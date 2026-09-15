export const fmtNum = (n: number) => n.toLocaleString("ko-KR");
export const fmtPercentRatio = (ratio: number) => (ratio * 100).toFixed(1) + "%";
export const fmtPercentValue = (pct: number) => pct.toFixed(1) + "%";
export const fmtMultiple = (n: number) => n.toFixed(1) + "배";
export const fmtSuppressed = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "배";
