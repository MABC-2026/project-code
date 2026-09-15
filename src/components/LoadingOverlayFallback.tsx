"use client";

import { useLoader } from "@/lib/loader";

export default function LoadingOverlayFallback() {
  const { state } = useLoader();

  if (state.phase === "idle") return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-zinc-200 border-t-brand-orange" />
    </div>
  );
}
