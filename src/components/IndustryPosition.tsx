export default function IndustryPosition({ 진단결과 }: { 진단결과: any }) {
  if (!진단결과?.업종위치) return null;

  const { 비교사업장수, p25, p50, p75, p90, 구간 } = 진단결과.업종위치;
  const 월회전율 = 진단결과.월회전율 ?? 0;
  const 업종배수 = 진단결과.업종배수 ?? 1;
  const 업종명 = 진단결과.업종 || "같은 업종";

  const 최대 = Math.max(p90 * 100, 월회전율 * 100) * 1.15;
  const x = (v: number) => 12 + (v / 최대) * 296;
  const 내위치 = Math.min(x(월회전율 * 100), 306);

  const 쉬운위치 =
    구간 === "상위 10% 안"
      ? "매우 높은 편"
      : 구간 === "상위 10~25%"
      ? "높은 편"
      : 구간 === "상위 25~50%" || 구간 === "하위 25~50%"
      ? "일반적인 범위"
      : 구간 === "하위 25% 안"
      ? "낮은 편"
      : 구간;

  return (
    <section className="mt-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">같은 업종 안 위치</h3>
        <span className="text-xs text-zinc-500">
          {업종명} {비교사업장수}곳
        </span>
      </div>
      <svg viewBox="0 0 320 110" className="mt-3 h-28 w-full">
        <rect x="12" y="46" width="296" height="14" rx="7" fill="#f4f4f5" />
        <rect
          x={x(p25 * 100)}
          y="46"
          width={x(p75 * 100) - x(p25 * 100)}
          height="14"
          fill="#e4e4e7"
        />
        <rect
          x={x(p75 * 100)}
          y="46"
          width={x(p90 * 100) - x(p75 * 100)}
          height="14"
          fill="#fde68a"
        />
        <rect
          x={x(p90 * 100)}
          y="46"
          width={308 - x(p90 * 100)}
          height="14"
          fill="#fecaca"
        />
        <line
          x1={x(p50 * 100)}
          x2={x(p50 * 100)}
          y1="40"
          y2="66"
          stroke="#52525b"
          strokeWidth="2"
        />
        <text
          x={x(p50 * 100)}
          y="82"
          textAnchor="middle"
          fontSize="11"
          fill="#52525b"
        >
          중앙값 {(p50 * 100).toFixed(1)}%
        </text>
        <circle cx={내위치} cy="53" r="9" fill="#7c3aed" stroke="white" strokeWidth="3" />
        <text
          x={내위치}
          y="28"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="#6d28d9"
        >
          이 회사 {(월회전율 * 100).toFixed(1)}%
        </text>
        <rect x="12" y="96" width="10" height="8" fill="#e4e4e7" />
        <text x="26" y="104" fontSize="10" fill="#71717a">
          일반적인 범위
        </text>
        <rect x="108" y="96" width="10" height="8" fill="#fde68a" />
        <text x="122" y="104" fontSize="10" fill="#71717a">
          높은 편
        </text>
        <rect x="180" y="96" width="10" height="8" fill="#fecaca" />
        <text x="194" y="104" fontSize="10" fill="#71717a">
          매우 높은 편
        </text>
      </svg>
      <p className="mt-1 text-sm text-zinc-800">
        {비교사업장수}곳 중 <b>{쉬운위치}</b> · 중앙값({(p50 * 100).toFixed(1)}%)의{" "}
        {업종배수.toFixed(1)}배
      </p>
    </section>
  );
}
