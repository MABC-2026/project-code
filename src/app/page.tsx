"use client";

import { useState, useCallback } from "react";
export default function Home() {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [phase, setPhase] = useState<"search" | "candidates" | "result" | "report">("search");
  const [candidates, setCandidates] = useState<Array<{
    번호: number;
    사업장명: string;
    업종?: string;
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
  const [resultMeta, setResultMeta] = useState<{
    입력_출처?: string;
    자료년월?: string;
    계절성주의?: boolean;
    업종기준선_일치?: boolean;
    안내문?: string;
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
      try { detail = JSON.parse(txt).error || txt; } catch { detail = txt; }
      throw new Error(detail || `HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  const callNpsSearch = useCallback(async (wkplNm: string) => {
    const params = new URLSearchParams({
      wkplNm: wkplNm.trim(),
      dataType: "json",
      numOfRows: "10",
      pageNo: "1",
    });
    const res = await fetch(`/api/nps/search?${params.toString()}`);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      let detail = "";
      try { detail = JSON.parse(txt).error || txt; } catch { detail = txt; }
      throw new Error(detail || `HTTP ${res.status}`);
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
      // 1단계: 공공데이터포털 NPS API로 실제 사업장명 검색
      let npsResult: { items?: Array<{ seq?: number; wkplNm?: string; wkplRoadNmDtlAddr?: string; bzowrRgstNo?: string; dataCrtYm?: string; wkplJnngStcd?: string }>; totalCount?: number; error?: string } | null = null;
      try {
        npsResult = await callNpsSearch(company);
      } catch (npsErr: any) {
        console.warn("[검색] NPS API 호출 실패, CSV 폴백 사용:", npsErr.message);
      }

      if (npsResult && npsResult.items && npsResult.items.length > 0) {
        const npsItems = npsResult.items;
        const displayed = npsItems.slice(0, 10);
        setCandidates(
          displayed.map((it, i) => ({
            번호: i + 1,
            사업장명: it.wkplNm || "(이름 미상)",
            시도: it.wkplRoadNmDtlAddr ? it.wkplRoadNmDtlAddr.split(" ")[0] || "" : "",
            source: "nps" as const,
            wkplNm: it.wkplNm || undefined,
            bzowrRgstNo: it.bzowrRgstNo || undefined,
            주소: it.wkplRoadNmDtlAddr || undefined,
            기준월: it.dataCrtYm || undefined,
          }))
        );
        setPhase("candidates");
        return;
      }

      // NPS 결과 없음 → CSV 파일에서 직접 검색
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
  }, [company, callApi, callNpsSearch]);

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
        setLoadingText("최근 12개월 국민연금 자료를 불러오는 중입니다 (15초 정도 걸립니다)");
        const wpParams = new URLSearchParams({
          name: c.사업장명,
          bizno: c.bzowrRgstNo || "",
          addr: c.주소 || "",
        });
        let workplaceFailReason: string | null = null;
        let workplaceRows: any[] | null = null;
        let workplaceFailedMonths: any = null;
        try {
          const wpRes = await fetch(`/api/nps/workplace?${wpParams.toString()}`);
          if (!wpRes.ok) throw new Error(`HTTP ${wpRes.status}`);
          const wpData = await wpRes.json();
          if (!wpData.ok) throw new Error(wpData.사유 || wpData.error || "공공데이터 조회 실패");
          workplaceRows = wpData.rows;
          workplaceFailedMonths = wpData.실패한달;
        } catch (wpErr: any) {
          workplaceFailReason = wpErr.message || "공공데이터 조회 실패";
        }

        if (workplaceRows) {
          try {
            const diagData = await callApi({ rows: workplaceRows });
            if (diagData.진단결과) {
              setResult(diagData.진단결과);
              setResultMeta({
                입력_출처: diagData.입력_출처,
                자료년월: diagData.자료년월,
                계절성주의: diagData.계절성주의,
                업종기준선_일치: diagData.업종기준선_일치,
                안내문: diagData.안내문,
                추이: diagData.추이,
                제외한달: diagData.제외한달,
                실패한달: workplaceFailedMonths,
              });
              setPhase("result");
              return;
            }
          } catch (diagErr: any) {
            workplaceFailReason = diagErr.message || "진단 요청 실패";
          }
        }

        // workplace 실패 또는 진단 실패 → 샘플 진단 도우미로 대체
        if (workplaceFailReason) {
          const sampleResult = await sampleDiagnose(c.사업장명);
          if (sampleResult && sampleResult !== "없음") {
            setResult(sampleResult);
            setResultMeta({
              입력_출처: "동봉 샘플",
              대체사유: workplaceFailReason,
            });
            setPhase("result");
            return;
          }
          setError(`공공데이터 조회에 실패했고(${workplaceFailReason}), 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에도 없는 사업장입니다.`);
          setPhase("search");
          return;
        }
      }

      // CSV 후보: 샘플 진단 도우미 사용
      if (c.source === "csv") {
        const sampleResult = await sampleDiagnose(c.사업장명);
        if (sampleResult && sampleResult !== "없음") {
          setResult(sampleResult);
          setResultMeta({
            입력_출처: "동봉 샘플",
          });
          setPhase("result");
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
  }, [company, callApi, candidates, sampleDiagnose]);

  const handleShowReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPhase("search");
    try {
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
  const fmtPercentRatio = (ratio: number) => (ratio * 100).toFixed(1) + "%";
  const fmtPercentValue = (pct: number) => pct.toFixed(1) + "%";
  const fmtMultiple = (n: number) => n.toFixed(1) + "배";
  const fmtSuppressed = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "배";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-6">
      <h1 className="text-2xl font-semibold text-zinc-900">사업장 인력 안정성 진단</h1>
      <p className="text-zinc-500 text-center max-w-md">
        국민연금공단 가입 사업장 내역(공공데이터) 기준, 사업장별 인력 안정성 지표를 계산합니다.
      </p>

      {error && (
        <div className="w-full max-w-md rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 whitespace-pre-line">
          {error}
        </div>
      )}

      {loading && loadingText && (
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
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 hover:bg-zinc-100"
              onClick={handleShowReport}
              disabled={loading}
            >
              전체 리포트 보기 (52,957곳)
            </button>
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
                        ? `공공데이터 · ${c.주소 || ""} · 기준월 ${c.기준월 || ""}`
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
              공공데이터 조회에 실패해 동봉 데이터(2026-07)로 보여드립니다 — 사유: {resultMeta.대체사유}
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

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-zinc-500">업종 / 지역</dt>
            <dd className="text-zinc-900">{result.업종 || "-"} / {result.시도 || "-"}</dd>
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

          <div className="mt-4 text-sm text-zinc-600">
            {result.순증감 === 0
              ? `- 겉으로 보이는 총원 변화는 ${result.순증감 >= 0 ? "+" : ""}${fmtNum(result.순증감)}명으로 거의 없지만, 실제로는 ${fmtNum(result.총이동)}명(${fmtNum(result.신규)}명 들어오고 ${fmtNum(result.상실)}명 나감)이 오갔습니다.`
              : `- 당월 총원은 ${result.순증감 >= 0 ? "+" : ""}${fmtNum(result.순증감)}명 변했지만, 그 사이에 ${fmtNum(result.총이동)}명(${fmtNum(result.신규)}명 유입·${fmtNum(result.상실)}명 유출)이 사업장을 오갔습니다.`}
            <br />
            {resultMeta?.업종기준선_일치 !== false && (
              <>
                <br />
                - 이 사업장의 월 회전율 {fmtPercentRatio(result.월회전율)}는 업종 중앙값 {fmtPercentRatio(result.업종중앙값)}의 {fmtMultiple(result.업종배수)}로, 같은 업종 평균보다 {result.업종배수 >= 1.5 ? "빠릅니다" : "비슷하거나 느립니다"}.
              </>
            )}
            <br />
            - 은폐지수가 {fmtSuppressed(result.은폐지수)}라는 것은 총원 변화 {result.순증감 >= 0 ? "+" : ""}{fmtNum(result.순증감)}명 뒤에 실제로는 {fmtNum(result.총이동)}명이 움직였다는 뜻입니다.
          </div>

          <p className="mt-4 text-sm text-zinc-600">
            {resultMeta?.안내문 || "본 수치는 공식 통계가 아니라 조회 시점의 행정 기록입니다"}
          </p>

          <button
            className="mt-4 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-700 hover:bg-zinc-100"
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
