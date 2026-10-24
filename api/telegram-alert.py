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
        "source", "event_type", "severity", "title", "message", "dedupe_key", "occurred_at", "water_checkin"
    }:
        raise ValueError("invalid_payload")
    if payload.get("source") != "superapp-node":
        raise ValueError("invalid_source")
    limits = {"event_type": 80, "title": 120, "message": 3000, "dedupe_key": 160}
    for field, limit in limits.items():
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError("invalid_field")
    if not re.fullmatch(r"(?:health\.(water_progress|diet_menu)|financeiro\.daily_summary)", payload["event_type"]):
        raise ValueError("invalid_event")
    if payload.get("severity") != "info":
        raise ValueError("invalid_severity")
    water_keyboard(payload)
    text = f"ℹ️ SuperApp\n{payload['title']}\n{payload['message']}"
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)[:4096]


def water_keyboard(payload):
    water = payload.get("water_checkin")
    if water is None:
        return None
    if (payload.get("event_type") != "health.water_progress" or not isinstance(water, dict)
        or set(water) != {"profile_id", "date", "time"}
        or isinstance(water["profile_id"], bool) or not isinstance(water["profile_id"], int)
        or water["profile_id"] <= 0
        or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(water["date"]))
        or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", str(water["time"]))):
        raise ValueError("invalid_water_prompt")
    buttons = [{"text": (f"{amount // 1000} L" if amount >= 1000 else f"{amount} ml"), "callback_data": f"water:{water['profile_id']}:{water['date']}:{water['time'].replace(':','')}:{amount}"}
               for amount in [100, 200, 300, 400, 500, 1000, 2000]]
    if any(len(button["callback_data"].encode("utf-8")) > 64 for button in buttons):
        raise ValueError("invalid_water_prompt")
    return {"inline_keyboard": [buttons[:3], buttons[3:5], buttons[5:]]}


def send_alert(text, reply_markup=None):
    if os.environ.get("TELEGRAM_ENABLED") != "true":
        raise ValueError("telegram_disabled")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", token) or not re.fullmatch(r"-?[0-9]+", chat_id):
        raise ValueError("telegram_config_missing")
    payload = {"chat_id": chat_id, "text": text}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
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
        if os.environ.get("TELEGRAM_ENABLED") != "true":
            self.reply(503, {"ok": False, "error": "telegram_disabled"})
            return
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
            payload = json.loads(self.rfile.read(size))
            text = format_alert(payload)
        except (ValueError, TypeError):
            self.reply(400, {"ok": False})
            return
        try:
            message_id = send_alert(text, water_keyboard(payload))
            self.reply(200, {"ok": True, "telegram_message_id": message_id})
        except urllib.error.HTTPError as error:
            # Read privately; only allowlisted codes leave the gateway.
            description = ""
            try:
                details = json.loads(error.read(16384))
                if isinstance(details, dict):
                    description = str(details.get("description", "")).lower()
            except (ValueError, OSError):
                pass
            if error.code in (401, 404):
                reason = "telegram_token_invalid"
            elif "chat not found" in description:
                reason = "telegram_chat_not_found"
            elif "blocked by the user" in description:
                reason = "telegram_bot_blocked"
            elif "initiate conversation" in description:
                reason = "telegram_start_required"
            elif "send messages to bots" in description:
                reason = "telegram_recipient_is_bot"
            elif "not enough rights" in description or "kicked" in description or "not a member" in description:
                reason = "telegram_bot_no_permission"
            elif error.code == 403:
                reason = "telegram_forbidden"
            elif error.code == 429:
                reason = "telegram_rate_limited"
            elif error.code == 400:
                reason = "telegram_bad_request"
            else:
                reason = "telegram_send_failed"
            self.reply(502, {"ok": False, "error": reason})
        except ValueError:
            self.reply(503, {"ok": False, "error": "telegram_config_missing"})
        except (urllib.error.URLError, OSError):
            self.reply(502, {"ok": False, "error": "telegram_network_error"})
        except RuntimeError:
            # Do not log exceptions: URLs contain the bot token.
            self.reply(502, {"ok": False, "error": "telegram_send_failed"})


if __name__ == "__main__":
    import argparse
    from http.server import HTTPServer
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8091)
    arguments = parser.parse_args()
    server = HTTPServer(("127.0.0.1", arguments.port), handler)
    print(f"Telegram Python local: {server.server_port}", flush=True)
    server.serve_forever()
