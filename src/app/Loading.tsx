"use client";

import { useLoader } from "@/lib/loader";

export default function LoadingOverlay() {
  const { state } = useLoader();

  if (state.phase === "idle") return null;

  return (
    <div
      role="status"
      aria-busy={true}
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm px-4"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 h-2 w-3/5 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full bg-amber-500 transition-[width] duration-300 ease-out"
            style={{ width: `${state.percent}%` }}
          />
        </div>
        <p className="text-sm font-medium text-zinc-900">{state.text}</p>
        <p className="mt-1 text-xs text-zinc-500">{state.percent}%</p>
      </div>
    </div>
  );
}
