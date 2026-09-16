export default function KeyNumbers({ 진단결과, 추이 }: { 진단결과: any; 추이?: { 자료년월: string; 가입자수: number; 신규: number; 상실: number }[] }) {
  if (!진단결과) return null;

  const sorted = 추이 && 추이.length >= 6
    ? [...추이].sort((a, b) => a.자료년월.localeCompare(b.자료년월))
    : undefined;
  const n = sorted ? sorted.length : 0;
  const first = sorted ? sorted[0] : undefined;
  const last = sorted ? sorted[n - 1] : undefined;

  const 가입자수 = 진단결과.가입자수 ?? 0;
  const 신규 = 진단결과.신규 ?? 0;
  const 상실 = 진단결과.상실 ?? 0;
  const 총이동 = 신규 + 상실;
  const 순증감 = 신규 - 상실;
  const 월회전율 = 진단결과.월회전율 ?? 0;

  const diffEl = sorted && last && first ? (() => {
    const diff = last.가입자수 - first.가입자수;
    const 비율 = Math.abs(diff / first.가입자수 * 100).toFixed(1);
    if (diff > 0) return <span className="text-emerald-600">▲ 1년 {diff.toLocaleString("ko-KR")}명 ({비율}%)</span>;
    if (diff < 0) return <span className="text-rose-600">▼ 1년 {Math.abs(diff).toLocaleString("ko-KR")}명 ({비율}%)</span>;
    return <span className="text-zinc-500">1년 동안 그대로</span>;
  })() : null;

  const graphEl = sorted && last && first && n >= 2 ? (() => {
    const vals = sorted.map(r => r.가입자수);
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    if (mx === mn) return null;
    const pts = sorted.map((r, i) => {
      const x = i * (100 / (n - 1));
      const y = 30 - ((r.가입자수 - mn) / (mx - mn)) * 26;
      return `${x},${y}`;
    });
    const diff = last.가입자수 - first.가입자수;
    return (
      <svg viewBox="0 0 100 32" className="mt-2 h-8 w-full" preserveAspectRatio="none">
        <polyline points={pts.join(" ")} fill="none" stroke={diff < 0 ? "#e11d48" : "#059669"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  })() : null;

  const 회전율그래프 = 진단결과.업종위치 ? (() => {
    const p25 = 진단결과.업종위치.p25 ?? 0;
    const p50 = 진단결과.업종위치.p50 ?? 0;
    const p75 = 진단결과.업종위치.p75 ?? 0;
    const p90 = 진단결과.업종위치.p90 ?? 0;
    const 최대 = Math.max(p90 * 100, 월회전율 * 100) * 1.15;
    const x = (v: number) => v / 최대 * 100;
    return (
      <svg viewBox="0 0 100 16" className="mt-2 h-4 w-full" preserveAspectRatio="none">
        <rect x="0" y="6" width="100" height="4" fill="#f4f4f5" />
        <rect x={x(p25 * 100)} y="6" width={x(p75 * 100) - x(p25 * 100)} height="4" fill="#e4e4e7" />
        <rect x={x(p50 * 100) - 0.4} y="3" width="0.8" height="10" fill="#71717a" />
        <rect x={Math.min(x(월회전율 * 100), 98)} y="2" width="2" height="12" fill="#7c3aed" />
      </svg>
    );
  })() : null;

  const 신규그래프칸 = sorted && n >= 6 && sorted[0].신규 != null ? (() => {
    const 최근신규 = sorted.slice(n - 3).reduce((s, r) => s + r.신규, 0) / 3;
    const 이전신규 = sorted.slice(0, n - 3).reduce((s, r) => s + r.신규, 0) / (n - 3);
    if (!(이전신규 > 0)) return null;
    const 변화퍼 = Math.round((최근신규 - 이전신규) / 이전신규 * 100);
    const 값클래스 = 변화퍼 <= -10 ? "text-rose-600" : 변화퍼 >= 10 ? "text-emerald-600" : "text-zinc-900";
    const 최대신규 = Math.max(...sorted.map(r => r.신규));
    return (
      <div className="rounded-lg bg-zinc-50 p-3">
        <p className="text-xs text-zinc-500">최근 3개월 신규취득</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${값클래스}`}>
          {변화퍼 > 0 ? "+" : ""}{변화퍼}%
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          월 {Math.round(최근신규).toLocaleString("ko-KR")}명 (그 전 {Math.round(이전신규).toLocaleString("ko-KR")}명)
        </p>
        {최대신규 > 0 && (
          <svg viewBox="0 0 100 32" className="mt-2 h-8 w-full" preserveAspectRatio="none">
            {sorted.map((r, i) => (
              <rect
                key={r.자료년월}
                x={i * (100 / n) + 0.6}
                y={32 - (r.신규 / 최대신규) * 30}
                width={100 / n - 1.2}
                height={(r.신규 / 최대신규) * 30}
                fill={i >= n - 3 ? "#e11d48" : "#d4d4d8"}
              />
            ))}
          </svg>
        )}
      </div>
    );
  })() : null;

  return (
    <section className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {/* 칸 1 — 직원 수 */}
      <div className="rounded-lg bg-zinc-50 p-3">
        <p className="text-xs text-zinc-500">직원 수</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
          {가입자수.toLocaleString("ko-KR")}<span className="text-base font-medium">명</span>
        </p>
        {diffEl}
        {graphEl}
        {!sorted && <p className="text-xs text-zinc-500 mt-2">추이 정보 없음</p>}
      </div>

      {/* 칸 2 — 이번 달 드나든 사람 */}
      <div className="rounded-lg bg-zinc-50 p-3">
        <p className="text-xs text-zinc-500">이번 달 드나든 사람</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
          {총이동.toLocaleString("ko-KR")}<span className="text-base font-medium">명</span>
        </p>
        <p className="text-xs text-zinc-500 mt-1">신규 {신규.toLocaleString("ko-KR")} · 상실 {상실.toLocaleString("ko-KR")}</p>
        {총이동 > 0 && (
          <>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-zinc-200">
              <div className="bg-emerald-500" style={{ width: `${신규 / 총이동 * 100}%` }} />
              <div className="bg-rose-400" style={{ width: `${상실 / 총이동 * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">인원 변화는 {순증감 > 0 ? "+" : ""}{순증감.toLocaleString("ko-KR")}명</p>
          </>
        )}
      </div>

      {/* 칸 3 — 월 회전율 */}
      <div className="rounded-lg bg-zinc-50 p-3">
        <p className="text-xs text-zinc-500">월 회전율</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">
          {(월회전율 * 100).toFixed(1)}%
        </p>
        {진단결과.업종위치 ? (
          <>
            <p className="text-xs text-zinc-500 mt-1">
              업종 중앙값의 {(진단결과.업종배수 ?? 1).toFixed(1)}배
            </p>
            {회전율그래프}
          </>
        ) : (
          <p className="text-xs text-zinc-500 mt-1">업종 기준선 없음</p>
        )}
      </div>

      {/* 칸 4 — 최근 3개월 신규취득 (조건부) */}
      {신규그래프칸}
    </section>
  );
}
