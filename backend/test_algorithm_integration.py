"""HTTP integration tests for US-07 (run: python -m unittest backend.test_algorithm_integration -v)."""
import json
import threading
import unittest
from http.server import HTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from backend import server as api
from backend.sliding_window import SlidingWindowLimiter


class QuietHandler(api.TrafficGovernorServer):
    def log_message(self, *args):
        pass


class AlgorithmIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = HTTPServer(('127.0.0.1', 0), QuietHandler)
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
        api.policy.update(algorithm='token_bucket', capacity=3, refill_rate=1,
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

    def call(self, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = Request(f'http://127.0.0.1:{self.port}{path}', data=data,
                      headers={'Content-Type':'application/json'} if data else {},
                      method='POST' if data else 'GET')
        try:
            with urlopen(req, timeout=2) as response:
                return response.status, dict(response.headers), json.loads(response.read())
        except HTTPError as error:
            raw = error.read()
            try:
                parsed = json.loads(raw)
            except ValueError:
                parsed = raw.decode()
            return error.code, dict(error.headers), parsed

    def test_default_token_bucket_contract(self):
        self.assertEqual(self.call('/policy')[2]['algorithm'], 'token_bucket')
        self.call('/policy', {'algorithm':'token_bucket', 'capacity':2, 'refill_rate':0.01})
        outputs = [self.call('/check?client_id=A') for _ in range(3)]
        self.assertEqual([r[0] for r in outputs], [200, 200, 429])
        self.assertEqual(outputs[2][2]['algorithm'], 'token_bucket')
        self.assertIsInstance(outputs[2][2]['tokens_remaining'], (int, float))
        self.assertGreater(int(outputs[2][1]['Retry-After']), 0)
        self.assertEqual(self.call('/metrics')[2]['total'], 3)

    def test_sliding_window_contract(self):
        code, _, result = self.call('/policy', {
            'algorithm':'sliding_window','window_limit':2,'window_seconds':10})
        self.assertEqual(code, 200)
        self.assertEqual(result['window_seconds'], 10)
        outputs = [self.call('/check?client_id=A') for _ in range(3)]
        self.assertEqual([r[0] for r in outputs], [200, 200, 429])
        self.assertEqual(outputs[0][2]['remaining'], 1)
        self.assertIsNone(outputs[2][2]['tokens_remaining'])
        self.assertGreater(outputs[2][2]['retry_after_ms'], 0)
        self.assertGreater(int(outputs[2][1]['Retry-After']), 0)
        self.assertEqual(self.call('/check?client_id=B')[0], 200)
        metrics = self.call('/metrics')[2]
        self.assertEqual((metrics['total'],metrics['allowed'],metrics['denied']), (4,3,1))
        self.assertEqual(metrics['active_algorithm'], 'sliding_window')
        self.assertTrue(all('algorithm' in x for x in metrics['logs']))

    def test_switching_resets_limiters_but_preserves_metrics(self):
        self.call('/policy', {'algorithm':'sliding_window','window_limit':1,'window_seconds':10})
        self.assertEqual(self.call('/check?client_id=A')[0], 200)
        self.assertEqual(self.call('/check?client_id=A')[0], 429)
        self.call('/policy', {'algorithm':'token_bucket','capacity':1,'refill_rate':0.01})
        self.assertEqual(self.call('/check?client_id=A')[0], 200)
        self.assertEqual(self.call('/check?client_id=A')[0], 429)
        self.assertEqual(self.call('/metrics')[2]['total'], 4)
        # Sliding Window limit is remembered when switching back.
        self.call('/policy', {'algorithm':'sliding_window'})
        self.assertEqual(self.call('/policy')[2]['window_limit'], 1)
        self.assertEqual(self.call('/check?client_id=A')[0], 200)

    def test_invalid_policy_is_atomic(self):
        before = self.call('/policy')[2]
        for invalid in [
            {'algorithm':'unsupported'},
            {'algorithm':'sliding_window','window_limit':0,'window_seconds':10},
            {'algorithm':'sliding_window','window_limit':2.5,'window_seconds':10},
            {'algorithm':'sliding_window','window_limit':True,'window_seconds':10},
            {'algorithm':'sliding_window','window_limit':2,'window_seconds':0},
            {'algorithm':'token_bucket','capacity':1,'refill_rate':-1},
            {'algorithm':'token_bucket','capacity':0,'refill_rate':1},
        ]:
            self.assertEqual(self.call('/policy',invalid)[0], 400)
            self.assertEqual(self.call('/policy')[2], before)

    def test_legacy_token_bucket_update(self):
        code, _, value = self.call('/policy',{'capacity':5,'refill_rate':2})
        self.assertEqual(code,200)
        self.assertEqual(value['algorithm'],'token_bucket')
        self.assertEqual(value['capacity'],5)


if __name__ == '__main__':
    unittest.main()
