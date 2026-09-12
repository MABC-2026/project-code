#!/usr/bin/env python3
"""
로컬 NPS 사업장 검색 1단계 검증 스크립트.

- 키는 os.environ["NPS_API_KEY"] 에서만 읽는다 (출력/로깅 금지)
- 키는 ENCODING 버전 (%2B %2F %3D 포함) 이므로 serviceKey 는 URL 문자열에 직접 붙인다.
  나머지 파라미터(wkplNm 등)만 urllib.parse.urlencode 로 정상 인코딩한다.
- Decoding 키를 쓰면 urllib 로 넘겨도 이중 인코딩되지 않지만,
  사용자가 가진 실제 키가 Encoding 버전이므로 URL 문자열 직접 붙이기 방식을 선택한다.
"""

import os
import sys
import json
import urllib.parse
import urllib.request

# .env.local 을 읽어 환경변수에 올린다 (python-dotenv 사용).
# 키는 절대 출력하지 않으며, 스크립트가 읽을 수 있도록만 로드한다.
try:
    from dotenv import load_dotenv
    load_dotenv("D:/종우네 작업공방/project-code/.env.local")
except Exception:
    pass

BASE_URL = "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2"

SEARCH_TERMS = ["케이티", "쿠팡풀필먼트"]


def fetch(wkpl_nm: str, page_no: int = 1, num_of_rows: int = 10) -> dict:
    key = os.environ.get("NPS_API_KEY")
    if not key:
        print("ERROR: NPS_API_KEY 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    # serviceKey 는 ENCODING 버전이므로 URL 문자열에 직접 붙인다 (이중 인코딩 방지).
    # 나머지 파라미터만 urlencode 로 인코딩.
    query = urllib.parse.urlencode({
        "wkplNm": wkpl_nm,
        "dataType": "json",
        "numOfRows": str(num_of_rows),
        "pageNo": str(page_no),
    }, safe="")
    url = f"{BASE_URL}?{query}&serviceKey={key}"

    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    # 공공데이터포털은 User-Agent 를 제한하는 경우가 있어 기본 값 유지

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"HTTP 오류: {e.code} {e.reason}", file=sys.stderr)
        print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        return {}
    except urllib.error.URLError as e:
        print(f"URL 오류: {e.reason}", file=sys.stderr)
        return {}

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print("응답이 JSON 이 아닙니다:", raw[:500], file=sys.stderr)
        return {}

    return data


def main():
    for term in SEARCH_TERMS:
        print(f"\n{'='*70}")
        print(f"[검색어] {term}")
        print(f"{'='*70}")
        data = fetch(term)
        if not data:
            continue

        # resultCode 확인
        header = data.get("response", {}).get("header", {})
        result_code = header.get("resultCode", "N/A")
        result_msg = header.get("resultMsg", "N/A")
        print(f"resultCode: {result_code}")
        print(f"resultMsg : {result_msg}")

        if result_code != "00":
            print(f"\n⚠ resultCode가 00이 아닙니다. 상세 메시지는 위 resultMsg 참고.")
            continue

        items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]
        if not items:
            print("  → 검색된 항목이 없습니다.")
            continue

        print(f"  → 총 {len(items)}건")
        for i, item in enumerate(items, 1):
            print(f"  [{i}]")
            print(f"      seq                : {item.get('seq', 'N/A')}")
            print(f"      wkplNm             : {item.get('wkplNm', 'N/A')}")
            print(f"      wkplRoadNmDtlAddr  : {item.get('wkplRoadNmDtlAddr', 'N/A')}")
            print(f"      wkplJnngStcd       : {item.get('wkplJnngStcd', 'N/A')}")
            # ⚠️ 가입자수는 이 응답에 없음 — 상세조회에서 가져온다


if __name__ == "__main__":
    main()
