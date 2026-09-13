import { NextRequest, NextResponse } from "next/server";
export const maxDuration = 60;
import * as fs from "fs";
import * as path from "path";

// .env.local 을 읽어 환경변수에 반영한다.
// (next dev / next start 시 자동 로드되지 않는 경우를 대비한 수동 로드)
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const raw = fs.readFileSync(envLocalPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

const BASE_URL =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2";

/**
 * NPS 사업장 검색 (1단계)
 *
 * 인증키는 ENCODING 버전(%2B %2F %3D 포함) 이므로 serviceKey 는 URL 문자열에 직접 붙인다.
 * 나머지 파라미터(wkplNm, dataType, numOfRows, pageNo)만 URLSearchParams 로 인코딩한다.
 * 디코딩 키를 쓰면 params 객체에 넣어도 이중 인코딩되지 않지만,
 * 사용자가 실제 ENCODING 키를 보유하고 있어 이 방식을 선택한다.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const wkplNm = searchParams.get("wkplNm");
  const pageNo = parseInt(searchParams.get("pageNo") ?? "1", 10);
  const numOfRows = parseInt(searchParams.get("numOfRows") ?? "100", 10);

  if (!wkplNm || wkplNm.trim().length === 0) {
    return NextResponse.json(
      { error: "wkplNm(사업장명) 쿼리가 필요합니다." },
      { status: 400 }
    );
  }

  // 키는 서버 사이드에서만 읽는다 (NEXT_PUBLIC_ 접두사 사용 안 함).
  const apiKey = process.env.NPS_API_KEY;
  if (!apiKey) {
    console.error("[NPS] NPS_API_KEY 환경변수가 설정되지 않았습니다.");
    return NextResponse.json(
      { error: "서버 설정 오류: NPS_API_KEY가 없습니다." },
      { status: 500 }
    );
  }

  // serviceKey 는 ENCODING 키이므로 URL 문자열에 직접 붙여서 이중 인코딩을 피한다.
  const encodedParams = new URLSearchParams({
    wkplNm: wkplNm.trim(),
    dataType: "json",
    numOfRows: numOfRows.toString(),
    pageNo: pageNo.toString(),
  });

  const url = `${BASE_URL}?${encodedParams.toString()}&serviceKey=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[NPS] HTTP ${res.status}: ${text.slice(0, 500)}`);
      return NextResponse.json(
        { error: `공공데이터 포털 응답 오류 (${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json();

    const header =
      data?.response?.header ?? {};
    const resultCode = header.resultCode;
    const resultMsg = header.resultMsg;

    // 정상 판정: resultCode === "00"
    if (resultCode !== "00") {
      return NextResponse.json(
        {
          resultCode,
          resultMsg,
          items: [],
          warned: true,
        },
        { status: 200 } // API 자체가 반환한 코드이므로 200 으로 전달
      );
    }

    const items =
      data?.response?.body?.items?.item ?? [];
    // item 이 객체 하나일 때도 배열로 정규화
    const normalizedItems = Array.isArray(items) ? items : [items];

    // ── 중복 제거: 사업장명(wkplNm) + 사업자번호(bzowrRgstNo) 기준 그룹화 ──
    // 같은 사업장이 달마다 한 번씩(최대 12회) 들어오며, seq와 주소가 달라도
    // wkplNm + bzowrRgstNo 가 같으면 한 업체로 묶는다. 주소는 묶는 기준에 넣지 않는다.
    const groups = new Map<string, typeof normalizedItems>();
    for (const it of normalizedItems) {
      const key = `${it.wkplNm}|${it.bzowrRgstNo ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }

    // 그룹별 대표: dataCrtYm 이 가장 최신인 항목 하나 + 개월수(그룹 크기)
    const representatives: Array<{
      seq: string;
      wkplNm: string;
      wkplRoadNmDtlAddr: string;
      wkplJnngStcd: string;
      bzowrRgstNo: string;
      dataCrtYm: string;
      months: number;
    }> = [];
    for (const [, group] of groups) {
      let best = group[0];
      for (const it of group) {
        if (it.dataCrtYm > best.dataCrtYm) best = it;
      }
      representatives.push({
        seq: best.seq,
        wkplNm: best.wkplNm,
        wkplRoadNmDtlAddr: best.wkplRoadNmDtlAddr,
        wkplJnngStcd: best.wkplJnngStcd,
        bzowrRgstNo: best.bzowrRgstNo ?? "",
        dataCrtYm: best.dataCrtYm,
        months: group.length,
      });
    }

    // ── 4단계 정렬 (skill/scripts/stability.py:search_company 와 동일 로직) ──
    function norm(s: string): string {
      return s.replace(/[\s_\-()]/g, "").toLowerCase();
    }
    function stripCorp(name: string): string {
      let r = name;
      for (const p of [
        /주식회사\s*/g,
        /유한회사\s*/g,
        /유한책임회사\s*/g,
        /\(\s*주\s*\)/g,
        /（\s*주\s*）/g,
        /\(\s*유\s*\)/g,
        /（\s*유\s*）/g,
        /㈜\s*/g,
      ]) {
        r = r.replace(p, "");
      }
      return r.trim();
    }
    function bigrams(s: string): Set<string> {
      const n = norm(s);
      if (n.length < 2) return new Set();
      const set = new Set<string>();
      for (let i = 0; i < n.length - 1; i++) {
        set.add(n.slice(i, i + 2));
      }
      return set;
    }
    function jaccard(a: string, b: string): number {
      const ba = bigrams(a);
      const bb = bigrams(b);
      if (ba.size === 0 && bb.size === 0) return 0;
      let inter = 0;
      for (const x of ba) {
        if (bb.has(x)) inter++;
      }
      const union = new Set([...ba, ...bb]);
      return inter / union.size;
    }

    const qNorm = norm(wkplNm);
    const qStripped = stripCorp(wkplNm);
    const exact: typeof representatives = [];
    const startsWith: typeof representatives = [];
    const contains: typeof representatives = [];
    const similar: typeof representatives = [];
    const seen = new Set<string>();

    for (const it of representatives) {
      const name = it.wkplNm;
      const bzno = it.bzowrRgstNo;
      const key = `${name}|${bzno}`;
      if (seen.has(key)) continue;
      const nNorm = norm(name);
      const nStripped = stripCorp(name);
      if (stripCorp(nNorm) === stripCorp(qNorm)) {
        exact.push(it);
        seen.add(key);
        continue;
      }
      if (nNorm.startsWith(qNorm)) {
        startsWith.push(it);
        seen.add(key);
        continue;
      }
      if (nNorm.includes(qNorm)) {
        contains.push(it);
        seen.add(key);
        continue;
      }
      if (jaccard(nStripped, qStripped) >= 0.5) {
        similar.push(it);
        seen.add(key);
      }
    }

    // 각 그룹 내 순서는 공공 API 반환 순서 유지 (가입자수 필드 없음)
    const sortedItems = [...exact, ...startsWith, ...contains, ...similar];

    // 사용자에게는 상위 10건만 노출
    const displayedItems = sortedItems.slice(0, 10);

    return NextResponse.json({
      resultCode,
      resultMsg,
      numOfRows: 10,
      pageNo,
      totalCount: data?.response?.body?.totalCount,
      items: displayedItems,
    });
  } catch (err) {
    console.error("[NPS] 요청 실패:", err);
    return NextResponse.json(
      { error: "NPS API 요청 중 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
