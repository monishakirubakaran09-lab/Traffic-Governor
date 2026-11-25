"""Session-history regression tests (run: python -m unittest backend.test_request_history -v)."""
import json
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend import server as api
from backend.sliding_window import SlidingWindowLimiter


class QuietHistoryHandler(api.TrafficGovernorServer):
    def log_message(self, *args):
        pass


class HistoryIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = HTTPServer(("127.0.0.1", 0), QuietHistoryHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        api.policy.clear()
        api.policy.update(algorithm="token_bucket", capacity=3, refill_rate=1,
                          window_limit=3, window_seconds=10)
        api.clients.clear()
        api.sliding_limiter = SlidingWindowLimiter(3, 10)
        api.metrics.clear()
        api.metrics.update(total=0, allowed=0, denied=0)
        api.request_logs.clear()
        api.client_metrics.clear()
        api.latency_samples.clear()
        api.latency_by_minute.clear()
        api.request_volume.clear()

    def call(self, path, payload=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = Request(f"http://127.0.0.1:{self.port}{path}", data=body,
                      headers={"Content-Type": "application/json"} if body else {},
                      method="POST" if body else "GET")
        try:
            with urlopen(req, timeout=3) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_history_keeps_all_125_requests(self):
        # 125 exceeds the previous 100-record deque limit.
        self.assertEqual(self.call("/policy", {"algorithm": "sliding_window",
                                               "window_limit": 200, "window_seconds": 60})[0], 200)
        for _ in range(125):
            self.assertEqual(self.call("/check?client_id=HistoryTest")[0], 200)
        code, first = self.call("/logs?limit=100&offset=0")
        self.assertEqual(code, 200)
        self.assertEqual(first["total"], 125)
        self.assertEqual(len(first["logs"]), 100)
        self.assertEqual(first["logs"][0]["id"], 125)
        self.assertEqual(first["logs"][-1]["id"], 26)
        self.assertTrue(first["has_more"])
        self.assertIn("timestamp", first["logs"][0])
        self.assertIn("latency_ms", first["logs"][0])

        _, older = self.call("/logs?limit=100&offset=100")
        self.assertEqual(len(older["logs"]), 25)
        self.assertEqual(older["logs"][0]["id"], 25)
        self.assertEqual(older["logs"][-1]["id"], 1)
        self.assertFalse(older["has_more"])

        _, metrics = self.call("/metrics")
        self.assertEqual(metrics["total"], 125)
        self.assertEqual(metrics["log_total"], 125)
        self.assertEqual(len(metrics["logs"]), 20)  # small live update

    def test_retains_allowed_denied_and_policy_switches(self):
        self.call("/policy", {"algorithm": "sliding_window", "window_limit": 2,
                               "window_seconds": 60})
        self.assertEqual([self.call("/check?client_id=A")[0]
                          for _ in range(4)], [200, 200, 429, 429])
        self.call("/policy", {"algorithm": "token_bucket", "capacity": 1,
                               "refill_rate": 0.0001})
        self.assertEqual([self.call("/check?client_id=A")[0]
                          for _ in range(3)], [200, 429, 429])

        _, page = self.call("/logs?limit=50")
        self.assertEqual(page["total"], 7)
        self.assertEqual(len(page["logs"]), 7)
        self.assertEqual({x["algorithm"] for x in page["logs"]},
                         {"token_bucket", "sliding_window"})
        self.assertEqual([x["status"] for x in page["logs"]],
                         [429, 429, 200, 429, 429, 200, 200])
        self.assertTrue(all(isinstance(x["latency_ms"], (int, float)) for x in page["logs"]))
        self.assertEqual(self.call("/metrics")[1]["total"], 7)

    def test_invalid_pagination_rejected(self):
        for query in ["limit=0", "limit=201", "offset=-1", "offset=hi", "limit=foo"]:
            code, body = self.call("/logs?" + query)
            self.assertEqual(code, 400)
            self.assertIn("error", body)
        self.assertEqual(self.call("/logs")[1]["total"], 0)


if __name__ == "__main__":
    unittest.main()
