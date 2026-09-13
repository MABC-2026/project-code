# -*- coding: utf-8 -*-
"""사업장 인력 안정성 지표 계산 — 전부 결정론적. LLM 판단 없음.

국민연금 가입 사업장 내역(공공데이터)에서 '총원이 숨기는 인력 이동'을 드러낸다.

사용법:
    python scripts/stability.py [사업장CSV] [--company 회사명] [--top N]

경로를 주지 않으면 assets/sample_workplaces.csv 로 시연한다.
표준 라이브러리만 사용한다(외부 패키지 0개).

구조 규칙:
    - 모든 def 는 모듈 최상단(들여쓰기 0칸)에 둔다. api/diagnose.py 가 import 한다.
    - 실행 코드는 전부 main() 안에만 둔다. import 시 아무것도 실행되면 안 된다.
    - 라이브러리 함수는 sys.exit() 대신 예외를 던진다. SystemExit 은 except Exception 에
      잡히지 않아 서버리스 함수를 통째로 죽인다.
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
MAX_BAR = 40               # 총이동 기준 막대 최대 폭


# ══════════════════════════════════════════════════════════════════
# 유틸
# ══════════════════════════════════════════════════════════════════

def bar(value, max_value, width=MAX_BAR):
    """값의 상대 크기를 유니코드 블록 막대로 그린다. value는 절대값으로 축척한다."""
    if max_value <= 0:
        return ' ' * width
    v = abs(value) if value else 0
    if v <= 0:
        return ' ' * width
    frac = v / max_value * width
    full = int(frac)
    rem = frac - full
    parts = ['\u2588'] * full
    if full < width:
        r8 = int(rem * 8 + 0.5)          # 0~8, 8이면 한 칸 더 채움
        if r8 == 0:
            pass
        elif r8 == 8:
            parts.append('\u2588')
        else:
            # U+258F 1/8 … U+2589 7/8
            parts.append(chr(0x258F - r8 + 1))
    parts = parts[:width]
    return ''.join(parts) + ' ' * (width - len(parts))


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


# ══════════════════════════════════════════════════════════════════
# 입출력
# ══════════════════════════════════════════════════════════════════

def read_rows(path):
    """CSV를 읽어 (행목록, 제외행수, 감지된인코딩)을 반환한다.

    실패 시 sys.exit 대신 예외를 던진다 — diagnose.py 가 ValueError/FileNotFoundError 를
    각각 400/404 로 매핑한다.
    """
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
                raise ValueError(
                    "필수 컬럼을 찾지 못했습니다: %s / 발견된 헤더: %s / "
                    "사업장명·가입자수·신규취득자수·상실가입자수가 필요합니다."
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
    raise ValueError("파일을 읽을 수 없습니다(utf-8/cp949/euc-kr 모두 실패): %s" % path)


def load_baseline():
    if not os.path.exists(BASELINE):
        return {}
    with open(BASELINE, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out = {}
    for r in rows:
        base_val = float(r["월회전율중앙값"])
        out[r["업종"]] = base_val
    return out


def load_baseline_quantiles():
    """업종별 분위수(p25/p75/p90)를 dict로 반환. 없으면 빈 dict — 구버전 기준선 호환."""
    if not os.path.exists(BASELINE):
        return {}
    with open(BASELINE, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    out = {}
    for r in rows:
        base_val = float(r["월회전율중앙값"])
        p25 = float(r.get("p25", base_val) or base_val) if r.get("p25") not in (None, "") else base_val
        p75 = float(r.get("p75", base_val) or base_val) if r.get("p75") not in (None, "") else base_val
        p90 = float(r.get("p90", base_val) or base_val) if r.get("p90") not in (None, "") else base_val
        out[r["업종"]] = {"p25": p25, "p50": base_val, "p75": p75, "p90": p90}
    return out


# ══════════════════════════════════════════════════════════════════
# 사업장명 검색
# ══════════════════════════════════════════════════════════════════

def strip_corp(name):
    """법인격 표기(주식회사·유한회사·(주)·(유)·（주）·（유）·㈜)를 제거한다."""
    patterns = [
        r"주식회사\s*",
        r"유한회사\s*",
        r"유한책임회사\s*",
        r"\(\s*주\s*\)",
        r"（\s*주\s*）",
        r"\(\s*유\s*\)",
        r"（\s*유\s*）",
        r"㈜\s*",
    ]
    result = name
    for p in patterns:
        result = re.sub(p, "", result)
    return result.strip()


def bigrams(s):
    s = norm(s)
    if len(s) < 2:
        return set()
    return set(s[i:i + 2] for i in range(len(s) - 1))


def jaccard_similarity(a, b):
    ba, bb = bigrams(a), bigrams(b)
    if not ba and not bb:
        return 0.0
    inter = ba & bb
    union = ba | bb
    return len(inter) / len(union) if union else 0.0


def search_company(rows, query):
    """후보를 4개 그룹으로 분류·정렬해 반환한다. 각 그룹은 가입자수 내림차순.

    그룹 순서:
      1. 정확히 일치 (공백 제거 + 법인격 표기 제거 후 완전 일치)
      2. 입력어로 시작
      3. 입력어를 포함
      4. 유사명 — 법인격 표기 제거 후 2-gram 자카드 >= 0.5
    """
    q_norm = norm(query)
    q_stripped = strip_corp(query)
    exact, starts_with, contains, similar = [], [], [], []
    seen = set()
    for r in rows:
        name = r["사업장명"]
        if name in seen:
            continue
        n_norm = norm(name)
        n_stripped = strip_corp(name)
        if strip_corp(n_norm) == strip_corp(q_norm):
            exact.append(r)
            seen.add(name)
            continue
        if n_norm.startswith(q_norm):
            starts_with.append(r)
            seen.add(name)
            continue
        if q_norm in n_norm:
            contains.append(r)
            seen.add(name)
            continue
        if jaccard_similarity(n_stripped, q_stripped) >= 0.5:
            similar.append(r)
            seen.add(name)
    for lst in (exact, starts_with, contains, similar):
        lst.sort(key=lambda x: -x["가입자수"])
    return exact, starts_with, contains, similar


def pick_best_candidate(exact, starts_with, contains, similar):
    """search_company의 4개 그룹에서 1순위 후보를 하나 고른다. 없으면 None."""
    cand = list(exact) + list(starts_with) + list(contains) + list(similar)
    return cand[0] if cand else None


# ══════════════════════════════════════════════════════════════════
# 계산 진입점 — api/diagnose.py 가 import 해서 쓴다
# ══════════════════════════════════════════════════════════════════

def compute(path=None, company=None, top_n=None):
    """CSV를 읽어 지표를 계산한다. 출력은 하지 않는다. run()과 main()이 공유한다."""
    if path is None:
        path = SAMPLE
    if not os.path.exists(path):
        raise FileNotFoundError("파일을 찾을 수 없습니다: %s" % path)
    rows, dropped, enc = read_rows(path)
    if not rows:
        raise ValueError("유효한 사업장이 한 건도 없습니다.")

    # ── 지표 계산 ─────────────────────────────────────────────────
    for r in rows:
        r["순증감"] = r["신규"] - r["상실"]
        r["총이동"] = r["신규"] + r["상실"]
        r["월회전율"] = r["총이동"] / 2 / r["가입자수"]
        r["분리율"] = r["상실"] / r["가입자수"]
        # 은폐지수 — 총원 변화 뒤에 몇 배의 사람이 오갔는가
        r["은폐지수"] = r["총이동"] / max(abs(r["순증감"]), 1)
        r["추정소득"] = (r["고지금액"] / r["가입자수"] / RATE) if r["고지금액"] > 0 else 0

    # 업종 기준선: 입력이 충분히 크면 자체 산출, 아니면 동봉 기준선
    by_ind = defaultdict(list)
    for r in rows:
        if r["업종"]:
            by_ind[r["업종"]].append(r["월회전율"])
    self_base = {k: st.median(v) for k, v in by_ind.items() if len(v) >= 30}
    bundled = load_baseline()
    baseline_q = load_baseline_quantiles()
    # 기준선은 표본이 클수록 믿을 만하다. 동봉 기준선은 전국 52,957개소에서 뽑았으므로
    # 입력이 그에 필적할 만큼 크지 않으면 동봉본을 쓴다. 작은 입력으로 자체 산출하면
    # 표본 편향이 그대로 기준선이 되어 업종배수가 왜곡된다.
    use_self = len(rows) >= 20000 and len(self_base) >= 50
    base = self_base if use_self else (bundled or self_base)
    base_src = ("입력 데이터 자체 산출(%s개 업종)" % "{:,}".format(len(self_base))) if use_self \
        else "동봉 기준선(2026-07 전국 52,957개소, %s개 업종)" % "{:,}".format(len(bundled))
    allmed = st.median([r["월회전율"] for r in rows]) or 0.0233

    for r in rows:
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

    ym = Counter(r["년월"] for r in rows if r["년월"]).most_common(1)
    YM = ym[0][0] if ym else "미상"
    season = YM.endswith("-07") or YM.endswith("-01")

    analyzed = [r for r in rows if r["가입자수"] >= MIN_HEADCOUNT]

    if company:
        exact, starts_with, contains, similar = search_company(rows, company)
        result_list = (list(exact) + list(starts_with) + list(contains) + list(similar))[:10]
    else:
        result_list = []

    return {
        "rows": rows, "analyzed": analyzed, "base": base, "allmed": allmed,
        "baseline_q": baseline_q, "bundled": bundled,
        "YM": YM, "season": season, "dropped": dropped, "enc": enc,
        "base_src": base_src, "result_list": result_list,
        "is_sample": os.path.abspath(path) == os.path.abspath(SAMPLE),
    }


def run(path=None, company=None, top_n=None):
    """diagnose.py가 import 해서 쓰는 진입점.

    반환 순서는 diagnose.py의 10개 언패킹과 일치한다:
    (ROWS, analyzed, base, allmed, YM, SEASON, dropped, enc, BASE_SRC, result_list)
    """
    d = compute(path=path, company=company, top_n=top_n)
    return (d["rows"], d["analyzed"], d["base"], d["allmed"], d["YM"],
            d["season"], d["dropped"], d["enc"], d["base_src"], d["result_list"])


# ══════════════════════════════════════════════════════════════════
# 출력 (CLI 전용)
# ══════════════════════════════════════════════════════════════════

def print_diagnosis(r, out, base, allmed, baseline_q, base_src_note=None):
    """단일 사업장 진단 출력을 출력 함수 out(=P)로 기록한다."""
    out("### %s" % r["사업장명"])
    out("")
    out("| 항목 | 값 |")
    out("|---|---|")
    out("| 업종 / 지역 | %s / %s |" % (r["업종"] or "-", r["시도"] or "-"))
    out("| 가입자수 | %s명 |" % "{:,}".format(r["가입자수"]))
    out("| 당월 순증감 | %+d명 |" % r["순증감"])
    out("| 당월 총이동 (신규+상실) | %d명 (신규 %d / 상실 %d) |"
        % (r["총이동"], r["신규"], r["상실"]))
    out("| 월 회전율 | %.2f%% (연환산 %.0f%%) |" % (r["월회전율"] * 100, r["월회전율"] * 1200))
    out("| **은폐지수** | **%.1f배** — 총원 변화 %+d명 뒤에 %d명이 오갔습니다 |"
        % (r["은폐지수"], r["순증감"], r["총이동"]))
    out("| 업종 내 상대 위치 | 업종 중앙값의 **%.1f배** |" % r["업종배수"])
    if r["추정소득"] > 0:
        cap = " ⚠️ 상한 도달 — 실제 평균 급여는 이보다 높습니다" if "소득상한도달" in r["경고"] else ""
        out("| 추정 평균 기준소득월액 | %s원%s |" % ("{:,.0f}".format(r["추정소득"]), cap))
    if r["경고"]:
        out("| 해석 주의 | %s |" % ", ".join("`%s`" % w for w in r["경고"]))
    if base_src_note:
        out("| 기준선 출처 | %s |" % base_src_note)
    out("")

    # ── ①. 순증감 대 총이동 막대 (두 막대 동일 축척) ─────────────
    bar_total = r["총이동"] if r["총이동"] > 0 else 1
    out("## ① 순증감 대 총이동 (같은 축척, 총이동 기준 최대 40칸)")
    out("")
    out("  겉으로 보이는 변화 (순증감)   |%s %+d명" % (bar(r["순증감"], bar_total), r["순증감"]))
    out("  실제로 오간 사람  (총이동)    |%s %d명" % (bar(r["총이동"], bar_total), r["총이동"]))
    out("")

    # ── ②. 업종 대비 막대 (두 막대 동일 40칸 축척) ──────────────
    b = base.get(r["업종"], allmed) or allmed
    max_of_two = max(r["월회전율"], b) if max(r["월회전율"], b) > 0 else 0.0001
    out("## ② 업종 대비 (업종 중앙값 대비 막대)")
    out("")
    out("  업종 중앙값    %.1f%%  |%s" % (b * 100, bar(b, max_of_two)))
    out("  이 사업장     %.1f%%  |%s  업종 중앙값의 %.1f배"
        % (r["월회전율"] * 100, bar(r["월회전율"], max_of_two), r["업종배수"]))
    out("")

    # ── 업종 내 위치 (분위수). 기준선에 분위수 컬럼이 있을 때만 출력.
    q = baseline_q.get(r["업종"])
    if q:
        loc = "상위 10퍼센트 이내" if r["월회전율"] >= q["p90"] else "상위 10퍼센트 밖"
        out("  업종 내 위치   p25 %.1f%%  p50 %.1f%%  p75 %.1f%%  p90 %.1f%%     이 사업장 %.1f%% (%s)"
            % (q["p25"] * 100, q["p50"] * 100, q["p75"] * 100, q["p90"] * 100, r["월회전율"] * 100, loc))
        out("")

    # ── 해설 ────────────────────────────────────────────────────
    out("### 해설")
    out("")
    if r["순증감"] == 0:
        out("- 겉으로 보이는 총원 변화는 %+d명으로 거의 없지만, 실제로는 %d명(%s명 들어오고 %s명 나감)이 오갔습니다."
            % (r["순증감"], r["총이동"], r["신규"], r["상실"]))
    else:
        out("- 당월 총원은 %+d명 변했지만, 그 사이에 %d명(%s명 유입·%s명 유출)이 사업장을 오갔습니다."
            % (r["순증감"], r["총이동"], r["신규"], r["상실"]))
    out("- 이 사업장의 월 회전율 %.1f%%는 업종 중앙값 %.1f%%의 %.1f배로, 같은 업종 평균보다 %s."
        % (r["월회전율"] * 100, b * 100, r["업종배수"],
           "빠르다" if r["업종배수"] >= 1.5 else "비슷하거나 느리다"))
    out("- 은폐지수가 %.1f배라는 것은 총원 변화 %+d명 뒤에 실제로는 %d명이 움직였다는 뜻입니다."
        % (r["은폐지수"], r["순증감"], r["총이동"]))
    out("")


def parse_args(argv):
    """CLI 인자를 파싱해 dict로 반환한다."""
    args = list(argv)
    company = top_n = pick = None
    compare_targets = None
    if "--company" in args:
        i = args.index("--company")
        company = args[i + 1] if i + 1 < len(args) else None
        del args[i:i + 2]
    if "--top" in args:
        i = args.index("--top")
        top_n = int(args[i + 1]) if i + 1 < len(args) else 10
        del args[i:i + 2]
    if "--pick" in args:
        i = args.index("--pick")
        pick = args[i + 1] if i + 1 < len(args) else None
        del args[i:i + 2]
    if "--compare" in args:
        i = args.index("--compare")
        raw = args[i + 1] if i + 1 < len(args) else None
        del args[i:i + 2]
        if raw:
            compare_targets = [t.strip() for t in raw.split(",") if t.strip()]
    return {
        "path": args[0] if args else SAMPLE,
        "company": company, "top_n": top_n, "pick": pick,
        "compare_targets": compare_targets,
    }


def build_report(d, opts):
    """계산 결과 d와 CLI 옵션 opts로 마크다운 리포트 문자열을 만든다."""
    rows = d["rows"]
    analyzed = d["analyzed"]
    base = d["base"]
    allmed = d["allmed"]
    baseline_q = d["baseline_q"]
    bundled = d["bundled"]
    YM = d["YM"]
    base_src = d["base_src"]
    company = opts["company"]
    top_n = opts["top_n"]
    pick = opts["pick"]
    compare_targets = opts["compare_targets"]
    path = opts["path"]

    L = []
    P = L.append

    if d["is_sample"]:
        P("> **입력 파일이 지정되지 않아 동봉된 공개 데이터 샘플로 시연합니다.**")
        P("> 출처: 국민연금공단 「국민연금 가입 사업장 내역」(공공데이터포털) %s 기준," % YM)
        P("> 가입자 30명 이상 사업장에서 층화 추출한 %s개소입니다." % "{:,}".format(len(rows)))
        P("")

    # ── 회사 비교 ──────────────────────────────────────────────
    if compare_targets:
        P("## 회사 비교 — %s" % ", ".join(compare_targets))
        P("")
        found_rows, skipped = [], []
        for t in compare_targets:
            best = pick_best_candidate(*search_company(rows, t))
            if best is None:
                skipped.append(t)
            else:
                found_rows.append(best)
        if not found_rows:
            P("- 비교할 사업장이 없습니다. 이름이 정확하지 않거나 데이터에 없는 회사입니다.")
            for s in skipped:
                P("  - '%s'는 찾지 못해 건너뜁니다." % s)
        else:
            if skipped:
                P("- 일부 이름은 찾지 못해 건너뛰었습니다:")
                for s in skipped:
                    P("  - '%s'" % s)
                P("")
            inds = set(r["업종"] for r in found_rows if r["업종"] and r["업종"] not in NO_INDUSTRY)
            if len(inds) > 1:
                P("⚠️ 업종이 서로 달라 월 회전율을 직접 비교할 수 없습니다. 업종배수로 비교하십시오.")
                P("")
            hdr = ["지표"] + [r["사업장명"] for r in found_rows]
            P("| " + " | ".join(hdr) + " |")
            P("| " + " | ".join(["---"] * len(hdr)) + " |")

            def _r(label, fn):
                P("| " + " | ".join([label] + [fn(r) for r in found_rows]) + " |")

            _r("가입자수", lambda r: "%s명" % "{:,}".format(r["가입자수"]))
            _r("당월 순증감", lambda r: "%+d명" % r["순증감"])
            _r("당월 총이동", lambda r: "%d명 (신규 %d / 상실 %d)" % (r["총이동"], r["신규"], r["상실"]))
            _r("월 회전율", lambda r: "%.2f%% (연환산 %.0f%%)" % (r["월회전율"] * 100, r["월회전율"] * 1200))
            _r("업종배수", lambda r: "%.1f배" % r["업종배수"])
            _r("은폐지수", lambda r: "%.1f배" % r["은폐지수"])
            _r("업종", lambda r: r["업종"] or "-")

            def _est(r):
                if r["추정소득"] > 0:
                    cap = " (상한 도달 — 실제 평균 급여는 이보다 높음)" if "소득상한도달" in r["경고"] else ""
                    return "%s원%s" % ("{:,.0f}".format(r["추정소득"]), cap)
                return "-"

            _r("추정소득", _est)
            P("")
            P("**비교 참고** — 이 표의 업종배수 기준은 동봉 기준선(2026-07 전국 52,957개소, %s개 업종)입니다."
              % "{:,}".format(len(bundled)))
            P("")

    elif company:
        # ── 개별 사업장 조회 ────────────────────────────────────
        exact, starts_with, contains, similar = search_company(rows, company)
        P("## 사업장 안정성 진단 — '%s' 검색 결과" % company)
        P("")

        def fmt_one(r):
            return ("%s · %s · %s · 가입자 %s명"
                    % (r["사업장명"], r["업종"] or "-", r["시도"] or "-", "{:,}".format(r["가입자수"])))

        if not exact and not starts_with and not contains and not similar:
            P("- 해당 이름의 사업장을 찾지 못했습니다.")
            P("- 국민연금 가입 사업장명은 법인명 기준이라 브랜드명과 다를 수 있습니다.")
            P("- 예: 쿠팡풀필먼트서비스는 '쿠팡풀필먼트서비스 유한회사', 현대자동차는")
            P("  '현대자동차 주식회사', 롯데는 '롯데쇼핑 주식회사' 등으로 등록돼 있을 수 있습니다.")
            return "\n".join(L)

        cand = (list(exact) + list(starts_with) + list(contains) + list(similar))[:10]
        groups_info = [("정확히 일치", exact), ("입력어로 시작", starts_with),
                       ("입력어를 포함", contains), ("유사명", similar)]
        shown_groups = [(g, lst) for g, lst in groups_info if lst]

        def list_groups():
            for g, lst in shown_groups:
                P("- [%s] (%d건)" % (g, len(lst)))
                for r in lst[:10]:
                    P("  - %s" % fmt_one(r))

        if len(cand) == 1:
            P("→ 후보가 1건뿐이므로 바로 진단합니다.")
            P("")
            print_diagnosis(cand[0], P, base, allmed, baseline_q, base_src)
        elif pick is not None:
            try:
                pick_i = int(pick) - 1
            except (TypeError, ValueError):
                P("'%s'는 번호로 해석할 수 없습니다. 1~%d 사이의 번호를 주십시오." % (pick, len(cand)))
                P("")
                P("더 정확한 이름으로 다시 검색하시거나, 번호를 알려주시면 해당 사업장을 진단합니다.")
                return "\n".join(L)
            if not (0 <= pick_i < len(cand)):
                P("'%s'는 1~%d 범위를 벗어납니다. 다시 검색하거나 번호를 확인하세요." % (pick, len(cand)))
                P("")
                list_groups()
                P("")
                P("더 정확한 이름으로 다시 검색하시거나, 번호를 알려주시면 해당 사업장을 진단합니다.")
                return "\n".join(L)
            P("→ %d건 중 %d번을 진단합니다 - %s" % (len(cand), pick_i + 1, cand[pick_i]["사업장명"]))
            P("")
            print_diagnosis(cand[pick_i], P, base, allmed, baseline_q, base_src)
        else:
            list_groups()
            P("")
            P("위 후보 중 하나를 번호로 선택하면 진단합니다. (1~%d)" % len(cand))
            P("")
            P("더 정확한 이름으로 다시 검색하시거나, 번호를 알려주시면 해당 사업장을 진단합니다. "
              "(예: --company 쿠팡풀필먼트 --pick 2)")
            P("")

    else:
        # ── 전체 리포트 ─────────────────────────────────────────
        N = len(analyzed)
        P("## 사업장 안정성 진단 — %s (%s 기준, 분석 대상 %s개소)"
          % (os.path.basename(path), YM, "{:,}".format(N)))
        P("")
        P("### 한 줄 요약")
        P("")
        med_t = st.median([r["월회전율"] for r in analyzed]) if analyzed else 0.0
        hidden = [r for r in analyzed if abs(r["순증감"]) <= max(1, r["가입자수"] * 0.01)
                  and r["업종배수"] >= 2.0 and not r["경고"]]
        P("- 월 회전율 중앙값 **%.2f%%** (연환산 %.1f%%)" % (med_t * 100, med_t * 1200))
        P("- **총원은 거의 그대로인데 인력이 대량으로 오간 사업장 %s개소 (%.1f%%)**"
          % ("{:,}".format(len(hidden)), (len(hidden) / N * 100) if N else 0.0))
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
            for hi_i, lo_i in zip(srt[:5], srt[-5:][::-1]):
                P("| %s | %.2f%% | | %s | %.2f%% |"
                  % (hi_i[0][:20], hi_i[1] * 100, lo_i[0][:20], lo_i[1] * 100))
            P("")
            meds = sorted(base.values())
            nm = len(meds)
            hi = meds[min(nm - 1, int(nm * 0.95))]
            lo = meds[min(nm - 1, int(nm * 0.05))]
            P("업종 간 편차가 **%.0f배**입니다 (상위 5퍼센트 업종 대 하위 5퍼센트 업종)."
              % (hi / lo if lo > 0 else 0))
            P("절대 회전율로 업종을 가로질러 비교하면 안 됩니다.")
            P("")

    # ── 공통 꼬리말 ────────────────────────────────────────────
    P("### 지표 정의")
    P("")
    P("- **순증감** = 신규취득자수 − 상실가입자수 (겉으로 드러나는 총원 변화)")
    P("- **총이동** = 신규취득자수 + 상실가입자수 (실제로 오간 사람 수)")
    P("- **월 회전율** = 총이동 ÷ 2 ÷ 가입자수")
    P("- **은폐지수** = 총이동 ÷ max(|순증감|, 1) — 총원 변화 뒤에 몇 배의 인력이 오갔는가")
    P("- **업종배수** = 해당 사업장 월 회전율 ÷ 업종 중앙값 (기준선: %s)" % base_src)
    P("")
    P("### 방법 및 한계")
    P("")
    P("- 본 결과는 **행정 기록에서 계산한 관측 지표**이며, 특정 사업장을 좋은/나쁜 직장으로 **평가하지 않습니다**.")
    P("- **회전율이 높다는 것이 곧 나쁜 직장을 뜻하지 않습니다.** 일용직·계절노동·프로젝트 조직·")
    P("  파견업은 구조적으로 높습니다. 그래서 업종 내 상대 비교를 함께 제시합니다.")
    P("- **단월 스냅샷입니다.** 자료는 %s 한 달치이므로 계절성과 일회성 사건을 구분할 수 없습니다." % YM)
    if d["season"]:
        P("- ⚠️ **%s은 공공기관 정기 인사이동 시기입니다.** 공공부문의 순증감·회전율이 인위적으로" % YM)
        P("  부풀려져 있을 수 있습니다. 해당 기관은 다른 달과 함께 봐야 합니다.")
    P("- ⚠️ **추정 평균 기준소득월액은 상한(%s원)에서 잘립니다.** 상한에 걸린 사업장의 실제"
      % "{:,}".format(CAP_OBSERVED))
    P("  평균 급여는 표시값보다 **높습니다**. 고임금 사업장일수록 과소평가됩니다.")
    P("- 가입자 %d명 미만은 회전율이 노이즈에 지배되어 분석 대상에서 제외했습니다." % MIN_HEADCOUNT)
    P("- 국민연금 미가입자(초단시간·일부 특수고용·프리랜서)는 집계에 포함되지 않습니다.")
    P("- 출처: 국민연금공단 「국민연금 가입 사업장 내역」(공공데이터포털). 사업장 단위 통계이며 개인정보를 포함하지 않습니다.")
    if d["dropped"]:
        P("- 수치가 유효하지 않은 %s행은 집계에서 제외했습니다." % "{:,}".format(d["dropped"]))

    return "\n".join(L)


# ══════════════════════════════════════════════════════════════════
# CLI — 실행 코드는 전부 여기 안에만 둔다
# ══════════════════════════════════════════════════════════════════

def main():
    opts = parse_args(sys.argv[1:])
    try:
        d = compute(path=opts["path"], company=opts["company"], top_n=opts["top_n"])
    except (FileNotFoundError, ValueError) as e:
        sys.exit("[중단] %s" % e)

    report = build_report(d, opts)
    print(report)

    out_path = os.path.join(os.getcwd(), "employer_stability_report.md")
    try:
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(report + "\n")
        print("\n리포트 저장: %s  (인코딩 감지: %s)" % (out_path, d["enc"]))
    except OSError as e:
        # 읽기 전용 환경에서도 표준출력 리포트는 살린다
        print("\n(리포트 파일 저장 실패: %s)" % e, file=sys.stderr)


if __name__ == "__main__":
    main()
