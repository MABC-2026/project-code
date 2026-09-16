import { Fragment } from "react";

export default function FlowChart({ 추이 }: { 추이?: { 자료년월: string; 가입자수: number; 신규: number; 상실: number }[] }) {
  if (!추이 || 추이.length < 6) return null;

  const sorted = [...추이].sort((a, b) => a.자료년월.localeCompare(b.자료년월));
  const n = sorted.length;

  const 신규합 = sorted.reduce((s, r) => s + r.신규, 0);
  const 평균신규 = 신규합 / n;

  const 최대값 = Math.max(...sorted.map((r) => Math.max(r.신규, r.상실)));
  const 단위 = 최대값 <= 50 ? 10 : 최대값 <= 200 ? 50 : 최대값 <= 700 ? 100 : 최대값 <= 2000 ? 500 : 1000;
  const 축최대 = Math.max(단위, Math.ceil(최대값 / 단위) * 단위);

  const 최근신규 = sorted.slice(-3).reduce((s, r) => s + r.신규, 0) / 3;
  const 이전신규 = sorted.slice(0, n - 3).reduce((s, r) => s + r.신규, 0) / (n - 3);
  const 변화퍼 = 이전신규 > 0 ? Math.round((최근신규 - 이전신규) / 이전신규 * 100) : null;

  const left = 44;
  const right = 16;
  const mid = 150;
  const H = 110;
  const 칸너비 = (760 - left - right) / n;
  const 막대너비 = Math.min(22, 칸너비 * 0.36);

  const 눈금값들 = [축최대, 축최대 / 2];

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          신규취득
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />
          상실
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border-2 border-amber-500" />
          채용이 몰린 달
        </span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <svg viewBox="0 0 760 290" className="h-64 w-full min-w-[560px]">
          {/* 눈금 */}
          {눈금값들.map((v) => {
            const y위 = mid - (v / 축최대) * H;
            const y아래 = mid + (v / 축최대) * H;
            return (
              <Fragment key={v}>
                <line
                  x1={left}
                  x2={760 - right}
                  y1={y위}
                  y2={y위}
                  stroke="#f4f4f5"
                  strokeWidth="1"
                />
                <text
                  x={left - 8}
                  y={y위 + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#a1a1aa"
                >
                  {v}
                </text>
                <line
                  x1={left}
                  x2={760 - right}
                  y1={y아래}
                  y2={y아래}
                  stroke="#f4f4f5"
                  strokeWidth="1"
                />
                <text
                  x={left - 8}
                  y={y아래 + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="#a1a1aa"
                >
                  {v}
                </text>
              </Fragment>
            );
          })}
          {/* 0 눈금 */}
          <line
            x1={left}
            x2={760 - right}
            y1={mid}
            y2={mid}
            stroke="#a1a1aa"
            strokeWidth="1"
          />
          <text
            x={left - 8}
            y={mid + 4}
            textAnchor="end"
            fontSize="11"
            fill="#a1a1aa"
          >
            0
          </text>

          {/* 최근 3개월 배경 */}
          <rect
            x={left + (n - 3) * 칸너비}
            y={14}
            width={3 * 칸너비}
            height={2 * H + 20}
            fill="#f5f3ff"
          />
          {변화퍼 !== null && Math.abs(변화퍼) >= 10 && (
            <text
              x={left + (n - 1.5) * 칸너비}
              y={28}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill="#6d28d9"
            >
              최근 3개월 신규 {변화퍼 > 0 ? "+" : ""}
              {변화퍼}%
            </text>
          )}

          {/* 달마다 막대 */}
          {sorted.map((r) => {
            const i = sorted.indexOf(r);
            const 중심 = left + i * 칸너비 + 칸너비 / 2;
            const 몰림 = r.신규 >= 평균신규 * 1.5 && r.신규 >= 3;
            const 신규높이 = (r.신규 / 축최대) * H;
            const 상실높이 = (r.상실 / 축최대) * H;

            return (
              <Fragment key={r.자료년월}>
                {/* 신규 막대 */}
                <rect
                  x={중심 - 막대너비 - 1}
                  y={mid - 신규높이}
                  width={막대너비}
                  height={신규높이}
                  rx="3"
                  fill="#10b981"
                  stroke={몰림 ? "#f59e0b" : "none"}
                  strokeWidth={몰림 ? 3 : 0}
                />
                {/* 상실 막대 */}
                <rect
                  x={중심 + 1}
                  y={mid}
                  width={막대너비}
                  height={상실높이}
                  rx="3"
                  fill="#fb7185"
                />
                {/* 달 글자 */}
                <text
                  x={중심}
                  y={mid + H + 24}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#71717a"
                >
                  {r.자료년월.slice(2, 4)}.
                  {r.자료년월.slice(5)}
                </text>
                {/* 몰림 라벨 */}
                {몰림 && (
                  <text
                    x={중심 - 막대너비 / 2 - 1}
                    y={mid - 신규높이 - 7}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#b45309"
                  >
                    몰림
                  </text>
                )}
              </Fragment>
            );
          })}

          {/* 세로 글자 */}
          <text
            x={10}
            y={mid - 55}
            fontSize="11"
            fill="#047857"
            textAnchor="middle"
            transform={`rotate(-90 10 ${mid - 55})`}
          >
            들어옴
          </text>
          <text
            x={10}
            y={mid + 55}
            fontSize="11"
            fill="#be123c"
            textAnchor="middle"
            transform={`rotate(-90 10 ${mid + 55})`}
          >
            나감
          </text>
        </svg>
      </div>
    </div>
  );
}
