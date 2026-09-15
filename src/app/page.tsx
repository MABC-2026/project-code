"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import TrendTable from "@/components/TrendTable";
import ExplainCard from "@/components/ExplainCard";
import AgentSteps, { type AgentStep } from "@/components/AgentSteps";
import HiringInsight from "@/components/HiringInsight";
import CompareTable, { type CompareEntry } from "@/components/CompareTable";
export default function Home() {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [phase, setPhase] = useState<"search" | "candidates" | "result" | "report" | "compare">("search");
  const [candidates, setCandidates] = useState<Array<{
    번호: number;
    사업장명: string;
    업종?: string;
    seq?: string;
    시도?: string;
    가입자수?: number;
    source: "nps" | "csv";
    wkplNm?: string;
    bzowrRgstNo?: string;
    주소?: string;
    기준월?: string;
  }>>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState(10);
  const [compareList, setCompareList] = useState<CompareEntry[]>([]);
  const [explain, setExplain] = useState<{ loading: boolean; error: string | null; data: any }>({ loading: false, error: null, data: null });
  const explainSeq = useRef(0);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  // 같은 단계의 마지막 기록이 "진행"이면 그 기록을 새 상태로 바꾸고, 아니면 새 기록을 붙인다
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
  const [resultMeta, setResultMeta] = useState<{
    입력_출처?: string;
    자료년월?: string;
    계절성주의?: boolean;
    업종기준선_일치?: boolean;
    안내문?: string;
    원본_업종명?: string;
    추이?: any;
    실패한달?: any;
    제외한달?: any;
    대체사유?: string;
  } | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);

  const callApi = useCallback(async (body: Record<string, any>) => {
    const res = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      let detail = "";
      try { detail = JSON.parse(txt).error || ""; } catch { detail = ""; }
      throw new Error(detail || `진단 서버 응답 오류 (HTTP ${res.status})`);
    }
    return res.json();
  }, []);

  const requestExplain = useCallback(async (diag: any, meta: any) => {
    const id = ++explainSeq.current;
    setExplain({ loading: true, error: null, data: null });
    logStep("해설", "진행", "Solar Pro 4가 계산 결과를 읽고 지원자 관점 해설을 쓰고 있어요");
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 진단결과: diag, 추이: meta?.추이, 자료년월: meta?.자료년월, 계절성주의: meta?.계절성주의, 입력_출처: meta?.입력_출처, 원본_업종명: meta?.원본_업종명 }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.사유 || `HTTP ${res.status}`);
      if (id === explainSeq.current) setExplain({ loading: false, error: null, data: j });
      if (id === explainSeq.current) logStep("해설", "완료", `사실 ${(j.사실목록 || []).length}개를 근거로 ${((j.소요ms || 0) / 1000).toFixed(1)}초 만에 썼어요` + (j.걸러낸문장수 ? ` · 기준에 안 맞는 문장 ${j.걸러낸문장수}개는 뺐어요` : ""));
    } catch (e: any) {
      if (id === explainSeq.current) setExplain({ loading: false, error: e.message || "해설 요청 실패", data: null });
      if (id === explainSeq.current) logStep("해설", "주의", `해설을 쓰지 못했어요 (${e.message || "해설 요청 실패"})`);
    }
  }, []);

  // 진단 결과가 바뀌면 해설을 부르고, 결과가 사라지면(뒤로·새 검색) 해설을 비운다
  useEffect(() => {
    if (!result) {
      explainSeq.current++;
      setExplain({ loading: false, error: null, data: null });
      return;
    }
    requestExplain(result, resultMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const callNpsSearch = useCallback(async (wkplNm: string) => {
    const params = new URLSearchParams({
      wkplNm: wkplNm.trim(),
      dataType: "json",
      pageNo: "1",
    });
    const res = await fetch(`/api/nps/search?${params.toString()}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      let detail = "";
      try { detail = JSON.parse(txt).error || ""; } catch { detail = ""; }
      throw new Error(detail || `검색 서버 응답 오류 (HTTP ${res.status})`);
    }
    return res.json();
  }, []);

  const sampleDiagnose = useCallback(async (companyName: string): Promise<any> => {
    try {
      const data = await callApi({ company: companyName, csvPath: "sample_workplaces.csv" });
      if (!data.ok) return "없음";
      if (data.진단결과) return data.진단결과;
      if (data.회사_미발견) return "없음";
      if (data.후보목록 && data.후보목록.length > 0) {
        const exact = data.후보목록.find((c: any) => c.사업장명 === companyName);
        if (exact && exact.번호 != null) {
          const pickData = await callApi({ company: companyName, csvPath: "sample_workplaces.csv", pick: exact.번호 });
          if (pickData.ok && pickData.진단결과) return pickData.진단결과;
        }
      }
      return "없음";
    } catch {
      return "없음";
    }
  }, [callApi]);

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return;
    setLoading(true);
    setError(null);
    setPhase("search");
    setCandidates([]);
    setResult(null);
    setReport(null);
    setResultMeta(null);
    setLoadingText(null);
    try {
      setLoadingText("공공데이터에서 사업장을 찾는 중입니다 (10초 정도 걸립니다)");
      setSteps([]);
      logStep("검색", "진행", `공공데이터에서 '${company.trim()}' 이름이 들어간 사업장을 찾고 있어요`);
        // 1단계: 공공데이터포털 NPS API로 실제 사업장명 검색
      let npsResult: { items?: Array<{ seq?: number; wkplNm?: string; wkplRoadNmDtlAddr?: string; bzowrRgstNo?: string; dataCrtYm?: string; wkplJnngStcd?: string; 가입자수?: number | null; 업종?: string | null }>; totalCount?: number; error?: string } | null = null;
      try {
        npsResult = await callNpsSearch(company);
      } catch (npsErr: any) {
        console.warn("[검색] NPS API 호출 실패, CSV 폴백 사용:", npsErr.message);
      }

      if (npsResult && npsResult.items && npsResult.items.length > 0) {
      const 검색어들: string[] = (npsResult as any).검색어 || [];
      const 한글읽기 = 검색어들.find((q) => q !== company.trim() && !q.includes("주식회사") && !q.includes("(주)"));
      logStep("검색", "완료", `후보 ${npsResult.items.length}곳을 찾았어요 · 법인 표기를 바꿔 ${검색어들.length}가지로 찾았어요` + (한글읽기 ? ` · ‘${company.trim()}’ → ‘${한글읽기}’로도 찾았어요` : ""));
        setCandidates(
          npsResult.items.map((it, i) => ({
            번호: i + 1,
            사업장명: it.wkplNm || "(이름 미상)",
            seq: it.seq != null ? String(it.seq) : undefined,
            시도: it.wkplRoadNmDtlAddr ? it.wkplRoadNmDtlAddr.split(" ")[0] || "" : "",
            source: "nps" as const,
            wkplNm: it.wkplNm || undefined,
            bzowrRgstNo: it.bzowrRgstNo || undefined,
            주소: it.wkplRoadNmDtlAddr || undefined,
            기준월: it.dataCrtYm
              ? it.dataCrtYm.length === 6
                ? it.dataCrtYm.slice(0, 4) + "-" + it.dataCrtYm.slice(4, 6)
                : it.dataCrtYm
              : undefined,
            가입자수: typeof it.가입자수 === "number" ? it.가입자수 : undefined,
            업종: it.업종 && it.업종 !== "BIZ_NO미존재사업장" ? it.업종 : undefined,
          }))
        );
        setPhase("candidates");
        return;
      }

      // NPS 결과 없음 → CSV 파일에서 직접 검색
      logStep("검색", "주의", "공공데이터 검색에서 찾지 못해 동봉 데이터(2026-07, 52,957곳)에서 찾아요");
      const data = await callApi({ company, csvPath: "sample_workplaces.csv" });
      if (!data.ok) throw new Error(data.error || "응답 이상");
      if (data.회사_미발견) {
        setError("해당 이름의 사업장을 찾지 못했습니다.\n\n국민연금 가입 사업장명은 법인명 기준이라 브랜드명과 다를 수 있습니다.");
        setPhase("search");
        return;
      }
      if (data.진단결과) {
        setResult(data.진단결과);
        setPhase("result");
        return;
      }
      if (data.후보목록 && data.후보목록.length > 0) {
        setCandidates(
          data.후보목록.map((c: any, i: number) => ({
            ...c,
            source: "csv" as const,
            wkplNm: c.사업장명,
          }))
        );
        setPhase("candidates");
        setPick(null);
        return;
      }
      setError("해당 이름의 사업장을 찾지 못했습니다.\n\n국민연금 가입 사업장명은 법인명 기준이라 브랜드명과 다를 수 있습니다.");
      setPhase("search");
    } catch (err: any) {
      setError(err.message || "검색 중 오류");
      setPhase("search");
    } finally {
      setLoading(false);
    }
  }, [company, callApi, callNpsSearch, logStep]);

  const handlePick = useCallback(async (번호: number) => {
    const c = candidates.find((c) => c.번호 === 번호);
    if (!c) {
      setError("후보가 없습니다.");
      setPhase("search");
      return;
    }
    setLoading(true);
    setError(null);
    setPhase("search");
    setResultMeta(null);
    setLoadingText(null);
    try {
      if (c.source === "nps") {
        setLoadingText("최근 12개월 국민연금 자료를 불러오는 중입니다 (5초 정도 걸립니다)");
        setSteps((prev) => prev.filter((s) => s.단계 === "검색"));
        logStep("수집", "진행", `‘${c.사업장명}’의 최근 12개월 국민연금 기록을 모으고 있어요`);
        const wpParams = new URLSearchParams({
          name: c.사업장명,
          bizno: c.bzowrRgstNo || "",
          addr: c.주소 || "",
          ...(c.seq ? { seq: c.seq } : {}),
        });
        let workplaceFailReason: string | null = null;
        let workplaceRows: any[] | null = null;
        let workplaceFailedMonths: any = null;
        try {
          const wpRes = await fetch(`/api/nps/workplace?${wpParams.toString()}`);
          const wpJson = (await wpRes.json().catch(() => null)) || {};
          if (!wpRes.ok || !wpJson.ok) {
            throw new Error(
              (wpJson && wpJson.사유) ||
                wpJson.error ||
                `HTTP ${wpRes.status}`
            );
          }
          workplaceRows = wpJson.rows;
          workplaceFailedMonths = wpJson.실패한달;
          logStep("수집", "완료", `${(wpJson.rows || []).length}개월 기록을 받았어요 · 공공 API ${wpJson.api호출수 ?? "?"}번 호출` + ((wpJson.실패한달 || []).length > 0 ? ` · 못 받은 달 ${(wpJson.실패한달 || []).length}개` : ""));
        } catch (wpErr: any) {
          workplaceFailReason = "12개월 기록 수집 실패 — " + (wpErr.message || "공공데이터 조회 실패");
          logStep("수집", "주의", workplaceFailReason);
        }

        if (workplaceRows) {
          try {
            logStep("계산", "진행", "예선 스킬(stability.py)로 회전율을 계산하고 같은 업종 기준선과 비교하고 있어요");
            const diagData = await callApi({ rows: workplaceRows });
            if (diagData.진단결과) {
              const 월회전율글자 = (diagData.진단결과.월회전율 * 100).toFixed(1);
              logStep("계산", "완료", diagData.진단결과.업종위치
                ? `같은 업종 ${diagData.진단결과.업종위치.비교사업장수}곳과 비교했어요 · 월 회전율 ${월회전율글자}%`
                : `업종 기준선에 없는 업종이라 업종 비교는 뺐어요 · 월 회전율 ${월회전율글자}%`);
              setResult(diagData.진단결과);
              setResultMeta({
                입력_출처: diagData.입력_출처,
                자료년월: diagData.자료년월,
                계절성주의: diagData.계절성주의,
                업종기준선_일치: diagData.업종기준선_일치,
                안내문: diagData.안내문,
                원본_업종명: diagData.원본_업종명,
                추이: diagData.추이,
                제외한달: diagData.제외한달,
                실패한달: workplaceFailedMonths,
              });
              setPhase("result");
              return;
            }
          } catch (diagErr: any) {
            workplaceFailReason = "진단 계산 실패 — " + (diagErr.message || "진단 요청 실패");
            logStep("계산", "주의", workplaceFailReason);
          }
        }

        // workplace 실패 또는 진단 실패 → 샘플 진단 도우미로 대체
        if (workplaceFailReason) {
          logStep("계산", "진행", "동봉 데이터(2026-07)로 대신 계산하고 있어요");
          const sampleResult = await sampleDiagnose(c.사업장명);
          if (sampleResult && sampleResult !== "없음") {
            setResult(sampleResult);
            setResultMeta({
              입력_출처: "동봉 샘플",
              계절성주의: true,
              대체사유: workplaceFailReason,
            });
            setPhase("result");
            setSteps((prev) => prev.map((s) => (s.단계 === "계산" && s.상태 === "진행" ? { ...s, 상태: "완료" as const, 내용: "동봉 데이터(2026-07)로 계산을 마쳤어요" } : s)));
            return;
          }
          setError(`공공데이터로 진단하지 못했어요 (${workplaceFailReason}). 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에도 없는 사업장이에요.`);
          setPhase("search");
          return;
        }
      }

      // CSV 후보: 샘플 진단 도우미 사용
      if (c.source === "csv") {
        setSteps((prev) => prev.filter((s) => s.단계 === "검색"));
        logStep("계산", "진행", "동봉 데이터(2026-07)에서 계산하고 있어요");
        const sampleResult = await sampleDiagnose(c.사업장명);
        if (sampleResult && sampleResult !== "없음") {
          setResult(sampleResult);
          setResultMeta({
              입력_출처: "동봉 샘플",
              계절성주의: true,
            });
          setPhase("result");
          setSteps((prev) => prev.map((s) => (s.단계 === "계산" && s.상태 === "진행" ? { ...s, 상태: "완료" as const, 내용: "동봉 데이터(2026-07)로 계산을 마쳤어요" } : s)));
          return;
        }
        setError(`${c.사업장명}은(는) 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에 없는 사업장입니다.`);
        setPhase("search");
        return;
      }

      setError("진단 결과를 받지 못했습니다.");
      setPhase("search");
    } catch (err: any) {
      setError(err.message || "선택 중 오류");
      setPhase("search");
    } finally {
      setLoading(false);
    }
  }, [company, callApi, candidates, sampleDiagnose, logStep]);

  const handleShowReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPhase("search");
    try {
      setSteps([]);
      const data = await callApi({ csvPath: "sample_workplaces.csv", top });
      if (!data.ok) throw new Error(data.error || "응답 이상");
      setReport(data);
      setPhase("report");
    } catch (err: any) {
      setError(err.message || "리포트 조회 중 오류");
      setPhase("search");
    } finally {
      setLoading(false);
    }
  }, [top, callApi]);

  const fmtNum = (n: number) => n.toLocaleString("ko-KR");
  const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(company.trim() + " 법인명")}`;
  const fmtPercentRatio = (ratio: number) => (ratio * 100).toFixed(1) + "%";
  const fmtPercentValue = (pct: number) => pct.toFixed(1) + "%";
  const fmtMultiple = (n: number) => n.toFixed(1) + "배";
  const fmtSuppressed = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "배";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-6">
      <h1 className="text-[3.1rem] font-extrabold text-center leading-tight">
        <span className="text-zinc-900">Work-</span>
        <span className="text-amber-600">Signal</span>
      </h1>
      <div className="mt-1">
        <p className="text-base text-zinc-500 text-center max-w-2xl">
          지원하려는 회사의 인력 흐름을 입사 전에 확인해보세요.<br/>
          직원이 얼마나 들어오고 나갔는지, 같은 업종과 비교해 쉽게 보여드려요.
        </p>
      </div>

      {error && (
        <div className="w-full max-w-md rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 whitespace-pre-line">
          {error}
        </div>
      )}
      {error && error.startsWith("해당 이름의 사업장을 찾지 못했습니다") && company.trim() && (
        <p className="text-xs text-zinc-500">찾는 회사가 없나요? <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-600 underline">'{company.trim()}' 법인명 검색해 보기 ↗</a></p>
      )}

      {loading && steps.length > 0 && <AgentSteps steps={steps} />}
      {loading && steps.length === 0 && loadingText && (
        <p className="text-zinc-400 text-sm">{loadingText}</p>
      )}

      {phase === "search" && (
        <>
          <form onSubmit={handleSearch} className="flex w-full max-w-md gap-2">
            <input
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
              type="text"
              placeholder="회사·사업장명을 입력하세요 (예: 기아, 쿠팡)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
            <button
              className="rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-50"
              type="submit"
              disabled={loading || !company.trim()}
            >
              검색
            </button>
          </form>
          <div className="mt-2">
            <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800">
                정확한 법인명을 모르시나요?
              </p>
              <p className="text-sm text-amber-700 mt-1">
                '[알고 있는 회사명] + 회사'로 검색해 법인명을 확인해주세요
              </p>
              <p className="text-xs text-amber-600 mt-1">
                예) 토스 회사→ 비바리퍼블리카 / 배민 회사→ 우아한형제들
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                *KT, LG 같은 영문 약자는 케이티, 엘지로도 검색해 보세요
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 hover:bg-zinc-100"
              onClick={handleShowReport}
              disabled={loading}
            >
              전체 리포트 보기 (52,957곳)
            </button>
            {compareList.length >= 1 && (
              <button
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 hover:bg-zinc-100"
                onClick={() => setPhase("compare")}
              >
                회사 비교 ({compareList.length}곳)
              </button>
            )}
          </div>
        </>
      )}

      {phase === "candidates" && candidates.length > 0 && (
        <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4">
          <p className="mb-3 text-sm text-zinc-500">
            {candidates.length > 0 && candidates[0]?.source === "nps"
              ? `NPS 공공데이터에서 "${company}" 관련 ${candidates.length}건을 찾았습니다. 번호를 선택하면 해당 사업장을 진단합니다.`
              : `검색어 "${company}" 에 대해 ${candidates.length}건의 후보가 있습니다. 번호를 선택하면 해당 사업장을 진단합니다.`}
          </p>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.번호} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="rounded-lg bg-zinc-200 px-2 py-0.5 text-sm font-medium text-zinc-700">{c.번호}</span>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900">{c.사업장명}</div>
                    <div className="text-xs text-zinc-500">
                      {c.source === "nps"
                        ? [c.업종, c.가입자수 != null ? `가입자 ${fmtNum(c.가입자수)}명` : undefined, c.주소, c.기준월 ? `기준월 ${c.기준월}` : undefined].filter(Boolean).join(" · ")
                        : `동봉 데이터${c.시도 ? ` · ${c.시도}` : ""}${c.가입자수 != null ? ` · 가입자 ${fmtNum(c.가입자수)}명` : ""}`}
                    </div>
                  </div>
                </div>
                <button
                  className="rounded-lg bg-zinc-900 px-3 py-1 text-sm text-white hover:bg-zinc-700"
                  onClick={() => handlePick(c.번호)}
                  disabled={loading}
                >
                  진단
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">찾는 회사가 없나요? <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-600 underline">'{company.trim()}' 법인명 검색해 보기 ↗</a></p>
          <button
            className="mt-3 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
            onClick={() => { setPhase("search"); setCompany(""); setResultMeta(null); setLoadingText(null); }}
          >
            뒤로
          </button>
        </div>
      )}

      {phase === "result" && result && (
        <div className="w-full max-w-2xl rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-1 text-lg font-semibold text-zinc-900">{result.사업장명}</h2>
          {resultMeta?.대체사유 ? (
            <div className="mt-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                공공데이터로 진단하지 못해 동봉 데이터(2026-07)로 보여드려요 — 사유: {resultMeta.대체사유}
              </div>
          ) : null}
          <p className="text-sm text-zinc-500 mt-1">
            {resultMeta?.입력_출처 === "공공데이터" || resultMeta?.입력_출처 === "공공데이터 API"
              ? `공공데이터 API · 기준월 ${resultMeta?.자료년월 || ""}`
              : "동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)"}
          </p>
          {resultMeta?.계절성주의 && (
            <p className="text-sm text-zinc-600 mt-1">7월·1월 자료는 공공기관 정기 인사이동이 섞여 회전율이 높게 나올 수 있습니다</p>
          )}
          <AgentSteps steps={steps} compact />
              <ExplainCard loading={explain.loading} error={explain.error} data={explain.data} 진단결과={result} 추이={resultMeta?.추이} />
          <HiringInsight rows={resultMeta?.추이} />

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
                  if (candidates.length > 0) {
                    setPhase("candidates");
                  } else {
                    setPhase("search");
                    setCompany("");
                  }
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
                  onClick={() => setPhase("compare")}
                >
                  회사 비교 보기 ({compareList.length}곳)
                </button>
              )}
            </div>
        </div>
      )}

      {phase === "compare" && (
        <div className="w-full max-w-4xl rounded-lg border border-zinc-200 bg-white p-4">
          <CompareTable
            entries={compareList}
            onRemove={(name) =>
              setCompareList((prev) =>
                prev.filter((e) => e.사업장명 !== name),
              )
            }
            onClear={() => setCompareList([])}
          />
          <button
            className="mt-4 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
            onClick={() =>
              setPhase(result ? "result" : "search")
            }
          >
            뒤로
          </button>
        </div>
      )}

      {phase === "report" && report && (
        <div className="w-full max-w-4xl rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            전체 리포트 — 동봉 데이터 ({report.분석대상수}개소 분석)
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-zinc-500">자료년월</dt>
            <dd className="text-zinc-900">{report.자료년월} {report.계절성주의 ? " ⚠️ 공공기관 정기 인사이동 시기" : ""}</dd>
            <dt className="text-zinc-500">월 회전율 중앙값</dt>
            <dd className="text-zinc-900">{fmtPercentRatio(report.summary.월회전율중앙값)} (연환산 {fmtPercentValue(report.summary.연환산중앙값)})</dd>
            <dt className="text-zinc-500">총원 그대로인데 대량 이동</dt>
            <dd className="text-zinc-900">{report.summary.총원은그대로대량이동_개수}개소 ({report.summary.총원은그대로대량이동_비율}%)</dd>
            <dt className="text-zinc-500">해석 주의 사업장</dt>
            <dd className="text-zinc-900">{report.summary.해석주의_사업장수}개소</dd>
            <dt className="text-zinc-500">기준선 출처</dt>
            <dd className="text-zinc-900">{report.기준선출처}</dd>
            <dt className="text-zinc-500">업종 기준선 수</dt>
            <dd className="text-zinc-900">{report.업종기준선개수}개 업종</dd>
            <dt className="text-zinc-500">업종 간 편차 배수</dt>
            <dd className="text-zinc-900">{fmtMultiple(report.업종간편차배수)}</dd>
          </dl>

          <div className="mt-4">
            <p className="mb-2 font-medium text-zinc-900">총원이 숨긴 인력 이동 — 업종배수 상위</p>
            {report.총원숨긴이동_상위.length > 0 ? (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-300 text-zinc-500">
                    <th className="text-left py-1 pr-2">사업장</th>
                    <th className="text-left py-1 pr-2">업종</th>
                    <th className="text-right py-1 pr-2">가입자</th>
                    <th className="text-right py-1 pr-2">순증감</th>
                    <th className="text-right py-1 pr-2">총이동</th>
                    <th className="text-right py-1 pr-2">업종배수</th>
                    <th className="text-right py-1">은폐지수</th>
                  </tr>
                </thead>
                <tbody>
                  {report.총원숨긴이동_상위.map((r: any) => (
                    <tr key={r.사업장명} className="border-b border-zinc-100">
                      <td className="py-1 pr-2 font-medium text-zinc-900">{r.사업장명}</td>
                      <td className="py-1 pr-2 text-zinc-600">{r.업종}</td>
                      <td className="text-right py-1 pr-2 text-zinc-900">{fmtNum(r.가입자수)}</td>
                      <td className="text-right py-1 pr-2 text-zinc-900">{r.순증감 >= 0 ? "+" : ""}{fmtNum(r.순증감)}</td>
                      <td className="text-right py-1 pr-2 text-zinc-900">{fmtNum(r.총이동)}</td>
                      <td className="text-right py-1 pr-2 font-medium text-zinc-900">{fmtMultiple(r.업종배수)}</td>
                      <td className="text-right py-1 text-zinc-900">{fmtSuppressed(r.은폐지수)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-zinc-500">조건을 만족하는 사업장이 없습니다.</p>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-2 font-medium text-zinc-900">업종 내 회전율 상위 (업종 중앙값 대비)</p>
            {report.업종대비_상위.length > 0 ? (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-300 text-zinc-500">
                    <th className="text-left py-1 pr-2">사업장</th>
                    <th className="text-left py-1 pr-2">업종</th>
                    <th className="text-right py-1 pr-2">가입자</th>
                    <th className="text-right py-1 pr-2">월회전율</th>
                    <th className="text-right py-1 pr-2">업종중앙값</th>
                    <th className="text-right py-1">배수</th>
                  </tr>
                </thead>
                <tbody>
                  {report.업종대비_상위.map((r: any) => (
                    <tr key={r.사업장명} className="border-b border-zinc-100">
                      <td className="py-1 pr-2 font-medium text-zinc-900">{r.사업장명}</td>
                      <td className="py-1 pr-2 text-zinc-600">{r.업종}</td>
                      <td className="text-right py-1 pr-2 text-zinc-900">{fmtNum(r.가입자수)}</td>
                      <td className="text-right py-1 pr-2 text-zinc-900">{fmtPercentValue(r.월회전율)}</td>
                      <td className="text-right py-1 pr-2 text-zinc-900">{fmtPercentValue(r.업종중앙값)}</td>
                      <td className="text-right py-1 font-medium text-zinc-900">{fmtMultiple(r.배수)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-zinc-500">조건을 만족하는 사업장이 없습니다.</p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
              onClick={() => setPhase("search")}
            >
              뒤로
            </button>
            <button
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
              onClick={() => { setPhase("search"); setReport(null); }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {phase === "search" && !error && (
        <>
          {/* placeholder for spacing */}
        </>
      )}
    </main>
  );
}
