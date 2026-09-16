"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ExplainCard from "@/components/ExplainCard";
import AgentSteps, { type AgentStep } from "@/components/AgentSteps";
import HiringInsight from "@/components/HiringInsight";
import TrendTable from "@/components/TrendTable";
import FullPageLoader from "@/components/FullPageLoader";

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

  useEffect(() => {
    const r = sessionStorage.getItem("diagnosisResult");
    const m = sessionStorage.getItem("resultMeta");
    const s = sessionStorage.getItem("diagSteps");
    if (r) {
      setResult(JSON.parse(r));
      setLoading(false);
    }
    if (m) setResultMeta(JSON.parse(m));
    if (s) setSteps(JSON.parse(s));
  }, []);

  useEffect(() => {
    if (!result) return;
    const apiBody = {
      진단결과: result,
      추이: resultMeta?.추이,
      자료년월: resultMeta?.자료년월,
      계절성주의: resultMeta?.계절성주의,
      입력_출처: resultMeta?.입력_출처,
      원본_업종명: resultMeta?.원본_업종명,
    };
    fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apiBody),
    })
      .then((res) => res.json())
      .then((j) => {
        if (!res.ok || !j?.ok) throw new Error(j?.사유 || `HTTP ${res.status}`);
        setExplain({ loading: false, error: null, data: j });
      })
      .catch((e: any) => {
        setExplain({ loading: false, error: e.message || "해설 요청 실패", data: null });
      });
  }, [result]);

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

                                <AgentSteps steps={steps} compact company={result.사업장명} />
            <FullPageLoader loading={explain.loading} steps={[]} text="해설을 준비하는 중..." percent={85} company={result.사업장명} />
            <ExplainCard
              loading={explain.loading}
              error={explain.error}
              data={explain.data}
              진단결과={result}
              추이={resultMeta?.추이}
            />
            <HiringInsight rows={resultMeta?.추이} />

            {/* 지표 정의 목록 */}
            <div className="rounded-xl border border-border-default bg-zinc-50 p-5 shadow-sm">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <dt className="text-zinc-500">업종 / 지역</dt>
                  <dd className="text-zinc-900">
                    {result.업종 || resultMeta?.원본_업종명 || "-"} /{" "}
                    {result.시도 || "-"}
                  </dd>
                  <dt className="text-zinc-500">가입자수</dt>
                  <dd className="text-zinc-900">
                    {result.가입자수?.toLocaleString("ko-KR") || "-"}명
                  </dd>
                  <dt className="text-zinc-500">당월 순증감</dt>
                  <dd className="text-zinc-900">
                    {result.순증감 >= 0 ? "+" : ""}
                    {result.순증감?.toLocaleString("ko-KR") || 0}명
                  </dd>
                  <dt className="text-zinc-500">
                    당월 총이동 (신규+상실)
                  </dt>
                  <dd className="text-zinc-900">
                    {result.총이동?.toLocaleString("ko-KR") || 0}명 (신규{" "}
                    {result.신규?.toLocaleString("ko-KR") || 0} / 상실{" "}
                    {result.상실?.toLocaleString("ko-KR") || 0})
                  </dd>
                  <dt className="text-zinc-500">월 회전율</dt>
                  <dd className="text-zinc-900">
                    {result.월회전율 != null
                      ? `${(result.월회전율 * 100).toFixed(1)}%`
                      : "-"} (연환산{" "}
                    {result.연환산회전율 != null
                      ? `${result.연환산회전율.toFixed(1)}%`
                      : "-"})
                  </dd>
                  <dt className="text-zinc-500">은폐지수</dt>
                  <dd className="text-zinc-900 font-medium">
                    {result.은폐지수 != null
                      ? `${result.은폐지수.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}배`
                      : "-"} — 총원 변화{" "}
                    {result.순증감 >= 0 ? "+" : ""}
                    {result.순증감?.toLocaleString("ko-KR") || 0}명 뒤에{" "}
                    {result.총이동?.toLocaleString("ko-KR") || 0}명이 오갔습니다
                  </dd>
                  {resultMeta?.업종기준선_일치 !== false && (
                    <>
                      <dt className="text-zinc-500">업종 내 상대 위치</dt>
                      <dd className="text-zinc-900">
                        업종 중앙값의{" "}
                        {result.업종배수 != null
                          ? `${result.업종배수.toFixed(1)}배`
                          : "-"}
                      </dd>
                    </>
                  )}
                  {result.추정소득 !== null && (
                    <>
                      <dt className="text-zinc-500">
                        추정 평균 기준소득월액
                      </dt>
                      <dd className="text-zinc-900">
                        {result.추정소득.toLocaleString("ko-KR")}원
                        {result.추정소득상한주의 && (
                          <span className="text-amber-600">
                            {" "}
                            ⚠️ 상한 도달 — 실제 평균 급여는 이보다 높습니다
                          </span>
                        )}
                      </dd>
                    </>
                  )}
                  {result.경고 && result.경고.length > 0 && (
                    <>
                      <dt className="text-zinc-500">해석 주의</dt>
                      <dd className="text-zinc-900">
                        {result.경고.map((w: string) => " " + w).join(", ")}
                      </dd>
                    </>
                  )}
                </div>
              </dl>
            </div>

            {/* 막대차트 */}
            <div className="mt-4 space-y-4 text-sm">
              <div className="space-y-2">
                <p className="font-medium text-zinc-900">
                  ① 순증감 대 총이동 (같은 축척, 총이동 기준)
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-44 flex-shrink-0 truncate text-zinc-700">
                      겉으로 보이는 변화 (순증감)
                    </span>
                    <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                      <div
                        className="h-full bg-zinc-400 rounded"
                        style={{
                          width: `${
                            Math.abs(result.순증감 || 0) /
                              ((result.총이동 || 1) || 1) *
                              100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="w-28 flex-shrink-0 text-right text-zinc-800">
                      {result.순증감 >= 0 ? "+" : ""}
                      {(result.순증감 || 0).toLocaleString("ko-KR")}명
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-44 flex-shrink-0 truncate text-zinc-700">
                      실제로 오간 사람 (총이동)
                    </span>
                    <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                      <div
                        className="h-full bg-zinc-900 rounded"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <span className="w-28 flex-shrink-0 text-right text-zinc-800">
                      {(result.총이동 || 0).toLocaleString("ko-KR")}명
                    </span>
                  </div>
                </div>
              </div>
              {resultMeta?.업종기준선_일치 !== false && (
                <div className="space-y-2">
                  <p className="font-medium text-zinc-900">
                    ② 업종 대비 (업종 중앙값 대비 막대)
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="w-44 flex-shrink-0 truncate text-zinc-700">
                        업종 중앙값
                      </span>
                      <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                        <div
                          className="h-full bg-zinc-400 rounded"
                          style={{
                            width: `${
                              (result.업종중앙값 || 0) /
                                Math.max(
                                  result.월회전율 || 0,
                                  result.업종중앙값 || 0
                                ) *
                                100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="w-28 flex-shrink-0 text-right text-zinc-800">
                        {result.월회전율 != null && result.업종중앙값 != null
                          ? `${(result.업종중앙값 * 100).toFixed(1)}%`
                          : "-"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="w-44 flex-shrink-0 truncate text-zinc-700">
                        이 사업장
                      </span>
                      <div className="flex-1 h-4 bg-zinc-200 rounded overflow-hidden">
                        <div
                          className="h-full bg-zinc-900 rounded"
                          style={{
                            width: `${
                              (result.월회전율 || 0) /
                                Math.max(
                                  result.월회전율 || 0,
                                  result.업종중앙값 || 0
                                ) *
                                100
                            }%`,
                          }}
                        />
                      </div>
                      <span className="w-28 flex-shrink-0 text-right text-zinc-800">
                        {result.월회전율 != null
                          ? `${(result.월회전율 * 100).toFixed(1)}%`
                          : "-"}
                      </span>
                    </div>
                  </div>
                  <p className="text-zinc-500 text-xs mt-1">
                    업종 중앙값의{" "}
                    {result.업종배수 != null
                      ? `${result.업종배수.toFixed(1)}배`
                      : "-"}
                  </p>
                </div>
              )}
              {resultMeta?.업종기준선_일치 === false && (
                <p className="text-zinc-600 text-sm">
                  이 업종은 동봉 기준선(550개 업종)에 없어 업종 비교를 표시하지
                  않습니다
                </p>
              )}
              {result.업종내위치 &&
                resultMeta?.업종기준선_일치 !== false && (
                  <p className="text-zinc-700">
                    업종 내 위치: {result.업종내위치}
                  </p>
                )}
            </div>

            <TrendTable
              rows={resultMeta?.추이}
              failedMonths={resultMeta?.실패한달}
              excludedMonths={resultMeta?.제외한달}
            />
            <p className="mt-4 text-sm text-zinc-600">
              {resultMeta?.안내문 ||
                "본 수치는 공식 통계가 아니라 조회 시점의 행정 기록입니다"}
            </p>

            {/* 결과 하단 버튼 */}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="rounded-xl border border-border-default bg-bg-card px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
                onClick={() => {
                  const prev = sessionStorage.getItem("prevCandidates");
                  if (prev) {
                    sessionStorage.setItem("candidates", prev);
                    sessionStorage.removeItem("prevCandidates");
                  } else {
                    sessionStorage.removeItem("candidates");
                  }
                  router.push("/candidates");
                }}
              >
                뒤로
              </button>
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
