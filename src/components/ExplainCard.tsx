import AgentThinking from "./AgentThinking";
export default function ExplainCard({ loading, error, data, 진단결과, 추이 }:
  { loading: boolean; error: string | null; data: any | null; 진단결과: any; 추이?: { 자료년월: string; 가입자수: number; 신규: number; 상실: number }[] }) {
  if (loading) {
    return (
      <section className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">지원자 관점 해설</h3>
          <span className="text-xs text-zinc-500">Solar Pro 4</span>
        </div>
        <div className="mt-2"><AgentThinking 단계="해설" /></div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">지원자 관점 해설</h3>
          <span className="text-xs text-zinc-500">Solar Pro 4</span>
        </div>
        <p className="mt-2 text-sm text-zinc-800">
          가입자 {진단결과?.가입자수?.toLocaleString("ko-KR") || "0"}명, 이번 달 신규취득 {진단결과?.신규?.toLocaleString("ko-KR") || "0"}명·상실 {진단결과?.상실?.toLocaleString("ko-KR") || "0"}명이에요.
        </p>
        <p className="mt-1 text-xs text-zinc-500">해설을 불러오지 못했어요 ({error}). 아래 숫자와 그래프는 그대로 볼 수 있어요.</p>
      </section>
    );
  }

  if (!data) return null;

  const h = data.해설;
  const 사실목록 = data.사실목록 || [];
  const 소요ms = data.소요ms || 0;

  return (
    <section className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">지원자 관점 해설</h3>
        <span className="text-xs text-zinc-500">Solar Pro 4</span>
      </div>

      <p className="mt-2 text-xl font-bold leading-snug text-zinc-900">{h.지원자_관점_요약}</p>

      {h.이렇게_볼_수_있어요 && h.이렇게_볼_수_있어요.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium text-zinc-500">이렇게 볼 수 있어요</p>
          {h.이렇게_볼_수_있어요.map((문장: string, i: number) => (
            <p key={i} className="mt-1 text-sm text-zinc-800">{문장}</p>
          ))}
        </>
      )}

      {h.같은_업종과_비교하면 && h.같은_업종과_비교하면.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium text-zinc-500">같은 업종과 비교하면</p>
          {h.같은_업종과_비교하면.map((문장: string, i: number) => (
            <p key={i} className="mt-1 text-sm text-zinc-800">{문장}</p>
          ))}
        </>
      )}

      {h.지원_전에_확인해보세요 && h.지원_전에_확인해보세요.length > 0 && (
        <>
          <p className="mt-3 text-xs font-medium text-zinc-500">지원 전에 확인해보세요</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {h.지원_전에_확인해보세요.map((문장: string, i: number) => (
              <li
                key={i}
                className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800"
              >
                {문장}
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-zinc-600">Solar가 이렇게 판단했어요</summary>
        <ol className="mt-1 list-decimal pl-5 text-xs text-zinc-700">
          {(h.판단_과정 || []).map((문장: string, i: number) => {
            let 정제 = 문장;
            if (정제.startsWith("먼저 ")) 정제 = 정제.slice(3);
            else if (정제.startsWith("그다음 ")) 정제 = 정제.slice(4);
            else if (정제.startsWith("마지막으로 ")) 정제 = 정제.slice(6);
            return <li key={i}>{정제}</li>;
          })}
        </ol>
        <p className="mt-2 text-xs text-zinc-500">근거로 쓴 사실 {사실목록.length}개 · {(소요ms / 1000).toFixed(1)}초</p>
        <ul className="list-disc pl-5 text-xs text-zinc-500">
          {사실목록.map((항목: string, i: number) => (
            <li key={i}>{항목}</li>
          ))}
        </ul>
      </details>

      <p className="mt-3 text-xs text-zinc-500">{h.데이터_참고}</p>
    </section>
  );
}
