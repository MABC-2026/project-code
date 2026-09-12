# -*- coding: utf-8 -*-
"""사업장 인력 안정성 지표 계산 — 전부 결정론적. LLM 판단 없음.

국민연금 가입 사업장 내역(공공데이터)에서 '총원이 숨기는 인력 이동'을 드러낸다.

사용법:
    python scripts/stability.py [사업장CSV] [--company 회사명] [--top N]

경로를 주지 않으면 assets/sample_workplaces.csv 로 시연한다.
표준 라이브러리만 사용한다(외부 패키지 0개).
"""
import csv, sys, os, re, statistics as st
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SAMPLE = os.path.join(ROOT, "assets", "sample_workplaces.csv")
BASELINE = os.path.join(ROOT, "assets", "industry_baseline.csv")

# 2026-07 원본 데이터(593,997행) 실측 상한. 국민연금 기준소득월액 상한에 걸린 값이다.
# 상한이 바뀌면 이 값을 갱신해야 한다. 근거는 references/metrics.md 참조.
CAP_OBSERVED = 6_956_000
RATE = 0.09                    # 국민연금 사업장 보험료율(근로자 4.5 + 사용자 4.5)
MIN_HEADCOUNT = 30             # 이 미만은 회전율이 노이즈에 지배된다

ALIASES = {
    "사업장명":     ["사업장명", "회사명", "업체명", "기업명", "name", "company"],
    "가입자수":     ["가입자수", "인원", "인원수", "직원수", "종업원수", "headcount"],
    "신규취득자수": ["신규취득자수", "신규취득", "신규", "입사자수", "취득자수"],
    "상실가입자수": ["상실가입자수", "상실가입자", "상실", "퇴사자수", "상실자수"],
    "당월고지금액": ["당월고지금액", "고지금액", "월고지금액", "보험료"],
    "업종":         ["업종", "업종명", "사업장업종코드명", "산업분류"],
    "시도":         ["시도", "지역", "사업장지번상세주소", "사업장도로명상세주소", "주소"],
    "자료생성년월": ["자료생성년월", "기준년월", "년월", "자료년월", "기준월"],
    "사업장형태":   ["사업장형태", "사업장형태구분코드 1 법인 2 개인", "법인구분"],
}
# 구조적으로 회전이 높은 업종 — 절대 회전율로 다른 업종과 비교하면 안 된다
CONSTRUCTION = re.compile(r"공사업|건설업|토공사|배관|전기공사|시설물|철근|콘크리트|도장|방수")
DAILY = re.compile(r"일용|日雇")
# 설계상 단기 고용인 사업장 — 회전율이 높은 게 정상이라 구직 판단 대상이 아니다.
# 7월·1월 공공기관 정기 인사이동이 겹치면 지표가 더 부풀려진다.
PUBLIC_TEMP = re.compile(r"일자리\s*사업|기간제|공공근로|계절근로|시청|군청|구청|도청|의회|"
                         r"지방국세청|교육지원청|주민센터|행정복지센터|사업단|지원단")
# 업종코드가 실제 업태와 다른 경우가 있다(농협 -> '국내은행', 대학 -> '애완동물 장묘').
# 아래 값은 업종 자체가 비어 있는 자리표시자라 업종 내 비교의 기준이 될 수 없다.
NO_INDUSTRY = {"BIZ_NO미존재사업장", "해당없음", "", "-"}
RANK_MIN_HEADCOUNT = 100   # 상위 목록 기준. 소규모는 회전율 분산이 커서 순위가 흔들린다


def norm(s):
    return re.sub(r"[\s_\-()]", "", (s or "")).lower()


def resolve(headers):
    found, used = {}, set()
    hmap = {norm(h): h for h in headers}
    for std, cands in ALIASES.items():
        for c in cands:
            h = hmap.get(norm(c))
            if h and h not in used:
                found[std] = h
                used.add(h)
                break
    return found


def read_rows(path):
    for enc in ("utf-8-sig", "cp949", "euc-kr"):
        try:
            with open(path, encoding=enc, newline="", errors="strict") as f:
                head = f.readline()
            if not head.strip():
                continue
        except (UnicodeDecodeError, LookupError):
            continue
        with open(path, encoding=enc, newline="", errors="replace") as f:
            rdr = csv.DictReader(f)
            col = resolve(rdr.fieldnames or [])
            miss = [k for k in ("사업장명", "가입자수", "신규취득자수", "상실가입자수") if k not in col]
            if miss:
                sys.exit("[중단] 필수 컬럼을 찾지 못했습니다: %s\n  발견된 헤더: %s\n"
                         "  사업장명·가입자수·신규취득자수·상실가입자수가 필요합니다."
                         % (", ".join(miss), ", ".join(rdr.fieldnames or [])))
            out, dropped, status_col = [], 0, None
            for h in (rdr.fieldnames or []):
                if "가입상태" in h:
                    status_col = h
            for r in rdr:
                if status_col and (r.get(status_col) or "").strip() == "2":
                    continue          # 탈퇴 사업장 제외
                try:
                    cnt = int(float(r[col["가입자수"]] or 0))
                    new = int(float(r[col["신규취득자수"]] or 0))
                    lost = int(float(r[col["상실가입자수"]] or 0))
                except (ValueError, TypeError):
                    dropped += 1
                    continue
                if cnt <= 0:
                    dropped += 1
                    continue
                try:
                    amt = int(float(r.get(col.get("당월고지금액", ""), 0) or 0))
                except (ValueError, TypeError):
                    amt = 0
                addr = (r.get(col.get("시도", ""), "") or "").strip()
                out.append({
                    "사업장명": (r[col["사업장명"]] or "").strip(),
                    "업종": (r.get(col.get("업종", ""), "") or "").strip(),
                    "시도": addr.split(" ")[0] if addr else "",
                    "년월": (r.get(col.get("자료생성년월", ""), "") or "").strip(),
                    "가입자수": cnt, "신규": new, "상실": lost, "고지금액": amt,
                })
            return out, dropped, enc
    sys.exit("[중단] 파일을 읽을 수 없습니다: %s" % path)


def load_baseline():
    if not os.path.exists(BASELINE):
        return {}
    with open(BASELINE, encoding="utf-8-sig", newline="") as f:
        return {r["업종"]: float(r["월회전율중앙값"]) for r in csv.DictReader(f)}


# ── 입력 ──────────────────────────────────────────────────────────
args = [a for a in sys.argv[1:]]
company = top_n = None
if "--company" in args:
    i = args.index("--company")
    company = args[i + 1] if i + 1 < len(args) else None
    del args[i:i + 2]
if "--top" in args:
    i = args.index("--top")
    top_n = int(args[i + 1]) if i + 1 < len(args) else 10
    del args[i:i + 2]
path = args[0] if args else SAMPLE
IS_SAMPLE = os.path.abspath(path) == os.path.abspath(SAMPLE)
if not os.path.exists(path):
    sys.exit("[중단] 파일을 찾을 수 없습니다: %s" % path)

ROWS, dropped, enc = read_rows(path)
if not ROWS:
    sys.exit("[중단] 유효한 사업장이 한 건도 없습니다.")

# ── 지표 계산 ─────────────────────────────────────────────────────
for r in ROWS:
    r["순증감"] = r["신규"] - r["상실"]
    r["총이동"] = r["신규"] + r["상실"]
    r["월회전율"] = r["총이동"] / 2 / r["가입자수"]
    r["분리율"] = r["상실"] / r["가입자수"]
    # 은폐지수 — 총원 변화 뒤에 몇 배의 사람이 오갔는가
    r["은폐지수"] = r["총이동"] / max(abs(r["순증감"]), 1)
    r["추정소득"] = (r["고지금액"] / r["가입자수"] / RATE) if r["고지금액"] > 0 else 0

# 업종 기준선: 입력에서 30개 이상이면 자체 산출, 아니면 동봉 기준선
by_ind = defaultdict(list)
for r in ROWS:
    if r["업종"]:
        by_ind[r["업종"]].append(r["월회전율"])
self_base = {k: st.median(v) for k, v in by_ind.items() if len(v) >= 30}
bundled = load_baseline()
# 기준선은 표본이 클수록 믿을 만하다. 동봉 기준선은 전국 52,957개소에서 뽑았으므로
# 입력이 그에 필적할 만큼 크지 않으면 동봉본을 쓴다. 작은 입력으로 자체 산출하면
# 표본 편향이 그대로 기준선이 되어 업종배수가 왜곡된다.
USE_SELF = len(ROWS) >= 20000 and len(self_base) >= 50
base = self_base if USE_SELF else (bundled or self_base)
BASE_SRC = ("입력 데이터 자체 산출(%s개 업종)" % "{:,}".format(len(self_base))) if USE_SELF \
    else "동봉 기준선(2026-07 전국 52,957개소, %s개 업종)" % "{:,}".format(len(bundled))
allmed = st.median([r["월회전율"] for r in ROWS]) or 0.0233

for r in ROWS:
    b = base.get(r["업종"], allmed) or allmed
    r["업종배수"] = r["월회전율"] / b if b > 0 else 0.0
    w = []
    if DAILY.search(r["사업장명"]):
        w.append("일용사업장")
    if r["업종"] and CONSTRUCTION.search(r["업종"]):
        w.append("건설현장형업종")
    if PUBLIC_TEMP.search(r["사업장명"]):
        w.append("공공·기간제")
    if r["추정소득"] >= CAP_OBSERVED * 0.995:
        w.append("소득상한도달")
    if r["가입자수"] < MIN_HEADCOUNT:
        w.append("소규모")
    r["경고"] = w

ym = Counter(r["년월"] for r in ROWS if r["년월"]).most_common(1)
YM = ym[0][0] if ym else "미상"
SEASON = YM.endswith("-07") or YM.endswith("-01")

L = []
P = L.append
if IS_SAMPLE:
    P("> **입력 파일이 지정되지 않아 동봉된 공개 데이터 샘플로 시연합니다.**")
    P("> 출처: 국민연금공단 「국민연금 가입 사업장 내역」(공공데이터포털) %s 기준," % YM)
    P("> 가입자 30명 이상 사업장에서 층화 추출한 %s개소입니다." % "{:,}".format(len(ROWS)))
    P("")

analyzed = [r for r in ROWS if r["가입자수"] >= MIN_HEADCOUNT]

# ── 개별 사업장 조회 ──────────────────────────────────────────────
if company:
    hits = [r for r in ROWS if company.replace(" ", "") in r["사업장명"].replace(" ", "")]
    P("## 사업장 안정성 진단 — '%s' 검색 결과 %d건" % (company, len(hits)))
    P("")
    if not hits:
        P("- 해당 이름의 사업장을 찾지 못했습니다. 데이터에 등록된 정확한 사업장명이 필요합니다.")
        P("- 국민연금 가입 사업장명은 법인명 기준이라 브랜드명과 다를 수 있습니다.")
    for r in sorted(hits, key=lambda x: -x["가입자수"])[:10]:
        P("### %s" % r["사업장명"])
        P("")
        P("| 항목 | 값 |")
        P("|---|---|")
        P("| 업종 / 지역 | %s / %s |" % (r["업종"] or "-", r["시도"] or "-"))
        P("| 가입자수 | %s명 |" % "{:,}".format(r["가입자수"]))
        P("| 당월 순증감 | %+d명 |" % r["순증감"])
        P("| 당월 총이동 (신규+상실) | %d명 (신규 %d / 상실 %d) |" % (r["총이동"], r["신규"], r["상실"]))
        P("| 월 회전율 | %.2f%% (연환산 %.0f%%) |" % (r["월회전율"] * 100, r["월회전율"] * 1200))
        P("| **은폐지수** | **%.1f배** — 총원 변화 %+d명 뒤에 %d명이 오갔습니다 |"
          % (r["은폐지수"], r["순증감"], r["총이동"]))
        P("| 업종 내 상대 위치 | 업종 중앙값의 **%.1f배** |" % r["업종배수"])
        if r["추정소득"] > 0:
            cap = " ⚠️ 상한 도달 — 실제 평균 급여는 이보다 높습니다" if "소득상한도달" in r["경고"] else ""
            P("| 추정 평균 기준소득월액 | %s원%s |" % ("{:,.0f}".format(r["추정소득"]), cap))
        if r["경고"]:
            P("| 해석 주의 | %s |" % ", ".join("`%s`" % w for w in r["경고"]))
        P("")
else:
    # ── 전체 리포트 ───────────────────────────────────────────────
    N = len(analyzed)
    P("## 사업장 안정성 진단 — %s (%s 기준, 분석 대상 %s개소)"
      % (os.path.basename(path), YM, "{:,}".format(N)))
    P("")
    P("### 한 줄 요약")
    P("")
    med_t = st.median([r["월회전율"] for r in analyzed])
    hidden = [r for r in analyzed if abs(r["순증감"]) <= max(1, r["가입자수"] * 0.01)
              and r["업종배수"] >= 2.0 and not r["경고"]]
    P("- 월 회전율 중앙값 **%.2f%%** (연환산 %.1f%%)" % (med_t * 100, med_t * 1200))
    P("- **총원은 거의 그대로인데 인력이 대량으로 오간 사업장 %s개소 (%.1f%%)**"
      % ("{:,}".format(len(hidden)), len(hidden) / N * 100))
    P("  — 순증감이 가입자수의 1% 이내인데 회전율이 **업종 중앙값의 2배 이상**. 총원만 보면 안 보입니다.")
    P("- 해석 주의 표시가 붙은 사업장 %s개소 (일용·건설현장·소득상한 등)"
      % "{:,}".format(sum(1 for r in analyzed if r["경고"])))
    P("")
    P("### 총원이 숨긴 인력 이동 — 순증감 ≈ 0 이면서 업종 대비 회전이 높은 사업장")
    P("")
    P("정렬 기준은 **업종배수**입니다. 은폐지수는 분모(순증감)가 우연히 0에 가까우면")
    P("무한정 커지므로 단독 정렬 기준으로 쓰지 않고, 회전이 실제로 높은 사업장에 한해 함께 표시합니다.")
    P("")
    P("| 사업장 | 업종 | 가입자 | 순증감 | 총이동 | 업종배수 | 은폐지수 |")
    P("|---|---|---:|---:|---:|---:|---:|")
    cand = [r for r in analyzed if not r["경고"] and r["총이동"] >= 10
            and r["가입자수"] >= RANK_MIN_HEADCOUNT and r["업종"] not in NO_INDUSTRY]
    rank = [r for r in cand if abs(r["순증감"]) <= max(1, r["가입자수"] * 0.01)
            and r["업종배수"] >= 2.0]
    for r in sorted(rank, key=lambda x: -x["업종배수"])[:(top_n or 10)]:
        P("| %s | %s | %s | %+d | %d | **%.1f배** | %.0f배 |"
          % (r["사업장명"][:24], (r["업종"] or "-")[:16], "{:,}".format(r["가입자수"]),
             r["순증감"], r["총이동"], r["업종배수"], r["은폐지수"]))
    if not rank:
        P("| (조건을 만족하는 사업장 없음) | | | | | | |")
    P("")
    P("### 업종 내 회전율이 특히 높은 사업장 (업종 중앙값 대비)")
    P("")
    P("| 사업장 | 업종 | 가입자 | 월회전율 | 업종 중앙값 | 배수 |")
    P("|---|---|---:|---:|---:|---:|")
    for r in sorted([r for r in cand if r["업종"] in base],
                    key=lambda x: -x["업종배수"])[:(top_n or 10)]:
        P("| %s | %s | %s | %.1f%% | %.1f%% | **%.1f배** |"
          % (r["사업장명"][:24], r["업종"][:16], "{:,}".format(r["가입자수"]),
             r["월회전율"] * 100, base[r["업종"]] * 100, r["업종배수"]))
    P("")
    P("### 업종별 기준선 (회전율 중앙값 상·하위)")
    P("")
    if base:
        srt = sorted(base.items(), key=lambda x: -x[1])
        P("| 높은 업종 | 중앙값 | | 낮은 업종 | 중앙값 |")
        P("|---|---:|---|---|---:|")
        for hi, lo in zip(srt[:5], srt[-5:][::-1]):
            P("| %s | %.2f%% | | %s | %.2f%% |" % (hi[0][:20], hi[1] * 100, lo[0][:20], lo[1] * 100))
        P("")
        P("업종 간 편차가 **%.0f배**입니다. 절대 회전율로 업종을 가로질러 비교하면 안 됩니다."
          % (srt[0][1] / srt[-1][1] if srt[-1][1] > 0 else 0))
        P("")

P("### 지표 정의")
P("")
P("- **순증감** = 신규취득자수 − 상실가입자수 (겉으로 드러나는 총원 변화)")
P("- **총이동** = 신규취득자수 + 상실가입자수 (실제로 오간 사람 수)")
P("- **월 회전율** = 총이동 ÷ 2 ÷ 가입자수")
P("- **은폐지수** = 총이동 ÷ max(|순증감|, 1) — 총원 변화 뒤에 몇 배의 인력이 오갔는가")
P("- **업종배수** = 해당 사업장 월 회전율 ÷ 업종 중앙값 (기준선: %s)" % BASE_SRC)
P("")
P("### 방법 및 한계")
P("")
P("- 본 결과는 **행정 기록에서 계산한 관측 지표**이며, 특정 사업장을 좋은/나쁜 직장으로 **평가하지 않습니다**.")
P("- **회전율이 높다는 것이 곧 나쁜 직장을 뜻하지 않습니다.** 일용직·계절노동·프로젝트 조직·")
P("  파견업은 구조적으로 높습니다. 그래서 업종 내 상대 비교를 함께 제시합니다.")
P("- **단월 스냅샷입니다.** 자료는 %s 한 달치이므로 계절성과 일회성 사건을 구분할 수 없습니다." % YM)
if SEASON:
    P("- ⚠️ **%s은 공공기관 정기 인사이동 시기입니다.** 공공부문의 순증감·회전율이 인위적으로" % YM)
    P("  부풀려져 있을 수 있습니다. 해당 기관은 다른 달과 함께 봐야 합니다.")
P("- ⚠️ **추정 평균 기준소득월액은 상한(%s원)에서 잘립니다.** 상한에 걸린 사업장의 실제"
  % "{:,}".format(CAP_OBSERVED))
P("  평균 급여는 표시값보다 **높습니다**. 고임금 사업장일수록 과소평가됩니다.")
P("- 가입자 %d명 미만은 회전율이 노이즈에 지배되어 분석 대상에서 제외했습니다." % MIN_HEADCOUNT)
P("- 국민연금 미가입자(초단시간·일부 특수고용·프리랜서)는 집계에 포함되지 않습니다.")
P("- 출처: 국민연금공단 「국민연금 가입 사업장 내역」(공공데이터포털). 사업장 단위 통계이며 개인정보를 포함하지 않습니다.")
if dropped:
    P("- 수치가 유효하지 않은 %s행은 집계에서 제외했습니다." % "{:,}".format(dropped))

report = "\n".join(L)
print(report)
with open("employer_stability_report.md", "w", encoding="utf-8") as f:
    f.write(report + "\n")
print("\n리포트 저장: employer_stability_report.md  (인코딩 감지: %s)" % enc)
