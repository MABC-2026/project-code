# 로컬 개발용. next dev 는 api/diagnose.py 를 실행하지 않으므로 같은 handler 를 로컬 포트에 띄운다.
# next.config.ts 가 개발 모드에서만 /api/diagnose 를 scripts/dev_diagnose.py 가 띄운 로컬 서버로 넘긴다.

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)            # 저장소 루트
API_DIR = os.path.join(ROOT, "api")

if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
if API_DIR not in sys.path:
    sys.path.insert(0, API_DIR)

import diagnose

from http.server import ThreadingHTTPServer

PORT = int(os.environ.get("DIAGNOSE_PORT", "8000"))
SERVER = ThreadingHTTPServer(("127.0.0.1", PORT), diagnose.handler)

print(f"진단 서버 주소: 127.0.0.1:{PORT}/api/diagnose (Ctrl+C 로 종료)")
sys.stdout.flush()
try:
    SERVER.serve_forever()
except KeyboardInterrupt:
    SERVER.server_close()
