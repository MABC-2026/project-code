# -*- coding: utf-8 -*-
"""국민연금 가입 사업장 내역 원본에서 업종 기준선과 층화 샘플을 만든다.

원본: 국민연금공단 「국민연금 가입 사업장 내역」(공공데이터포털, 인증키 불필요)
2026-07 기준, 등록 상태 553,944개소 중 가입자 30명 이상 52,957개소를 모집단으로 쓴다.

이유: 가입자 30명 미만 사업장의 64.9%는 당월 인력 이동이 0건이다.
이들을 포함하면 회전율이 0으로 몰리고 업종 중앙값이 왜곡된다.
30명 이상에서는 0 이동이 64.9%에 달하지 않아 기준선 역할을 할 수 있다.

사용법:
    python scripts/extract_sample.py <원본CSV경로>

시드 고정으로 같은 원본이면 항상 같은 샘플이 나온다.
"""
import csv
import os
import re
import random
import sys
from collections import defaultdict

random.seed(20260830)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT_SAMPLE = os.path.join(ROOT, "assets", "sample_workplaces.csv")
OUT_BASE = os.path.join(ROOT, "assets", "industry_baseline.csv")

MIN_HEADCOUNT = 30   # 지원자: 가입자 30명 미만 사업장의 64.9%가 당월 이동 0건
MIN_SITES = 8        # 업종당 이만큼은 있어야 업종 중앙값을 기준선으로 신뢰할 수 있다
CAP_OBSERVED = 6_956_000  # 2026-07 실측 기준소득월액 상한(보험료율 9% 역산 최대)
DAILY_PAT = re.compile(r"일용|日雇")


def read_source(path):
    """원본 CSV를 읽어 (사업장명, 업종, 시도, 형태, 가입자수, 당월고지금액,
    신규취득자수, 상실가입자수, 월회전율) 리스트를 반환한다.
    탈퇴(코드 2)와 가입자 30명 미만·당월고지금액 0 이하는 제외한다."""
    for enc in ("cp949", "utf-8-sig", "euc-kr"):
        try:
            with open(path, encoding=enc, newline="", errors="strict") as f:
                f.readline()
            break
        except (UnicodeDecodeError, LookupError):
            continue
    else:
        sys.exit("[중단] 원본 파일의 인코딩을 판별하지 못했습니다: %s" % path)

    rows = []
    with open(path, encoding=enc, newline="", errors="replace") as f:
        rdr = csv.DictReader(f)
        for r in rdr:
            if r.get("사업장가입상태코드 1 등록 2 탈퇴", "").strip() != "1":
                continue  # 탈퇴 제외
            try:
                cnt = int(r.get("가입자수", "0") or 0)
                new = int(r.get("신규취득자수", "0") or 0)
                lost = int(r.get("상실가입자수", "0") or 0)
                amt = int(r.get("당월고지금액", "0") or 0)
            except (ValueError, KeyError):
                continue
            if cnt < MIN_HEADCOUNT or amt <= 0:
                continue
            addr = r.get("사업장지번상세주소", "") or ""
            sido = addr.split(" ")[0] if addr else ""
            form = "법인" if r.get("사업장형태구분코드 1 법인 2 개인", "") == "1" else "개인"
            turnover = (new + lost) / 2 / cnt
            rows.append({
                "자료생성년월": r.get("자료생성년월", ""),
                "사업장명": r.get("사업장명", "").strip(),
                "업종": r.get("사업장업종코드명", "").strip(),
                "시도": sido,
                "사업장형태": form,
                "가입자수": cnt,
                "당월고지금액": amt,
                "신규취득자수": new,
                "상실가입자수": lost,
                "_회전율": turnover,
            })
    return rows, enc


def sorted_quantiles(values, p25=0.25, p75=0.75, p90=0.90):
    """정렬 후 인덱스로 직접 분위수를 계산한다.
    statistics.quantiles는 사용하지 않는다 — 반환 개수가 버전 따라 달라
    매핑 실수가 발생하기 때문이다.
    v[min(len(v)-1, int(len(v)*p))]
    """
    v = sorted(values)
    n = len(v)
    return (
        v[min(n - 1, int(n * p25))],
        v[min(n - 1, int(n * p75))],
        v[min(n - 1, int(n * p90))],
    )


def build_baseline(rows):
    """업종별 월회전율 중앙값과 분위수(p25, p75, p90)를 dict로 만든다.
    조건: 업종당 사업장 8개 이상, 중앙값 0 초과."""
    by_ind = defaultdict(list)
    for r in rows:
        if r["업종"]:
            by_ind[r["업종"]].append(r["_회전율"])

    base = {}
    for ind, v in by_ind.items():
        if len(v) < MIN_SITES:
            continue
        sv = sorted(v)
        n = len(sv)
        med = sv[n // 2] if n % 2 == 1 else (sv[n // 2 - 1] + sv[n // 2]) / 2
        if med <= 0:
            continue  # 중앙값 0은 업종배수의 분모가 될 수 없다
        p25, p75, p90 = sorted_quantiles(v)
        base[ind] = {
            "n": n,
            "median": med,
            "p25": p25,
            "p75": p75,
            "p90": p90,
        }
    return base, by_ind


def write_baseline(base):
    """업종 기준선 CSV를 쓴다."""
    os.makedirs(os.path.dirname(OUT_BASE), exist_ok=True)
    with open(OUT_BASE, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["업종", "사업장수", "월회전율중앙값", "p25", "p75", "p90"])
        for ind in sorted(base, key=lambda k: -base[k]["median"]):
            d = base[ind]
            w.writerow([
                ind,
                d["n"],
                round(d["median"], 5),
                round(d["p25"], 5),
                round(d["p75"], 5),
                round(d["p90"], 5),
            ])
    print("업종 기준선: {:,}개 업종 -> {}".format(len(base), OUT_BASE))


def build_sample(rows, by_ind):
    """층화 추출로 시연용 샘플을 만든다.
    유형별 풀에서 무작위 추출 + 무작위분을 더한다.
    가입자 3000명 이상은 전원 포함한다."""
    sel, seen = [], set()

    def take(pool, k, label):
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
        print("   {:<30} {:>5}개".format(label, n))

    print("샘플 구성:")

    # 회전문형: 순증감이 가입자수의 1% 이내 + 회전율 10% 이상 + 일용 제외
    take([
        r for r in rows
        if abs(r["신규취득자수"] - r["상실가입자수"]) <= max(1, r["가입자수"] * 0.01)
        and r["_회전율"] >= 0.10
        and not DAILY_PAT.search(r["사업장명"])
    ], 200, "회전문형(순증감≈0·회전高)")

    # 일용: 사업장명에 일용 포함
    take([r for r in rows if DAILY_PAT.search(r["사업장명"])], 80, "일용(함정 케이스)")

    # 성장형: 순취득 = 신규 - 상실 >= max(5, 가입자수*5%)
    take([
        r for r in rows
        if r["신규취득자수"] - r["상실가입자수"] >= max(5, r["가입자수"] * 0.05)
    ], 150, "성장형")

    # 감축형: 순상실 = 상실 - 신규 >= max(5, 가입자수*5%)
    take([
        r for r in rows
        if r["상실가입자수"] - r["신규취득자수"] >= max(5, r["가입자수"] * 0.05)
    ], 150, "감축형")

    # 소득상한 도달: 추정소득 = 당월고지금액 / 가입자수 / 0.09 가 CAP의 99.5% 이상
    take([
        r for r in rows
        if r["당월고지금액"] / r["가입자수"] / 0.09 >= CAP_OBSERVED * 0.995
    ], 120, "상한 도달")

    # 저회전 안정형: 월회전율 1% 이하
    take([r for r in rows if r["_회전율"] <= 0.01], 300, "저회전 안정형")

    # 초대형: 가입자 3000명 이상 — 전원 포함
    big = [r for r in rows if r["가입자수"] >= 3000]
    for r in big:
        key = (r["사업장명"], r["가입자수"])
        if key not in seen:
            seen.add(key)
            sel.append(r)
    print("   {:<30} {:>5}개".format("초대형(3000명+) — 전원 포함", len(big)))

    # 대기업: 가입자 1000명 이상, 200개 무작위
    take([r for r in rows if r["가입자수"] >= 1000], 200, "대기업(1000명+)")

    # 무작위: 전체 행에서 900개
    take(rows, 900, "무작위")

    random.shuffle(sel)
    return sel


def write_sample(sel):
    """샘플 CSV를 쓴다."""
    os.makedirs(os.path.dirname(OUT_SAMPLE), exist_ok=True)
    FIELDS = [
        "자료생성년월", "사업장명", "업종", "시도", "사업장형태",
        "가입자수", "당월고지금액", "신규취득자수", "상실가입자수",
    ]
    with open(OUT_SAMPLE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(sel)
    print("\n샘플 {:,}행 -> {}  ({:.0f} KB)".format(
        len(sel), OUT_SAMPLE, os.path.getsize(OUT_SAMPLE) / 1024))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    if not os.path.exists(src):
        sys.exit("[중단] 원본 파일을 찾을 수 없습니다: %s" % src)

    rows, enc = read_source(src)
    print("가입자 %d명 이상 · 등록 사업장: {:,}".format(len(rows)) % MIN_HEADCOUNT)

    base, by_ind = build_baseline(rows)
    write_baseline(base)
    sel = build_sample(rows, by_ind)
    write_sample(sel)


if __name__ == "__main__":
    main()
