"use client";

import { useEffect, useState } from "react";
import AgentSteps from "./AgentSteps";

export default function FullPageLoader({
  loading,
  steps,
  text,
  percent,
}: {
  loading: boolean;
  steps: any[];
  text?: string | null;
  percent?: number;
}) {
  const [localPercent, setLocalPercent] = useState(0);

  useEffect(() => {
    if (!loading) {
      setLocalPercent(0);
      return;
    }
    // steps 기반으로 대략적 진행률 계산
    const base = percent ?? 0;
    if (base > 0) {
      setLocalPercent(base);
      return;
    }
    if (steps.length === 0) setLocalPercent(0);
    else if (steps.length === 1) setLocalPercent(25);
    else if (steps.length === 2) setLocalPercent(55);
    else setLocalPercent(85);
  }, [loading, percent, steps.length]);

  if (!loading) return null;

  const message =
    steps.length > 0
      ? steps[steps.length - 1].내용
      : text ?? "처리 중입니다";

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-bg-card/95 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border-default bg-bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-700">{message}</p>
          <span className="text-xs text-zinc-400">
            {localPercent}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-brand-orange transition-[width] duration-300 ease-out"
            style={{ width: `${localPercent}%` }}
          />
        </div>
        {steps.length > 0 && (
          <div className="mt-4">
            <AgentSteps steps={steps} />
          </div>
        )}
      </div>
    </div>
  );
}
