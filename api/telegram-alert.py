"""Gateway Telegram adaptado da VPS; uma chamada HTTP por envio, sem daemon."""
import hmac
import json
import os
import re
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler


def format_alert(payload):
    if not isinstance(payload, dict) or set(payload) - {
        "source", "event_type", "severity", "title", "message", "dedupe_key", "occurred_at"
    }:
        raise ValueError("invalid_payload")
    if payload.get("source") != "superapp-node":
        raise ValueError("invalid_source")
    limits = {"event_type": 80, "title": 120, "message": 3000, "dedupe_key": 160}
    for field, limit in limits.items():
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError("invalid_field")
    if not re.fullmatch(r"health\.(water_progress|diet_menu)", payload["event_type"]):
        raise ValueError("invalid_event")
    if payload.get("severity") != "info":
        raise ValueError("invalid_severity")
    text = f"ℹ️ SuperApp\n{payload['title']}\n{payload['message']}"
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)[:4096]


def send_alert(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", token) or not re.fullmatch(r"-?[0-9]+", chat_id):
        raise ValueError("telegram_config_missing")
    body = json.dumps({"chat_id": chat_id, "text": text}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage", data=body,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.loads(response.read(65536))
    if not result.get("ok"):
        raise RuntimeError("telegram_rejected")
    return result.get("result", {}).get("message_id")


class handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(405, {"ok": False})

    def do_POST(self):
        token = os.environ.get("ALERTS_API_TOKEN", "")
        supplied = self.headers.get("X-Alert-Token", "")
        if len(token) < 32 or not hmac.compare_digest(supplied.encode(), token.encode()):
            self.reply(401, {"ok": False})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 16384:
                self.reply(413, {"ok": False})
                return
            text = format_alert(json.loads(self.rfile.read(size)))
        except (ValueError, TypeError):
            self.reply(400, {"ok": False})
            return
        try:
            message_id = send_alert(text)
            self.reply(200, {"ok": True, "telegram_message_id": message_id})
        except ValueError:
            self.reply(503, {"ok": False, "error": "telegram_config_missing"})
        except (urllib.error.URLError, RuntimeError, ValueError, OSError):
            # Do not log exceptions: URLs contain the bot token.
            self.reply(502, {"ok": False, "error": "telegram_send_failed"})
