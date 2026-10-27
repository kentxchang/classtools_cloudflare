#!/usr/bin/env python3
"""
fm-cors-proxy.py - 讓「網路上的剛好學網頁」也能使用 Mac 本機的 Apple AI (fm serve)

fm serve 只接受從 localhost 網頁發出的請求；本程式在本機 (預設 127.0.0.1:1977) 當轉接站，
替回應加上 CORS 標頭並轉送給 fm serve，作用等同 Ollama 的 OLLAMA_ORIGINS。

用法 (只需 Python 3，無需安裝其他套件)：
    python3 fm-cors-proxy.py                           # 允許所有網站 (等同 OLLAMA_ORIGINS="*")
    python3 fm-cors-proxy.py --origin https://你的網站   # 只允許指定網站 (較安全，可重複指定)

啟動後在剛好學的 AI 設定中，將服務網址設為 http://127.0.0.1:1977 即可。
若 fm serve 尚未執行，本程式會自動幫你啟動它。
"""
import argparse
import http.client
import shutil
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ARGS = None


def fm_alive():
    try:
        c = http.client.HTTPConnection("127.0.0.1", ARGS.target_port, timeout=1.5)
        c.request("GET", "/health")
        return c.getresponse().status == 200
    except Exception:
        return False


def ensure_fm_serve():
    if fm_alive():
        return
    fm = shutil.which("fm")
    if not fm:
        print("⚠️  找不到 fm 指令 (需 macOS 27)，請確認系統版本；仍會啟動轉接站。")
        return
    subprocess.Popen([fm, "serve", "--host", "127.0.0.1", "--port", str(ARGS.target_port)],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(15):
        time.sleep(0.4)
        if fm_alive():
            print(f"✅ 已自動啟動 fm serve (埠號 {ARGS.target_port})")
            return
    print("⚠️  fm serve 啟動逾時，請檢查 Apple Intelligence 是否已開啟")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.command, self.path))

    def _cors(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        if "*" in ARGS.origin or origin in ARGS.origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers",
                             self.headers.get("Access-Control-Request-Headers") or "content-type,authorization")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
            return True
        return False

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if origin and "*" not in ARGS.origin and origin not in ARGS.origin:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _forward(self):
        origin = self.headers.get("Origin")
        allowed = (not origin) or "*" in ARGS.origin or origin in ARGS.origin
        if not allowed:
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b'{"error":"origin not allowed by fm-cors-proxy"}')
            return
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {"Content-Type": self.headers.get("Content-Type", "application/json")}
        try:
            conn = http.client.HTTPConnection("127.0.0.1", ARGS.target_port, timeout=300)
            conn.request(self.command, self.path, body=body, headers=headers)  # 不轉送 Origin
            resp = conn.getresponse()
        except Exception as e:
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(('{"error":"無法連線 fm serve: %s"}' % e).encode())
            return
        self.send_response(resp.status)
        self._cors()
        self.send_header("Content-Type", resp.getheader("Content-Type", "application/json"))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        while True:
            chunk = resp.read(1024)
            if not chunk:
                break
            self.wfile.write(chunk)
            self.wfile.flush()

    do_GET = _forward
    do_POST = _forward


def main():
    global ARGS
    p = argparse.ArgumentParser(description="fm serve CORS 轉接站")
    p.add_argument("--port", type=int, default=1977, help="本轉接站埠號 (預設 1977)")
    p.add_argument("--target-port", type=int, default=1976, help="fm serve 埠號 (預設 1976)")
    p.add_argument("--origin", action="append", default=None,
                   help="允許的網站來源，例如 https://example.workers.dev；可重複，預設 * (全部)")
    ARGS = p.parse_args()
    ARGS.origin = ARGS.origin or ["*"]
    ensure_fm_serve()
    srv = ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler)
    print(f"🍎 fm-cors-proxy 已啟動：http://127.0.0.1:{ARGS.port}  →  fm serve :{ARGS.target_port}")
    print(f"   允許來源：{', '.join(ARGS.origin)}    (按 Ctrl+C 結束)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
