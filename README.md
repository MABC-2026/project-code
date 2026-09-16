# Work-Signal

국민연금 가입 사업장 기록으로 **지원하려는 회사의 인력 흐름**을 보여주는 웹 서비스입니다. MABC 2026 결선 · 팀 알잘딱깔센.

배포: https://mabc-2026-theta.vercel.app

## 무엇을 보여주나

- **사람이 얼마나 오가나** — 월 회전율, 같은 업종 안 위치(중앙값·상위 구간)
- **왜 뽑나** — 최근 12개월 신규취득을 빈자리 채우기와 늘어난 자리로 나눔
- **언제 뽑나** — 신규취득이 평소의 1.5배 이상 몰린 달과 그 간격
- **요즘 달라졌나** — 최근 3개월과 그 전 9개월의 신규취득·상실 비교
- **지원자 관점 해설** — Solar Pro 4 가 계산된 사실만 근거로 쓴 해설과 면접에서 확인할 거리
- **에이전트의 생각** — 검색·수집·계산·해설 단계, 한 달 수치와 1년 흐름을 비교하며 생각이 바뀐 지점

회사를 좋다·나쁘다로 평가하지 않습니다. 신규취득·상실은 입사·퇴사와 같지 않습니다(전보·재가입 포함).

## 구조

```
skill/                        예선 스킬 — 계산의 원본 (skill/SKILL.md)
  scripts/stability.py        지표 계산 (표준 라이브러리만 사용)
  references/metrics.md       지표 정의·근거·한계·출처
  assets/                     동봉 데이터 52,957곳 · 업종 기준선 550개 업종
api/diagnose.py               Vercel 파이썬 함수. 스킬 계산을 그대로 호출해 진단 결과와 업종 위치를 돌려준다
src/app/api/nps/search/       사업장 검색 (공공데이터 오픈API, 법인 표기 여러 가지·영문 이름 한글 읽기)
src/app/api/nps/workplace/    고른 사업장의 최근 12개월 기록 수집
src/app/api/explain/          Solar Pro 4 해설 (사실 목록 → 숫자 근거·금지 표현 검사)
src/app/page.tsx              화면
src/components/               숫자 4칸, 들어온/나간 사람 막대그래프, 채용 흐름, 업종 위치, 에이전트의 생각
scripts/dev_diagnose.py       로컬 개발용 진단 서버 (next dev 가 /api/diagnose 를 여기로 넘긴다)
```

## 흐름

1. **검색** — 회사 이름으로 공공데이터 오픈API 를 법인 표기 여러 가지로 조회합니다.
2. **수집** — 고른 사업장의 최근 12개월 기록(가입자 수·신규취득·상실)을 달마다 조회합니다.
3. **계산** — `api/diagnose.py` 가 `skill/scripts/stability.py` 로 회전율·업종배수 등을 계산합니다.
4. **채용 흐름** — 12개월 기록으로 채용의 성격·몰린 달·최근 3개월 변화를 계산합니다.
5. **해설** — 서버가 사실 목록을 만들어 Solar Pro 4 에 넘기고, 사실 목록에 없는 숫자나 금지 표현이 들어간 문장은 뺍니다.

공공데이터 조회에 실패하면 동봉 데이터(2026-07)로 진단하고 그 사실을 화면에 표시합니다.

## 로컬 실행

1. `npm install`
2. `.env.local` 에 `NPS_API_KEY`(공공데이터포털 인증키)와 `UPSTAGE_API_KEY`(Upstage 콘솔 키)를 넣습니다. 키 값은 저장소에 올리지 않습니다.
3. 터미널 1: `python scripts/dev_diagnose.py` (127.0.0.1:8000)
4. 터미널 2: `npm run dev` → http://localhost:3000

스킬만 쓸 때: `python skill/scripts/stability.py [CSV경로] --company "회사명"`

## 배포

Vercel 에 배포합니다. 환경변수 `NPS_API_KEY`, `UPSTAGE_API_KEY` 를 설정합니다(선택: `SOLAR_MODEL`, 기본값 `solar-pro4-260806`). `api/diagnose.py` 는 Vercel 파이썬 함수로 동작합니다.

## 데이터·모델 출처

- 국민연금공단 「국민연금공단_국민연금 가입 사업장 내역」 파일데이터 (월간 CSV) — https://www.data.go.kr/data/15083277/fileData.do
- 같은 자료의 오픈API (`apis.data.go.kr/B552015/NpsBplcInfoInqireServiceV2`: getBassInfoSearchV2 · getDetailInfoSearchV2 · getPdAcctoSttusInfoSearchV2) — https://www.data.go.kr/data/3046071/openapi.do
- 국민연금 보험료율 (2025년까지 9%, 2026년 9.5%, 2033년 13%) — https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0038M0.do
- 기준소득월액 상한 (2026-07 ~ 2027-06 6,590,000원) — https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?menuId=MN24000897&pstId=NE202500000000030479
- 해설 모델: Upstage Solar Pro 4 (`solar-pro4-260806`) — https://console.upstage.ai/docs/models

## 한계

- 신규취득·상실은 입사·퇴사와 같지 않습니다(전보·재가입 포함).
- 최근 12개월 기록이라 해마다 같은 달에 채용이 몰린다고 단정할 수 없습니다.
- 1월·7월은 공공기관 정기 인사이동이 섞일 수 있습니다.
- 대기업은 본사·공장·지점이 별도 사업장으로 잡힙니다.
- 공식 통계가 아니라 조회 시점의 행정 기록입니다.

## 라이선스

MIT — MABC 2026 알잘딱깔센
