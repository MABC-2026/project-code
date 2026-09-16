"use client";

import { useEffect, type ComponentProps } from "react";
import AgentSteps from "./AgentSteps";

type FullPageLoaderProps = {
  loading: boolean;
  steps: ComponentProps<typeof AgentSteps>["steps"];
  company?: string;
  text?: string | null;
  percent?: number;
};

export default function FullPageLoader({
  loading,
  steps,
  company,
}: FullPageLoaderProps) {
  useEffect(() => {
    if (!loading) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [loading]);

  if (!loading) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="기업 진단 진행 중"
      aria-busy="true"
    >
      <div
        className="
          w-full max-w-xl overflow-hidden
          rounded-3xl border border-white/70 bg-white
          shadow-[0_24px_80px_-16px_rgba(0,0,0,0.35)]
        "
      >
        <div
          className="
            max-h-[85dvh] overflow-y-auto
            [&>*]:box-border
            [&>*]:m-0
            [&>*]:w-full
            [&>*]:max-w-none
            [&>*]:rounded-none
            [&>*]:border-0
            [&>*]:shadow-none
          "
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {steps.length > 0 ? (
            <AgentSteps steps={steps} company={company} />
          ) : (
            <p className="p-6 text-lg font-semibold text-zinc-900">
              에이전트가 진단을 준비하고 있어요
            </p>
          )}
        </div>
      </div>
    </div>
  );
}