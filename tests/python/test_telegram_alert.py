import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("gateway", Path(__file__).resolve().parents[2] / "api/telegram-alert.py")
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)


class GatewayTests(unittest.TestCase):
    def payload(self):
        return {"source": "superapp-node", "event_type": "health.water_progress",
                "severity": "info", "title": "Água", "message": "Texto",
                "dedupe_key": "agua:2026-10-05:07:30:1"}

    def test_format_accepts_valid_application_alert(self):
        self.assertIn("Água", gateway.format_alert(self.payload()))

    def test_rejects_untrusted_fields_and_sources(self):
        for field, value in [("source", "other"), ("chat_id", "123"), ("event_type", "other.event")]:
            payload = self.payload()
            payload[field] = value
            with self.assertRaises(ValueError):
                gateway.format_alert(payload)

    def test_rejects_missing_or_oversized_message(self):
        for value in ["", "x" * 3001, None]:
            payload = self.payload()
            payload["message"] = value
            with self.assertRaises(ValueError):
                gateway.format_alert(payload)

    def test_missing_credentials_do_not_contact_telegram(self):
        with patch.dict("os.environ", {}, clear=True), patch("urllib.request.urlopen") as request:
            with self.assertRaises(ValueError):
                gateway.send_alert("Texto")
            request.assert_not_called()

    def test_disabled_channel_never_contacts_telegram_with_valid_credentials(self):
        for flag in [None, "false", "TRUE", "1"]:
            env = {"TELEGRAM_BOT_TOKEN": "123:fake", "TELEGRAM_CHAT_ID": "123"}
            if flag is not None:
                env["TELEGRAM_ENABLED"] = flag
            with patch.dict("os.environ", env, clear=True), patch("urllib.request.urlopen") as request:
                with self.assertRaisesRegex(ValueError, "telegram_disabled"):
                    gateway.send_alert("Texto")
                request.assert_not_called()

    def test_enabled_channel_keeps_telegram_transport(self):
        env = {"TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "123:fake", "TELEGRAM_CHAT_ID": "123"}
        with patch.dict("os.environ", env, clear=True), patch("urllib.request.urlopen") as request:
            request.return_value.__enter__.return_value.read.return_value = b'{"ok":true,"result":{"message_id":7}}'
            self.assertEqual(gateway.send_alert("Texto"), 7)
            self.assertEqual(request.call_count, 1)

    def test_disabled_http_handler_stops_before_reading_body(self):
        instance = gateway.handler.__new__(gateway.handler)
        from unittest.mock import Mock
        instance.reply = Mock()
        with patch.dict("os.environ", {}, clear=True):
            instance.do_POST()
        instance.reply.assert_called_once_with(503, {"ok": False, "error": "telegram_disabled"})

    def test_water_prompt_creates_only_fixed_volume_buttons(self):
        payload = self.payload()
        payload["water_checkin"] = {"profile_id": 1, "date": "2026-10-13", "time": "07:30"}
        gateway.format_alert(payload)
        keyboard = gateway.water_keyboard(payload)
        buttons = [button for row in keyboard["inline_keyboard"] for button in row]
        self.assertEqual([button["text"] for button in buttons], ["100 ml", "200 ml", "300 ml", "400 ml", "500 ml", "1 L", "2 L"])
        self.assertEqual(buttons[0]["callback_data"], "water:1:2026-10-13:0730:100")
        payload["water_checkin"]["profile_id"] = True
        with self.assertRaises(ValueError):
            gateway.format_alert(payload)

    def test_water_prompt_is_rejected_on_diet_messages(self):
        payload = self.payload()
        payload["event_type"] = "health.diet_menu"
        payload["water_checkin"] = {"profile_id": 1, "date": "2026-10-13", "time": "07:30"}
        with self.assertRaises(ValueError):
            gateway.format_alert(payload)


if __name__ == "__main__":
    unittest.main()
