import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

// .env.local 수동 로드
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
  "https://apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2";

const NPS_LIST_URL = `${BASE_URL}/getBassInfoSearchV2`;
const NPS_DETAIL_URL = `${BASE_URL}/getDetailInfoSearchV2`;
const NPS_STATUS_URL = `${BASE_URL}/getPdAcctoSttusInfoSearchV2`;

const RATE = 0.09;
const BASELINE_PATH = path.join(
  process.cwd(),
  "skill",
  "assets",
  "industry_baseline.csv"
);
const SAMPLE_PATH = path.join(
  process.cwd(),
  "skill",
  "assets",
  "sample_workplaces.csv"
);

function getApiKey() {
  return process.env.NPS_API_KEY;
}

/** ENCODING 키를 URL에 직접 붙이는 방식의 NPS 목록 조회 */
async function npsList(wkplNm: string, numOfRows = 10) {
  const key = getApiKey();
  if (!key) throw new Error("NPS_API_KEY가 설정되지 않았습니다.");
  const params = new URLSearchParams({
    wkplNm: wkplNm.trim(),
    dataType: "json",
    numOfRows: numOfRows.toString(),
    pageNo: "1",
  });
  const url = `${NPS_LIST_URL}?${params.toString()}&serviceKey=${key}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NPS 목록 API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const header = data?.response?.header ?? {};
  if (header.resultCode !== "00") {
    throw new Error(`NPS resultCode=${header.resultCode}: ${header.resultMsg}`);
  }
  const items = data?.response?.body?.items?.item ?? [];
  const arr = Array.isArray(items) ? items : [items];
  // 2026년 7월 데이터만 사용 (다른 월 데이터 필터링)
  const filtered = arr.filter((item: any) => (item.dataCrtYm ?? "") === "202607");
  return filtered.length > 0 ? filtered : arr;
}

/** NPS 상세 정보조회 (seq 기반) */
async function npsDetail(seq: number) {
  const key = getApiKey();
  if (!key) throw new Error("NPS_API_KEY가 설정되지 않았습니다.");
  const params = new URLSearchParams({
    seq: seq.toString(),
    dataType: "json",
    numOfRows: "10",
    pageNo: "1",
  });
  const url = `${NPS_DETAIL_URL}?${params.toString()}&serviceKey=${key}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NPS 상세 API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const header = data?.response?.header ?? {};
  if (header.resultCode !== "00") {
    throw new Error(`NPS detail resultCode=${header.resultCode}: ${header.resultMsg}`);
  }
  const items = data?.response?.body?.items?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

/** NPS 기간별 현황 (seq + dataCrtYm 기반) */
async function npsStatus(seq: number, dataCrtYm: string) {
  const key = getApiKey();
  if (!key) throw new Error("NPS_API_KEY가 설정되지 않았습니다.");
  const params = new URLSearchParams({
    seq: seq.toString(),
    dataCrtYm: dataCrtYm,
    dataType: "json",
    numOfRows: "10",
    pageNo: "1",
  });
  const url = `${NPS_STATUS_URL}?${params.toString()}&serviceKey=${key}`;
  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NPS 기간별 API 오류 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const header = data?.response?.header ?? {};
  if (header.resultCode !== "00") {
    throw new Error(`NPS status resultCode=${header.resultCode}: ${header.resultMsg}`);
  }
  const items = data?.response?.body?.items?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

/** 업종 기준선 로드 */
function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  const rows = listCSV(BASELINE_PATH);
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = parseFloat(r["월회전율중앙값"]);
    if (v > 0) out[r["업종"]] = v;
  }
  return out;
}

function listCSV(p: string): Record<string, string>[] {
  const text = fs.readFileSync(p, "utf-8");
  const lines = text.split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v) => v.trim());
    if (vals.length === 0 || (vals.length === 1 && vals[0] === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    out.push(row);
  }
  return out;
}

/** 업종명 유사 매칭 (API 업종명과 baseline 업종명 간 fuzzy 매칭) */
function matchIndustry(apiName: string, baseline: Record<string, number>): number | null {
  if (!apiName) return null;
  // 정확 일치 먼저
  if (baseline[apiName]) return baseline[apiName];
  // 부분 일치
  const apiNorm = apiName.replace(/[\s_\-()]/g, "").toLowerCase();
  for (const [bName, bVal] of Object.entries(baseline)) {
    const bNorm = bName.replace(/[\s_\-()]/g, "").toLowerCase();
    if (apiNorm.includes(bNorm) || bNorm.includes(apiName)) return bVal;
  }
  return null;
}

function buildDiagnosis(row: {
  사업장명: string;
  업종: string;
  시도: string;
  가입자수: number;
  순증감: number;
  총이동: number;
  신규: number;
  상실: number;
  월회전율: number;
  은폐지수: number;
  업종배수: number;
  추정소득: number | null;
  경고: string[];
  업종중앙값: number;
}) {
  return {
    사업장명: row.사업장명,
    업종: row.업종,
    시도: row.시도,
    가입자수: row.가입자수,
    순증감: row.순증감,
    총이동: row.총이동,
    신규: row.신규,
    상실: row.상실,
    월회전율: row.월회전율,
    연환산회전율: row.월회전율 * 1200,
    은폐지수: row.은폐지수,
    업종배수: row.업종배수,
    추정소득: row.추정소득,
    추정소득상한주의: row.추정소득 !== null && row.추정소득 >= 6956000 * 0.995,
    업종중앙값: row.업종중앙값,
    경고: row.경고,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const company = ((body.company || "").toString()).trim();
    const pick = body.pick != null ? (typeof body.pick === "number" ? body.pick : parseInt(body.pick as string, 10)) : undefined;
    if (!company) {
      return NextResponse.json({ error: "company(사업장명)가 필요합니다." }, { status: 400 });
    }

    // 1. NPS 목록 조회
    const listItems = await npsList(company, 10);
    if (listItems.length === 0) {
      return NextResponse.json(
        { ok: true, 회사_미발견: true, 검색결과_건수: 0 },
        { status: 200 }
      );
    }

    // pick이 있으면 해당 항목 진단, 없으면 목록만 반환
    if (pick !== undefined && pick >= 1 && pick <= listItems.length) {
      const target = listItems[pick - 1];
      const seq = target.seq;
      if (!seq) {
        return NextResponse.json(
          { ok: true, 회사_미발견: true, 검색결과_건수: 0, error: "seq를 얻을 수 없습니다." },
          { status: 200 }
        );
      }

      // 2. NPS 상세 조회 (가입자수, 고지금액, 업종명)
      const detailItems = await npsDetail(seq);
      if (detailItems.length === 0) {
        return NextResponse.json(
          { ok: true, 회사_미발견: true, 검색결과_건수: 0 },
          { status: 200 }
        );
      }
      const detail = detailItems[0];

      const 가입자수 = parseInt(detail.jnngpCnt ?? "0", 10) || 0;
      const 고지금액 = parseInt(detail.crrmmNtcAmt ?? "0", 10) || 0;
      const 업종명 = (detail.vldtVlKrnNm ?? "").trim() || "(업종 미상)";
      const 시도 = (target.wkplRoadNmDtlAddr ?? "").split(" ")[0] || "";

      // 3. NPS 기간별 현황 (202607)
      const statusItems = await npsStatus(seq, "202607");
      const status = statusItems[0] || {};

      // 4. 지표 계산
      const 신규 = parseInt(status.nwAcqzrCnt ?? "0", 10) || 0;
      const 상실 = parseInt(status.lssJnngpCnt ?? "0", 10) || 0;
      const 순증감 = 신규 - 상실;
      const 총이동 = 신규 + 상실;
      const 월회전율 = 총이동 / 2 / (가입자수 || 1);
      const 은폐지수 = 총이동 / Math.max(Math.abs(순증감), 1);
      const 추정소득 = 고지금액 > 0 ? Math.round(고지금액 / (가입자수 || 1) / RATE) : null;

      // 업종 기준선 매칭
      const baseline = loadBaseline();
      const 업종중앙값 = matchIndustry(업종명, baseline) ?? 0.0233;
      const 업종배수 = 업종중앙값 > 0 ? 월회전율 / 업종중앙값 : 0;

      // 경고 판정
      const 경고: string[] = [];
      if (신규 === 0 && 상실 === 0) 경고.push("당월이동없음");
      if (가입자수 < 30) 경고.push("소규모");
      if (추정소득 !== null && 추정소득 >= 6956000 * 0.995) 경고.push("소득상한도달");

      const result = buildDiagnosis({
        사업장명: target.wkplNm || company,
        업종: 업종명,
        시도: 시도,
        가입자수,
        순증감,
        총이동,
        신규,
        상실,
        월회전율: Math.round(월회전율 * 10000) / 10000,
        은폐지수: Math.round(은폐지수 * 100) / 100,
        업종배수: Math.round(업종배수 * 100) / 100,
        추정소득,
        경고,
        업종중앙값: Math.round(업종중앙값 * 10000) / 10000,
      });

      return NextResponse.json(
        {
          ok: true,
          입력_샘플시연: false,
          자료출처: "NPS 공공데이터포털 API (getBassInfoSearchV2 + getDetailInfoSearchV2 + getPdAcctoSttusInfoSearchV2)",
          자료년월: "2026-07",
          계절성주의: true,
          기준선출처: "동봉 기준선(2026-07 전국 52,957개소)",
          분석대상수: 1,
          진단결과: result,
          검색결과_건수: listItems.length,
        },
        { status: 200 }
      );
    }

    // pick 없으면 목록만 반환 (CSV와 동일한 형태)
    const 후보목록 = listItems.map((it, i) => ({
      번호: i + 1,
      사업장명: it.wkplNm || "(이름 미상)",
      시도: (it.wkplRoadNmDtlAddr ?? "").split(" ")[0] || "",
      source: "nps" as const,
      wkplNm: it.wkplNm,
    }));

    return NextResponse.json(
      {
        ok: true,
        회사_미발견: false,
        검색결과_건수: listItems.length,
        후보목록,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[NPS 진단] 오류:", err);
    return NextResponse.json(
      { ok: false, error: err.message || "NPS 진단 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  // GET 요청은 POST로 리다이렉트 안내
  return NextResponse.json(
    { error: "POST로 요청하세요. body: { company: '사업장명' }" },
    { status: 405 }
  );
}
