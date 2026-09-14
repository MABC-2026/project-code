import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로컬 next dev 는 파이썬 함수(api/diagnose.py)를 실행하지 않는다.
  // 개발 모드에서만 /api/diagnose 를 scripts/dev_diagnose.py 가 띄운 로컬 서버로 넘긴다. 배포(Vercel)에는 영향이 없다.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/diagnose", destination: `http://127.0.0.1:${process.env.DIAGNOSE_PORT || "8000"}/api/diagnose` }];
  },
};

export default nextConfig;
