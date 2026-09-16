"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import AgentSteps, { type AgentStep } from "@/components/AgentSteps";
import { callApi, sampleDiagnose } from "@/lib/api";
import FullPageLoader from "@/components/FullPageLoader";

function CandidatesInner() {
  const router = useRouter();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const logStep = useCallback(
    (단계: string, 상태: AgentStep["상태"], 내용: string) => {
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

  useEffect(() => {
    const savedCandidates = sessionStorage.getItem("candidates");
    const savedCompany = sessionStorage.getItem("searchCompany");
    const savedPage = sessionStorage.getItem("candidatesPage");
    if (savedCandidates) {
      try {
        setCandidates(JSON.parse(savedCandidates));
      } catch {
        sessionStorage.removeItem("candidates");
      }
    }
    if (savedCompany) {
      setCompany(savedCompany);
    }
    if (savedPage) {
      const p = parseInt(savedPage, 10);
      if (!isNaN(p) && p >= 1) setPage(p);
      sessionStorage.removeItem("candidatesPage");
    }
  }, []);

  const handlePick = useCallback(
    async (번호: number) => {
      const c = candidates.find((c) => c.번호 === 번호);
      if (!c) {
        setError("후보가 없습니다.");
        router.push("/");
        return;
      }
      setLoading(true);
      setError(null);
      setSteps([]);
      setLoadingText(null);
      try {
        if (c.source === "nps") {
          setLoadingText("최근 12개월 국민연금 자료를 불러오는 중입니다 (5초 정도 걸립니다)");
          setSteps((prev) => prev.filter((s) => s.단계 === "검색"));
          logStep(
            "수집",
            "진행",
            `'${c.사업장명}'의 최근 12개월 국민연금 기록을 모으고 있어요`
          );
          const wpParams = new URLSearchParams({
            name: c.사업장명,
            bizno: c.bzowrRgstNo || "",
            addr: c.주소 || "",
            ...(c.seq ? { seq: c.seq } : {}),
          });
          let workplaceFailReason: string | null = null;

          try {
            const wpRes = await fetch(`/api/nps/workplace?${wpParams.toString()}`);
            const wpJson = ((await wpRes.json().catch(() => null)) || {}) as any;
            if (!wpRes.ok || !wpJson.ok) {
              throw new Error(
                (wpJson && wpJson.사유) ||
                  wpJson.error ||
                  `HTTP ${wpRes.status}`
              );
            }
            logStep(
              "수집",
              "완료",
              `${(wpJson.rows || []).length}개월 기록을 받았어요 · 공공 API ${wpJson.api호출수 ?? "?"}번 호출` +
                ((wpJson.실패한달 || []).length > 0
                  ? ` · 못 받은 달 ${(wpJson.실패한달 || []).length}개`
                  : "")
            );

            logStep(
              "계산",
              "진행",
              "예선 스킬(stability.py)로 회전율을 계산하고 같은 업종 기준선과 비교하고 있어요"
            );
            const diagData = await callApi({ rows: wpJson.rows });
            if (diagData.진단결과) {
              const 월회전율글자 = (diagData.진단결과.월회전율 * 100).toFixed(1);
              logStep(
                "계산",
                "완료",
                diagData.진단결과.업종위치
                  ? `같은 업종 ${diagData.진단결과.업종위치.비교사업장수}곳과 비교했어요 · 월 회전율 ${월회전율글자}%`
                  : `업종 기준선에 없는 업종이라 업종 비교는 뺐어요 · 월 회전율 ${월회전율글자}%`
              );
              sessionStorage.setItem("diagnosisResult", JSON.stringify(diagData.진단결과));
              sessionStorage.setItem("resultMeta", JSON.stringify({
                입력_출처: diagData.입력_출처,
                자료년월: diagData.자료년월,
                계절성주의: diagData.계절성주의,
                업종기준선_일치: diagData.업종기준선_일치,
                안내문: diagData.안내문,
                원본_업종명: diagData.원본_업종명,
                추이: diagData.추이,
                제외한달: diagData.제외한달,
                실패한달: wpJson.실패한달,
              }));
              sessionStorage.setItem("diagSteps", JSON.stringify(steps));
              sessionStorage.setItem("prevCandidates", JSON.stringify(candidates));
              console.log("[DEBUG] Saving prevCandidatesPage:", page);
              sessionStorage.setItem("prevCandidatesPage", JSON.stringify(page));
              router.push("/result");
              return;
            }
          } catch (wpErr: any) {
            workplaceFailReason =
              "12개월 기록 수집 실패 — " +
              (wpErr.message || "공공데이터 조회 실패");
            logStep("수집", "주의", workplaceFailReason);
          }

          if (workplaceFailReason) {
            logStep(
              "계산",
              "진행",
              "동봉 데이터(2026-07)로 대신 계산하고 있어요"
            );
            const sampleResult = await sampleDiagnose(c.사업장명);
            if (sampleResult && sampleResult !== "없음") {
              logStep(
                "계산",
                "완료",
                "동봉 데이터(2026-07)로 계산을 마쳤어요"
              );
              sessionStorage.setItem("diagnosisResult", JSON.stringify(sampleResult));
              sessionStorage.setItem("resultMeta", JSON.stringify({
                입력_출처: "동봉 샘플",
                계절성주의: true,
                대체사유: workplaceFailReason,
              }));
              sessionStorage.setItem("diagSteps", JSON.stringify(steps));
              sessionStorage.setItem("prevCandidates", JSON.stringify(candidates));
              console.log("[DEBUG] Saving prevCandidatesPage:", page);
              sessionStorage.setItem("prevCandidatesPage", JSON.stringify(page));
              router.push("/result");
              return;
            }
            setError(
              `공공데이터로 진단하지 못했어요 (${workplaceFailReason}). 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에도 없는 사업장이에요.`
            );
            router.push("/");
            return;
          }
        }

        if (c.source === "csv") {
          setSteps((prev) => prev.filter((s) => s.단계 === "검색"));
          logStep(
            "계산",
            "진행",
            "동봉 데이터(2026-07)에서 계산하고 있어요"
          );
          const sampleResult = await sampleDiagnose(c.사업장명);
          if (sampleResult && sampleResult !== "없음") {
            logStep(
              "계산",
              "완료",
              "동봉 데이터(2026-07)로 계산을 마쳤어요"
            );
            sessionStorage.setItem("diagnosisResult", JSON.stringify(sampleResult));
            sessionStorage.setItem("resultMeta", JSON.stringify({
              입력_출처: "동봉 샘플",
              계절성주의: true,
            }));
            sessionStorage.setItem("diagSteps", JSON.stringify(steps));
            sessionStorage.setItem("prevCandidates", JSON.stringify(candidates));
            sessionStorage.setItem("prevCandidatesPage", JSON.stringify(page));
            router.push("/result");
            return;
          }
          setError(
            `${c.사업장명}은(는) 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에 없는 사업장입니다.`
          );
          router.push("/");
          return;
        }

        setError("진단 결과를 받지 못했습니다.");
        router.push("/");
      } catch (err: any) {
        setError(err.message || "선택 중 오류");
        router.push("/");
      } finally {
        setLoading(false);
      }
    },
    [candidates, router, logStep, steps, page]
  );

  const fmtNum = (n: number) => n.toLocaleString("ko-KR");
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    company.trim() + " 법인명"
  )}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 내비게이션 */}
      <nav className="sticky top-0 z-40 border-b border-border-default bg-bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-bg-card/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 py-2 sm:px-6 lg:px-8">
          <a
            href="/"
            className="flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 rounded"
          >
            <span className="text-brand-black font-bold tracking-tight">
              Work-
            </span>
            <span className="text-brand-orange font-bold tracking-tight">
              Signal
            </span>
          </a>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500">
              "{company}" 관련 검색 결과
            </span>
          </div>
        </div>
      </nav>

      {/* 페이지 콘텐츠 */}
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8 flex-1">
        {/* 에러 표시 */}
        {error && (
          <div className="mt-6 flex w-full max-w-lg items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm">
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

        {/* 로딩 오버레이 */}
        <FullPageLoader loading={loading} steps={steps} text={loadingText} company={company} />

        {/* 후보 목록 */}
        {!loading && candidates.length > 0 && (
          <section className="mt-8">
            <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-card p-6 shadow-sm">
              <p className="mb-4 text-sm text-zinc-500">
                {candidates.length > 0 &&
                  candidates[0]?.source === "nps"
                    ? `NPS 공공데이터에서 "${company}" 관련 ${candidates.length}건을 찾았습니다. 번호를 선택하면 해당 사업장을 진단합니다.`
                    : `검색어 "${company}" 에 대해 ${candidates.length}건의 후보가 있습니다. 번호를 선택하면 해당 사업장을 진단합니다.`}
              </p>
              <div className="space-y-2">
                {candidates
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((c) => (
                    <div
                      key={c.번호}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border-default bg-zinc-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 rounded-lg bg-zinc-200 px-2.5 py-0.5 text-sm font-medium text-zinc-700">
                          {c.번호}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-zinc-900">
                            {c.사업장명}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {c.source === "nps"
                              ? [
                                  c.업종,
                                  c.가입자수 != null
                                    ? `가입자 ${fmtNum(c.가입자수)}명`
                                    : undefined,
                                  c.주소,
                                  c.기준월 ? `기준월 ${c.기준월}` : undefined,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : `동봉 데이터${c.시도 ? ` · ${c.시도}` : ""}${
                                  c.가입자수 != null
                                    ? ` · 가입자 ${fmtNum(c.가입자수)}명`
                                    : ""
                                }`}
                          </div>
                        </div>
                      </div>
                      <button
                        className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                        onClick={() => handlePick(c.번호)}
                        disabled={loading}
                      >
                        진단
                      </button>
                    </div>
                  ))}
              </div>
              {/* 페이지네이션 */}
              {candidates.length > pageSize && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    className="rounded-xl border border-border-default bg-bg-card px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ← 이전
                  </button>
                  <span className="text-sm text-zinc-500">
                    {page} / {Math.ceil(candidates.length / pageSize)}
                  </span>
                  <button
                    className="rounded-xl border border-border-default bg-bg-card px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                    onClick={() =>
                      setPage((p) =>
                        Math.min(Math.ceil(candidates.length / pageSize), p + 1)
                      )
                    }
                    disabled={
                      page >= Math.ceil(candidates.length / pageSize)
                    }
                  >
                    다음 →
                  </button>
                </div>
              )}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-500">
                  찾는 회사가 없나요?{" "}
                  <a
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-orange underline hover:underline"
                  >
                    &quot;{company.trim()}&quot; 법인명 검색해 보기 ↗
                  </a>
                </p>
                <button
                  className="rounded-xl border border-border-default bg-bg-card px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                  onClick={() => {
                    sessionStorage.removeItem("candidates");
                    router.push("/");
                  }}
                >
                  뒤로
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  return <CandidatesInner />;
}
