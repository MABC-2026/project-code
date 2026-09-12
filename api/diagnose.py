import json
import os
import sys
import tempfile
import traceback
import statistics as _statistics

# Vercel Python 서버리스 함수: /api/diagnose
# skill/scripts/stability.py 의 계산 로직을 그대로 import 해서 사용한다.
# TypeScript로 다시 쓰지 않는다. 계산은 stability.run()이 한다.

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL_SCRIPTS = os.path.join(ROOT, "skill", "scripts")
SKILL_ASSETS = os.path.join(ROOT, "skill", "assets")

sys.path.insert(0, SKILL_SCRIPTS)

from stability import run, read_rows, MIN_HEADCOUNT, RANK_MIN_HEADCOUNT, NO_INDUSTRY

BASELINE_PATH = os.path.join(SKILL_ASSETS, "industry_baseline.csv")
SAMPLE_PATH = os.path.join(SKILL_ASSETS, "sample_workplaces.csv")


def _resolve_csv_path(raw: str) -> str:
    """요청에서 받은 CSV 경로를 안전히 해결한다.
    절대경로면 skill/assets 아래인지 확인하고, 상대경로면 skill/assets 기준으로 해석한다."""
    if not raw or not raw.strip():
        return SAMPLE_PATH
    raw = raw.strip()
    if os.path.isabs(raw):
        real = os.path.realpath(raw)
        real_assets = os.path.realpath(SKILL_ASSETS)
        if not real.startswith(real_assets + os.sep):
            raise ValueError("csvPath 는 skill/assets/ 아래만 사용할 수 있습니다")
        return real
    return os.path.normpath(os.path.join(SKILL_ASSETS, raw))


def _read_csv_text(path: str) -> str:
    if not os.path.exists(path):
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {path}")
    with open(path, encoding="utf-8-sig") as f:
        return f.read()


def _rows_from_text(text: str):
    from stability import read_rows
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, encoding="utf-8-sig") as f:
        f.write(text)
        tmp = f.name
    try:
        rows, dropped, enc = read_rows(tmp)
        return rows, dropped
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


def _build_diagnosis_dict(row, base, allmed):
    """stability.run()이 반환한 개별 사업장 dict을 프론트엔드용으로 변환한다.
    원문 스크립트의 출력 포맷이 아니라, 동일한 계산값만 JSON으로 재배열한다."""
    b = base.get(row["업종"], allmed) or allmed
    cap = ""
    if row["추정소득"] > 0 and "소득상한도달" in row["경고"]:
        cap = " ⚠️ 상한 도달 — 실제 평균 급여는 이보다 높습니다"
    return {
        "사업장명": row["사업장명"],
        "업종": row["업종"],
        "시도": row["시도"],
        "가입자수": row["가입자수"],
        "순증감": row["순증감"],
        "총이동": row["총이동"],
        "신규": row["신규"],
        "상실": row["상실"],
        "월회전율": round(row["월회전율"], 6),
        "연환산회전율": round(row["월회전율"] * 1200, 1),
        "은폐지수": round(row["은폐지수"], 2),
        "업종배수": round(row["업종배수"], 2),
        "추정소득": round(row["추정소득"]) if row["추정소득"] > 0 else None,
        "추정소득상한주의": "소득상한도달" in row["경고"],
        "업종중앙값": round(b, 6),
        "경고": row["경고"],
    }


def diagnose(request):
    """Vercel Python 서버리스 함수 진입점. POST /api/diagnose."""
    try:
        if request.method == "OPTIONS":
            return ("", 204, {"Content-Type": "text/plain"})
        if request.method != "POST":
            return (json.dumps({"error": "POST만 지원"}, ensure_ascii=False), 405,
                    {"Content-Type": "application/json"})

        raw_body = getattr(request, "body", None)
        if raw_body is None:
            return (json.dumps({"error": "본문 없음"}, ensure_ascii=False), 400,
                    {"Content-Type": "application/json"})
        if isinstance(raw_body, (bytes, bytearray)):
            raw_body = raw_body.decode("utf-8", errors="replace")
        try:
            body = json.loads(raw_body) if raw_body.strip() else {}
        except ValueError:
            return (json.dumps({"error": "JSON 파싱 실패"}, ensure_ascii=False), 400,
                    {"Content-Type": "application/json"})
        if not isinstance(body, dict):
            return (json.dumps({"error": "JSON 객체 필요"}, ensure_ascii=False), 400,
                    {"Content-Type": "application/json"})

        company = (body.get("company") or "").strip()
        csv_path_raw = (body.get("csvPath") or "").strip()
        top = body.get("top")
        pick = body.get("pick")
        try:
            top = int(top) if top is not None else None
            if pick is not None:
                pick = int(pick)
                if pick < 1:
                    raise ValueError
        except (TypeError, ValueError):
            return (json.dumps({"error": "'top'과 'pick'은 양의 정수여야 함"}, ensure_ascii=False), 400,
                    {"Content-Type": "application/json"})

        csv_path = _resolve_csv_path(csv_path_raw if csv_path_raw else "")
        csv_text = _read_csv_text(csv_path)
        rows, dropped = _rows_from_text(csv_text)
        if not rows:
            return (json.dumps({"error": "유효한 사업장이 없음"}, ensure_ascii=False), 422,
                    {"Content-Type": "application/json"})

        _analyzed, analyzed, base, allmed, YM, SEASON, _dropped_report, enc, BASE_SRC, result_list = run(
            path=csv_path, company=company, top_n=top,
        )

        is_sample = os.path.abspath(csv_path) == os.path.abspath(SAMPLE_PATH)

        if company:
            cand = list(result_list)
            cand = cand[:10]
            out = {
                "ok": True,
                "입력_샘플시연": is_sample,
                "검색결과_건수": len(cand),
                "자료년월": YM,
                "계절성주의": bool(SEASON),
                "기준선출처": BASE_SRC,
                "분석대상수": len(analyzed),
                "전체행수": len(rows),
                "제외행수": dropped,
                "업종기준선개수": len(base),
            }
            if not cand:
                out["회사_미발견"] = True
                out["검색그룹"] = {"정확히일치": [], "입력어로시작": [], "입력어포함": [], "유사명": []}
            elif len(cand) == 1:
                out["진단결과"] = _build_diagnosis_dict(cand[0], base, allmed)
            else:
                out["후보목록"] = [{"번호": i + 1, "사업장명": r["사업장명"],
                                     "업종": r["업종"], "시도": r["시도"],
                                     "가입자수": r["가입자수"]} for i, r in enumerate(cand)]
                out["후보_수"] = len(cand)
                out["검색그룹"] = {
                    "정확히일치": [r["사업장명"] for r in cand if company.replace(" ", "") in r["사업장명"].replace(" ", "")][:5],
                    "입력어로시작": [],
                    "입력어포함": [],
                    "유사명": [],
                }
            return (json.dumps(out, ensure_ascii=False), 200,
                    {"Content-Type": "application/json"})

        # 전체 리포트
        cand = [r for r in analyzed if not r["경고"] and r["총이동"] >= 10
                and r["가입자수"] >= RANK_MIN_HEADCOUNT and r["업종"] not in NO_INDUSTRY]
        rank = [r for r in cand if abs(r["순증감"]) <= max(1, r["가입자수"] * 0.01)
                and r["업종배수"] >= 2.0]
        cand_ranked = [r for r in analyzed if not r["경고"] and r["총이동"] >= 10
                       and r["가입자수"] >= RANK_MIN_HEADCOUNT and r["업종"] not in NO_INDUSTRY]

        meds = sorted(base.values())
        hi_q = meds[min(len(meds) - 1, int(len(meds) * 0.95))] if meds else 0
        lo_q = meds[min(len(meds) - 1, int(len(meds) * 0.05))] if meds else 0
        편차배수 = (hi_q / lo_q) if len(meds) >= 2 and lo_q > 0 else None

        out = {
            "ok": True,
            "입력_샘플시연": is_sample,
            "자료년월": YM,
            "계절성주의": bool(SEASON),
            "분석대상수": len(analyzed),
            "전체행수": len(rows),
            "제외행수": dropped,
            "기준선출처": BASE_SRC,
            "업종기준선개수": len(base),
            "summary": {
                "월회전율중앙값": round(float(_statistics.median([r["월회전율"] for r in analyzed])), 6) if analyzed else 0.0,
                "연환산중앙값": round(float(_statistics.median([r["월회전율"] for r in analyzed]) or 0) * 1200, 2) if analyzed else 0.0,
                "총원은그대로대량이동_개수": len(rank),
                "총원은그대로대량이동_비율": round(len(rank) / len(analyzed) * 100, 2) if analyzed else 0.0,
                "해석주의_사업장수": sum(1 for r in analyzed if r["경고"]),
                "기준선출처": BASE_SRC,
                "자료년월": YM,
            },
            "높은업종_상위5": [{"업종": k, "중앙값": round(v * 100, 2)}
                              for k, v in sorted(base.items(), key=lambda x: -x[1])[:5]],
            "낮은업종_하위5": [{"업종": k, "중앙값": round(v * 100, 2)}
                              for k, v in sorted(base.items(), key=lambda x: x[1])[:5]],
            "업종간편차배수": round(편차배수, 2) if 편차배수 else None,
            "총원숨긴이동_상위": [
                {"사업장명": r["사업장명"], "업종": r["업종"], "가입자수": r["가입자수"],
                 "순증감": r["순증감"], "총이동": r["총이동"],
                 "업종배수": round(r["업종배수"], 2), "은폐지수": round(r["은폐지수"], 2)}
                for r in sorted(rank, key=lambda x: -x["업종배수"])[:(top or 10)]
            ],
            "업종대비_상위": [
                {"사업장명": r["사업장명"], "업종": r["업종"], "가입자수": r["가입자수"],
                 "월회전율": round(r["월회전율"] * 100, 2),
                 "업종중앙값": round(base[r["업종"]] * 100, 2),
                 "배수": round(r["업종배수"], 2)}
                for r in sorted([r for r in cand_ranked if r["업종"] in base],
                                key=lambda x: -x["업종배수"])[:(top or 10)]
            ],
        }
        return (json.dumps(out, ensure_ascii=False), 200,
                {"Content-Type": "application/json"})

    except FileNotFoundError as e:
        return (json.dumps({"error": str(e)}, ensure_ascii=False), 404,
                {"Content-Type": "application/json"})
    except ValueError as e:
        return (json.dumps({"error": str(e)}, ensure_ascii=False), 400,
                {"Content-Type": "application/json"})
    except Exception:
        return (json.dumps({"error": "서버 오류", "detail": traceback.format_exc()},
                            ensure_ascii=False), 500, {"Content-Type": "application/json"})
