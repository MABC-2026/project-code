export default function ThoughtTrail({ 진단결과, 추이 }: { 진단결과: any; 추이?: { 자료년월: string; 가입자수: number; 신규: number; 상실: number }[] }) {
  if (!진단결과) return null;

  const 순증감 = 진단결과.순증감 ?? 0;
  const 총이동 = 진단결과.총이동 ?? 0;
  const 부호 = (n: number) => (n > 0 ? "+" : "");

  const 항목들: React.ReactNode[] = [];

  // (가) 이번 달만 보면
  항목들.push(
    <li key="ga" className="rounded-lg bg-zinc-50 px-3 py-2">
      <span className="block text-xs text-zinc-400">이번 달만 보면</span>
      <span className="ml-1 text-zinc-800">인원 {부호(순증감)}{순증감.toLocaleString("ko-KR")}명</span>
      <span className="ml-1 text-zinc-800">·</span>
      <span className="ml-1 text-zinc-800">드나든 사람</span>
      <span className="ml-1 text-zinc-800">{총이동.toLocaleString("ko-KR")}명</span>
    </li>
  );

  if (추이 && 추이.length >= 6) {
    const sorted = [...추이].sort((a, b) => a.자료년월.localeCompare(b.자료년월));
    const n = sorted.length;
    const first = sorted[0];
    const last = sorted[n - 1];
    const diff = last.가입자수 - first.가입자수;

    // (나) 1년을 보면
    let 연속k = 0;
    let 방향: 1 | -1 | null = null;
    for (let i = n - 1; i >= 1; i--) {
      const delta = sorted[i].가입자수 - sorted[i - 1].가입자수;
      if (delta === 0) break;
      if (방향 === null) {
        방향 = delta > 0 ? 1 : -1;
        연속k = 1;
      } else if ((delta > 0 && 방향 === 1) || (delta < 0 && 방향 === -1)) {
        연속k++;
      } else {
        break;
      }
    }

    const 누적내용 = `${first.가입자수.toLocaleString("ko-KR")}명 → ${last.가입자수.toLocaleString("ko-KR")}명 (${부호(diff)}${diff.toLocaleString("ko-KR")}명)`;
    let 연연속부분 = "";
    if (연속k >= 3) {
      연연속부분 = ` · 마지막 ${연속k}개월 연속 ${방향 === 1 ? "늘었어요" : "줄었어요"}`;
    }

    항목들.push(
      <li key="na" className="rounded-lg bg-zinc-50 px-3 py-2">
        <span className="block text-xs text-zinc-400">1년을 보면</span>
        <span className="ml-1 text-zinc-800">{누적내용}</span>
        <span className="text-zinc-800">{연연속부분}</span>
      </li>
    );

    // (다) 방향 비교
    const 월키 =
      (진단결과.순증감 ?? 0) / (진단결과.가입자수 ?? 1) > 0.005
        ? "늘"
        : (진단결과.순증감 ?? 0) / (진단결과.가입자수 ?? 1) < -0.005
        ? "줄"
        : "그대로";
    const 연키 =
      diff / first.가입자수 > 0.01
        ? "늘"
        : diff / first.가입자수 < -0.01
        ? "줄"
        : "그대로";
    const 월방향음 = { 늘: "늘어난 달", 줄: "줄어든 달", 그대로: "거의 그대로인 달" }[월키];
    const 연방향음 = { 늘: "늘어나는 흐름", 줄: "줄어드는 흐름", 그대로: "거의 그대로인 흐름" }[연키];

    if (월키 === 연키) {
      항목들.push(
        <li key="da-same" className="rounded-lg bg-violet-50 px-3 py-2 text-violet-800">
          <span className="block text-xs text-zinc-400">방향 비교</span>
          <span className="ml-1">→ 한 달과 1년이 같은 방향이에요 · {연방향음}</span>
        </li>
      );
    } else {
      항목들.push(
        <li key="da-diff" className="rounded-lg bg-violet-100 px-3 py-2 font-medium text-violet-900">
          <span className="block text-xs text-zinc-400">방향 비교</span>
          <span className="ml-1">↻ 한 달만 보면 {월방향음}이었는데, 1년을 보면 {연방향음}이에요. 1년 흐름을 기준으로 봤어요.</span>
        </li>
      );
    }

    // (라) 채용을 나눠 보면
    const 신규합 = 추이.reduce((s, r) => s + r.신규, 0);
    const 상실합 = 추이.reduce((s, r) => s + r.상실, 0);
    if (신규합 > 0) {
      const 증원 = Math.max(신규합 - 상실합, 0);
      const 충원퍼 = Math.round(Math.min(신규합, 상실합) / 신규합 * 100);
      const 증원퍼 = 100 - 충원퍼;
      const 채용내용 =
        증원 === 0
          ? `신규취득 ${신규합.toLocaleString("ko-KR")}명은 모두 빈자리 채우기`
          : `신규취득 ${신규합.toLocaleString("ko-KR")}명 중 빈자리 채우기 ${충원퍼}% · 늘어난 자리 ${증원퍼}%`;

      항목들.push(
        <li key="ra" className="rounded-lg bg-zinc-50 px-3 py-2">
          <span className="block text-xs text-zinc-400">채용을 나눠 보면</span>
          <span className="ml-1 text-zinc-800">{채용내용}</span>
        </li>
      );
    }

    // (마) 최근 3개월 vs 이전
    const 최근신규 = sorted.slice(n - 3).reduce((s, r) => s + r.신규, 0) / 3;
    const 이전신규 = sorted.slice(0, n - 3).reduce((s, r) => s + r.신규, 0) / (n - 3);
    const 변화퍼 = 이전신규 > 0 ? Math.round((최근신규 - 이전신규) / 이전신규 * 100) : null;

    if (변화퍼 !== null && 이전신규 >= 3) {
      const cls =
        변화퍼 <= -30
          ? "rounded-lg bg-amber-50 px-3 py-2 text-amber-900"
          : 변화퍼 >= 30
          ? "rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900"
          : null;
      if (cls) {
        const txt =
          변화퍼 <= -30
            ? `신규취득이 ${Math.abs(변화퍼)}% 줄었어요`
            : `신규취득이 ${변화퍼}% 늘었어요`;
        항목들.push(
          <li key="ma" className={cls}>
            <span className="block text-xs text-amber-700">최근 3개월</span>
            <span className="ml-1">{txt}</span>
          </li>
        );
      }
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">생각이 이렇게 흘러갔어요</p>
      <ol className="mt-3 space-y-2 text-sm text-zinc-800">{항목들}</ol>
    </section>
  );
}
