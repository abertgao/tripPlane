#!/usr/bin/env python3
"""GitHub push hook：main 或 master 有新提交时触发拉取发布。"""
import hashlib
import hmac
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECRET_FILE = os.path.join(ROOT, ".webhook-secret")
HOST = "127.0.0.1"
PORT = 8810
DEPLOY_BRANCHES = {"main", "master"}


def load_secret() -> bytes:
    with open(SECRET_FILE, "r", encoding="utf-8") as handle:
        secret = handle.read().strip()
    if not secret:
        raise SystemExit(f"empty webhook secret: {SECRET_FILE}")
    return secret.encode()


SECRET = load_secret()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/hooks/github":
            self._json(200, {"ok": True})
            return
        self.send_error(404)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/hooks/github":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length)
        signature = self.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(SECRET, body, hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            self._json(401, {"ok": False})
            return

        event = self.headers.get("X-GitHub-Event", "")
        if event == "ping":
            self._json(200, {"ok": True, "pong": True})
            return
        if event != "push":
            self._json(202, {"ok": True, "ignored": event})
            return

        payload = json.loads(body.decode() or "{}")
        ref = payload.get("ref") or ""
        branch = ref[len("refs/heads/") :] if ref.startswith("refs/heads/") else ""
        if branch not in DEPLOY_BRANCHES:
            self._json(202, {"ok": True, "ignored": ref})
            return

        env = os.environ.copy()
        env["TRIPPLANE_DEPLOY_BRANCH"] = branch
        subprocess.Popen(
            ["bash", os.path.join(ROOT, "scripts/pull-and-deploy.sh")],
            cwd=ROOT,
            env=env,
            start_new_session=True,
        )
        self._json(202, {"ok": True, "deploy": branch})

    def _json(self, code: int, data: dict):
        raw = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, fmt: str, *args):
        print("[tripplane-hook] " + (fmt % args))


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
