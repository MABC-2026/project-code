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
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryPage = searchParams.get("page");
    if (queryPage !== null) {
      const p = Number(queryPage);
      if (Number.isFinite(p) && p >= 1) {
        setPage(p);
        return;
      }
    }
    const saved = sessionStorage.getItem("candidatesPage");
    if (saved !== null) {
      const p = Number(saved);
      if (Number.isFinite(p) && p >= 1) {
        setPage(p);
        return;
      }
    }
  }, []);

  // 현재 페이지를 세션스토리지에 남겨, 결과 페이지 뒤로그 및 브라우저 뒤로가기 시 복구한다.
  useEffect(() => {
    sessionStorage.setItem("candidatesPage", String(page));
  }, [page]);
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
    // URL 쿼리 파라미터에서 페이지 번호를 읽는다 (뒤로가기 시 쿼리 포함).
    const searchParams = new URLSearchParams(window.location.search);
    const queryPage = searchParams.get("page");
    let targetPage: number | null = null;
    if (queryPage !== null) {
      const p = parseInt(queryPage, 10);
      if (!isNaN(p) && p >= 1) targetPage = p;
    }
    if (targetPage === null && savedPage) {
      const p = parseInt(savedPage, 10);
      if (!isNaN(p) && p >= 1) targetPage = p;
    }
    if (targetPage !== null) {
      setPage(targetPage);
    }
    // 세션스토리지의 페이지 번호는 한 번만 소비한다.
    if (savedPage) {
      sessionStorage.removeItem("candidatesPage");
    }
  }, []);

  const handlePick = useCallback(
    async (번호: number) => {
      const c = candidates.find((c) => c.번호 === 번호);
      if (!c) {
        setError("후보가 없습니다.");
        setLoading(false);
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
              sessionStorage.setItem("prevCandidatesPage", JSON.stringify(page));
              setLoading(false);
              router.push(`/result?page=${page}`);
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
              sessionStorage.setItem("prevCandidatesPage", JSON.stringify(page));
              setLoading(false);
              router.push(`/result?page=${page}`);
              return;
            }
            setError(
              `공공데이터로 진단하지 못했어요 (${workplaceFailReason}). 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에도 없는 사업장이에요.`
            );
            setLoading(false);
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
            setLoading(false);
            router.push(`/result?page=${page}`);
            return;
          }
          setError(
            `${c.사업장명}은(는) 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에 없는 사업장입니다.`
          );
          setLoading(false);
          router.push("/");
          return;
        }

        setError("진단 결과를 받지 못했습니다.");
        setLoading(false);
        router.push("/");
      } catch (err: any) {
        setError(err.message || "선택 중 오류");
        setLoading(false);
        router.push("/");
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
      <nav className="sticky top-5 z-40 mx-auto w-[calc(100%-2rem)] max-w-[1200px]">
        <div className="card-white flex h-[72px] items-center justify-between px-5 lg:px-8">
          <a
            href="/"
            className="brand-mark outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg px-1 -ml-1"
          >
            <span className="text-[var(--brand-black)] font-bold tracking-tight text-[22px] sm:text-[26px]">
              Work-
            </span>
            <span className="text-[var(--brand-orange)] font-bold tracking-tight text-[22px] sm:text-[26px]">
              Signal
            </span>
          </a>

          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--text-zinc-500)]">
              &quot;{company}&quot; 관련 검색 결과
            </span>
          </div>
        </div>
      </nav>

      {/* 페이지 콘텐츠 */}
      <div className="mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-6 lg:px-8 flex-1">
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
          <section className="mt-6">
            {/* 목록 헤더 */}
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-balance text-[28px] font-bold text-[var(--text-zinc-900)]">
                  &quot;{company}&quot; 검색 결과
                </h2>
                <span className="mt-1 inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--bg-zinc-50)] px-3 py-0.5 text-xs font-medium text-[var(--text-zinc-600)]">
                  총 {candidates.length}건
                </span>
              </div>
            </div>

            {/* 목록 카드 */}
            <div className="card-white overflow-hidden">
              <div className="divide-y divide-[var(--border-default)]">
                {candidates
                  .slice((page - 1) * pageSize, page * pageSize)
                  .map((c) => (
                    <div
                      key={c.번호}
                      className="flex items-center gap-4 px-5 py-4"
                    >
                      {/* 번호 */}
                      <span className="shrink-0 rounded-lg bg-[var(--bg-zinc-100)] px-3 py-1 text-sm font-medium text-[var(--text-zinc-700)]">
                        {c.번호}
                      </span>

                      {/* 기업 정보 */}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[18px] font-semibold text-[var(--text-zinc-900)]">
                          {c.사업장명}
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-zinc-500)]">
                          {c.source === "nps" ? (
                            <>
                              <span className="text-[var(--text-zinc-600)]">{c.업종}</span>
                              {c.업종 && c.주소 && <span className="mx-1">·</span>}
                              <span className="text-[var(--text-zinc-500)]">{c.주소}</span>
                              {c.업종 && c.기준월 && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span className="text-[var(--text-zinc-500)]">기준월 {c.기준월}</span>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              <span className="text-[var(--text-zinc-500)]">
                                동봉 데이터
                                {c.시도 ? ` · ${c.시도}` : ""}
                              </span>
                              {c.가입자수 != null && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span className="text-[var(--text-zinc-500)]">
                                    가입자 {fmtNum(c.가입자수)}명
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* 가입자 수 영역 */}
                      {c.가입자수 != null && (
                        <div className="shrink-0 text-right">
                          <p className="text-[20px] font-bold text-[var(--text-zinc-900)]">
                            {fmtNum(c.가입자수)}
                          </p>
                          <p className="text-[12px] text-[var(--text-zinc-500)]">
                            가입자
                          </p>
                        </div>
                      )}

                      {/* 진단 버튼 */}
                      <div className="shrink-0">
                        <button
                          className="btn-filled-orange text-sm"
                          onClick={() => handlePick(c.번호)}
                          disabled={loading}
                        >
                          진단
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* 페이지네이션 */}
              {candidates.length > pageSize && (
                <div className="mt-4 flex items-center justify-center gap-2 border-t border-[var(--border-default)] pt-4">
                  <button
                    className="btn-ghost-secondary py-2 px-4 text-sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    ← 이전
                  </button>
                  <span className="text-sm text-[var(--text-zinc-500)]">
                    {page} / {Math.ceil(candidates.length / pageSize)}
                  </span>
                  <button
                    className="btn-ghost-secondary py-2 px-4 text-sm"
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

              {/* 하단 컨트롤 */}
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-default)] pt-4">
                <p className="text-xs text-[var(--text-zinc-500)]">
                  찾는 회사가 없나요?{" "}
                  <a
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--brand-orange)] underline hover:underline"
                  >
                    &quot;{company.trim()}&quot; 법인명 검색해 보기 ↗
                  </a>
                </p>
                <button
                  className="btn-ghost-secondary py-2 px-4 text-sm"
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
