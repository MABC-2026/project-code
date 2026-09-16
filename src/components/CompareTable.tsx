import type { ReactNode } from "react";

export type CompareEntry = {
  사업장명: string;
  업종: string;
  출처: string;
  자료년월: string;
  진단결과: any;
};

export default function CompareTable({
  entries,
  onRemove,
  onClear,
}: {
  entries: CompareEntry[];
  onRemove: (사업장명: string) => void;
  onClear: () => void;
}) {
  const industryCount = new Set(
    entries.map((e) => e.업종).filter((ind) => ind && ind !== "BIZ_NO미존재사업장"),
  ).size;

  const hasMixedIndustry = entries.length >= 2 && industryCount >= 2;

  if (entries.length < 2) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          회사 비교 ({entries.length}곳)
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          두 곳 이상 담으면 나란히 비교합니다.
        </p>
        {entries.length === 1 && (
          <p className="mt-1 text-sm text-zinc-600">{entries[0].사업장명}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">
        회사 비교 ({entries.length}곳)
      </h2>

      {hasMixedIndustry && (
        <div className="mt-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-700">
          업종이 달라서 월 회전율 숫자끼리는 비교할 수 없습니다. 업종배수와
          &lsquo;같은 업종 안 위치&rsquo;를 보세요.
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse text-zinc-900">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="whitespace-nowrap text-zinc-600 py-1.5 pr-3" />
              {entries.map((e) => (
                <th
                    key={e.사업장명}
                    className="min-w-[9rem] px-2 text-left"
                  >
                    <div className="font-medium text-zinc-900">{e.사업장명}</div>
                    <button
                      type="button"
                      className="text-xs text-zinc-600 underline"
                      onClick={() => onRemove(e.사업장명)}
                    >
                      빼기
                    </button>
                  </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CompareRows.map(({ label, render }) => (
              <tr key={label} className="border-b border-zinc-100">
                <td className="whitespace-nowrap text-zinc-600 py-1.5 pr-3">
                  {label}
                </td>
                {entries.map((e) => (
                  <td
                    key={e.사업장명}
                    className="min-w-[9rem] px-2 align-top text-zinc-900"
                  >
                    {render(e)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-zinc-600">
        업종배수와 같은 업종 안 위치는 동봉 기준선(2026-07 전국 52,957곳,
        550개 업종) 기준입니다. 회전율이 높다고 나쁜 회사라는 뜻은 아닙니다.
      </p>

      <button
        type="button"
        className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
        onClick={onClear}
      >
        비교 목록 비우기
      </button>
    </div>
  );
}

const CompareRows = [
  {
    label: "업종",
    render: (e: CompareEntry) => e.업종 || "-",
  },
  {
    label: "가입자수",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      return d.가입자수.toLocaleString("ko-KR") + "명";
    },
  },
  {
    label: "당월 순증감",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      const sign = d.순증감 > 0 ? "+" : "";
      return sign + d.순증감.toLocaleString("ko-KR") + "명";
    },
  },
  {
    label: "당월 총이동",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      return (
        d.총이동.toLocaleString("ko-KR") +
        "명 (신규 " +
        d.신규.toLocaleString("ko-KR") +
        " / 상실 " +
        d.상실.toLocaleString("ko-KR") +
        ")"
      );
    },
  },
  {
    label: "월 회전율",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      return (
        (d.월회전율 * 100).toFixed(1) +
        "% (연환산 " +
        d.연환산회전율.toFixed(1) +
        "%)"
      );
    },
  },
  {
    label: "업종배수",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      return d.업종위치 ? d.업종배수.toFixed(1) + "배" : "-";
    },
  },
  {
    label: "같은 업종 안 위치",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      if (!d.업종위치) return "기준선에 없는 업종";
      return (
        d.업종위치.구간 + " (" + d.업종위치.비교사업장수 + "곳 중)"
      );
    },
  },
  {
    label: "은폐지수",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      return (
        d.은폐지수.toLocaleString("ko-KR", {
          maximumFractionDigits: 1,
        }) + "배"
      );
    },
  },
  {
    label: "추정 평균 기준소득월액",
    render: (e: CompareEntry) => {
      const d = e.진단결과;
      if (d.추정소득 == null) return "-";
      const cap =
        d.추정소득상한주의
          ? " (상한 도달 — 실제 평균 급여는 이보다 높음)"
          : "";
      return (
        d.추정소득.toLocaleString("ko-KR") + "원" + cap
      );
    },
  },
  {
    label: "자료",
    render: (e: CompareEntry) => e.출처 + " " + e.자료년월,
  },
] as const;
