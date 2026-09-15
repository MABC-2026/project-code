"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLoader } from "@/lib/loader";
import { 문구목록 } from "@/components/AgentThinking";

type LoaderPhase = "search" | "npsLoad" | "csvCalc" | "resultReady" | "navigate" | "해설";

const 경로맵: Record<string, { 단계: LoaderPhase; 문구키: keyof typeof 문구목록 }> = {
  "/": { 단계: "search", 문구키: "검색" },
  "/candidates": { 단계: "npsLoad", 문구키: "수집" },
  "/result": { 단계: "csvCalc", 문구키: "계산" },
  "/report": { 단계: "csvCalc", 문구키: "수집" },
  "/compare": { 단계: "navigate", 문구키: "계산" },
};

export default function NavigationLoader() {
  const pathname = usePathname();
  const { setPhase, setPercent, setText, reset } = useLoader();
  const lastPath = useRef(pathname);
  const 진행Ref = useRef(0);
  const 활동중 = useRef(false);

  useEffect(() => {
    const prev = lastPath.current;
    lastPath.current = pathname;

    if (prev === pathname) return;

    const 진입 = 경로맵[pathname];
    if (!진입) {
      reset();
      return;
    }

    const { 단계, 문구키 } = 진입;
    const 문구들 = 문구목록[문구키];
    if (!문구들 || 문구들.length === 0) {
      setPhase(단계, "");
      setPercent(0);
      return;
    }

    활동중.current = true;
    진행Ref.current = 0;
    setPhase(단계, 문구들[0]);
    setPercent(0);

    let idx = 0;
    const 회전 = () => {
      if (!활동중.current) return;
      setText(문구들[idx % 문구들.length]);
      idx++;
      setTimeout(회전, 1800);
    };
    회전();

    let interval: ReturnType<typeof setInterval> | null = null;
    interval = setInterval(() => {
      if (!활동중.current) {
        if (interval) clearInterval(interval);
        return;
      }
      진행Ref.current = Math.min(95, 진행Ref.current + 3);
      setPercent(진행Ref.current);
    }, 300);

    const t = setTimeout(() => {
      활동중.current = false;
      if (interval) clearInterval(interval);
      setPercent(100);
      setText("완료");
      setTimeout(() => {
        setTimeout(reset, 200);
      }, 400);
    }, 700);

    return () => {
      활동중.current = false;
      if (interval) clearInterval(interval);
      clearTimeout(t);
    };
  }, [pathname]);

  return null;
}
