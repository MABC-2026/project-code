"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

export type LoaderPhase =
  | "idle"
  | "search"
  | "npsLoad"
  | "csvCalc"
  | "resultReady"
  | "navigate"
  | "해설";

interface LoaderState {
  phase: LoaderPhase;
  text: string;
  percent: number;
}

interface LoaderContextValue {
  state: LoaderState;
  setPhase: (phase: LoaderPhase, text: string) => void;
  setPercent: (percent: number) => void;
  setText: (text: string) => void;
  reset: () => void;
}

const LoaderContext = createContext<LoaderContextValue | null>(null);

export function useLoader(): LoaderContextValue {
  const ctx = useContext(LoaderContext);
  if (!ctx) throw new Error("useLoader must be used within LoaderProvider");
  return ctx;
}

export function useLoaderText(): string {
  const ctx = useContext(LoaderContext);
  if (!ctx) return "";
  return ctx.state.text;
}

export function useLoaderPercent(): number {
  const ctx = useContext(LoaderContext);
  if (!ctx) return 0;
  return ctx.state.percent;
}

export function LoaderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoaderState>({
    phase: "idle",
    text: "",
    percent: 0,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhase = useCallback((phase: LoaderPhase, text: string) => {
    setState({ phase, text, percent: 0 });
  }, []);

  const setPercent = useCallback((percent: number) => {
    setState((prev) => ({ ...prev, percent: Math.max(0, Math.min(99, Math.round(percent))) }));
  }, []);

  const setText = useCallback((text: string) => {
    setState((prev) => ({ ...prev, text }));
  }, []);

  const reset = useCallback(() => {
    setState({ phase: "idle", text: "", percent: 0 });
  }, []);

  return (
    <LoaderContext.Provider value={{ state, setPhase, setPercent, setText, reset }}>
      {children}
    </LoaderContext.Provider>
  );
}
