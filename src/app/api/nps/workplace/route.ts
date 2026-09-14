import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const BASE_URL =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getBassInfoSearchV2";
const DETAIL_URL =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getDetailInfoSearchV2";
const STATUS_URL =
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2/getPdAcctoSttusInfoSearchV2";

interface Item {
  seq: string;
  wkplNm: string;
  wkplRoadNmDtlAddr: string;
  wkplJnngStcd: string;
  bzowrRgstNo: string;
  dataCrtYm: string;
  vldtVlKrnNm?: string;
  wkplStylDvcd?: string;
  jnngpCnt?: string;
  crrmmNtcAmt?: string;
  nwAcqzrCnt?: string;
  lssJnngpCnt?: string;
}

interface DetailItem {
  wkplNm?: string;
  wkplRoadNmDtlAddr?: string;
  vldtVlKrnNm?: string;
  wkplStylDvcd?: string;
  jnngpCnt?: string;
  crrmmNtcAmt?: string;
  nwAcqzrCnt?: string;
  lssJnngpCnt?: string;
  adptDt?: string;
}

interface StatusItem {
  wkplNm?: string;
  wkplRoadNmDtlAddr?: string;
  vldtVlKrnNm?: string;
  wkplStylDvcd?: string;
  jnngpCnt?: string;
  crrmmNtcAmt?: string;
  nwAcqzrCnt?: string;
  lssJnngpCnt?: string;
}

async function fetchJson(url: string, timeoutMs: number = 8000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractItems(data: any): Item[] {
  const items = data?.response?.body?.items?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}

function extractDetailItems(data: any): DetailItem[] {
  const items = data?.response?.body?.items?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}

function extractStatusItems(data: any): StatusItem[] {
  const items = data?.response?.body?.items?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}

function toNumber(v: string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

function formatMonth(ym: string): string {
  if (ym.length === 6) {
    return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
  }
  return ym;
}

function getSido(addr: string): string {
  const first = addr.trim().split(/\s+/)[0];
  return first || "";
}

function bizType(code: string | undefined): string {
  if (code === "1") return "법인";
  if (code === "2") return "개인";
  return "";
}

/** 공용 유틸: 대기, 재시도. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function retryOnce<T>(fn: () => Promise<T>, waitMs: number): Promise<T> {
  try { return await fn(); } catch { await sleep(waitMs); return await fn(); }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const name = searchParams.get("name");
  const bizno = searchParams.get("bizno");
  const addr = searchParams.get("addr");
  const seq = searchParams.get("seq");

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: "name(사업장명) 쿼리가 필요합니다." },
      { status: 400 }
    );
  }
  if (!bizno || bizno.trim().length === 0) {
    return NextResponse.json(
      { error: "bizno(사업자번호) 쿼리가 필요합니다." },
      { status: 400 }
    );
  }

  const apiKey = process.env.NPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "서버 설정 오류: NPS_API_KEY가 없습니다." },
      { status: 500 }
    );
  }

  let apiCallCount = 0;
  const failedMonths: { 자료년월: string; 사유: string }[] = [];

  const maxPages = 3;
  const allItems: Item[] = [];
  let totalCount = 0;

  try {
    // 사업자번호에서 숫자만 추출해 앞 6자리 확보
    const digitsOnly = bizno.replace(/\D/g, "");
    const regNo6 = digitsOnly.length >= 6 ? digitsOnly.slice(0, 6) : "";

    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      const encodedParams = new URLSearchParams({
        wkplNm: name.trim(),
        dataType: "json",
        numOfRows: "100",
        pageNo: pageNo.toString(),
        ...(regNo6 && { bzowrRgstNo: regNo6 }),
      });
      const url = `${BASE_URL}?${encodedParams.toString()}&serviceKey=${apiKey}`;

      apiCallCount++;
      const data = await retryOnce(() => fetchJson(url, 25000), 1200);
      const header = data?.response?.header ?? {};
      const resultCode = header.resultCode;

      if (resultCode !== "00") {
        return NextResponse.json(
          {
            ok: false,
            사유: `getBassInfoSearchV2 결과 코드: ${resultCode}`,
            resultCode,
          },
          { status: 502 }
        );
      }

      const items = extractItems(data);
      totalCount = data?.response?.body?.totalCount ?? items.length;

      const filtered = items.filter(
        (it) =>
          it.wkplNm === name.trim() &&
          (it.bzowrRgstNo ?? "") === bizno
      );
      allItems.push(...filtered);

      const distinctMonths = new Set(allItems.map((it) => it.dataCrtYm));
      if (distinctMonths.size >= 12 || pageNo * 100 >= totalCount) break;
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        사유: err.message || "getBassInfoSearchV2 요청 실패",
        resultCode: "UNKNOWN",
      },
      { status: 502 }
    );
  }

  if (allItems.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        사유: "해당 사업장의 정보를 찾을 수 없습니다.",
        resultCode: "NO_DATA",
      },
      { status: 502 }
    );
  }

  const byMonth = new Map<string, Item[]>();
  for (const it of allItems) {
    const m = it.dataCrtYm;
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m)!.push(it);
  }

  // 기준 적용일을 정하지 않은 상태
  let baseAdptDt: string | null = null;

  // 기준 기록을 정한다: 가장 최신 달의 기록 중에서
  const latestKey = [...byMonth.keys()].sort().slice(-1)[0];
  const latestMonthItems = byMonth.get(latestKey) || [];
  let baseItem: Item | undefined;

  if (seq && latestMonthItems.some((it) => String(it.seq) === seq)) {
    baseItem = latestMonthItems.find((it) => String(it.seq) === seq);
  } else if (addr) {
    baseItem = latestMonthItems.find((it) => it.wkplRoadNmDtlAddr === addr);
  }
  if (!baseItem && latestMonthItems.length > 0) {
    baseItem = latestMonthItems[0];
  }

  const hasMultipleInAnyMonth = Array.from(byMonth.values()).some((items) => items.length > 1);

  // 기록이 여러 개인 달이 하나라도 있으면 기준 적용일을 얻는다
  if (hasMultipleInAnyMonth && baseItem) {
    try {
      apiCallCount++;
      const baseUrl = `${DETAIL_URL}?seq=${baseItem.seq}&dataType=json&serviceKey=${apiKey}`;
      const baseData = await fetchJson(baseUrl, 8000);
      const baseDetail = extractDetailItems(baseData)[0];
      if (baseDetail && baseDetail.adptDt) {
        baseAdptDt = baseDetail.adptDt;
      }
    } catch {
      // 기준 적용일 조회 실패 — 그대로 진행 (적용일은 null)
    }
  }

  const selectedItems = new Map<string, Item>();

  for (const [month, items] of byMonth.entries()) {
    if (items.length === 1) {
      // 기록이 하나뿐인 달은 상세 조회 추가 없이 그대로 사용
      selectedItems.set(month, items[0]);
    } else {
      // 기록이 여러 개인 달: seq로 상세 조회를 동시에 불러 기준 적용일과 같은 것을 고른다
      const detailPromises = items.map(async (it) => {
        try {
          apiCallCount++;
          const url = `${DETAIL_URL}?seq=${it.seq}&dataType=json&serviceKey=${apiKey}`;
          const data = await fetchJson(url, 8000);
          const detail = extractDetailItems(data)[0];
          return { seq: it.seq, adptDt: detail?.adptDt ?? null };
        } catch {
          return { seq: it.seq, adptDt: null };
        }
      });
      const resolved = await Promise.all(detailPromises);

      if (baseAdptDt) {
        const match = resolved.find((r) => r.adptDt === baseAdptDt);
        if (match) {
          const item = items.find((it) => it.seq === match.seq);
          if (item) {
            selectedItems.set(month, item);
          } else {
            failedMonths.push({
              자료년월: formatMonth(month),
              사유: "같은 이름·사업자번호 사업장이 여러 곳이라 구분하지 못함",
            });
          }
        } else {
          failedMonths.push({
            자료년월: formatMonth(month),
            사유: "같은 이름·사업자번호 사업장이 여러 곳이라 구분하지 못함",
          });
        }
      } else {
        // 기준 적용일을 구하지 못했으면 주소가 addr과 같은 첫 기록 (없으면 첫 기록)
        if (addr) {
          const match = items.find((it) => it.wkplRoadNmDtlAddr === addr);
          if (match) {
            selectedItems.set(month, match);
          } else {
            failedMonths.push({
              자료년월: formatMonth(month),
              사유: "같은 이름·사업자번호 사업장이 여러 곳이라 구분하지 못함",
            });
          }
        } else {
          selectedItems.set(month, items[0]);
        }
      }
    }
  }

  const sortedMonths = [...selectedItems.keys()].sort().slice(-12);
  const recentItems: Item[] = sortedMonths
    .map((m) => selectedItems.get(m)!)
    .filter(Boolean);

  if (recentItems.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        사유: "최근 12개월 데이터를 구성할 수 없습니다.",
        resultCode: "NO_RECENT_DATA",
      },
      { status: 502 }
    );
  }

  const rows: any[] = [];
  const monthFailures: { 자료년월: string; 사유: string }[] = [];

  const latestMonth = sortedMonths[sortedMonths.length - 1];
  const latestMonthFormatted = formatMonth(latestMonth);
  let latestFailed = false;
  let latestFailureReason = "";

  const fetchMonthData = async (item: Item, month: string): Promise<any> => {
    const seq = item.seq;
    const dataCrtYm = item.dataCrtYm;

    try {
      apiCallCount++;
      const detailUrl = `${DETAIL_URL}?seq=${seq}&dataType=json&serviceKey=${apiKey}`;
      const detailData = await fetchJson(detailUrl, 8000);

      apiCallCount++;
      const statusUrl = `${STATUS_URL}?seq=${seq}&dataCrtYm=${dataCrtYm}&dataType=json&serviceKey=${apiKey}`;
      const statusData = await fetchJson(statusUrl, 8000);

      const detailItems = extractDetailItems(detailData);
      const statusItems = extractStatusItems(statusData);

      const merged = { ...detailItems[0], ...statusItems[0] };

      if (!merged || (!merged.wkplNm && !merged.vldtVlKrnNm)) {
        throw new Error("상세/현황 데이터가 없음");
      }

      return {
        자료생성년월: formatMonth(month),
        사업장명: merged.wkplNm || item.wkplNm,
        업종: merged.vldtVlKrnNm || "",
        시도: getSido(merged.wkplRoadNmDtlAddr || ""),
        사업장형태: bizType(merged.wkplStylDvcd),
        가입자수: toNumber(merged.jnngpCnt),
        당월고지금액: toNumber(merged.crrmmNtcAmt),
        신규취득자수: toNumber(merged.nwAcqzrCnt),
        상실가입자수: toNumber(merged.lssJnngpCnt),
      };
    } catch (err: any) {
      monthFailures.push({
        자료년월: formatMonth(month),
        사유: err.message || "조회 실패",
      });
      return null;
    }
  };

  const batchSize = 4;
  for (let i = 0; i < recentItems.length; i += batchSize) {
    const batch = recentItems.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((item) => fetchMonthData(item, item.dataCrtYm))
    );
    for (const r of results) {
      if (r) rows.push(r);
    }
  }

  // 달별 조회 실패분을 한 번 더 시도
  if (monthFailures.length > 0) {
    await sleep(1200);
    const retryTargets = [...monthFailures];
    monthFailures.length = 0;
    for (const f of retryTargets) {
      const item = recentItems.find((it) => formatMonth(it.dataCrtYm) === f.자료년월);
      if (!item) { monthFailures.push(f); continue; }
      const r = await fetchMonthData(item, item.dataCrtYm);
      if (r) rows.push(r);
    }
  }

  const latestRow = rows.find((r) => r.자료생성년월 === latestMonthFormatted);
  if (!latestRow) {
    latestFailed = true;
    latestFailureReason = monthFailures.find(
      (f) => f.자료년월 === latestMonthFormatted
    )?.사유 || "최신 달 조회 실패";
  }

  if (latestFailed) {
    return NextResponse.json(
      {
        ok: false,
        사유: latestFailureReason,
        resultCode: "LATEST_MONTH_FAILED",
      },
      { status: 502 }
    );
  }

  rows.sort((a, b) => a.자료생성년월.localeCompare(b.자료생성년월));

  const latestDataMonth = rows[rows.length - 1]?.자료생성년월 || "";

  return NextResponse.json({
    ok: true,
    사업장명: name.trim(),
    사업자번호: bizno,
    최신자료년월: latestDataMonth,
    개월수: rows.length,
    rows,
    실패한달: [...failedMonths, ...monthFailures].sort((a, b) => a.자료년월.localeCompare(b.자료년월)),
    api호출수: apiCallCount,
    적용일: baseAdptDt,
  }, {
    headers: { "Cache-Control": [...failedMonths, ...monthFailures].length === 0 ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store" },
  });
}
