"""Deterministic tests for the TrafficGovernor SlidingWindowLimiter.

Run from the OJTT root: python -m unittest backend.test_sliding_window -v
Place this file in: OJTT/backend/test_sliding_window.py
"""
import unittest

from backend.sliding_window import SlidingWindowLimiter


class FakeClock:
    def __init__(self, start=0.0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class TestSlidingWindowLimiter(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.limiter = SlidingWindowLimiter(limit=3, window_seconds=10, clock=self.clock)

    def test_three_allowed_fourth_denied(self):
        decisions = [self.limiter.allow("A") for _ in range(4)]
        self.assertEqual([d["status"] for d in decisions], [200, 200, 200, 429])
        self.assertEqual([d["remaining"] for d in decisions[:3]], [2, 1, 0])

    def test_clients_have_independent_limits(self):
        for _ in range(3):
            self.limiter.allow("A")
        self.assertEqual(self.limiter.allow("A")["status"], 429)
        self.assertEqual(self.limiter.allow("B")["status"], 200)

    def test_expiration_at_exact_window_boundary(self):
        for _ in range(3):
            self.limiter.allow("A")
        self.clock.advance(10)
        result = self.limiter.allow("A")
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["remaining"], 2)

    def test_retry_time_is_calculated_from_oldest_request(self):
        self.limiter.allow("A")
        self.clock.advance(1)
        self.limiter.allow("A")
        self.clock.advance(1)
        self.limiter.allow("A")
        self.clock.advance(1)
        result = self.limiter.allow("A")
        self.assertEqual(result["status"], 429)
        self.assertEqual(result["retry_after_ms"], 7000)

    def test_denied_request_does_not_consume_a_slot(self):
        for _ in range(3):
            self.limiter.allow("A")
        for _ in range(5):
            self.assertEqual(self.limiter.allow("A")["status"], 429)
        self.clock.advance(10)
        self.assertEqual(self.limiter.allow("A")["status"], 200)

    def test_expired_requests_removed_incrementally(self):
        self.limiter.allow("A")   # t=0
        self.clock.advance(4)
        self.limiter.allow("A")   # t=4
        self.clock.advance(4)
        self.limiter.allow("A")   # t=8
        self.clock.advance(2)      # t=10 -> t=0 expires
        result = self.limiter.allow("A")
        self.assertEqual(result["status"], 200)
        self.assertEqual(result["remaining"], 0)

    def test_invalid_limits(self):
        for value in [0, -1, 1.5, True, "3", None]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    SlidingWindowLimiter(value, 10, clock=self.clock)

    def test_invalid_windows(self):
        for value in [0, -1, 2.5, True, "10", None]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    SlidingWindowLimiter(3, value, clock=self.clock)

    def test_response_has_expected_fields(self):
        result = self.limiter.allow("A")
        self.assertEqual(result["client_id"], "A")
        self.assertEqual(result["decision"], "ALLOWED")
        self.assertTrue(result["allowed"])
        self.assertEqual(result["retry_after_ms"], 0)


if __name__ == "__main__":
    unittest.main()
