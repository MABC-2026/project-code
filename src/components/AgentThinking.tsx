"use client";

import { useEffect, useState } from "react";

const 문구목록: Record<string, string[]> = {
  검색: [
    "‘{이름}’ 이름이 들어간 사업장을 찾는 중…",
    "‘주식회사 {이름}’, ‘{이름}(주)’처럼 법인 표기를 바꿔 찾는 중…",
    "이름이 정확히 같은 사업장을 먼저 고르는 중…",
    "후보마다 업종과 가입자 수를 확인하는 중…",
    "영문 이름을 한글 읽기로도 찾아보는 중…",
  ],
  수집: [
    "‘{이름}’의 최근 12개월 기록을 한 달씩 모으는 중…",
    "한 달만 보면 계절 영향과 헷갈려서, 1년 치를 모으는 중…",
    "달마다 들어온 사람과 나간 사람을 세는 중…",
    "못 받은 달이 있으면 다시 요청하는 중…",
  ],
  계산: [
    "예선 스킬로 월 회전율을 계산하는 중…",
    "같은 업종 사업장들과 견줘 보는 중…",
    "겉으로 보이는 인원 변화와 실제로 오간 사람을 비교하는 중…",
    "1월·7월처럼 인사이동이 섞이는 달인지 확인하는 중…",
  ],
  해설: [
    "Solar가 사실 목록을 읽는 중…",
    "지원자가 가장 먼저 알아야 할 흐름을 고르는 중…",
    "빈자리를 채운 채용인지, 새로 생긴 자리인지 살펴보는 중…",
    "면접에서 물어볼 거리를 정리하는 중…",
    "사실 목록에 없는 숫자가 들어가지 않았는지 확인하는 중…",
  ],
};

function 채우기(문구: string, 이름: string | undefined): string {
  if (이름 === undefined) {
    return 문구.replace(/‘\{이름\}’|‘{이름}’|{이름}/g, "").replace(/  +/g, " ").trim();
  }
  return 문구.replace(/\{이름\}/g, 이름);
}

export default function AgentThinking({ 단계, 이름 }: { 단계: string; 이름?: string }) {
  const [순서, set순서] = useState<string[]>([]);
  const [번호, set번호] = useState(0);

  useEffect(() => {
    const 원본 = 문구목록[단계];
    if (!원본) {
      set순서([]);
      return;
    }
    const 목록: string[] = [];
    const 영문있음 = /[A-Za-z]/.test(이름 ?? "");
    for (const 문구 of 원본) {
      if (문구.includes("{이름}") && !이름) continue;
      if (문구.includes("영문") && !영문있음) continue;
      목록.push(채우기(문구, 이름));
    }
    if (목록.length === 0) {
      set순서([]);
      return;
    }
    const 섞은것: string[] = [...목록];
    for (let i = 섞은것.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = 섞은것[i];
      섞은것[i] = 섞은것[j];
      섞은것[j] = tmp;
    }
    set순서(섞은것);
    set번호(0);
  }, [단계, 이름]);

  useEffect(() => {
    if (순서.length === 0) return;
    const t = setInterval(() => set번호((i) => i + 1), 1800);
    return () => clearInterval(t);
  }, [순서]);

  if (순서.length === 0) return null;

  return (
    <p className="mt-1 flex items-center gap-2 text-xs text-violet-700">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
      </span>
      <span>{순서[번호 % 순서.length]}</span>
    </p>
  );
}
