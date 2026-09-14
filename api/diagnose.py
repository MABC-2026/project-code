import json
import os
import re
import csv
import sys
import tempfile
import traceback
import statistics as _statistics
from http.server import BaseHTTPRequestHandler

# Vercel Python 서버리스 함수: /api/diagnose
# skill/scripts/stability.py 의 계산 로직을 그대로 import 해서 사용한다.
# TypeScript로 다시 쓰지 않는다. 계산은 stability.run()이 한다.

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SKILL_SCRIPTS = os.path.join(ROOT, "skill", "scripts")
SKILL_ASSETS = os.path.join(ROOT, "skill", "assets")

sys.path.insert(0, SKILL_SCRIPTS)

from stability import run, read_rows, MIN_HEADCOUNT, RANK_MIN_HEADCOUNT, NO_INDUSTRY, search_company

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


def _rows_to_temp_csv(rows):
    """read_rows 결과 행 목록을 stability.run()이 읽을 수 있는 임시 CSV로 쓰고 경로를 반환한다.

    read_rows 결과의 키(년월·신규·상실·고지금액)를 stability가 기대하는 열 이름으로 옮겨 쓴다.
    부른 쪽이 finally에서 반드시 지운다."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                      encoding="utf-8-sig", newline="")
    try:
        w = csv.writer(tmp)
        w.writerow(["자료생성년월", "사업장명", "업종", "시도", "사업장형태",
                    "가입자수", "당월고지금액", "신규취득자수", "상실가입자수"])
        for r in rows:
            w.writerow([
                r.get("년월", ""),
                r.get("사업장명", ""),
                r.get("업종", ""),
                r.get("시도", ""),
                "",  # 사업장형태 — read_rows 결과에 없음
                r.get("가입자수", 0),
                r.get("고지금액", 0),
                r.get("신규", 0),
                r.get("상실", 0),
            ])
        tmp.close()
        return tmp.name
    except Exception:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise

_BASELINE_INFO_CACHE = None


def _baseline_info():
    """기준선 CSV를 한 번만 읽어 캐시한다.

    반환: { 업종명: {"사업장수": int, "p25": float, "p50": float, "p75": float, "p90": float} }
    """
    global _BASELINE_INFO_CACHE
    if _BASELINE_INFO_CACHE is not None:
        return _BASELINE_INFO_CACHE
    info = {}
    try:
        with open(BASELINE_PATH, encoding="utf-8-sig", newline="") as f:
            rdr = csv.DictReader(f)
            for row in rdr:
                name = (row.get("업종") or "").strip()
                if not name:
                    continue
                median = (row.get("월회전율중앙값") or "").strip()
                p25 = (row.get("p25") or "").strip()
                p75 = (row.get("p75") or "").strip()
                p90 = (row.get("p90") or "").strip()
                try:
                    med_f = float(median) if median else 0.0
                except (ValueError, TypeError):
                    med_f = 0.0

                def _fill(v):
                    if v:
                        try:
                            return float(v)
                        except (ValueError, TypeError):
                            pass
                    return med_f

                info[name] = {
                    "사업장수": int(row.get("사업장수", 0) or 0),
                    "p25": _fill(p25),
                    "p50": med_f,
                    "p75": _fill(p75),
                    "p90": _fill(p90),
                }
    except Exception:
        info = {}
    _BASELINE_INFO_CACHE = info
    return info


def _industry_position(업종, 월회전율):
    """같은 업종 안에서의 위치를 분위수로 반환한다.

    업종이 기준선에 없으면 None.
    """
    info = _baseline_info()
    if 업종 not in info:
        return None
    b = info[업종]
    r = 월회전율
    p25 = b["p25"]
    p50 = b["p50"]
    p75 = b["p75"]
    p90 = b["p90"]
    if r >= p90:
        구간 = "상위 10% 안"
    elif r >= p75:
        구간 = "상위 10~25%"
    elif r >= p50:
        구간 = "상위 25~50%"
    elif r >= p25:
        구간 = "하위 25~50%"
    else:
        구간 = "하위 25% 안"
    return {
        "비교사업장수": b["사업장수"],
        "p25": round(p25, 6),
        "p50": round(p50, 6),
        "p75": round(p75, 6),
        "p90": round(p90, 6),
        "구간": 구간,
    }


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
        "업종위치": _industry_position(row["업종"], row["월회전율"]),
    }


class handler(BaseHTTPRequestHandler):
    """Vercel Python 서버리스 함수 진입점. POST /api/diagnose."""

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length) if content_length > 0 else b""
            if not raw_body.strip():
                body = {}
            else:
                try:
                    body = json.loads(raw_body.decode("utf-8"))
                except ValueError:
                    self._json_error("JSON 파싱 실패", 400)
                    return
            if not isinstance(body, dict):
                self._json_error("JSON 객체 필요", 400)
                return

            # ── 공공 API 경로: POST 본문에 rows 가 있으면 여기서 처리하고 바로 응답 ──
            if "rows" in body:
                _rows = body["rows"]
                if not isinstance(_rows, list) or len(_rows) == 0:
                    self._json_error("rows는 비어 있지 않은 배열이어야 합니다", 400)
                    return

                # ── 검사 ──────────────────────────────────────────────────────────
                _최대년월 = ""
                _제외한달 = []
                for _i, _r in enumerate(_rows):
                    if not isinstance(_r, dict):
                        self._json_error("rows의 %d번째 항목이 객체가 아닙니다" % (_i + 1), 400)
                        return
                    _사업장명 = (_r.get(u"사업장명") or u"").strip()
                    _년월 = (_r.get(u"자료생성년월") or u"").strip()
                    _신규 = _r.get(u"신규취득자수")
                    _상실 = _r.get(u"상실가입자수")
                    if not _사업장명 or not _년월:
                        self._json_error("rows의 %d번째 행에 사업장명·자료생성년월이 필요합니다" % (_i + 1), 400)
                        return
                    for _vname, _v in ((u"신규취득자수", _신규), (u"상실가입자수", _상실)):
                        try:
                            _iv = int(_v)
                        except (TypeError, ValueError):
                            self._json_error("rows의 %d번째 행 %s는 정수여야 합니다" % (_i + 1, _vname), 400)
                            return
                        if _iv < 0:
                            self._json_error("rows의 %d번째 행 %s는 0 이상이어야 합니다" % (_i + 1, _vname), 400)
                            return
                    _cnt = _r.get(u"가입자수")
                    try:
                        _cnt_i = int(_cnt) if _cnt is not None else 0
                    except (TypeError, ValueError):
                        _cnt_i = 0
                    if _cnt_i <= 0:
                        _제외한달.append({"년월": _년월, "사업장명": _사업장명})
                    else:
                        if _년월 > _최대년월:
                            _최대년월 = _년월
                _최신제외 = [e for e in _제외한달 if e["년월"] == _최대년월]
                if _최신제외:
                    self._json_error("가장 최신 달(%s)의 가입자수가 0 이하인 행이 있어 진단할 수 없습니다" % _최대년월, 400)
                    return

                # ── 업종 맞추기 ─────────────────────────────────────────────────────
                _baseline_names = []
                try:
                    with open(BASELINE_PATH, encoding="utf-8-sig", newline="") as _bf:
                        _brdr = csv.DictReader(_bf)
                        for _br in _brdr:
                            _bn = (_br.get(u"업종") or u"").strip()
                            if _bn:
                                _baseline_names.append(_bn)
                except Exception:
                    _baseline_names = []
                _norm_cache = {}
                def _norm_ind(s):
                    return re.sub(r"[^가-힣a-zA-Z0-9]", "", (s or "")).lower()
                def _resolve_ind_name(ind):
                    if ind in _baseline_names:
                        return ind, True
                    _n = _norm_ind(ind)
                    if _n in _norm_cache:
                        return _norm_cache[_n], True
                    for _bn in _baseline_names:
                        if _norm_ind(_bn) == _n:
                            _norm_cache[_n] = _bn
                            return _bn, True
                    _norm_cache[_n] = None
                    return ind, False
                _최신원본업종 = None
                _rows_fixed = []
                for _r in _rows:
                    _ind = (_r.get(u"업종") or u"").strip()
                    if _ind:
                        _resolved, _matched = _resolve_ind_name(_ind)
                    else:
                        _resolved, _matched = _ind, False
                    _r2 = dict(_r)
                    if _ind:
                        _r2[u"업종"] = _resolved
                    _rows_fixed.append(_r2)
                    if _r.get(u"자료생성년월", u"").strip() == _최대년월 and _최신원본업종 is None:
                        _최신원본업종 = _ind
                _기준선업종명 = None
                _업종기준선일치 = False
                _진단행 = None
                for _r in _rows_fixed:
                    if (_r.get(u"자료생성년월") or u"").strip() == _최대년월 and (_r.get(u"가입자수") or 0) > 0:
                        _진단행 = _r
                        _기준선업종명 = _r.get(u"업종", u"")
                        _업종기준선일치 = _기준선업종명 in _baseline_names and bool(_기준선업종명)
                        break

                # ── 진단용 임시 CSV (최신 달 한 행) ──────────────────────────────────
                _out_YM = u""
                _out_SEASON = False
                _out_BASE_SRC = u""
                _out_진단결과 = {}
                if _진단행:
                    _진단텀프 = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                                            encoding="utf-8-sig", newline="")
                    _진단fname = _진단텀프.name
                    _w = csv.writer(_진단텀프)
                    _w.writerow([u"자료생성년월", u"사업장명", u"업종", u"시도", u"사업장형태",
                                 u"가입자수", u"당월고지금액", u"신규취득자수", u"상실가입자수"])
                    _w.writerow([
                        _진단행.get(u"자료생성년월", u""),
                        _진단행.get(u"사업장명", u""),
                        _진단행.get(u"업종", u""),
                        _진단행.get(u"시도", u""),
                        _진단행.get(u"사업장형태", u""),
                        _진단행.get(u"가입자수", 0),
                        _진단행.get(u"당월고지금액", 0),
                        _진단행.get(u"신규취득자수", 0),
                        _진단행.get(u"상실가입자수", 0),
                    ])
                    _진단텀프.close()
                    try:
                        (_d_rows, _d_analyzed, _d_base, _d_allmed, _d_YM, _d_SEASON,
                         _d_dropped, _d_enc, _d_BASE_SRC, _d_result_list) = run(
                            path=_진단fname, company=_진단행.get(u"사업장명", u""))
                        _out_YM = _d_YM
                        _out_SEASON = bool(_d_SEASON)
                        _out_BASE_SRC = _d_BASE_SRC
                        if _d_result_list:
                            _out_진단결과 = _build_diagnosis_dict(_d_result_list[0], _d_base, _d_allmed)
                    finally:
                        try:
                            os.unlink(_진단fname)
                        except OSError:
                            pass
                        _진단fname = None

                # ── 추이용 임시 CSV (전체 행, 가입자수>0만) ──────────────────────────
                _추이 = []
                _유효행 = [r for r in _rows_fixed if (r.get(u"가입자수") or 0) > 0]
                if _유효행:
                    _추이텀프 = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False,
                                                            encoding="utf-8-sig", newline="")
                    _추이fname = _추이텀프.name
                    _w2 = csv.writer(_추이텀프)
                    _w2.writerow([u"자료생성년월", u"사업장명", u"업종", u"시도", u"사업장형태",
                                  u"가입자수", u"당월고지금액", u"신규취득자수", u"상실가입자수"])
                    for _r in _유효행:
                        _w2.writerow([
                            _r.get(u"자료생성년월", u""),
                            _r.get(u"사업장명", u""),
                            _r.get(u"업종", u""),
                            _r.get(u"시도", u""),
                            _r.get(u"사업장형태", u""),
                            _r.get(u"가입자수", 0),
                            _r.get(u"당월고지금액", 0),
                            _r.get(u"신규취득자수", 0),
                            _r.get(u"상실가입자수", 0),
                        ])
                    _추이텀프.close()
                    try:
                        (_t_rows, _t_analyzed, _t_base, _t_allmed, _t_YM, _t_SEASON,
                         _t_dropped, _t_enc, _t_BASE_SRC, _t_result_list) = run(path=_추이fname)
                        _by_month = {}
                        for _r in _t_rows:
                            _ym = _r.get(u"년월", u"")
                            if not _ym:
                                continue
                            if _ym not in _by_month:
                                _by_month[_ym] = {"가입자수": 0, "신규": 0, "상실": 0}
                            _by_month[_ym]["가입자수"] += _r.get(u"가입자수", 0)
                            _by_month[_ym]["신규"] += _r.get(u"신규", 0)
                            _by_month[_ym]["상실"] += _r.get(u"상실", 0)
                        for _ym in sorted(_by_month.keys()):
                            _d = _by_month[_ym]
                            _순증감 = _d["신규"] - _d["상실"]
                            _총이동 = _d["신규"] + _d["상실"]
                            _회전 = round(_총이동 / 2.0 / _d["가입자수"], 6) if _d["가입자수"] > 0 else 0.0
                            _추이.append({
                                "자료년월": _ym,
                                "가입자수": _d["가입자수"],
                                "신규": _d["신규"],
                                "상실": _d["상실"],
                                "순증감": _순증감,
                                "총이동": _총이동,
                                "월회전율": _회전,
                            })
                    finally:
                        try:
                            os.unlink(_추이fname)
                        except OSError:
                            pass
                        _추이fname = None

                # ── 응답 ──────────────────────────────────────────────────────────
                out = {
                    "ok": True,
                    "입력_출처": u"공공데이터 API",
                    "자료년월": _out_YM,
                    "계절성주의": _out_SEASON,
                    "기준선출처": _out_BASE_SRC,
                    "업종기준선_일치": _업종기준선일치,
                    "기준선_업종명": _기준선업종명 if _업종기준선일치 else None,
                    "원본_업종명": _최신원본업종 or u"",
                    "진단결과": _out_진단결과,
                    "추이": _추이,
                    "제외한달": _제외한달,
                    "안내문": u"본 수치는 공식 통계가 아니라 조회 시점의 행정 기록입니다",
                }
                self._json_response(out, 200)
                return

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
                self._json_error("'top'과 'pick'은 양의 정수여야 함", 400)
                return

            csv_path = _resolve_csv_path(csv_path_raw if csv_path_raw else "")
            csv_text = _read_csv_text(csv_path)
            rows, dropped = _rows_from_text(csv_text)
            if not rows:
                self._json_error("유효한 사업장이 없음", 422)
                return

            # 회사 검색 경로 — company 가 있을 때
            if company:
                exact, starts_with, contains, similar = search_company(rows, company)
                cand = list(exact) + list(starts_with) + list(contains) + list(similar)
                cand = cand[:10]
                if not cand:
                    out = {
                        "ok": True,
                        "입력_샘플시연": os.path.abspath(csv_path) == os.path.abspath(SAMPLE_PATH),
                        "검색결과_건수": 0,
                        "분석대상수": sum(1 for r in rows if r["가입자수"] >= MIN_HEADCOUNT),
                        "전체행수": len(rows),
                        "제외행수": dropped,
                        "회사_미발견": True,
                        "검색그룹": {"정확히일치": [], "입력어로시작": [], "입력어포함": [], "유사명": []},
                    }
                    self._json_response(out, 200)
                    return
                # 후보 행만 임시 CSV에 쓰고 run 호출
                tmp_path = _rows_to_temp_csv(cand)
                try:
                    (_analyzed, analyzed, base, allmed, YM, SEASON,
                     _dropped_report, enc, BASE_SRC, result_list) = run(
                        path=tmp_path, company=company, top_n=top,
                    )
                finally:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
                cand = list(result_list)[:10]
                is_sample = os.path.abspath(csv_path) == os.path.abspath(SAMPLE_PATH)

                if pick is not None and 1 <= pick <= len(cand):
                    out = {
                        "ok": True,
                        "입력_샘플시연": is_sample,
                        "검색결과_건수": len(cand),
                        "자료년월": YM,
                        "계절성주의": bool(SEASON),
                        "기준선출처": BASE_SRC,
                        "분석대상수": sum(1 for r in rows if r["가입자수"] >= MIN_HEADCOUNT),
                        "전체행수": len(rows),
                        "제외행수": dropped,
                        "업종기준선개수": len(base),
                    }
                    out["진단결과"] = _build_diagnosis_dict(cand[pick - 1], base, allmed)
                    self._json_response(out, 200)
                    return
                out = {
                    "ok": True,
                    "입력_샘플시연": is_sample,
                    "검색결과_건수": len(cand),
                    "자료년월": YM,
                    "계절성주의": bool(SEASON),
                    "기준선출처": BASE_SRC,
                    "분석대상수": sum(1 for r in rows if r["가입자수"] >= MIN_HEADCOUNT),
                    "전체행수": len(rows),
                    "제외행수": dropped,
                    "업종기준선개수": len(base),
                }
                if len(cand) == 1:
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
                self._json_response(out, 200)
                return

            # 전체 리포트 경로 — company 가 없을 때
            analyzed_chunks = []
            base = None
            allmed = None
            YM = None
            SEASON = None
            BASE_SRC = None
            for start in range(0, len(rows), 15000):
                chunk = rows[start:start + 15000]
                tmp_path = _rows_to_temp_csv(chunk)
                try:
                    (_analyzed, chunk_analyzed, chunk_base, chunk_allmed,
                     chunk_YM, chunk_SEASON, _dr, _enc, chunk_BASE_SRC,
                     _rl) = run(path=tmp_path, top_n=top)
                    analyzed_chunks.append(chunk_analyzed)
                    if base is None:
                        base = chunk_base
                        allmed = chunk_allmed
                        YM = chunk_YM
                        SEASON = chunk_SEASON
                        BASE_SRC = chunk_BASE_SRC
                finally:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
            analyzed = []
            for c in analyzed_chunks:
                analyzed.extend(c)
            is_sample = os.path.abspath(csv_path) == os.path.abspath(SAMPLE_PATH)
            cand = [r for r in analyzed if not r["경고"] and r["총이동"] >= 10
                    and r["가입자수"] >= RANK_MIN_HEADCOUNT and r["업종"] not in NO_INDUSTRY]
            rank = [r for r in cand if abs(r["순증감"]) <= max(1, r["가입자수"] * 0.01)
                    and r["업종배수"] >= 2.0 and r["업종"] in base]
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
            self._json_response(out, 200)

        except FileNotFoundError as e:
            self._json_error(str(e), 404)
        except ValueError as e:
            self._json_error(str(e), 400)
        except Exception:
            self._json_error("서버 오류", 500, detail=traceback.format_exc())

    def _json_response(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def _json_error(self, message, status, detail=None):
        obj = {"error": message}
        if detail:
            obj["detail"] = detail
        body = json.dumps(obj, ensure_ascii=False)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))
