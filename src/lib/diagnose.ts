import { callApi, callNpsSearch, requestExplain, sampleDiagnose } from "./api";
import type { AgentStep } from "@/components/AgentSteps";

export type DiagnosisResult = {
  result: unknown;
  resultMeta: unknown;
  error: string | null;
  explainData: unknown;
  explainError: string | null;
  steps: AgentStep[];
};

function pushStep(
  steps: AgentStep[],
  단계: string,
  상태: AgentStep["상태"],
  내용: string
) {
  const i = steps.map((s) => s.단계).lastIndexOf(단계);
  if (i >= 0 && steps[i].상태 === "진행") {
    steps[i] = { 단계, 상태, 내용 };
  } else {
    steps.push({ 단계, 상태, 내용 });
  }
}

const 단계이름: Record<string, string> = {
  검색: "사업장 찾기",
  수집: "12개월 기록 모으기",
  계산: "예선 스킬로 계산",
  해설: "Solar 해설 쓰기",
};

function 단계표시(step: AgentStep): string {
  if (step.상태 === "완료") return "✓";
  if (step.상태 === "주의") return "!";
  return "…";
}

export async function performDiagnosis(
  후보: {
    번호: number;
    사업장명: string;
    source: "nps" | "csv";
    seq?: string;
    bzowrRgstNo?: string;
    주소?: string;
    업종?: string;
  },
  company: string,
  onProgress: (percent: number, message: string) => void,
  steps: AgentStep[]
): Promise<DiagnosisResult> {
  pushStep(steps, "검색", "완료", `공공데이터에서 '${company.trim()}' 이름이 들어간 사업장을 찾았어요`);

  if (후보.source === "nps") {
    onProgress(15, "최근 12개월 국민연금 자료를 불러오는 중...");
    pushStep(steps, "수집", "진행", `‘${후보.사업장명}’의 최근 12개월 국민연금 기록을 모으고 있어요`);

    const wpParams = new URLSearchParams({
      name: 후보.사업장명,
      bizno: 후보.bzowrRgstNo || "",
      addr: 후보.주소 || "",
      ...(후보.seq ? { seq: 후보.seq } : {}),
    });

    let workplaceFailReason: string | null = null;
    let workplaceRows: unknown[] | null = null;
    let workplaceFailedMonths: unknown = null;

    try {
      const wpRes = await fetch(`/api/nps/workplace?${wpParams.toString()}`);
      const wpJson = ((await wpRes.json().catch(() => null)) || {}) as any;
      if (!wpRes.ok || !wpJson.ok) {
        throw new Error(
          (wpJson && wpJson.사유) || wpJson.error || `HTTP ${wpRes.status}`
        );
      }
      workplaceRows = wpJson.rows;
      workplaceFailedMonths = wpJson.실패한달;
      pushStep(
        steps,
        "수집",
        "완료",
        `${(wpJson.rows || []).length}개월 기록을 받았어요 · 공공 API ${wpJson.api호출수 ?? "?"}번 호출` +
          ((wpJson.실패한달 || []).length > 0
            ? ` · 못 받은 달 ${(wpJson.실패한달 || []).length}개`
            : "")
      );
    } catch (wpErr: any) {
      workplaceFailReason =
        "12개월 기록 수집 실패 — " + (wpErr.message || "공공데이터 조회 실패");
      pushStep(steps, "수집", "주의", workplaceFailReason);
    }

    if (workplaceRows) {
      try {
        onProgress(40, "회전율을 계산하는 중...");
        pushStep(
          steps,
          "계산",
          "진행",
          "예선 스킬(stability.py)로 회전율을 계산하고 같은 업종 기준선과 비교하고 있어요"
        );
        const diagData = await callApi({ rows: workplaceRows });
        if (diagData.진단결과) {
          const 월회전율글자 = (diagData.진단결과.월회전율 * 100).toFixed(1);
          pushStep(
            steps,
            "계산",
            "완료",
            diagData.진단결과.업종위치
              ? `같은 업종 ${diagData.진단결과.업종위치.비교사업장수}곳과 비교했어요 · 월 회전율 ${월회전율글자}%`
              : `업종 기준선에 없는 업종이라 업종 비교는 뺐어요 · 월 회전율 ${월회전율글자}%`
          );
          onProgress(65, "계산을 마쳤어요");

          const resultMeta = {
            입력_출처: diagData.입력_출처,
            자료년월: diagData.자료년월,
            계절성주의: diagData.계절성주의,
            업종기준선_일치: diagData.업종기준선_일치,
            안내문: diagData.안내문,
            원본_업종명: diagData.원본_업종명,
            추이: diagData.추이,
            제외한달: diagData.제외한달,
            실패한달: workplaceFailedMonths,
          };

          onProgress(75, "해설을 준비하는 중...");
          try {
            const explainData = await requestExplain(
              diagData.진단결과,
              resultMeta
            );
            pushStep(
              steps,
              "해설",
              "완료",
              `사실 ${(explainData.사실목록 || []).length}개를 근거로 ${((explainData.소요ms || 0) / 1000).toFixed(1)}초 만에 썼어요` +
                (explainData.걸러낸문장수
                  ? ` · 기준에 안 맞는 문장 ${explainData.걸러낸문장수}개는 뺐어요`
                  : "")
            );
            onProgress(100, "완료");
            return {
              result: diagData.진단결과,
              resultMeta,
              error: null,
              explainData,
              explainError: null,
              steps,
            };
          } catch (e: any) {
            pushStep(
              steps,
              "해설",
              "주의",
              `해설을 쓰지 못했어요 (${e.message || "해설 요청 실패"})`
            );
            onProgress(100, "완료");
            return {
              result: diagData.진단결과,
              resultMeta,
              error: null,
              explainData: null,
              explainError: e.message || "해설 요청 실패",
              steps,
            };
          }
        }
      } catch (diagErr: any) {
        workplaceFailReason =
          "진단 계산 실패 — " + (diagErr.message || "진단 요청 실패");
        pushStep(steps, "계산", "주의", workplaceFailReason);
      }
    }

    if (workplaceFailReason) {
      pushStep(
        steps,
        "계산",
        "진행",
        "동봉 데이터(2026-07)로 대신 계산하고 있어요"
      );
      onProgress(45, "동봉 데이터로 대신 계산하는 중...");
      const sampleResult = await sampleDiagnose(후보.사업장명);
      if (sampleResult && sampleResult !== "없음") {
        pushStep(
          steps,
          "계산",
          "완료",
          "동봉 데이터(2026-07)로 계산을 마쳤어요"
        );
        onProgress(65, "계산을 마쳤어요");

        const resultMeta = {
          입력_출처: "동봉 샘플",
          계절성주의: true,
          대체사유: workplaceFailReason,
        };

        onProgress(75, "해설을 준비하는 중...");
        try {
          const explainData = await requestExplain(sampleResult, resultMeta);
          pushStep(
            steps,
            "해설",
            "완료",
            `사실 ${(explainData.사실목록 || []).length}개를 근거로 ${((explainData.소요ms || 0) / 1000).toFixed(1)}초 만에 썼어요` +
              (explainData.걸러낸문장수
                ? ` · 기준에 안 맞는 문장 ${explainData.걸러낸문장수}개는 뺐어요`
                : "")
          );
          onProgress(100, "완료");
          return {
            result: sampleResult,
            resultMeta,
            error: null,
            explainData,
            explainError: null,
            steps,
          };
        } catch (e: any) {
          pushStep(
            steps,
            "해설",
            "주의",
            `해설을 쓰지 못했어요 (${e.message || "해설 요청 실패"})`
          );
          onProgress(100, "완료");
          return {
            result: sampleResult,
            resultMeta,
            error: null,
            explainData: null,
            explainError: e.message || "해설 요청 실패",
            steps,
          };
        }
      }

      return {
        result: null,
        resultMeta: null,
        error: `공공데이터로 진단하지 못했어요 (${workplaceFailReason}). 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에도 없는 사업장이에요.`,
        explainData: null,
        explainError: null,
        steps,
      };
    }
  }

  if (후보.source === "csv") {
    pushStep(
      steps,
      "계산",
      "진행",
      "동봉 데이터(2026-07)에서 계산하고 있어요"
    );
    onProgress(30, "동봉 데이터에서 계산하는 중...");
    const sampleResult = await sampleDiagnose(후보.사업장명);
    if (sampleResult && sampleResult !== "없음") {
      pushStep(
        steps,
        "계산",
        "완료",
        "동봉 데이터(2026-07)로 계산을 마쳤어요"
      );
      onProgress(65, "계산을 마쳤어요");

      const resultMeta = {
        입력_출처: "동봉 샘플",
        계절성주의: true,
      };

      onProgress(75, "해설을 준비하는 중...");
      try {
        const explainData = await requestExplain(sampleResult, resultMeta);
        pushStep(
          steps,
          "해설",
          "완료",
          `사실 ${(explainData.사실목록 || []).length}개를 근거로 ${((explainData.소요ms || 0) / 1000).toFixed(1)}초 만에 썼어요` +
            (explainData.걸러낸문장수
              ? ` · 기준에 안 맞는 문장 ${explainData.걸러낸문장수}개는 뺐어요`
              : "")
        );
        onProgress(100, "완료");
        return {
          result: sampleResult,
          resultMeta,
          error: null,
          explainData,
          explainError: null,
          steps,
        };
      } catch (e: any) {
        pushStep(
          steps,
          "해설",
          "주의",
          `해설을 쓰지 못했어요 (${e.message || "해설 요청 실패"})`
        );
        onProgress(100, "완료");
        return {
          result: sampleResult,
          resultMeta,
          error: null,
          explainData: null,
          explainError: e.message || "해설 요청 실패",
          steps,
        };
      }
    }

    return {
      result: null,
      resultMeta: null,
      error: `${후보.사업장명}은(는) 동봉 데이터(2026-07, 가입자 30명 이상 52,957곳)에 없는 사업장입니다.`,
      explainData: null,
      explainError: null,
      steps,
    };
  }

  return {
    result: null,
    resultMeta: null,
    error: "진단 결과를 받지 못했습니다.",
    explainData: null,
    explainError: null,
    steps,
  };
}
