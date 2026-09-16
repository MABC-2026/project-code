import React from "react";
import FlowChart from "./FlowChart";

export default function HiringInsight({
  rows,
}: {
  rows?: { 자료년월: string; 가입자수: number; 신규: number; 상실: number }[];
}) {
  if (!rows || rows.length < 6) return null;

  const sorted = [...rows].sort((a, b) => a.자료년월.localeCompare(b.자료년월));
  const n = sorted.length;

  const 신규합 = sorted.reduce((s, r) => s + r.신규, 0);
  const 상실합 = sorted.reduce((s, r) => s + r.상실, 0);
  const 충원 = Math.min(신규합, 상실합);
  const 증원 = Math.max(신규합 - 상실합, 0);
  const 줄어든 = Math.max(상실합 - 신규합, 0);
  const 평균인원 = sorted.reduce((s, r) => s + r.가입자수, 0) / n;
  const 신규비율 = Math.round(신규합 / 평균인원 * 100);
  const 충원퍼 = Math.round(충원 / 신규합 * 100);
  const 증원퍼 = 100 - 충원퍼;
  const 평균신규 = 신규합 / n;

  const strings = {
    신규합: 신규합.toLocaleString("ko-KR"),
    충원: 충원.toLocaleString("ko-KR"),
    증원: 증원.toLocaleString("ko-KR"),
    줄어든: 줄어든.toLocaleString("ko-KR"),
    상실합: 상실합.toLocaleString("ko-KR"),
    충원퍼: `${충원퍼}%`,
    증원퍼: `${증원퍼}%`,
    신규비율: `${신규비율}%`,
  };

  // 채용의 성격 문장
  let 채용성격문장: React.ReactNode;
  if (신규합 === 0) {
    채용성격문장 = <p className="mt-1 text-sm text-zinc-900">지난 {n}개월 동안 신규취득이 없었어요.</p>;
  } else if (증원 === 0) {
    채용성격문장 = (
      <p className="mt-1 text-sm text-zinc-900">
        지난 {n}개월 신규취득 {strings.신규합}명은 모두 나간 만큼 다시 채운 흐름이에요.
      </p>
    );
  } else if (충원퍼 >= 70) {
    채용성격문장 = (
      <p className="mt-1 text-sm text-zinc-900">
        지난 {n}개월 신규취득 {strings.신규합}명 중 {strings.충원퍼}는 나간 만큼 다시 채운 흐름이에요.
      </p>
    );
  } else if (충원퍼 <= 40) {
    채용성격문장 = (
      <p className="mt-1 text-sm text-zinc-900">
        지난 {n}개월 신규취득 {strings.신규합}명 중 {strings.증원퍼}는 인원이 늘어난 흐름이에요.
      </p>
    );
  } else {
    채용성격문장 = (
      <p className="mt-1 text-sm text-zinc-900">
        지난 {n}개월 신규취득 {strings.신규합}명 중 빈자리를 채운 흐름이 {strings.충원퍼}, 인원이 늘어난 흐름이 {strings.증원퍼}예요.
      </p>
    );
  }

  // 몰린달: 조건에 맞는 달 최대 4개 (신규 큰 순서), 화면엔 자료년월 오름차순
  const 몰린달후보 = sorted.filter((r) => r.신규 >= 평균신규 * 1.5 && r.신규 >= 3);
  const 몰린달상위 = 몰린달후보.sort((a, b) => b.신규 - a.신규).slice(0, 4);
  const 몰린달표시 = [...몰린달상위].sort((a, b) => a.자료년월.localeCompare(b.자료년월));

  const 몰린달칩들 = 몰린달표시.map((m) => ({
    자료년월: m.자료년월,
    신규: m.신규,
    배수: Math.round((m.신규 / 평균신규) * 10) / 10,
  }));

  // 간격 문장: 3~4개이고 모두 동일한 간격이며 그 간격이 2개월 이상
  let 간격문장: React.ReactNode | null = null;
  if (몰린달후보.length === 3 || 몰린달후보.length === 4) {
    const indices = 몰린달표시.map((m) => {
      const [y, mo] = m.자료년월.split("-").map(Number);
      return y * 12 + mo;
    });
    const gaps: number[] = [];
    for (let i = 1; i < indices.length; i++) {
      gaps.push(indices[i] - indices[i - 1]);
    }
    if (gaps.length > 0 && gaps.every((g) => g === gaps[0]) && gaps[0] >= 2) {
      간격문장 = (
        <p className="mt-1 text-sm text-zinc-900">{gaps[0]}개월 간격으로 신규취득이 몰렸어요.</p>
      );
    }
  }

  // 1월·7월 경고
  let 인사이동문장: React.ReactNode | null = null;
  if (몰린달표시.some((m) => {
    const month = Number(m.자료년월.split("-")[1]);
    return month === 1 || month === 7;
  })) {
    인사이동문장 = (
      <p className="mt-1 text-xs text-zinc-500">1월·7월은 정기 인사이동이 섞여 신규취득이 많게 나올 수 있어요.</p>
    );
  }

  const 몰린달칩jsx = 몰린달칩들.map((m) => (
    <span
      key={m.자료년월}
      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800"
    >
      {m.자료년월} · {m.신규.toLocaleString("ko-KR")}명 · 평소의 {m.배수}배
    </span>
  ));

  // 최근 3개월 변화
  const 최근신규 = sorted.slice(-3).reduce((s, r) => s + r.신규, 0) / 3;
  const 이전신규 = sorted.slice(0, n - 3).reduce((s, r) => s + r.신규, 0) / (n - 3);
  const 최근상실 = sorted.slice(-3).reduce((s, r) => s + r.상실, 0) / 3;
  const 이전상실 = sorted.slice(0, n - 3).reduce((s, r) => s + r.상실, 0) / (n - 3);

  const 신규변화퍼 = 이전신규 > 0 ? Math.round((최근신규 - 이전신규) / 이전신규 * 100) : null;
  const 상실변화퍼 = 이전상실 > 0 ? Math.round((최근상실 - 이전상실) / 이전상실 * 100) : null;

  const 변화꼬리 = (변화퍼: number | null) =>
    변화퍼 !== null
      ? `, ${변화퍼 > 0 ? "+" : ""}${변화퍼}%`
      : "";

  const 신규칩 = (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800">
      신규취득 월평균 {Math.round(최근신규).toLocaleString("ko-KR")}명 (그 전{" "}
      {Math.round(이전신규).toLocaleString("ko-KR")}명{변화꼬리(신규변화퍼)})
    </span>
  );
  const 상실칩 = (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-800">
      상실 월평균 {Math.round(최근상실).toLocaleString("ko-KR")}명 (그 전{" "}
      {Math.round(이전상실).toLocaleString("ko-KR")}명{변화꼬리(상실변화퍼)})
    </span>
  );

  const 신호문장들: React.ReactNode[] = [];
  if (신규변화퍼 !== null && 신규변화퍼 <= -30 && 이전신규 >= 3)
    신호문장들.push(
      <p key="신규감소" className="mt-1 text-sm text-zinc-900">
        최근 신규취득이 크게 줄었어요.
      </p>,
    );
  if (신규변화퍼 !== null && 신규변화퍼 >= 30 && 이전신규 >= 3)
    신호문장들.push(
      <p key="신규증가" className="mt-1 text-sm text-zinc-900">
        최근 신규취득이 크게 늘었어요.
      </p>,
    );
  if (상실변화퍼 !== null && 상실변화퍼 >= 30 && 이전상실 >= 3)
    신호문장들.push(
      <p key="상실증가" className="mt-1 text-sm text-zinc-900">
        최근 상실이 크게 늘었어요.
      </p>,
    );

  // 지원자 팁
  let 팁: React.ReactNode | null = null;
  if (신규합 > 0) {
    if (충원퍼 >= 70) {
      팁 = (
        <p className="mt-1 text-xs text-zinc-700">
          지원한 자리가 새로 생긴 자리인지, 누군가 떠난 자리인지 면접에서 물어보세요.
        </p>
      );
    } else if (증원퍼 >= 60) {
      팁 = (
        <p className="mt-1 text-xs text-zinc-700">
          새로 생긴 자리가 많은 흐름이에요. 조직이 어디로 커지는 중인지 물어보세요.
        </p>
      );
    }
  }

  const 줄어든접미사 = 줄어든 > 0 ? ` · 채우지 않고 줄어든 자리 ${strings.줄어든}명` : "";

  return (
    <section className="mt-3 mb-4 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">인력 흐름으로 본 채용</h3>
        <span className="text-xs text-zinc-500">최근 {n}개월 · 국민연금 기록</span>
      </div>

      <FlowChart 추이={rows} />

      <p className="mt-3 text-xs font-medium text-zinc-500">채용의 성격</p>
      {채용성격문장}

      {신규합 > 0 && (
        <>
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded bg-zinc-100">
            <div className="h-full bg-zinc-700" style={{ width: `${충원퍼}%` }} />
            <div className="h-full bg-emerald-500" style={{ width: `${증원퍼}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-zinc-600">
            <span>
              <span className="text-zinc-700">■</span> 빈자리 채우기 {strings.충원}명 ({strings.충원퍼})
            </span>
            <span>
              <span className="text-emerald-500">■</span> 늘어난 자리 {strings.증원}명 ({strings.증원퍼})
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            같은 기간 상실 {strings.상실합}명 · 신규취득은 평균 직원 수의 {strings.신규비율}
            {줄어든접미사}
          </p>
          {팁}

          <p className="mt-4 text-xs font-medium text-zinc-500">채용이 몰린 달</p>
          {몰린달표시.length > 0 ? (
            <>
              <div className="mt-1 flex flex-wrap gap-2">{몰린달칩jsx}</div>
              {간격문장}
              {인사이동문장}
              <p className="mt-1 text-xs text-zinc-500">1년치 기록이라 해마다 같은 달에 몰린다고 단정할 수는 없어요.</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-700">특별히 몰린 달 없이 고르게 신규취득이 있었어요.</p>
              <p className="mt-1 text-xs text-zinc-500">1년치 기록이라 해마다 같은 달에 몰린다고 단정할 수는 없어요.</p>
            </>
          )}
        </>
      )}

      <p className="mt-4 text-xs font-medium text-zinc-500">최근 3개월 변화</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {신규칩}
        {상실칩}
      </div>
      {신호문장들}
      <p className="mt-1 text-xs text-zinc-500">계절에 따라 신규취득·상실이 달라지는 영향이 섞일 수 있어요.</p>

      <p className="mt-4 text-xs text-zinc-500">
        {n}개월 동안 나간 인원(상실)만큼 들어온 신규취득을 &lsquo;빈자리 채우기&rsquo;, 그보다 더 들어온 인원을 &lsquo;늘어난 자리&rsquo;로 셌어요. 신규취득·상실은 입사·퇴사와 같지 않아요(전보·재가입 포함).
      </p>
    </section>
  );
}
