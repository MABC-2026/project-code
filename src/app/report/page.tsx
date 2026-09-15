"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import CompareTable from "@/components/CompareTable";
import LoadingOverlayFallback from "@/components/LoadingOverlayFallback";
import { 문구목록 } from "@/components/AgentThinking";

function ReportInner() {
  const router = useRouter();
  const [result, setResult] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const resultRaw = sessionStorage.getItem("diagnosisResult");
    const resultMetaRaw = sessionStorage.getItem("resultMeta");
    if (resultRaw) setResult(JSON.parse(resultRaw));
    if (resultMetaRaw) setMeta(JSON.parse(resultMetaRaw));
  }, []);

  if (!result || !meta) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <nav className="sticky top-0 z-40 border-b border-border-default bg-bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-bg-card/80">
          <div className="mx-auto flex h-16 items-center justify-between px-5 py-2 sm:px-6 lg:px-8">
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
          </div>
        </nav>
        <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:px-8 flex-1">
          <div className="text-center">
            <p className="text-sm text-zinc-500">
              리포트 데이터를 불러오는 중...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const 업종명 = result?.업종명 ?? meta?.원본_업종명 ?? "미상";
  const 판정 = result?.판정 ?? "미분류";
  const 월회전율 = result?.월회전율 ?? 0;
  const 인풋 = result?.인풋 ?? {};
  const 기준선 = result?.업종위치 ?? {};
  const 진단의견 = result?.진단의견 ?? [];
  const 안내문 = meta?.안내문 ?? "";

  const pageCount =
    Math.ceil(인풋?.전체월수 ?? 12 / 6) || Math.ceil((인풋?.전체월수 ?? 12) / 6);

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
            인력 안정성 전체 리포트
          </h1>
          <p className="mt-1 text-zinc-500">
            {result?.name ? `"${result.name}"` : ""} · {업종명}
          </p>
        </div>

        {/* 판정 배너 */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-border-default bg-bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
                    판정 === "안정"
                      ? "bg-green-100 text-green-800"
                      : 판정 === "주의"
                      ? "bg-amber-100 text-amber-800"
                      : 판정 === "경고"
                      ? "bg-red-100 text-red-800"
                      : "bg-zinc-200 text-zinc-700"
                  }`}
                >
                  {판정}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-medium text-zinc-900">
                    {result?.name ?? "사업장"}
                  </h2>
                  <p className="text-sm text-zinc-500">
                    월 회전율 {월회전율.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm text-zinc-500">
                수집 기간:{" "}
                {meta?.자료년월
                  ? `${meta.자료년월}년 기준`
                  : meta?.입력_출처 ?? "동봉 샘플"}
              </p>
              {meta?.계절성주의 && (
                <p className="mt-1 text-sm text-amber-600">
                  ※ 1월·7월 등 인사이동이 섞이는 달이 포함되어 있어,
                  단순 증감만으로 해석하지 않도록 주의
                </p>
              )}
              {meta?.대체사유 && (
                <p className="mt-1 text-sm text-red-600">
                  대체 사유: {meta.대체사유}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 안내문 */}
        {안내문 && (
          <div className="mb-8 rounded-xl border border-border-default bg-bg-card p-4 text-sm text-zinc-700">
            {안내문}
          </div>
        )}

        {/* 진단 의견 */}
        {진단의견.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-lg font-medium text-zinc-900">
              진단 의견
            </h2>
            <div className="space-y-2">
              {진단의견.map((내용: string, i: number) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-border-default bg-bg-card p-4 pl-4"
                >
                  <span className="mt-0.5 shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {i + 1}
                  </span>
                  <p className="min-w-0 text-sm text-zinc-700">{내용}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 트렌드 표 */}
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-medium text-zinc-900">
            월별 추이
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-card p-4 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default">
                  <th className="py-2 text-left font-medium text-zinc-500">월</th>
                  <th className="py-2 text-right font-medium text-zinc-500">입사자</th>
                  <th className="py-2 text-right font-medium text-zinc-500">퇴사자</th>
                  <th className="py-2 text-right font-medium text-zinc-500">순증감</th>
                  <th className="py-2 text-right font-medium text-zinc-500">월말 인원</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {result?.추이?.map((행: any, i: number) => (
                  <tr key={i}>
                    <td className="py-2 text-left text-zinc-900">{행.년월 ?? ""}</td>
                    <td className="py-2 text-right text-zinc-900">
                      {행.신규 ?? 0}
                    </td>
                    <td className="py-2 text-right text-zinc-900">{행.상실 ?? 0}</td>
                    <td
                      className={`py-2 text-right ${
                        (행.신규 ?? 0) - (행.상실 ?? 0) >= 0
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {(행.신규 ?? 0) - (행.상실 ?? 0)}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {행.월말인원 ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 업종 비교 */}
        {기준선?.비교사업장수 != null && 기준선?.비교사업장수 > 0 && (
          <div className="mb-8">
            <h2 className="mb-3 text-lg font-medium text-zinc-900">
              업종 내 비교
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-card p-4 shadow-sm">
              <p className="mb-2 text-sm text-zinc-500">
                같은 업종 {기준선.비교사업장수}곳과 비교한 결과입니다.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-default">
                    <th className="py-2 text-left font-medium text-zinc-500">항목</th>
                    <th className="py-2 text-right font-medium text-zinc-500">
                      {result?.name ?? "사업장"}
                    </th>
                    <th className="py-2 text-right font-medium text-zinc-500">
                      업종 평균
                    </th>
                    <th className="py-2 text-right font-medium text-zinc-500">
                      업종 중앙값
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  <tr>
                    <td className="py-2 text-left text-zinc-900">
                      월 회전율
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {월회전율.toFixed(1)}%
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.회전율평균?.toFixed(1) ?? "—"}%
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.회전율중앙값?.toFixed(1) ?? "—"}%
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-left text-zinc-900">
                      평균 입사인
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {인풋?.평균입사 ?? 0}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.월평균입사?.toFixed(0) ?? "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.중앙값입사?.toFixed(0) ?? "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-left text-zinc-900">
                      평균 퇴사인
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {인풋?.평균퇴사 ?? 0}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.월평균퇴사?.toFixed(0) ?? "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.중앙값퇴사?.toFixed(0) ?? "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-left text-zinc-900">
                      입사/퇴사 비율
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {(인풋?.평균입사 ?? 0) / (인풋?.평균퇴사 ?? 1) > 0
                        ? ((인풋?.평균입사 ?? 0) / (인풋?.평균퇴사 ?? 1)).toFixed(2)
                        : "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.비율평균?.toFixed(2) ?? "—"}
                    </td>
                    <td className="py-2 text-right text-zinc-900">
                      {기준선?.비율중앙값?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 비교 페이지 링크 */}
        <div className="mb-8 flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            여러 사업장을 함께 비교하고 싶으신가요?
          </p>
          <button
            className="rounded-xl bg-brand-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-orange/90 focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2"
            onClick={() => router.push("/compare")}
          >
            사업장 비교
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<LoadingOverlayFallback />}>
      <ReportInner />
    </Suspense>
  );
}
