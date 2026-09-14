import type { FC } from "react";

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

export default function TrendTable({ rows, failedMonths, excludedMonths }: TrendTableProps) {
  if (!rows || rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => a.자료년월.localeCompare(b.자료년월));
  const lastYearMonth = sorted[sorted.length - 1].자료년월;
  const maxRatio = Math.max(...sorted.map((r) => r.월회전율), 0);

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
      text: "* 1월·7월은 공공기관 정기 인사이동이 섞여 회전율이 높게 나올 수 있습니다.",
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

  return (
    <div className="mt-4">
      <h3 className="font-medium text-zinc-900">
        최근 {sorted.length}개월 추이
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
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
              const barWidth =
                maxRatio > 0 ? (r.월회전율 / maxRatio) * 100 : 0;
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
                    <div className="inline-flex items-center gap-1">
                      <div className="w-16 h-2 overflow-hidden rounded bg-zinc-200">
                        <div
                          className="h-full bg-zinc-900 rounded"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span>{(r.월회전율 * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
