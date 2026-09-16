"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import TrendTable from "@/components/TrendTable";
import ExplainCard from "@/components/ExplainCard";
import AgentSteps, { type AgentStep } from "@/components/AgentSteps";
import HiringInsight from "@/components/HiringInsight";
import KeyNumbers from "@/components/KeyNumbers";
import IndustryPosition from "@/components/IndustryPosition";
import ThoughtTrail from "@/components/ThoughtTrail";
import CompareTable, { type CompareEntry } from "@/components/CompareTable";
import FullPageLoader from "@/components/FullPageLoader";

export default function Home() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [top, setTop] = useState(10);
  const explainSeq = useRef(0);
  const [explain, setExplain] = useState<{
    loading: boolean;
    error: string | null;
    data: any;
  }>({ loading: false, error: null, data: null });

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

  const callApi = useCallback(
    async (body: Record<string, any>) => {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let detail = "";
        try {
          detail = JSON.parse(txt).error || "";
        } catch {
          detail = "";
        }
        throw new Error(detail || `진단 서버 응답 오류 (HTTP ${res.status})`);
      }
      return res.json();
    },
    []
  );

  const callNpsSearch = useCallback(
    async (wkplNm: string) => {
      const params = new URLSearchParams({
        wkplNm: wkplNm.trim(),
        dataType: "json",
        pageNo: "1",
      });
      const res = await fetch(`/api/nps/search?${params.toString()}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let detail = "";
        try {
          detail = JSON.parse(txt).error || "";
        } catch {
          detail = "";
        }
        throw new Error(detail || `검색 서버 응답 오류 (HTTP ${res.status})`);
      }
      return res.json();
    },
    []
  );

  const sampleDiagnose = useCallback(
    async (companyName: string): Promise<any> => {
      try {
        const data = await callApi({
          company: companyName,
          csvPath: "sample_workplaces.csv",
        });
        if (!data.ok) return "없음";
        if (data.진단결과) return data.진단결과;
        if (data.회사_미발견) return "없음";
        if (data.후보목록 && data.후보목록.length > 0) {
          const exact = data.후보목록.find(
            (c: any) => c.사업장명 === companyName
          );
          if (exact && exact.번호 != null) {
            const pickData = await callApi({
              company: companyName,
              csvPath: "sample_workplaces.csv",
              pick: exact.번호,
            });
            if (pickData.ok && pickData.진단결과)
              return pickData.진단결과;
          }
        }
        return "없음";
      } catch {
        return "없음";
      }
    },
    [callApi]
  );

  const handleSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!company.trim()) return;
      flushSync(() => {
        setLoading(true);
        setError(null);
        setSteps([]);
        setLoadingText(
          "공공데이터에서 사업장을 찾는 중입니다 (10초 정도 걸립니다)"
        );
      });
      try {
        logStep(
          "검색",
          "진행",
          `공공데이터에서 '${company.trim()}' 이름이 들어간 사업장을 찾고 있어요`
        );
        let npsResult: {
          items?: Array<{
            seq?: number;
            wkplNm?: string;
            wkplRoadNmDtlAddr?: string;
            bzowrRgstNo?: string;
            dataCrtYm?: string;
            wkplJnngStcd?: string;
            가입자수?: number | null;
            업종?: string | null;
          }>;
          totalCount?: number;
          error?: string;
        } | null = null;
        try {
          npsResult = await callNpsSearch(company);
        } catch (npsErr: any) {
          console.warn(
            "[검색] NPS API 호출 실패, CSV 폴백 사용:",
            npsErr.message
          );
        }

        if (npsResult && npsResult.items && npsResult.items.length > 0) {
          const 검색어들: string[] =
            (npsResult as any).검색어 || [];
          const 한글읽기 = 검색어들.find(
            (q) =>
              q !== company.trim() &&
              !q.includes("주식회사") &&
              !q.includes("(주)")
          );
          logStep(
            "검색",
            "완료",
            `후보 ${npsResult.items.length}곳을 찾았어요 · 법인 표기를 바꿔 ${검색어들.length}가지로 찾았어요` +
              (한글읽기
                ? ` · '${company.trim()}' → '${한글읽기}'로도 찾았어요`
                : "")
          );
          const candidates = npsResult.items.map((it, i) => ({
            번호: i + 1,
            사업장명: it.wkplNm || "(이름 미상)",
            seq: it.seq != null ? String(it.seq) : undefined,
            시도:
              it.wkplRoadNmDtlAddr
                ? it.wkplRoadNmDtlAddr.split(" ")[0] || ""
                : "",
            source: "nps" as const,
            wkplNm: it.wkplNm || undefined,
            bzowrRgstNo: it.bzowrRgstNo || undefined,
            주소: it.wkplRoadNmDtlAddr || undefined,
            기준월: it.dataCrtYm
              ? it.dataCrtYm.length === 6
                ? it.dataCrtYm.slice(0, 4) +
                  "-" +
                  it.dataCrtYm.slice(4, 6)
                : it.dataCrtYm
              : undefined,
            가입자수:
              typeof it.가입자수 === "number" ? it.가입자수 : undefined,
            업종: it.업종 && it.업종 !== "BIZ_NO미존재사업장" ? it.업종 : undefined,
          }));

          sessionStorage.setItem("candidates", JSON.stringify(candidates));
          sessionStorage.setItem("searchCompany", company.trim());
          router.push("/candidates");
          return;
        }

        logStep(
          "검색",
          "주의",
          "공공데이터 검색에서 찾지 못해 동봉 데이터(2026-07, 52,957곳)에서 찾아요"
        );
        const data = await callApi({
          company,
          csvPath: "sample_workplaces.csv",
        });
        if (!data.ok) throw new Error(data.error || "응답 이상");
        if (data.회사_미발견) {
          setError(
            "해당 이름의 사업장을 찾지 못했습니다.\n\n국민연금 가입 사업장명은 법인명 기준이라 브랜드명과 다를 수 있습니다."
          );
          return;
        }
        if (data.진단결과) {
          sessionStorage.setItem("diagnosisResult", JSON.stringify(data.진단결과));
          sessionStorage.setItem("resultMeta", JSON.stringify({
            입력_출처: data.입력_출처,
            자료년월: data.자료년월,
            계절성주의: data.계절성주의,
            업종기준선_일치: data.업종기준선_일치,
            안내문: data.안내문,
            원본_업종명: data.원본_업종명,
            추이: data.추이,
            제외한달: data.제외한달,
            실패한달: null,
          }));
          sessionStorage.setItem("searchCompany", company.trim());
          router.push("/result");
          return;
        }
        if (data.후보목록 && data.후보목록.length > 0) {
          const candidates = data.후보목록.map((c: any, i: number) => ({
            ...c,
            source: "csv" as const,
            wkplNm: c.사업장명,
          }));
          sessionStorage.setItem("candidates", JSON.stringify(candidates));
          sessionStorage.setItem("searchCompany", company.trim());
          router.push("/candidates");
          return;
        }
        setError(
          "해당 이름의 사업장을 찾지 못했습니다.\n\n국민연금 가입 사업장명은 법인명 기준이라 브랜드명과 다를 수 있습니다."
        );
      } catch (err: any) {
        setError(err.message || "검색 중 오류");
      } finally {
        setLoading(false);
      }
    },
    [company, callApi, callNpsSearch, logStep, router]
  );

  const handleShowReport = useCallback(async () => {
    sessionStorage.removeItem("reportData");
    router.push("/report");
  }, [router]);

  const fmtNum = (n: number) => n.toLocaleString("ko-KR");
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    company.trim() + " 법인명"
  )}`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 내비게이션 — 떠 있는 흰색 바 */}
      <nav className="sticky top-5 z-40 mx-auto w-[calc(100%-2rem)] max-w-[1200px]">
        <div className="card-white flex h-[72px] items-center justify-between px-5 lg:px-8">
          <a
            href="#search-hero"
            className="brand-mark outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg px-1 -ml-1"
          >
            <span className="text-[var(--brand-black)] font-bold tracking-tight text-[22px] sm:text-[26px]">
              Work-
            </span>
            <span className="text-[var(--brand-orange)] font-bold tracking-tight text-[22px] sm:text-[26px]">
              Signal
            </span>
          </a>

          <ul className="hidden items-center gap-7 font-medium text-[var(--text-body)] lg:flex">
            <li>
              <a
                href="#about-section"
                className="text-[var(--text-zinc-500)] hover:text-[var(--brand-orange)] transition-colors focus-visible:text-[var(--brand-orange)]"
              >
                서비스 소개
              </a>
            </li>
            <li>
              <a
                href="#features-section"
                className="text-[var(--text-zinc-500)] hover:text-[var(--brand-orange)] transition-colors focus-visible:text-[var(--brand-orange)]"
              >
                제공 정보
              </a>
            </li>
            <li>
              <a
                href="#howto-section"
                className="text-[var(--text-zinc-500)] hover:text-[var(--brand-orange)] transition-colors focus-visible:text-[var(--brand-orange)]"
              >
                이용 방법
              </a>
            </li>
          </ul>

          <a
            href="#search-hero"
            className="btn-filled-orange text-sm"
          >
            <svg
              className="size-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            기업 검색
          </a>
        </div>
      </nav>

      {/* 페이지 콘텐츠 */}
      <div className="mx-auto w-full max-w-[1200px] px-5 py-6 sm:px-6 lg:px-8 flex-1">
        {/* ===== 히어로 배너 ===== */}
        <section
          id="search-hero"
          className="hero-bg relative overflow-hidden rounded-[24px] py-10 sm:py-14 lg:py-16 px-6 sm:px-10 lg:px-12"
        >
          {/* 하단 흰색 안개 장식 */}
          <div className="hero-fog" aria-hidden="true">
            <div className="absolute left-1/4 top-0 h-28 w-4/5 rounded-full bg-white/70 blur-[3rem]" />
            <div className="absolute right-1/4 top-0 h-20 w-2/3 rounded-full bg-white/80 blur-[2rem]" />
            <div className="absolute left-0 right-0 top-0 h-10 rounded-full bg-white/90 blur-[2rem]" />
          </div>

          <div className="relative mx-auto flex w-full max-w-[880px] flex-col items-center text-center">
            {/* 상단 배지 */}
            <span className="badge-subtle mb-5">
              국민연금 데이터 기반 기업 정보
            </span>

            {/* 워드마크 */}
            <h1 className="mb-4 text-balance brand-mark">
              <span className="text-[var(--brand-black)] font-bold tracking-tight text-[56px] sm:text-[64px] lg:text-[72px]">
                Work-
              </span>
              <span className="text-[var(--brand-orange)] font-bold tracking-tight text-[56px] sm:text-[64px] lg:text-[72px]">
                Signal
              </span>
            </h1>

            {/* 소개 문구 */}
            <p className="text-balance max-w-[680px] text-[18px] sm:text-[20px] leading-[1.55] text-[var(--text-zinc-600)] sm:text-[var(--text-zinc-600)]">
              지원하려는 회사의 인력 흐름을 입사 전에 확인해보세요.
              <br className="hidden sm:block" />
              직원이 얼마나 들어오고 나가는지, 같은 업종과 비교해 쉽게 보여드려요.
            </p>

            {/* 검색 폼 — 고정 높이, 스크롤 없이 표시되도록 */}
            <div className="mt-8 w-full max-w-[680px] shrink-0">
              <form
                onSubmit={handleSearch}
                className="flex overflow-hidden rounded-[16px] border border-[var(--border-default)] bg-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.08)] focus-within:border-[var(--brand-orange)] focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/50"
              >
                <input
                  className="flex-1 min-w-0 border-0 bg-transparent px-5 py-[14px] text-[16px] text-[var(--foreground)] placeholder-[var(--text-zinc-400)] focus:outline-none"
                  type="text"
                  placeholder="회사·사업장명을 입력하세요 (예: 기아, 쿠팡)"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  aria-label="회사명 입력"
                />
                <button
                  className="shrink-0 self-stretch bg-[var(--brand-orange)] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--brand-orange-dark)] focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={loading || !company.trim()}
                >
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      검색 중
                    </span>
                  ) : (
                    "검색"
                  )}
                </button>
              </form>

              {/* 안내 패널 */}
              <div className="mt-3 rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-orange-light)] p-4 text-left shadow-[0_2px_6px_rgba(0,0,0,0.02)]">
                <p className="text-[15px] font-semibold text-[var(--text-zinc-800)]">
                  정확한 법인명을 모르시나요?
                </p>
                <p className="mt-1 text-[14px] text-[var(--text-zinc-600)]">
                  알고 있는 회사명 + &lsquo;회사&rsquo;로 검색해 법인명을
                  확인해주세요
                </p>
                <p className="mt-2 text-xs text-[var(--text-zinc-500)]">
                  예) 토스 회사 → 비바리퍼블리카 / 배민 회사 → 우아한형제들
                </p>
                <p className="mt-1 text-xs text-[var(--text-zinc-500)]">
                  *KT, LG 같은 영문 약자는 케이티, 엘지로도 검색해 보세요
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-ghost-secondary text-sm"
                    onClick={handleShowReport}
                    disabled={loading}
                  >
                    전체 리포트 보기 (52,957곳)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

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
              {error.startsWith("해당 이름의 사업장을 찾지 못했습니다") &&
                company.trim() && (
                  <p className="mt-2 text-xs text-zinc-600">
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
                )}
            </div>
          </div>
        )}

        {/* 풀페이지 로딩 오버레이 */}
        {loading && (
          <FullPageLoader
            loading={loading}
            steps={steps}
            text={loadingText}
            percent={steps.length === 0 ? 15 : steps.length === 1 ? 40 : 70}
            company={company}
          />
        )}

        {/* ===== 제품 미리보기 — 배너 하단 ~ 흰색 본문 경계 ===== */}
        <section
          aria-label="제품 미리보기"
          className="relative -mx-6 sm:-mx-10 lg:-mx-12 mt-[-24px] mb-20 px-6 sm:px-10 lg:px-12"
        >
          <div className="product-preview-card overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--border-default)]">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-orange-bright)]">
                  <svg
                    className="h-4 w-4 text-[var(--brand-orange)]"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-zinc-500)]">대시보드 미리보기</p>
                  <p className="text-[11px] text-[var(--text-zinc-400)]">
                    실제 기업 진단이 아닙니다
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--text-zinc-400)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-orange)]" />
                <span>Live</span>
              </div>
            </div>

            {/* 지표 4개 */}
            <div className="grid gap-3 px-6 pb-2 pt-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "직원 수", value: "1,248명", sub: "전월 대비 +12명", color: "var(--text-zinc-800)" },
                { label: "총이동", value: "86명", sub: "신규 54 · 상실 32", color: "var(--text-zinc-800)" },
                { label: "월 회전율", value: "3.2%", sub: "업종 중앙값의 1.1배", color: "var(--text-zinc-800)" },
                { label: "핵심 지표", value: "4개 패널", sub: "흐름 · 채용 · 추이", color: "var(--text-zinc-500)" },
              ].map((m) => (
                <div key={m.label} className="metric-card">
                  <p className="text-[14px] font-medium text-[var(--text-zinc-500)]">
                    {m.label}
                  </p>
                  <p className="text-[28px] font-bold tracking-tight text-[var(--text-zinc-900)]">
                    {m.value}
                  </p>
                  <p className="text-[13px] text-[var(--text-zinc-500)]">
                    {m.sub}
                  </p>
                </div>
              ))}
            </div>

            {/* 예시 그래프 영역 */}
            <div className="mx-6 mb-4 px-6 pb-6">
              <div className="border-t border-[var(--border-default)] pt-4">
                <p className="text-[14px] font-semibold text-[var(--text-zinc-800)]">
                  최근 12개월 직원 수 · 월 회전율
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[var(--bg-zinc-50)] p-4 text-center text-sm text-[var(--text-zinc-500)]">
                    <svg className="mx-auto h-5 w-5 text-[var(--brand-orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 3v18h18" />
                      <path d="M7 16l4-6 4 4 4-8" />
                    </svg>
                    <p className="mt-1 font-medium">직원 수 추이</p>
                    <p>실제 진단 시 최근 12개월 선그래프가 표시됩니다.</p>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-zinc-50)] p-4 text-center text-sm text-[var(--text-zinc-500)]">
                    <svg className="mx-auto h-5 w-5 text-[var(--brand-orange)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 8v8M8 12h8" />
                    </svg>
                    <p className="mt-1 font-medium">월 회전율 추이</p>
                    <p>업종 중앙값 대비 막대차트도 함께 제공됩니다.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 서비스 소개 섹션 A ===== */}
        <section
          id="about-section"
          className="section-gap-pc scroll-mt-24"
        >
          <div className="mx-auto max-w-[1100px]">
            <span className="mb-3 inline-block rounded-full border border-[var(--brand-orange)]/30 bg-[var(--bg-orange-light)] px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-info-title)]">
              ABOUT WORK-SIGNAL
            </span>
            <h2 className="mb-5 text-balance text-[36px] font-bold text-[var(--text-zinc-900)] sm:text-[40px]">
              회사 이름 너머의 인력 흐름을 봅니다
            </h2>
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="text-lg leading-relaxed text-[var(--text-zinc-600)]">
                  <span className="text-[var(--brand-orange)]">Work-Signal</span>은 공공데이터에 담긴 기업의 인력 현황과 이동을
                  취업·이직 준비생이 이해하기 쉽게 정리하는 서비스입니다.
                </p>
                <p className="mt-4 text-[var(--text-zinc-500)] leading-[1.65]">
                  겉으로 보이는 직원 수 변화뿐 아니라, 그 뒤에 얼마나 많은
                  사람이 새로 들어오고 나갔는지 함께 보여드려요. 같은 업종의
                  다른 회사들과 비교해 상대적 위치도 확인할 수 있습니다.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-sm text-[var(--text-zinc-500)]">
                  <span className="rounded-full bg-[var(--bg-zinc-100)] px-3 py-1 text-[var(--text-zinc-700)]">
                    국민연금 가입 사업장 데이터
                  </span>
                  <span className="rounded-full bg-[var(--bg-zinc-100)] px-3 py-1 text-[var(--text-zinc-700)]">
                    월 회전율 · 순증감 · 총이동
                  </span>
                  <span className="rounded-full bg-[var(--bg-zinc-100)] px-3 py-1 text-[var(--text-zinc-700)]">
                    업종 중앙값 비교
                  </span>
                </div>
              </div>
              <div className="h-full">
                <div className="checklist-panel overflow-hidden p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-[var(--text-zinc-500)]">
                    <span className="rounded-full bg-[var(--brand-orange)] px-2 py-0.5 text-white font-medium text-[11px]">
                      지원 전 체크리스트
                    </span>
                    <span className="text-[10px] text-[var(--text-zinc-400)]">▼</span>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {[
                      {
                        t: "직원 수 변화",
                        d: "겉으로 보이는 증감만으로는 알 수 없는 움직임을 함께 확인해요.",
                      },
                      {
                        t: "실제 오간 사람",
                        d: "새로 들어온 사람과 나간 사람을 나눠서 봐요.",
                      },
                      {
                        t: "업종 대비 위치",
                        d: "같은 업종 회사들과 비교해 어느 정도인지 보여드려요.",
                      },
                    ].map((item, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="shrink-0 mt-0.5 rounded-full bg-[var(--brand-orange)]/10 p-1 text-[var(--brand-orange)]">
                          <svg
                            className="h-4 w-4"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-zinc-900)]">
                            {item.t}
                          </p>
                          <p className="text-sm text-[var(--text-zinc-500)]">{item.d}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 제공 정보 섹션 B ===== */}
        <section
          id="features-section"
          className="section-gap-pc scroll-mt-24"
        >
          <div className="mx-auto max-w-[1100px]">
            <h2 className="mb-2 text-balance text-[34px] font-bold text-[var(--text-zinc-900)] sm:text-[38px]">
              지원 전에 살펴볼 세 가지 정보
            </h2>
            <p className="mb-10 max-w-[680px] text-[var(--text-zinc-500)]">
              <span className="text-[var(--brand-orange)]">Work-Signal</span>이 제공하는 핵심 정보는 인력 현황, 인력 이동,
              업종 비교 세 가지입니다.
            </p>
            <div className="grid gap-5 sm:grid-cols-3">
              {[
                {
                  icon: (
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
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  ),
                  title: "인력 현황",
                  desc: "국민연금에 가입된 직원 수와 당월 순증감(들어온 사람- 나간 사람)을 보여드려요. 회사가 실제로 커졌는지, 줄었는지 확인할 수 있습니다.",
                },
                {
                  icon: (
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
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  ),
                  title: "인력 이동",
                  desc: "새로 들어온 사람(신규)과 나간 사람(상실)을 나눠서 보여드려요. 순증감은 같아 보여도 안팎으로 많은 사람이 오갈 수 있습니다.",
                },
                {
                  icon: (
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
                      <rect width="7" height="7" x="3" y="3" rx="1" />
                      <rect width="7" height="7" x="14" y="3" rx="1" />
                      <rect width="7" height="7" x="14" y="14" rx="1" />
                      <rect width="7" height="7" x="3" y="14" rx="1" />
                    </svg>
                  ),
                  title: "업종 비교",
                  desc: "같은 업종에 속한 다른 사업장들의 중앙값과 비교해, 이 회사의 인력 이동이 어느 정도 위치인지 알려드려요.",
                },
              ].map((f) => (
                <div
                  key={f.title}
                  className="group relative overflow-hidden rounded-[18px] border border-[var(--border-default)] bg-[var(--bg-card)] p-6 shadow-sm transition-colors hover:border-[var(--brand-orange)]/40"
                >
                  <div className="shrink-0 rounded-xl bg-[var(--brand-orange)]/10 p-3">
                    <span className="mx-auto h-5 w-5 text-center text-[var(--brand-orange)]">
                      {f.icon}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-[var(--text-zinc-900)]">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-zinc-600)] leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 이용 방법 섹션 C ===== */}
        <section
          id="howto-section"
          className="section-gap-pc scroll-mt-24"
        >
          <div className="mx-auto max-w-[1100px]">
            <h2 className="mb-2 text-balance text-[34px] font-bold text-[var(--text-zinc-900)] sm:text-[38px]">
              검색부터 확인까지, 세 단계면 충분해요
            </h2>
            <p className="mb-10 max-w-[680px] text-[var(--text-zinc-500)]">
              회사 이름을 검색하고, 원하는 사업장을 고른 뒤, 지표와 해설을
              확인하면 됩니다.
            </p>
            <div className="relative grid gap-6 sm:grid-cols-3">
              {/* 연결선 — 데스크톱 */}
              <div className="absolute top-10 left-[12%] right-[12%] h-px bg-[var(--border-default)] hidden sm:block" aria-hidden="true" />
              {[
                {
                  n: "01",
                  t: "회사 검색",
                  d: "알고 있는 회사명이나 법인명을 검색창에 입력해요. 국민연금 데이터와 동봉 데이터에서 일치하는 사업장을 찾아드려요.",
                },
                {
                  n: "02",
                  t: "사업장 선택",
                  d: "검색 결과에서 확인하려는 사업장을 골라요. 여러 후보가 나오면 사업장명과 소재지를 확인하고 선택하세요.",
                },
                {
                  n: "03",
                  t: "지표 확인",
                  d: "월 회전율, 순증감, 총이동, 업종 내 위치 등 핵심 지표와 지원자 관점 해설을 함께 볼 수 있어요.",
                },
              ].map((step) => (
                <div key={step.n} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-orange)]/10 text-sm font-bold text-[var(--brand-orange)]">
                      {step.n}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-zinc-900)]">
                        {step.t}
                      </h3>
                      <p className="mt-2 text-sm text-[var(--text-zinc-600)] leading-relaxed">
                        {step.d}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== 데이터 안내 섹션 D ===== */}
        <section className="section-gap-pc scroll-mt-24">
          <div className="mx-auto max-w-[1100px]">
            <h2 className="mb-2 text-balance text-[34px] font-bold text-[var(--text-zinc-900)] sm:text-[38px]">
              숫자의 의미와 한계도 함께 알려드려요
            </h2>
            <p className="mb-6 max-w-[680px] text-[var(--text-zinc-500)]">
              <span className="text-[var(--brand-orange)]">Work-Signal</span>이 보여드리는 수치는 참고용이며, 기업의 안정성이나
              채용 가능성을 보장하지 않습니다.
            </p>
            <div className="overflow-hidden rounded-[16px] bg-[var(--bg-zinc-50)] p-6 shadow-sm">
              <div className="grid gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-zinc-900)]">
                    데이터 출처
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm text-[var(--text-zinc-600)]">
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[var(--brand-orange)]">•</span>
                      <span>
                        국민연금 가입자 및 사업장 정보 (공공데이터 API)
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[var(--brand-orange)]">•</span>
                      <span>
                        동봉 데이터: 2026년 7월 기준 전국 52,957곳 가입자
                        30명 이상 사업장
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-zinc-900)]">
                    기준 시점
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-zinc-600)]">
                    진단 결과는 조회 시점에 확보한 최근 12개월 기록을 기준으로
                    계산됩니다. 기준월과 자료 출처는 결과 화면에 표시됩니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-zinc-900)]">
                    추정치의 한계
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-zinc-600)] leading-relaxed">
                    월 회전율과 업종배수는 행정 기록에서 계산한 참고 수치입니다.
                    실제 채용·퇴사와는 다를 수 있으며, 1월·7월은 공공기관
                    정기 인사이동이 섞여 수치가 높게 보일 수 있습니다.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-zinc-900)]">
                    해석 주의사항
                  </h3>
                  <p className="mt-2 text-sm text-[var(--text-zinc-600)] leading-relaxed">
                    회전율이나 업종배수가 높다고 해서 나쁜 회사라는 뜻은
                    아닙니다. 숫자만으로 기업의 안정성이나 근무 조건을 판단하지
                    말고, 실제 관심사와 함께 참고 자료로 활용하세요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 마지막 검색 유도 영역 ===== */}
        <section className="section-gap-pc scroll-mt-24">
          <div className="mx-auto max-w-[960px]">
            <div className="relative overflow-hidden rounded-[24px] border border-[var(--border-default)] bg-[var(--brand-orange-bright)] p-8 sm:p-10 shadow-sm">
              {/* 모서리 장식 */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--brand-hero-edge)] blur-[2rem] opacity-70" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-[var(--brand-orange)]/30 blur-[1rem] opacity-60" aria-hidden="true" />

              <div className="relative">
                <h2 className="text-balance text-[28px] font-bold text-[var(--text-zinc-900)] sm:text-[32px]">
                  관심 있는 기업,{" "}
                  <span className="text-[var(--brand-orange)]">Work-Signal</span>로 살펴보세요
                </h2>
                <p className="mt-3 max-w-2xl text-[var(--text-zinc-500)] sm:text-lg">
                  회사명 하나만 입력하면 인력 흐름과 업종 비교를 바로 확인할 수 있어요.
                </p>
                <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <a
                    href="#search-hero"
                    className="btn-filled-orange"
                  >
                    <svg
                      className="h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.3-4.3" />
                    </svg>
                    기업 검색하기
                  </a>
                  <span className="text-xs text-[var(--text-zinc-500)]">
                    위 내비게이션 또는 아래 검색창으로 이동할 수 있어요
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form
                onSubmit={handleSearch}
                className="flex w-full max-w-[560px] overflow-hidden rounded-[14px] border border-[var(--border-default)] bg-white shadow-sm focus-within:border-[var(--brand-orange)] focus-within:ring-2 focus-within:ring-[var(--brand-orange)]/50"
              >
                <input
                  className="flex-1 min-w-0 border-0 bg-transparent px-4 py-[13px] text-[15px] text-[var(--foreground)] placeholder-[var(--text-zinc-400)] focus:outline-none"
                  type="text"
                  placeholder="회사·사업장명을 입력하세요"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  aria-label="회사명 입력"
                />
                <button
                  className="shrink-0 self-stretch bg-[var(--brand-orange)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--brand-orange-dark)] focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={loading || !company.trim()}
                >
                  검색
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* 푸터 */}
        <footer className="mt-24 border-t border-[var(--border-default)] bg-[var(--bg-card)] py-10">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-4 px-5 text-sm text-[var(--text-zinc-500)] sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <div className="flex items-center gap-2">
              <span className="brand-mark text-[var(--brand-black)] font-bold text-[18px] sm:text-[20px]">
                Work-
              </span>
              <span className="brand-mark text-[var(--brand-orange)] font-bold text-[18px] sm:text-[20px]">
                Signal
              </span>
              <span className="ml-2 text-xs">— 기업 인력 흐름 확인</span>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-[var(--text-zinc-500)]">
              국민연금 공공데이터와 동봉 데이터를 바탕으로 인력 이동을 정리해 보여드립니다. <br></br>
              수치는 참고용이며 기업의 안정성이나 채용 가능성을 보장하지 않습니다.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
