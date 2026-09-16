export type AgentStep = { 단계: string; 상태: "진행" | "완료" | "주의"; 내용: string };

import AgentThinking from "./AgentThinking";

const 단계이름: Record<string, string> = {
  검색: "사업장 찾기",
  수집: "12개월 기록 모으기",
  계산: "예선 스킬로 계산",
  해설: "Solar 해설 쓰기",
};

function 표시(step: AgentStep): string {
  if (step.상태 === "완료") return "✓";
  if (step.상태 === "주의") return "!";
  return "…";
}

function 상태색(step: AgentStep): string {
  if (step.상태 === "완료") return "text-emerald-600";
  if (step.상태 === "주의") return "text-orange-600";
  return "text-zinc-400 animate-pulse";
}

export default function AgentSteps({ steps, compact = false }: { steps: AgentStep[]; compact?: boolean }) {
  if (steps.length === 0) return null;

  const 이름찾기 = (단계: string) => {
    const m = steps.find((x) => x.단계 === 단계)?.내용.match(/['‘]([^'’]+)['’]/);
    return m ? m[1] : undefined;
  };

  const 이름들 = steps.map((s) => {
    const raw = 단계이름[s.단계] ?? s.단계;
    return `${표시(s)} ${raw}`;
  });

  if (compact) {
    return (
      <details className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-xs text-zinc-600">진단 과정 — {이름들.join(" → ")}</summary>
        <ol className="mt-2 space-y-1">
          {steps.map((s, i) => {
            const raw = 단계이름[s.단계] ?? s.단계;
            return (
              <li key={i} className="text-xs text-zinc-700">
                <span className={상태색(s)}>{표시(s)}</span>{" "}
                <span className="font-medium">{raw}</span> — {s.내용}
              </li>
            );
          })}
        </ol>
      </details>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-sm font-medium text-zinc-900">{steps.some((s) => s.상태 === "진행") ? "에이전트가 진단하는 중이에요" : "에이전트가 진단한 과정"}</p>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const raw = 단계이름[s.단계] ?? s.단계;
          return (
            <li key={i} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center text-sm ${상태색(s)}`}>{표시(s)}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{raw}</p>
                <p className="text-xs text-zinc-600">{s.내용}</p>
                {s.상태 === "진행" && <AgentThinking 단계={s.단계} 이름={이름찾기(s.단계) ?? 이름찾기("검색")} />}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
