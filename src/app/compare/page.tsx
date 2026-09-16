"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import type { CompareEntry } from "@/components/CompareTable";
import CompareTable from "@/components/CompareTable";
import LoadingOverlayFallback from "@/components/LoadingOverlayFallback";
import { 문구목록 } from "@/components/AgentThinking";
import { sampleDiagnose } from "@/lib/api";

function CompareInner() {
  const router = useRouter();
  const [rows, setRows] = useState<CompareEntry[]>([]);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<{ 단계: string; 상태: any; 내용: string }[]>([]);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [loadingPercent, setLoadingPercent] = useState(0);

  // 세션스토리지의 compareList를 rows로 복원
  useEffect(() => {
    const saved = sessionStorage.getItem("compareList");
    if (saved) {
      try {
        const list: CompareEntry[] = JSON.parse(saved);
        setRows(list.filter((e) => e.진단결과));
      } catch {
        // 무시
      }
    }
  }, []);

  const logStep = useCallback(
    (단계: string, 상태: any, 내용: string) => {
      setSteps((prev) => {
        const i = prev.map((s) => s.단계).lastIndexOf(단계);
        if (i >= 0 && prev[i].상태 === "진행") {
          const next = [...prev];
          next[i] = { 단계, 상태, 내용 };
          return next;
        }
        return [...prev, { 단계, 상태, 내용 }];
      });
    },
    []
  );

  const compare = useCallback(
    async (names: string[]) => {
      if (names.length === 0) {
        setError("비교할 사업장을 선택해 주세요.");
        return;
      }
      setLoading(true);
      setError(null);
      setSteps([]);
      setLoadingText(null);
      setLoadingPercent(0);
      try {
        logStep("검색", "진행", "비교할 사업장을 찾는 중...");
        const results = await Promise.all(
          names.map(async (name) => {
            logStep("계산", "진행", `${name}의 동봉 데이터로 계산하는 중...`);
            setLoadingPercent(Math.min(loadingPercent + 100 / names.length, 99));
            const res = await sampleDiagnose(name);
            if (res && res !== "없음") {
              logStep("계산", "완료", `${name}의 계산이 완료되었어요`);
              return { name, result: res };
            }
            logStep("계산", "주의", `${name}은(는) 동봉 데이터에 없는 사업장입니다`);
            return { name, result: null };
          })
        );
        const entries: CompareEntry[] = results
          .filter((r) => r.result !== null)
          .map((r) => {
            const d = r.result as CompareEntry["진단결과"];
            return {
              사업장명: r.name,
              업종: d.업종 || "",
              출처: "동봉 데이터",
              자료년월: "2026-07",
              진단결과: d,
            };
          });
        setRows(entries);
        sessionStorage.setItem("compareList", JSON.stringify(entries));
        if (entries.length === 0) {
          setError("선택한 사업장 중 진단 가능한 곳이 없습니다.");
        }
      } catch (err: any) {
        setError(err.message || "비교 중 오류");
      } finally {
        setLoading(false);
        setLoadingPercent(100);
      }
    },
    [loadingPercent]
  );

  const toggleSelection = (name: string) => {
    setSelectedNames((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : [...prev, name]
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 내비게이션 */}
      <nav className="sticky top-0 z-40 border-b border-border-default bg-bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-bg-card/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 py-2 sm:px-6 lg:px-8">
          <a
            href="/"
            className="flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 rounded"
          >
            <span className="text-[var(--brand-black)] font-bold tracking-tight text-[22px] sm:text-[26px]">
              Work-
            </span>
            <span className="text-[var(--brand-orange)] font-bold tracking-tight text-[22px] sm:text-[26px]">
              Signal
            </span>
          </a>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
              onClick={() => router.push("/")}
            >
              홈
            </button>
            <button
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
              onClick={() => router.push("/result")}
            >
              진단 결과
            </button>
          </div>
        </div>
      </nav>

      {/* 페이지 콘텐츠 */}
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8 flex-1">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900">
            사업장 비교
          </h1>
          <p className="mt-1 text-zinc-500">
            최대 5개 사업장까지 선택하여 인원 변동을 비교할 수 있습니다.
          </p>
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mb-6 flex w-full max-w-lg items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm">
            <div className="mt-0.5 shrink-0 text-red-500">
              <svg
                className="h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="whitespace-pre-line">{error}</p>
            </div>
          </div>
        )}

        {/* 비교 결과 */}
        {rows.length > 0 && (
          <section className="mb-8">
            <CompareTable
              entries={rows}
              onRemove={(사업장명) => {
                setRows((prev) => prev.filter((e) => e.사업장명 !== 사업장명));
                sessionStorage.setItem("compareList", JSON.stringify(rows.filter((e) => e.사업장명 !== 사업장명)));
              }}
              onClear={() => {
                setRows([]);
                sessionStorage.removeItem("compareList");
              }}
            />
          </section>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<LoadingOverlayFallback />}>
      <CompareInner />
    </Suspense>
  );
}
