# -*- coding: utf-8 -*-
"""동봉 샘플과 업종 기준선을 원본 공개 데이터에서 다시 만든다.

동봉된 assets/sample_workplaces.csv 와 assets/industry_baseline.csv 가
어떻게 만들어졌는지를 코드로 남긴 것이다. 새 월 자료가 나오면 이걸로 갱신한다.

원본 내려받기 (인증키 불필요):
    공공데이터포털 > 국민연금공단_국민연금 가입 사업장 내역 > CSV 내려받기
    파일 크기 약 110MB, 인코딩 cp949, 2026-07 기준 593,997행

사용법:
    python scripts/extract_sample.py <원본CSV경로>

시드가 고정되어 있어 같은 원본에서는 항상 같은 샘플이 나온다.
"""
import csv, os, re, sys, random, statistics as st
from collections import defaultdict

random.seed(20260830)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_SAMPLE = os.path.join(ROOT, "assets", "sample_workplaces.csv")
OUT_BASE = os.path.join(ROOT, "assets", "industry_baseline.csv")

MIN_HEADCOUNT = 30          # 이 미만은 회전율이 노이즈에 지배된다
CAP = 6_956_000             # 2026-07 실측 기준소득월액 상한
DAILY = re.compile(r"일용|日雇")

if len(sys.argv) < 2:
    sys.exit(__doc__)
SRC = sys.argv[1]
if not os.path.exists(SRC):
    sys.exit("[중단] 원본 파일을 찾을 수 없습니다: %s" % SRC)

rows = []
for enc in ("cp949", "utf-8-sig", "euc-kr"):
    try:
        with open(SRC, encoding=enc, newline="", errors="strict") as f:
            f.readline()
        break
    except (UnicodeDecodeError, LookupError):
        continue
else:
    sys.exit("[중단] 인코딩을 판별하지 못했습니다.")

with open(SRC, encoding=enc, newline="", errors="replace") as f:
    for r in csv.DictReader(f):
        if r.get("사업장가입상태코드 1 등록 2 탈퇴") != "1":
            continue
        try:
            cnt, amt = int(r["가입자수"] or 0), int(r["당월고지금액"] or 0)
            new, lost = int(r["신규취득자수"] or 0), int(r["상실가입자수"] or 0)
        except (ValueError, KeyError):
            continue
        if cnt < MIN_HEADCOUNT or amt <= 0:
            continue
        addr = r.get("사업장지번상세주소") or ""
        rows.append({
            "자료생성년월": r["자료생성년월"], "사업장명": r["사업장명"],
            "업종": r["사업장업종코드명"], "시도": addr.split(" ")[0] if addr else "",
            "사업장형태": "법인" if r.get("사업장형태구분코드 1 법인 2 개인") == "1" else "개인",
            "적용일자": r.get("적용일자", ""),
            "가입자수": cnt, "당월고지금액": amt,
            "신규취득자수": new, "상실가입자수": lost,
            "_회전율": (new + lost) / 2 / cnt,
        })

print("가입자 %d명 이상 · 등록 사업장: {:,}".format(len(rows)) % MIN_HEADCOUNT)

# ── 업종 기준선 ───────────────────────────────────────────────────
by_ind = defaultdict(list)
for r in rows:
    by_ind[r["업종"]].append(r["_회전율"])
base = {k: st.median(v) for k, v in by_ind.items() if len(v) >= 30}
os.makedirs(os.path.dirname(OUT_BASE), exist_ok=True)
with open(OUT_BASE, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["업종", "사업장수", "월회전율중앙값"])
    for k, v in sorted(base.items(), key=lambda x: -x[1]):
        w.writerow([k, len(by_ind[k]), round(v, 5)])
print("업종 기준선: {:,}개 업종 -> {}".format(len(base), OUT_BASE))

# ── 층화 샘플 ─────────────────────────────────────────────────────
# 무작위 추출만 하면 회전문형·상한도달 같은 희귀 사례가 빠져 시연이 밋밋해진다.
# 유형별로 뽑은 뒤 무작위분을 더한다.
sel, seen = [], set()


def take(pool, k, tag):
    pool = list(pool)
    random.shuffle(pool)
    n = 0
    for r in pool:
        key = (r["사업장명"], r["가입자수"])
        if key in seen:
            continue
        seen.add(key)
        sel.append(r)
        n += 1
        if n >= k:
            break
    print("   {:<26} {:>5,}개".format(tag, n))


print("샘플 구성:")
take([r for r in rows if abs(r["신규취득자수"] - r["상실가입자수"]) <= max(1, r["가입자수"] * .01)
      and r["_회전율"] >= .10 and not DAILY.search(r["사업장명"])], 200, "회전문형(순증감~0·회전高)")
take([r for r in rows if DAILY.search(r["사업장명"])], 80, "일용(함정 케이스)")
take([r for r in rows if r["신규취득자수"] - r["상실가입자수"] >= max(5, r["가입자수"] * .05)], 150, "성장형")
take([r for r in rows if r["상실가입자수"] - r["신규취득자수"] >= max(5, r["가입자수"] * .05)], 150, "감축형")
take([r for r in rows if abs(r["당월고지금액"] / r["가입자수"] / .09 - CAP) < 1000], 120, "상한 도달")
take([r for r in rows if r["_회전율"] <= .01], 300, "저회전 안정형")
take([r for r in rows if r["가입자수"] >= 1000], 200, "대기업(1000명+)")
take(rows, 900, "무작위")

random.shuffle(sel)
FIELDS = ["자료생성년월", "사업장명", "업종", "시도", "사업장형태", "적용일자",
          "가입자수", "당월고지금액", "신규취득자수", "상실가입자수"]
with open(OUT_SAMPLE, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
    w.writeheader()
    w.writerows(sel)
print("\n샘플 {:,}행 -> {}  ({:.0f} KB)".format(
    len(sel), OUT_SAMPLE, os.path.getsize(OUT_SAMPLE) / 1024))
