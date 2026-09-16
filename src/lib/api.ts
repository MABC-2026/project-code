export async function callApi(body: Record<string, unknown>) {
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
}

export async function callNpsSearch(wkplNm: string) {
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
}

export async function requestExplain(diag: unknown, meta: unknown) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      진단결과: diag,
      추이: (meta as any)?.추이,
      자료년월: (meta as any)?.자료년월,
      계절성주의: (meta as any)?.계절성주의,
      입력_출처: (meta as any)?.입력_출처,
      원본_업종명: (meta as any)?.원본_업종명,
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.사유 || `HTTP ${res.status}`);
  return j;
}

export async function sampleDiagnose(companyName: string): Promise<unknown> {
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
        if (pickData.ok && pickData.진단결과) return pickData.진단결과;
      }
    }
    return "없음";
  } catch {
    return "없음";
  }
}
