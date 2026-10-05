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


if __name__ == "__main__":
    unittest.main()
