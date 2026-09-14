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
const DETAIL_URL =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getDetailInfoSearchV2";

/** 영문 1~4개 연속 묶음만 한글 읽기로 변환. 5글자 이상은 그대로. 대소문자 구분 안 함. */
function toHangulLetters(s: string): string {
  const map: Record<string, string> = {
    A: "에이", B: "비", C: "씨", D: "디", E: "이", F: "에프", G: "지", H: "에이치",
    I: "아이", J: "제이", K: "케이", L: "엘", M: "엠", N: "엔", O: "오", P: "피",
    Q: "큐", R: "알", S: "에스", T: "티", U: "유", V: "브이", W: "더블유", X: "엑스",
    Y: "와이", Z: "제트",
  };
  return s.replace(/[A-Za-z]+/g, (m) => {
    if (m.length >= 5) return m;
    let r = "";
    for (const ch of m) {
      r += map[ch.toUpperCase()] ?? ch;
    }
    return r;
  });
}

/** 공백·밑줄·하이픈·괄호(ASCII 및 전각)를 제거하고 소문자로 정규화. */
function norm(s: string): string {
  return s.replace(/[\s_\-()（）]/g, "").toLowerCase();
}

/** 법인 표기(주식회사/유한회사/유한책임회사/(주)/（주）/㈜ 등)를 제거. */
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

/** 일치 판정 키: 법인 표기 제거 후 정규화. */
function key(s: string): string {
  return norm(stripCorp(s));
}

/** 바이그램 집합. */
function bigrams(s: string): Set<string> {
  const n = norm(s);
  if (n.length < 2) return new Set();
  const set = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) {
    set.add(n.slice(i, i + 2));
  }
  return set;
}

/** 자카드 유사도. */
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

/** 공사 현장 이름 판정. */
function isConstructionSite(name: string): boolean {
  return (
    /일용/.test(name) ||
    /\//.test(name) ||
    /\(상용\)/.test(name) ||
    /（상용）/.test(name)
  );
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const wkplNm = searchParams.get("wkplNm");
  // pageNo는 응답용으로만 사용
  const pageNo = parseInt(searchParams.get("pageNo") ?? "1", 10);

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

  // ── 검색어 구성 ──
  const q0 = wkplNm.trim();
  const qH = toHangulLetters(q0);
  const qHUsed = qH !== q0;          // q0와 다를 때만 사용
  const baseSource = qHUsed ? qH : q0;
  const base = stripCorp(baseSource);

  const kq0 = key(q0);
  const kqH = qHUsed ? key(qH) : null;

  // 호출 목록 (query + pageNo 고유키로 중복 제거)
  const called = new Set<string>();
  const callList: { query: string; pageNo: number }[] = [];

  function addCall(q: string, p: number) {
    const k = `${q}\u0000${p}`;
    if (called.has(k)) return;
    called.add(k);
    callList.push({ query: q, pageNo: p });
  }

  addCall(q0, 1);
  addCall(q0, 2);
  if (qHUsed) addCall(qH, 1);

  addCall(`주식회사 ${base}`, 1);
  addCall(`${base} 주식회사`, 1);
  addCall(`${base}(주)`, 1);
  addCall(`(주)${base}`, 1);
  addCall(`${base}주식회사`, 1);
  addCall(`주식회사${base}`, 1);

  // ── API 호출 함수 (numOfRows=100, pageNo 인자 추가) ──
  async function fetchNps(query: string, page: number) {
    const params = new URLSearchParams({
      wkplNm: query,
      dataType: "json",
      numOfRows: "100",
      pageNo: String(page),
    });
    const url = `${BASE_URL}?${params.toString()}&serviceKey=${apiKey}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[NPS] HTTP ${res.status}: ${text.slice(0, 500)}`);
      throw new Error(`공공데이터 포털 응답 오류 (${res.status})`);
    }
    return res.json();
  }

  try {
    // ── 모든 검색어를 병렬로 호출 (Promise.allSettled) ──
    const results = await Promise.allSettled(
      callList.map((c) => fetchNps(c.query, c.pageNo))
    );

    // q0 1쪽이 실패했을 때만 502 반환, 나머지 실패는 무시
    if (results[0].status === "rejected") {
      return NextResponse.json(
        { error: (results[0] as PromiseRejectedResult).reason.message },
        { status: 502 }
      );
    }

    // ── 모든 성공 결과 병합 ──
    const allItems: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        const items =
          r.value?.response?.body?.items?.item ?? [];
        allItems.push(...(Array.isArray(items) ? items : [items]));
      }
    }

    const originalData = (results[0] as PromiseFulfilledResult<any>).value;
    const header = originalData?.response?.header ?? {};
    const resultCode = header.resultCode;
    const resultMsg = header.resultMsg;

    // ── 중복 제거: 사업장명(wkplNm) + 사업자번호(bzowrRgstNo) 기준 그룹화 ──
    const groups = new Map<string, any[]>();
    for (const it of allItems) {
      const gk = `${it.wkplNm}|${it.bzowrRgstNo ?? ""}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk)!.push(it);
    }

    // 그룹별 대표: dataCrtYm 이 가장 최신인 항목 + 개월수(서로 다른 달 수)
    const representatives: any[] = [];
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
        months: new Set(group.map((it) => it.dataCrtYm)).size,
      });
    }

    // ── 4단계 분류 (key = norm(stripCorp(s))) ──
    const exact: any[] = [];
    const startsWith: any[] = [];
    const contains: any[] = [];
    const similar: any[] = [];

    for (const it of representatives) {
      const kn = key(it.wkplNm);
      if (kn === kq0 || (kqH !== null && kn === kqH)) {
        it.stage = 1;
        exact.push(it);
      } else if (kn.startsWith(kq0) || (kqH !== null && kn.startsWith(kqH))) {
        it.stage = 2;
        startsWith.push(it);
      } else if (kn.includes(kq0) || (kqH !== null && kn.includes(kqH))) {
        it.stage = 3;
        contains.push(it);
      } else if (
        jaccard(kn, kq0) >= 0.5 ||
        (kqH !== null && jaccard(kn, kqH) >= 0.5)
      ) {
        it.stage = 4;
        similar.push(it);
      }
    }

    // ── 각 단계 내에서 공사 현장을 뒤로 ──
    function pushConstructionToEnd(arr: any[]): any[] {
      const normal: any[] = [];
      const construction: any[] = [];
      for (const it of arr) {
        if (isConstructionSite(it.wkplNm)) {
          construction.push(it);
        } else {
          normal.push(it);
        }
      }
      return [...normal, ...construction];
    }

    const sortedItems = [
      ...pushConstructionToEnd(exact),
      ...pushConstructionToEnd(startsWith),
      ...pushConstructionToEnd(contains),
      ...pushConstructionToEnd(similar),
    ];

    // 일반 명칭(4단계 순서) → 공사 현장(같은 4단계 순서) 순으로 재배열
    const normalItems = sortedItems.filter(
      (it) => !isConstructionSite(it.wkplNm)
    );
    const constructionItems = sortedItems.filter(
      (it) => isConstructionSite(it.wkplNm)
    );
    const reorderedItems = [...normalItems, ...constructionItems];

    // 사용자에게는 상위 30건 노출
    const displayedItems = reorderedItems.slice(0, 30);

    // ── 실제로 호출한 검색어 목록 (쪽 번호 없이 중복 제거) ──
    const actualQueries: string[] = [
      ...new Set(callList.map((c) => c.query)),
    ];

    // ── 상위 30곳 각각 getDetailInfoSearchV2 호출 (10개씩 배치, 건당 8초 제한) ──
    const detailMap = new Map<
      string,
      { jnngpCnt: number | null; vldtVlKrnNm: string | null }
    >();

    for (let i = 0; i < displayedItems.length; i += 10) {
      const batch = displayedItems.slice(i, i + 10);
      const batchPromises = batch.map((it) => {
        return (async () => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          try {
            const url = `${DETAIL_URL}?seq=${it.seq}&dataType=json&serviceKey=${apiKey}`;
            const res = await fetch(url, {
              method: "GET",
              headers: { Accept: "application/json" },
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (!res.ok) {
              return {
                seq: it.seq,
                jnngpCnt: null,
                vldtVlKrnNm: null,
              };
            }
            const data = await res.json();
            const raw = data?.response?.body?.items?.item;
            const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
            if (items.length === 0) {
              return {
                seq: it.seq,
                jnngpCnt: null,
                vldtVlKrnNm: null,
              };
            }
            const first = items[0];
            const rawCnt = first.jnngpCnt;
            let jnngpCnt: number | null = null;
            if (rawCnt != null && rawCnt !== "") {
              const n = Number(rawCnt);
              if (!isNaN(n)) jnngpCnt = n;
            }
            const vldtVlKrnNm = first.vldtVlKrnNm ?? null;
            return { seq: it.seq, jnngpCnt, vldtVlKrnNm };
          } catch (err) {
            clearTimeout(timer);
            return {
              seq: it.seq,
              jnngpCnt: null,
              vldtVlKrnNm: null,
            };
          }
        })();
      });

      const batchResults = await Promise.allSettled(batchPromises);
      for (const br of batchResults) {
        if (br.status === "fulfilled") {
          detailMap.set(br.value.seq, {
            jnngpCnt: br.value.jnngpCnt,
            vldtVlKrnNm: br.value.vldtVlKrnNm,
          });
        }
      }
    }

    // 상세 정보 부착
    for (const it of displayedItems) {
      const d = detailMap.get(it.seq);
      it.jnngpCnt = d?.jnngpCnt ?? null;
      it.vldtVlKrnNm = d?.vldtVlKrnNm ?? null;
    }

    // ── 재 정렬: 공사 현장 여부(일반 먼저) → 단계(1→4) → 가입자수 내림(null 마지막) ──
    displayedItems.sort((a, b) => {
      const aC = isConstructionSite(a.wkplNm) ? 1 : 0;
      const bC = isConstructionSite(b.wkplNm) ? 1 : 0;
      if (aC !== bC) return aC - bC;

      const aS = a.stage ?? 4;
      const bS = b.stage ?? 4;
      if (aS !== bS) return aS - bS;

      const aCnt = a.jnngpCnt;
      const bCnt = b.jnngpCnt;
      if (aCnt == null && bCnt == null) return 0;
      if (aCnt == null) return 1;
      if (bCnt == null) return -1;
      return bCnt - aCnt;
    });

    // ── 응답 구성 ──
    const responseItems = displayedItems.map((it) => ({
      seq: it.seq,
      wkplNm: it.wkplNm,
      wkplRoadNmDtlAddr: it.wkplRoadNmDtlAddr,
      wkplJnngStcd: it.wkplJnngStcd,
      bzowrRgstNo: it.bzowrRgstNo,
      dataCrtYm: it.dataCrtYm,
      months: it.months,
      가입자수: it.jnngpCnt,
      업종: it.vldtVlKrnNm,
    }));

    const responseBody: any = {
      resultCode,
      resultMsg,
      numOfRows: 30,
      pageNo,
      totalCount: originalData?.response?.body?.totalCount,
      검색어: actualQueries,
      items: responseItems,
    };
    if (resultCode !== "00") {
      responseBody.warned = true;
    }

    return NextResponse.json(responseBody);
  } catch (err) {
    console.error("[NPS] 요청 실패:", err);
    return NextResponse.json(
      { error: "NPS API 요청 중 내부 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
