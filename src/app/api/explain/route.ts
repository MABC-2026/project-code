import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `너는 취업을 준비하는 지원자가 회사의 인력 흐름 기록을 쉽게 이해하도록 돕는 기업 데이터 해석 에이전트다.
입력으로 받는 '사실 목록'은 국민연금 가입 사업장 공공데이터를 예선 스킬이 계산한 결과다.
숫자를 다시 늘어놓지 말고, 지원자 입장에서 이 기록이 무엇을 뜻하는지 쉬운 말로 설명한다.

반드시 지킬 것
1. 숫자는 사실 목록에 적힌 표기 그대로 쓴다. 새로 계산하거나, 반올림을 바꾸거나(예: 9.8배를 약 10배로), 없는 숫자를 만들지 않는다. 한 문장에 숫자는 두 개까지.
2. 회사의 좋고 나쁨을 판단하지 않는다. 지원자가 스스로 판단할 근거와 확인할 거리를 준다.
   쓰지 말 것: "퇴사자가 많습니다", "직원들이 오래 다니지 않습니다", "조직문화가 좋지 않습니다", "블랙기업", "추천", "좋은 회사", "나쁜 회사", "이직률", "퇴사율", "퇴사"
3. 국민연금의 신규취득·상실은 실제 입사·자발적 퇴사와 같지 않다. "신규취득", "상실", "인력 이동"이라는 말을 쓴다.
4. 이번 달은 사실 목록의 '이번 달 인원 흐름' 분류에 맞춰서만 설명한다.
   - "드나듦 중심"일 때만 "전체 인원 변화는 작지만 안에서는 신규취득과 상실이 많이 일어났어요"처럼 말한다.
   - "증가 중심"이면 인원이 늘어난 달로, "감소 중심"이면 인원이 줄어든 달로 말한다. 이때 "거의 그대로", "변화는 작지만"이라고 쓰지 않는다.
5. 같은 업종 비교가 있으면 "중앙값의 몇 배", "같은 업종 안에서 높은 편"처럼 상대적인 맥락으로 말한다. 사실 목록의 '같은 업종 안 위치' 표현(낮은 편·일반적인 범위·높은 편·매우 높은 편)을 그대로 쓰고, p25·p75·p90·분위 같은 용어는 쓰지 않는다. 같은 업종 비교가 없으면 업종과 비교하는 말을 하지 않는다.
6. 최근 12개월 자료가 있으면 한 달 수치보다 흐름을 먼저 본다. 일시적인 변화인지, 몇 개월 연속인지, 최근에 달라졌는지를 사실 목록의 숫자로 말한다. 이번 달 흐름과 12개월 흐름이 다르면(예: 이번 달은 늘었는데 1년 전보다는 줄었음) 둘 다 말한다. 12개월 자료가 없으면 흐름을 추측하지 않는다.
7. 말투: 취업 준비생에게 설명하듯 쉬운 해요체(~예요, ~해요, ~했어요). 한 문장은 짧게 쓰고 전문용어는 줄인다. 아래 예시는 형식만 참고하고, 문장은 이 회사의 사실로 새로 쓴다.
   쓰지 말 것: "~것으로 보입니다", "~라고 볼 수 있어요", "종합적으로", "결론적으로", "~에 해당합니다", "~라는 뜻입니다", 영어, 이모지.

항목별 형식 (개수를 꼭 지킨다)
- 지원자_관점_요약: 한 문장, 50자 이내. 지원자가 가장 먼저 알아야 할 흐름 한 가지.
  예(12개월 동안 늘고 업종 안에서 높은 편일 때): "직원 수는 늘고 있지만, 같은 업종보다 인력 이동은 빠른 편이에요."
  예(드나듦 중심일 때만): "전체 인원은 거의 그대로인데 실제로는 많은 인력이 오간 사업장이에요."
- 이렇게_볼_수_있어요: 2~3문장. 이번 달 인원 흐름을 풀고, 12개월 자료가 있으면 흐름(연속·일시적·최근 변화)을 말한다.
- 같은_업종과_비교하면: 1~2문장. 업종 중앙값과 같은 업종 안 위치로 말한다. 같은 업종 비교가 없으면 빈 배열로 둔다.
- 지원_전에_확인해보세요: 2~3개. 지원자가 채용 공고나 면접에서 확인할 거리를 짧은 명사형으로 쓴다. 사실 목록의 흐름에 맞는 것을 고른다.
  인력 이동이 큰 경우 예: "이번 채용이 사업 확장에 따른 증원인지, 빈자리를 채우는 채용인지", "최근 조직 개편이나 대규모 채용이 있었는지", "지원 직무 팀의 구성과 근속 현황"
  가입자 수가 늘어나는 경우 예: "신규 사업이나 조직 확대 여부", "새로 합류한 사람을 위한 온보딩 체계", "이번 채용이 증원인지 여부"
- 판단_과정: 정확히 3문장. "먼저", "그다음", "마지막으로"로 시작하고 그 말을 문장 안에서 다시 쓰지 않는다. "~라서"로 이유를 넣고 "~했어요"로 끝낸다.`;

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

function pct(r: number): string {
  return (r * 100).toFixed(1);
}

function flowType(d: any): { 흐름: string; 설명: string } {
  const 총이동 = d.총이동;
  const 순증감 = d.순증감;
  if (총이동 === 0) {
    return { 흐름: "없음", 설명: "드나든 사람이 없음" };
  }
  if (순증감 === 0) {
    return { 흐름: "드나듦", 설명: "드나듦 중심 (총인원 변화에 비해 신규취득·상실이 훨씬 많음)" };
  }
  const ratio = 총이동 / Math.max(Math.abs(순증감), 1);
  if (ratio >= 3) {
    return { 흐름: "드나듦", 설명: "드나듦 중심 (총인원 변화에 비해 신규취득·상실이 훨씬 많음)" };
  }
  if (순증감 > 0) {
    return { 흐름: "증가", 설명: "증가 중심 (드나든 사람 대부분이 늘어난 인원)" };
  }
  return { 흐름: "감소", 설명: "감소 중심 (드나든 사람 대부분이 줄어든 인원)" };
}

function easyLoc(interval: string): string {
  if (interval === "상위 10% 안") return "매우 높은 편";
  if (interval === "상위 10~25%") return "높은 편";
  if (interval === "상위 25~50%" || interval === "하위 25~50%") return "일반적인 범위";
  if (interval === "하위 25% 안") return "낮은 편";
  return interval;
}

function buildFactList(
  d: any,
  추이: any[] | undefined,
  자료년월: string | undefined,
  계절성주의: boolean | undefined,
  입력_출처: string | undefined,
  원본_업종명: string | undefined
): string[] {
  const f: string[] = [];

  // 1
  f.push(`회사: ${d.사업장명} · 업종: ${d.업종 || 원본_업종명 || "업종 정보 없음"} · 지역: ${d.시도 || "지역 정보 없음"}`);

  // 2
  const src = 입력_출처 === "공공데이터 API" ? "공공데이터" : "동봉 데이터";
  f.push(`기준월: ${자료년월 || "2026-07"} (국민연금 가입 사업장 기록, ${src})`);

  // 3
  f.push(`국민연금 가입자 수: ${fmt(d.가입자수)}명`);

  // 4
  f.push(`이번 달 신규취득: ${fmt(d.신규)}명, 상실: ${fmt(d.상실)}명`);

  // 5
  const sgn = d.순증감 > 0 ? "+" : "";
  f.push(`이번 달 순증감: ${sgn}${fmt(d.순증감)}명, 총이동(신규취득+상실): ${fmt(d.총이동)}명`);

  // 6
  const flow = flowType(d);
  f.push(`이번 달 인원 흐름: ${flow.설명}`);

  // 7
  const per100_new = (d.신규 / d.가입자수 * 100).toFixed(1);
  const per100_loss = (d.상실 / d.가입자수 * 100).toFixed(1);
  f.push(`가입자 100명당 이번 달 신규취득 ${per100_new}명, 상실 ${per100_loss}명`);

  // 8
  f.push(`월 회전율(신규취득과 상실의 평균 ÷ 가입자 수): ${pct(d.월회전율)}%`);

  // 9
  if (d.업종위치) {
    const { 비교사업장수, p50, 구간 } = d.업종위치;
    f.push(`같은 업종 비교: 같은 업종 ${비교사업장수}곳의 월 회전율 중앙값 ${pct(p50)}%, 이 사업장은 중앙값의 ${d.업종배수.toFixed(1)}배, 같은 업종 안 위치: ${easyLoc(구간)}`);
  } else {
    f.push(`같은 업종 비교: 없음 (업종 기준선에 없는 업종)`);
  }

  // 10 — 추이 6개월 이상
  if (추이 && 추이.length >= 6) {
    const sorted = [...추이].sort((a, b) => a.자료년월.localeCompare(b.자료년월));
    const n = sorted.length;
    const first = sorted[0];
    const last = sorted[n - 1];
    const diff = last.가입자수 - first.가입자수;

    let up = 0, down = 0, same = 0;
    for (let i = 1; i < n; i++) {
      if (sorted[i].가입자수 > sorted[i - 1].가입자수) up++;
      else if (sorted[i].가입자수 < sorted[i - 1].가입자수) down++;
      else same++;
    }

    f.push(`최근 ${n}개월 가입자 수: ${first.자료년월} ${fmt(first.가입자수)}명 → ${last.자료년월} ${fmt(last.가입자수)}명 (${diff > 0 ? "+" : ""}${fmt(diff)}명)`);

    let cntLine = `최근 ${n}개월 중 가입자 수가 전달보다 늘어난 달 ${up}번, 줄어든 달 ${down}번`;
    if (same > 0) cntLine += `, 같은 달 ${same}번`;
    f.push(cntLine);

    // k: 끝에서부터 같은 방향 연속
    let k = 0;
    let lastDir: number | null = null;
    for (let i = n - 1; i >= 1; i--) {
      const delta = sorted[i].가입자수 - sorted[i - 1].가입자수;
      if (delta === 0) break;
      const dir = delta > 0 ? 1 : -1;
      if (lastDir === null) {
        lastDir = dir;
        k++;
      } else if (dir === lastDir) {
        k++;
      } else {
        break;
      }
    }
    if (k >= 2) {
      f.push(`마지막 ${k}개월 연속 가입자 수 ${lastDir === 1 ? "증가" : "감소"}`);
    }

    // 최저/최고 월 회전율 (동률이면 앞달)
    let minRate = Infinity, maxRate = -Infinity;
    let minMonth = "", maxMonth = "";
    for (const item of sorted) {
      const r = item.월회전율 * 100;
      if (r < minRate) { minRate = r; minMonth = item.자료년월; }
      if (r > maxRate) { maxRate = r; maxMonth = item.자료년월; }
    }
    f.push(`최근 ${n}개월 월 회전율: 가장 낮은 달 ${minMonth} ${minRate.toFixed(1)}%, 가장 높은 달 ${maxMonth} ${maxRate.toFixed(1)}%`);

    // 최근 3개월 vs 그전
    const 최근3 = sorted.slice(-3).reduce((s: number, it: any) => s + it.월회전율 * 100, 0) / 3;
    const 그전 = sorted.slice(0, n - 3).reduce((s: number, it: any) => s + it.월회전율 * 100, 0) / (n - 3);
    f.push(`최근 3개월 평균 월 회전율 ${최근3.toFixed(1)}%, 그 전 ${n - 3}개월 평균 ${그전.toFixed(1)}%`);
  }

  // 11 — 주의 사항
  const warns: string[] = [];
  if (계절성주의) {
    warns.push("7월·1월 자료는 공공기관 정기 인사이동이 섞여 인력 이동이 크게 나올 수 있음");
  }
  if (d.경고) {
    for (const w of d.경고) {
      if (w !== "소득상한도달") warns.push(`스킬 표시: ${w}`);
    }
  }
  if (warns.length > 0) {
    f.push(`주의 사항: ${warns.join("; ")}`);
  } else {
    f.push(`주의 사항: 없음`);
  }

  return f;
}

async function solarCall(factList: string[]): Promise<any> {
  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) throw new Error("UPSTAGE_API_KEY가 없습니다");

  const model = process.env.SOLAR_MODEL || "solar-pro4-260806";

  const body = {
    model,
    temperature: 0.2,
    max_tokens: 900,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "explain",
        strict: true,
        schema: {
          type: "object",
          properties: {
            지원자_관점_요약: { type: "string" },
            이렇게_볼_수_있어요: { type: "array", items: { type: "string" } },
            같은_업종과_비교하면: { type: "array", items: { type: "string" } },
            지원_전에_확인해보세요: { type: "array", items: { type: "string" } },
            판단_과정: { type: "array", items: { type: "string" } }
          },
          required: ["지원자_관점_요약", "이렇게_볼_수_있어요", "같은_업종과_비교하면", "지원_전에_확인해보세요", "판단_과정"],
          additionalProperties: false
        }
      }
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "사실 목록\n- " + factList.join("\n- ") }
    ]
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const fetchOnce = async (): Promise<string> => {
    const res = await fetch("https://api.upstage.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("응답 형식 오류");
    return content;
  };

  try {
    let content: string;
    try {
      content = await fetchOnce();
      return JSON.parse(content);
    } catch (firstErr) {
      // fetch 실패 또는 JSON.parse 실패 시 한 번 재시도
      try {
        content = await fetchOnce();
        return JSON.parse(content);
      } catch (secondErr) {
        throw secondErr;
      }
    }
  } catch (err: any) {
    if (err.name === "AbortError" || err.message.toLowerCase().includes("abort")) {
      throw new Error("시간 초과");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractNums(text: string): string[] {
  const re = /\d[\d,]*(?:\.\d+)?/g;
  const m = text.match(re);
  if (!m) return [];
  return m.map(s => s.replace(/,/g, ""));
}

function allowedNums(factList: string[], _자료년월: string | undefined): Set<string> {
  const set = new Set<string>();
  for (const f of factList) {
    for (const n of extractNums(f)) set.add(n);

    const re = /(\d{4})-(\d{2})/g;
    let m;
    while ((m = re.exec(f)) !== null) {
      set.add(m[1]);
      set.add(String(Number(m[2])));
      set.add(m[1].slice(2));
    }
  }
  set.add("100");
  set.add("1");
  set.add("7");
  set.add("12");
  return set;
}

const FORBIDDEN = [
  "퇴사", "오래 다니지 않", "조직문화", "블랙기업", "추천", "좋은 회사", "나쁜 회사", "이직률",
  "안정적인 회사", "불안정한 회사", "가지 마", "위험", "것으로 보", "라고 볼 수", "볼 수 있어요", "볼 수 있습니다",
  "종합적으로", "결론적으로", "에 해당", "라는 뜻", "p25", "p75", "p90", "분위",
  "증가 중심", "감소 중심", "드나듦 중심", "중심의 달"
];

function passNum(sentence: string, allowed: Set<string>): boolean {
  for (const n of extractNums(sentence)) {
    if (!allowed.has(n)) return false;
  }
  return true;
}

function passForbid(sentence: string): boolean {
  for (const fb of FORBIDDEN) {
    if (sentence.includes(fb)) return false;
  }
  return true;
}

function 요약대체(d: any, 흐름: string): string {
  const sgn = d.순증감 > 0 ? "+" : "";
  if (흐름 === "증가") {
    return `이번 달 가입자가 ${fmt(d.순증감)}명 늘었어요 (신규취득 ${fmt(d.신규)}명·상실 ${fmt(d.상실)}명).`;
  }
  if (흐름 === "감소") {
    return `이번 달 가입자가 ${fmt(Math.abs(d.순증감))}명 줄었어요 (신규취득 ${fmt(d.신규)}명·상실 ${fmt(d.상실)}명).`;
  }
  if (흐름 === "드나듦") {
    return `전체 인원 변화는 ${sgn}${fmt(d.순증감)}명인데 이번 달 ${fmt(d.총이동)}명이 드나들었어요.`;
  }
  return `이번 달에는 신규취득과 상실이 없었어요.`;
}

function filterResult(
  result: any,
  factList: string[],
  d: any,
  업종위치: any | null,
  자료년월: string | undefined,
  흐름: string
): { 해설: any; 걸러낸문장수: number } {
  const allowed = allowedNums(factList, 자료년월);
  let removed = 0;

  const out: any = {};

  // 지원자_관점_요약
  let 요약 = result.지원자_관점_요약 || "";
  if (요약.length > 60 || !passNum(요약, allowed) || !passForbid(요약)) {
    요약 = 요약대체(d, 흐름);
    removed++;
  }
  // 흐름이 증가/감소일 때 "거의 그대로"/"변화는 작지만"/"변화가 작지만" 포함 문장 제거
  if (흐름 === "증가" || 흐름 === "감소") {
    const banned = ["거의 그대로", "변화는 작지만", "변화가 작지만"];
    if (banned.some(b => 요약.includes(b))) {
      요약 = 요약대체(d, 흐름);
      removed++;
    }
  }
  out.지원자_관점_요약 = 요약;

  // 이렇게_볼_수_있어요 (최대 3)
  const raw이렇게 = result.이렇게_볼_수_있어요 || [];
  let 이렇게 = raw이렇게.slice(0, 3).filter((s: string) => passNum(s, allowed) && passForbid(s));
  removed += raw이렇게.length - 이렇게.length;
  // 흐름이 증가/감소일 때 금지 문구 포함 문장 제거
  if (흐름 === "증가" || 흐름 === "감소") {
    const banned = ["거의 그대로", "변화는 작지만", "변화가 작지만"];
    const beforeLen = 이렇게.length;
    이렇게 = 이렇게.filter((s: string) => !banned.some(b => s.includes(b)));
    removed += beforeLen - 이렇게.length;
  }
  out.이렇게_볼_수_있어요 = 이렇게;

  // 같은_업종과_비교하면
  if (!업종위치) {
    out.같은_업종과_비교하면 = ["이 업종은 비교할 기준선이 없어서 같은 업종과 견주지 않았어요."];
    removed += (result.같은_업종과_비교하면 || []).length;
  } else {
    const raw비교 = result.같은_업종과_비교하면 || [];
    const 비교 = raw비교.slice(0, 2).filter((s: string) => passNum(s, allowed) && passForbid(s));
    removed += raw비교.length - 비교.length;
    out.같은_업종과_비교하면 = 비교;
  }

  // 지원_전에_확인해보세요 (최대 3)
  const raw확인 = result.지원_전에_확인해보세요 || [];
  const 확인 = raw확인.slice(0, 3).filter((s: string) => passNum(s, allowed) && passForbid(s));
  removed += raw확인.length - 확인.length;
  out.지원_전에_확인해보세요 = 확인;

  // 판단_과정 (최대 3)
  const raw판단 = result.판단_과정 || [];
  const 판단 = raw판단.slice(0, 3).filter((s: string) => passNum(s, allowed) && passForbid(s));
  removed += raw판단.length - 판단.length;
  out.판단_과정 = 판단;

  return { 해설: out, 걸러낸문장수: removed };
}

function buildDataRef(자료년월: string | undefined, 계절성주의: boolean | undefined): string {
  let t = `국민연금 사업장 기록(기준월 ${자료년월 || "2026-07"})으로 계산했어요. 신규취득·상실이 곧 입사·퇴사를 뜻하지는 않아요.`;
  if (계절성주의) t += ` 7월·1월 자료에는 공공기관 정기 인사이동이 섞일 수 있어요.`;
  return t;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const d = body.진단결과;

    if (!d || !(d.가입자수 > 0)) {
      return NextResponse.json(
        { ok: false, 사유: "진단결과가 필요합니다" },
        { status: 400 }
      );
    }

    const apiKey = process.env.UPSTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, 사유: "서버 설정 오류: UPSTAGE_API_KEY가 없습니다" },
        { status: 500 }
      );
    }

    const 추이 = body.추이;
    const 자료년월 = body.자료년월;
    const 계절성주의 = body.계절성주의;
    const 입력_출처 = body.입력_출처;
    const 원본_업종명 = body.원본_업종명;

    const 사실목록 = buildFactList(d, 추이, 자료년월, 계절성주의, 입력_출처, 원본_업종명);

    const startMs = Date.now();
    let solarResult: any;
    try {
      solarResult = await solarCall(사실목록);
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, 사유: err.message || "Solar 호출 실패" },
        { status: 502 }
      );
    }
    const 소요ms = Date.now() - startMs;

    const 업종위치 = d.업종위치 || null;
    const 흐름 = flowType(d);
    const { 해설, 걸러낸문장수 } = filterResult(solarResult, 사실목록, d, 업종위치, 자료년월, 흐름.흐름);

    해설.데이터_참고 = buildDataRef(자료년월, 계절성주의);

    return NextResponse.json(
      {
        ok: true,
        해설,
        사실목록,
        걸러낸문장수,
        모델: process.env.SOLAR_MODEL || "solar-pro4-260806",
        소요ms
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("explain route error:", err);
    return NextResponse.json(
      { ok: false, 사유: "서버 내부 오류" },
      { status: 500 }
    );
  }
}
