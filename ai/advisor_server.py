"""Local HTTP server that exposes the offline advising model at /advising."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from runModel import generate_json

HOST = os.getenv("ADVISOR_HOST", "127.0.0.1")
PORT = int(os.getenv("ADVISOR_PORT", "8000"))


class AdvisingHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/advising":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return

        try:
            raw = self.rfile.read(content_length)
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("payload must be a JSON object")
        except Exception as exc:  # noqa: BLE001
            self._send_json(400, {"error": f"Invalid JSON payload: {exc}"})
            return

        try:
            result = generate_json(payload)
        except Exception as exc:  # noqa: BLE001
            self._send_json(500, {"error": f"Model inference failed: {exc}"})
            return

        self._send_json(200, result)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AdvisingHandler)
    print(f"[advisor-server] Listening on http://{HOST}:{PORT}/advising")
    print("[advisor-server] Requests to /advising call runModel.generate_json() locally.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
