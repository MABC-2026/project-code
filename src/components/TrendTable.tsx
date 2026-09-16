interface Row {
  자료년월: string;
  가입자수: number;
  신규: number;
  상실: number;
  순증감: number;
  총이동: number;
  월회전율: number;
}

interface FailedMonth {
  자료년월: string;
  사유: string;
}

interface ExcludedMonth {
  년월: string;
}

interface TrendTableProps {
  rows?: Row[];
  failedMonths?: FailedMonth[];
  excludedMonths?: ExcludedMonth[];
}

function monthDiff(ym: string, base: string) {
  const [y1, m1] = ym.split("-").map(Number);
  const [y2, m2] = base.split("-").map(Number);
  return (y1 - y2) * 12 + (m1 - m2);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  let total = y * 12 + (m - 1) + n;
  let ny = Math.floor(total / 12);
  let nm = total % 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function formatXLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${y % 100}.${String(m).padStart(2, "0")}`;
}

// 연속 구간별로 polyline 좌표 문자열 배열 반환 (빠진 달 있으면 끊음)
function buildPolylines(
  points: { ym: string; value: number }[],
  xOf: (ym: string) => number,
  yOf: (v: number) => number
): string[] {
  if (points.length === 0) return [];
  const segs: { ym: string; value: number }[][] = [];
  let cur = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prevDiff = monthDiff(points[i - 1].ym, points[0].ym);
    const curDiff = monthDiff(points[i].ym, points[0].ym);
    if (curDiff === prevDiff + 1) {
      cur.push(points[i]);
    } else {
      if (cur.length > 1) segs.push(cur);
      cur = [points[i]];
    }
  }
  if (cur.length > 1) segs.push(cur);
  return segs.map((seg) => {
    return seg.map((p) => `${xOf(p.ym)},${yOf(p.value)}`).join(" ");
  });
}

function LineChart({
  title,
  points,
  valueLabel,
  axisLabel,
  fromZero,
}: {
  title: string;
  points: { ym: string; value: number }[];
  valueLabel: (v: number) => string;
  axisLabel: (v: number) => string;
  fromZero: boolean;
}) {
  if (points.length === 0) return null;

  const sorted = [...points].sort(
    (a, b) => a.ym.localeCompare(b.ym) || a.value - b.value
  );
  const firstYM = sorted[0].ym;
  const lastYM = sorted[sorted.length - 1].ym;
  const span = monthDiff(lastYM, firstYM);

  const W = 320,
    H = 140;
  const mL = 58,
    mR = 12,
    mT = 20,
    mB = 22;

  const plotW = W - mL - mR;
  const plotH = H - mT - mB;

  const vals = sorted.map((p) => p.value);
  const maxVal = Math.max(...vals);
  const minVal = Math.min(...vals);

  // y 범위
  let yMin: number, yMax: number;
  if (fromZero) {
    yMin = 0;
    yMax = maxVal * 1.2;
    if (yMax === 0) yMax = 1;
  } else {
    if (minVal === maxVal) {
      yMin = minVal - 1;
      yMax = minVal + 1;
    } else {
      const pad = (maxVal - minVal) * 0.1;
      yMin = minVal - pad;
      yMax = maxVal + pad;
    }
  }

  const xOf = (ym: string) => {
    if (span === 0) return mL + plotW / 2;
    return mL + (monthDiff(ym, firstYM) / span) * plotW;
  };
  const yOf = (v: number) => {
    return mT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  };

  const lastVal = sorted[sorted.length - 1].value;
  const ariaParts = sorted.map((p) => `${p.ym} ${valueLabel(p.value)}`);
  const ariaLabel = `${title}: ${ariaParts.join(", ")}`;

  // 가로 눈금선: fromZero → 0/최댓값, else → 최솟값/최댓값
  const gridLines = fromZero ? [0, maxVal] : [minVal, maxVal];

  // x 라벨 후보: addMonths(firstYM, 0/3/6/...) (span 이하) + 마지막 달
  const labelCandidates: string[] = [];
  for (let d = 0; d <= span; d += 3) {
    labelCandidates.push(addMonths(firstYM, d));
  }
  labelCandidates.push(lastYM);

  // 마지막 달과 2달 이내인 후보 중 마지막 달이 아닌 것 제외 (중복 제거 후)
  const uniqueCandidates = [...new Set(labelCandidates)];
  const xLabels = uniqueCandidates.filter(
    (ym) => monthDiff(lastYM, ym) > 2 || ym === lastYM
  );

  const lastIndex = sorted.length - 1;

  return (
    <div className="mt-2">
      <div className="text-xs text-zinc-600">{title}</div>
      <svg
        viewBox="0 0 320 140"
        className="w-full h-auto"
        role="img"
        aria-label={ariaLabel}
      >
        {gridLines.map((v) => (
          <line
            key={v}
            x1={mL}
            y1={yOf(v)}
            x2={W - mR}
            y2={yOf(v)}
            stroke="#e4e4e7"
          />
        ))}
        {gridLines.map((v) => (
          <text
            key={`lbl-${v}`}
            x={52}
            y={yOf(v) + 3}
            fontSize={10}
            fill="#71717a"
            textAnchor="end"
          >
            {axisLabel(v)}
          </text>
        ))}
        {buildPolylines(sorted, xOf, yOf).map((pts, i) => (
          <polyline
            key={`poly-${i}`}
            points={pts}
            fill="none"
            stroke="#18181b"
            strokeWidth={2}
          />
        ))}
        {sorted.map((p, idx) => (
          <circle
            key={`dot-${p.ym}`}
            cx={xOf(p.ym)}
            cy={yOf(p.value)}
            r={idx === lastIndex ? 3.5 : 2}
            fill="#18181b"
          />
        ))}
        <text
          x={xOf(lastYM)}
          y={yOf(lastVal) - 8}
          textAnchor="end"
          fontSize={10}
          fontWeight={600}
          fill="#18181b"
        >
          {valueLabel(lastVal)}
        </text>
        {xLabels.map((ym) => (
          <text
            key={`xlbl-${ym}`}
            x={xOf(ym)}
            y={134}
            fontSize={10}
            fill="#71717a"
            textAnchor="middle"
          >
            {formatXLabel(ym)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function TrendTable({
  rows,
  failedMonths,
  excludedMonths,
}: TrendTableProps) {
  if (!rows || rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.자료년월.localeCompare(b.자료년월));
  const lastYearMonth = sorted[sorted.length - 1].자료년월;

  const expiredMark = (ym: string) => {
    if (ym.endsWith("-01") || ym.endsWith("-07")) return " *";
    return "";
  };

  const fmtSigned = (n: number) => {
    if (n > 0) return `+${n.toLocaleString("ko-KR")}`;
    return n.toLocaleString("ko-KR");
  };

  const footnoteLines: Array<{ text: string; title?: string }> = [];
  footnoteLines.push({
    text: `위 진단 수치는 가장 최근 달(${lastYearMonth}) 기준입니다.`,
  });
  if (sorted.some((r) => r.자료년월.endsWith("-01") || r.자료년월.endsWith("-07"))) {
    footnoteLines.push({
      text: "1월·7월(표의 *)은 공공기관 정기 인사이동이 섞여 회전율이 높게 나올 수 있습니다.",
    });
  }
  if (failedMonths && failedMonths.length > 0) {
    const ymList = failedMonths.map((f) => f.자료년월).join(", ");
    footnoteLines.push({
      text: `조회하지 못한 달: ${ymList}`,
      title: failedMonths.map((f) => `${f.자료년월}: ${f.사유}`).join("; "),
    });
  }
  if (excludedMonths && excludedMonths.length > 0) {
    const ymList = excludedMonths.map((e) => e.년월).join(", ");
    footnoteLines.push({
      text: `가입자가 0명이라 뺀 달: ${ymList}`,
    });
  }

  const pointsForWorkers = sorted.map((r) => ({
    ym: r.자료년월,
    value: r.가입자수,
  }));
  const pointsForTurnover = sorted.map((r) => ({
    ym: r.자료년월,
    value: r.월회전율 * 100,
  }));

  return (
    <div className="mt-4">
      <h3 className="font-medium text-zinc-900">최근 {sorted.length}개월 추이</h3>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LineChart
          title="직원 수 (국민연금 가입자)"
          points={pointsForWorkers}
          valueLabel={(v) => v.toLocaleString("ko-KR") + "명"}
          axisLabel={(v) => Math.round(v).toLocaleString("ko-KR")}
          fromZero={false}
        />
        <LineChart
          title="월 회전율"
          points={pointsForTurnover}
          valueLabel={(v) => v.toFixed(1) + "%"}
          axisLabel={(v) => v.toFixed(1) + "%"}
          fromZero={true}
        />
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-zinc-600">월별 숫자 보기</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-500">
                <th className="text-left py-1 pr-2">월</th>
                <th className="text-right py-1 pr-2">가입자</th>
                <th className="text-right py-1 pr-2">신규</th>
                <th className="text-right py-1 pr-2">상실</th>
                <th className="text-right py-1 pr-2">순증감</th>
                <th className="text-right py-1 pr-2">총이동</th>
                <th className="text-right py-1">월 회전율</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const isLast = idx === sorted.length - 1;
                return (
                  <tr
                    key={r.자료년월}
                    className={
                      isLast ? "font-semibold bg-zinc-50" : "border-b border-zinc-100"
                    }
                  >
                    <td className="py-1 pr-2 text-zinc-900">
                      {r.자료년월}
                      {expiredMark(r.자료년월)}
                    </td>
                    <td className="text-right py-1 pr-2 text-zinc-900">
                      {r.가입자수.toLocaleString("ko-KR")}
                    </td>
                    <td className="text-right py-1 pr-2 text-zinc-900">
                      {r.신규.toLocaleString("ko-KR")}
                    </td>
                    <td className="text-right py-1 pr-2 text-zinc-900">
                      {r.상실.toLocaleString("ko-KR")}
                    </td>
                    <td className="text-right py-1 pr-2 text-zinc-900">
                      {fmtSigned(r.순증감)}
                    </td>
                    <td className="text-right py-1 pr-2 text-zinc-900">
                      {r.총이동.toLocaleString("ko-KR")}
                    </td>
                    <td className="text-right py-1 text-zinc-900">
                      {(r.월회전율 * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <div className="text-xs text-zinc-500 mt-1 space-y-0.5">
        {footnoteLines.map((line, i) => (
          <div key={i} title={line.title}>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
