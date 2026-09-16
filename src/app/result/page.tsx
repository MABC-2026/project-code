"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompareEntry } from "@/components/CompareTable";
import ExplainCard from "@/components/ExplainCard";
import AgentSteps, { type AgentStep } from "@/components/AgentSteps";
import HiringInsight from "@/components/HiringInsight";
import TrendTable from "@/components/TrendTable";
import FullPageLoader from "@/components/FullPageLoader";
import KeyNumbers from "@/components/KeyNumbers";
import IndustryPosition from "@/components/IndustryPosition";
import ThoughtTrail from "@/components/ThoughtTrail";

function ResultInner() {
  const router = useRouter();
  const [result, setResult] = useState<any>(null);
  const [resultMeta, setResultMeta] = useState<any>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [explain, setExplain] = useState<{
    loading: boolean;
    error: string | null;
    data: any;
  }>({ loading: false, error: null, data: null });
  const [loading, setLoading] = useState(true);
  const [compareList, setCompareList] = useState<CompareEntry[]>([]);
  const explainSeq = useRef(0);

  // page.tsx와 동일하게 진행 중인 단계는 갱신하고 새 단계는 추가합니다.
  const logStep = useCallback((단계: string, 상태: AgentStep["상태"], 내용: string) => {
    setSteps((prev) => {
      const i = prev.map((s) => s.단계).lastIndexOf(단계);
      if (i >= 0 && prev[i].상태 === "진행") {
        const next = [...prev];
        next[i] = { 단계, 상태, 내용 };
        return next;
      }
      return [...prev, { 단계, 상태, 내용 }];
    });
  }, []);

  useEffect(() => {
    const r = sessionStorage.getItem("diagnosisResult");
    const m = sessionStorage.getItem("resultMeta");
    const s = sessionStorage.getItem("diagSteps");
    const c = sessionStorage.getItem("compareList");
    if (r) {
      setResult(JSON.parse(r));
      setLoading(false);
    }
    if (m) setResultMeta(JSON.parse(m));
    if (s) setSteps(JSON.parse(s));
    if (c) setCompareList(JSON.parse(c));
  }, []);

  useEffect(() => {
    const id = ++explainSeq.current;
    if (!result) {
      setExplain({ loading: false, error: null, data: null });
      return;
    }

    setExplain({ loading: true, error: null, data: null });
    logStep("해설", "진행", "Solar Pro 4가 계산 결과를 읽고 지원자 관점 해설을 쓰고 있어요");

    const requestExplain = async () => {
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            진단결과: result,
            추이: resultMeta?.추이,
            자료년월: resultMeta?.자료년월,
            계절성주의: resultMeta?.계절성주의,
            입력_출처: resultMeta?.입력_출처,
            원본_업종명: resultMeta?.원본_업종명,
          }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) throw new Error(j?.사유 || `HTTP ${res.status}`);
        if (id !== explainSeq.current) return;
        setExplain({ loading: false, error: null, data: j });
        logStep("해설", "완료", `사실 ${(j.사실목록 || []).length}개를 근거로 ${((j.소요ms || 0) / 1000).toFixed(1)}초 만에 썼어요` + (j.걸러낸문장수 ? ` · 기준에 안 맞는 문장 ${j.걸러낸문장수}개는 뺐어요` : ""));
      } catch (e: any) {
        if (id !== explainSeq.current) return;
        setExplain({ loading: false, error: e.message || "해설 요청 실패", data: null });
        logStep("해설", "주의", `해설을 쓰지 못했어요 (${e.message || "해설 요청 실패"})`);
      }
    };

    void requestExplain();
    return () => {
      // 이전 화면의 늦은 응답이 현재 해설을 덮어쓰지 않도록 합니다.
      explainSeq.current++;
    };
  }, [result, resultMeta, logStep]);

  // 결과가 바뀌면 compareList도 세션스토리지에 저장
  useEffect(() => {
    if (compareList.length > 0) {
      sessionStorage.setItem("compareList", JSON.stringify(compareList));
    }
  }, [compareList]);

  const fmtNum = (n: number) => n.toLocaleString("ko-KR");
  const fmtPercentRatio = (ratio: number) => (ratio * 100).toFixed(1) + "%";
  const fmtPercentValue = (pct: number) => pct.toFixed(1) + "%";
  const fmtMultiple = (n: number) => n.toFixed(1) + "배";
  const fmtSuppressed = (n: number) =>
    n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "배";

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <nav className="sticky top-0 z-40 border-b border-border-default bg-bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 py-2 sm:px-6 lg:px-8">
            <a href="/" className="flex items-center gap-1 font-bold">
              <span className="text-brand-black">Work-</span>
              <span className="text-brand-orange">Signal</span>
            </a>
          </div>
        </nav>
        <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8 flex-1">
          <div className="flex items-center justify-center py-20">
            <FullPageLoader loading={loading} steps={steps} percent={30} company={result?.사업장명 || ""} />
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <nav className="sticky top-0 z-40 border-b border-border-default bg-bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 py-2 sm:px-6 lg:px-8">
            <a href="/" className="flex items-center gap-1 font-bold">
              <span className="text-brand-black">Work-</span>
              <span className="text-brand-orange">Signal</span>
            </a>
          </div>
        </nav>
        <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8 flex-1">
          <div className="mt-6 flex w-full max-w-lg items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 shadow-sm">
            <p className="whitespace-pre-line">진단 결과가 없습니다. 이전 페이지로 돌아가 다시 시도해주세요.</p>
          </div>
          <button
            className="mt-4 rounded-xl border border-border-default bg-bg-card px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            onClick={() => router.push("/")}
          >
            뒤로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 내비게이션 */}
      <nav className="sticky top-0 z-40 border-b border-border-default bg-bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-bg-card/80">
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
              {result.사업장명}
            </span>
          </div>
        </div>
      </nav>

      {/* 페이지 콘텐츠 */}
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8 flex-1">
        {/* 진단 결과 */}
        <section className="mt-8">
          <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">
                  {result.사업장명}
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  {resultMeta?.입력_출처 === "공공데이터" ||
                  resultMeta?.입력_출처 === "공공데이터 API"
                    ? `공공데이터 API · 기준월 ${resultMeta?.자료년월 || ""}`
                    : "동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)"}
                </p>
                {resultMeta?.계절성주의 && (
                  <p className="text-sm text-zinc-600 mt-1">
                    7월·1월 자료는 공공기관 정기 인사이동이 섞여 회전율이 높게
                    나올 수 있습니다
                  </p>
                )}
              </div>
              {resultMeta?.대체사유 && (
                <div className="shrink-0 rounded-xl border border-orange-300 bg-bg-info px-4 py-2 text-sm text-info-title">
                  공공데이터로 진단하지 못해 동봉 데이터(2026-07)로 보여드려요 — 사유:{" "}
                  {resultMeta.대체사유}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <aside className="order-2 self-start lg:order-1 lg:sticky lg:top-[5.5rem] lg:col-span-4">
              <AgentSteps steps={steps} />
              <ThoughtTrail 진단결과={result} 추이={resultMeta?.추이} />
            </aside>
            <div className="order-1 min-w-0 rounded-lg border border-zinc-200 bg-white p-4 lg:order-2 lg:col-span-8">
              <ExplainCard loading={explain.loading} error={explain.error} data={explain.data} 진단결과={result} 추이={resultMeta?.추이} />
              <KeyNumbers 진단결과={result} 추이={resultMeta?.추이} />
              <IndustryPosition 진단결과={result} />
              <HiringInsight rows={resultMeta?.추이} />

              <details className="mt-4 rounded-lg border border-zinc-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                  숫자 자세히 보기
                </summary>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <dt className="text-zinc-500">업종 / 지역</dt>
                  <dd className="text-zinc-900">{result.업종 || resultMeta?.원본_업종명 || "-"} / {result.시도 || "-"}</dd>
                  <dt className="text-zinc-500">가입자수</dt>
                  <dd className="text-zinc-900">{fmtNum(result.가입자수)}명</dd>
                  <dt className="text-zinc-500">당월 순증감</dt>
                  <dd className="text-zinc-900">{result.순증감 >= 0 ? "+" : ""}{result.순증감}명</dd>
                  <dt className="text-zinc-500">당월 총이동 (신규+상실)</dt>
                  <dd className="text-zinc-900">{fmtNum(result.총이동)}명 (신규 {fmtNum(result.신규)} / 상실 {fmtNum(result.상실)})</dd>
                  <dt className="text-zinc-500">월 회전율</dt>
                  <dd className="text-zinc-900">{fmtPercentRatio(result.월회전율)} (연환산 {fmtPercentValue(result.연환산회전율)})</dd>
                  <dt className="text-zinc-500">은폐지수</dt>
                  <dd className="text-zinc-900 font-medium">{fmtSuppressed(result.은폐지수)} — 총원 변화 {result.순증감 >= 0 ? "+" : ""}{fmtNum(result.순증감)}명 뒤에 {fmtNum(result.총이동)}명이 오갔습니다</dd>
                  {resultMeta?.업종기준선_일치 !== false && (
                    <>
                      <dt className="text-zinc-500">업종 내 상대 위치</dt>
                      <dd className="text-zinc-900">업종 중앙값의 {fmtMultiple(result.업종배수)}</dd>
                    </>
                  )}
                  {result.추정소득 !== null && (
                    <>
                      <dt className="text-zinc-500">추정 평균 기준소득월액</dt>
                      <dd className="text-zinc-900">
                        {result.추정소득.toLocaleString("ko-KR")}원
                        {result.추정소득상한주의 && " ⚠️ 상한 도달 — 실제 평균 급여는 이보다 높습니다"}
                      </dd>
                    </>
                  )}
                  {result.경고 && result.경고.length > 0 && (
                    <>
                      <dt className="text-zinc-500">해석 주의</dt>
                      <dd className="text-zinc-900">{result.경고.map((w: string) => ` ` + w).join(", ")}</dd>
                    </>
                  )}
                </dl>

                <div className="mt-4 space-y-4 text-sm">
                  <div className="space-y-1">
                    <p className="font-medium text-zinc-900">① 순증감 대 총이동 (같은 축척, 총이동 기준)</p>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-40 flex-shrink-0 truncate text-zinc-800">겉으로 보이는 변화 (순증감)</span>
                        <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                          <div className="h-full bg-zinc-400 rounded" style={{ width: `${Math.abs(result.순증감) / (result.총이동 || 1) * 100}%` }} />
                        </div>
                        <span className="w-24 flex-shrink-0 text-right text-zinc-800">{result.순증감 >= 0 ? "+" : ""}{fmtNum(result.순증감)}명</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-40 flex-shrink-0 truncate text-zinc-800">실제로 오간 사람 (총이동)</span>
                        <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                          <div className="h-full bg-zinc-900 rounded" style={{ width: "100%" }} />
                        </div>
                        <span className="w-24 flex-shrink-0 text-right text-zinc-800">{fmtNum(result.총이동)}명</span>
                      </div>
                    </div>
                  </div>
                  {resultMeta?.업종기준선_일치 !== false && (
                    <div className="space-y-1">
                      <p className="font-medium text-zinc-900">② 업종 대비 (업종 중앙값 대비 막대)</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-40 flex-shrink-0 truncate text-zinc-800">업종 중앙값</span>
                          <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                            <div className="h-full bg-zinc-400 rounded" style={{ width: `${result.업종중앙값 / Math.max(result.월회전율, result.업종중앙값) * 100}%` }} />
                          </div>
                          <span className="w-24 flex-shrink-0 text-right text-zinc-800">{fmtPercentRatio(result.업종중앙값)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-40 flex-shrink-0 truncate text-zinc-800">이 사업장</span>
                          <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                            <div className="h-full bg-zinc-900 rounded" style={{ width: `${result.월회전율 / Math.max(result.월회전율, result.업종중앙값) * 100}%` }} />
                          </div>
                          <span className="w-24 flex-shrink-0 text-right text-zinc-800">{fmtPercentRatio(result.월회전율)}</span>
                        </div>
                      </div>
                      <p className="text-zinc-500 text-xs mt-1">업종 중앙값의 {fmtMultiple(result.업종배수)}</p>
                    </div>
                  )}
                  {resultMeta?.업종기준선_일치 === false && (
                    <p className="text-zinc-600 text-sm">이 업종은 동봉 기준선(550개 업종)에 없어 업종 비교를 표시하지 않습니다</p>
                  )}
                  {result.업종내위치 && resultMeta?.업종기준선_일치 !== false && (
                    <p className="text-zinc-700">업종 내 위치: {result.업종내위치}</p>
                  )}
                </div>

              </details>


              <TrendTable
                rows={resultMeta?.추이}
                failedMonths={resultMeta?.실패한달}
                excludedMonths={resultMeta?.제외한달}
              />
              <p className="mt-4 text-sm text-zinc-600">
                {resultMeta?.안내문 || "본 수치는 공식 통계가 아니라 조회 시점의 행정 기록입니다"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
                  onClick={() => {
                    const prev = sessionStorage.getItem("prevCandidates");
                    if (prev) {
                      sessionStorage.setItem("candidates", prev);
                      sessionStorage.removeItem("prevCandidates");
                    } else {
                      sessionStorage.removeItem("candidates");
                    }
                    const prevPage = sessionStorage.getItem("prevCandidatesPage");
                    if (prevPage) {
                      sessionStorage.setItem("candidatesPage", prevPage);
                      sessionStorage.removeItem("prevCandidatesPage");
                    }
                    router.push(`/candidates?page=${prevPage ? prevPage : "1"}`);
                    setResult(null);
                    setResultMeta(null);
                  }}
                >
                  뒤로
                </button>
                <button
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
                  disabled={compareList.some((e) => e.사업장명 === result.사업장명)}
                  onClick={() => {
                    setCompareList((prev) => {
                      const filtered = prev.filter(
                        (e) => e.사업장명 !== result.사업장명,
                      );
                      return [
                        ...filtered,
                        {
                          사업장명: result.사업장명,
                          업종:
                            result.업종 ||
                            resultMeta?.원본_업종명 ||
                            "",
                          출처:
                            resultMeta?.입력_출처 === "공공데이터 API"
                              ? "공공데이터"
                              : "동봉 데이터",
                          자료년월: resultMeta?.자료년월 || "2026-07",
                          진단결과: result,
                        },
                      ].slice(-5);
                    });
                  }}
                >
                  {compareList.some(
                    (e) => e.사업장명 === result.사업장명,
                  )
                    ? "비교 목록에 있음"
                    : `비교에 담기 (${compareList.length}/5)`}
                </button>
                {compareList.length >= 2 && (
                  <button
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700"
                    onClick={() => router.push("/compare")}
                  >
                    회사 비교 보기 ({compareList.length}곳)
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return <ResultInner />;
}
