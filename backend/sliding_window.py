
import time
import math
from collections import defaultdict, deque


class SlidingWindowLimiter:

    def __init__(self, limit, window_seconds, clock=None):

        # Both policy values must be positive whole numbers
        if type(limit) is not int or limit <= 0:
            raise ValueError("Limit must be a positive integer")

        if type(window_seconds) is not int or window_seconds <= 0:
            raise ValueError("Window must be a positive integer")

        self.limit = limit
        self.window_seconds = window_seconds

        # Each client gets its own request history
        self.requests = defaultdict(deque)

        # Monotonic time is suitable for measuring intervals
        self.clock = clock if clock is not None else time.monotonic

    def allow(self, client_id):

        # Get the current time
        now = self.clock()

        # Retrieve this client's request timestamps
        history = self.requests[client_id]

        # Calculate the beginning of the active window
        cutoff = now - self.window_seconds

        # Remove accepted requests that have expired
        while history and history[0] <= cutoff:
            history.popleft()

        # Check whether the client has space for a new request
        if len(history) < self.limit:

            # Record this accepted request
            history.append(now)

            return {
                "client_id": client_id,
                "allowed": True,
                "decision": "ALLOWED",
                "status": 200,
                "remaining": self.limit - len(history),
                "retry_after_ms": 0
            }

        # Find how long until the oldest request expires
        retry_seconds = history[0] + self.window_seconds - now

        return {
            "client_id": client_id,
            "allowed": False,
            "decision": "DENIED",
            "status": 429,
            "remaining": 0,
            "retry_after_ms": max(0, math.ceil(retry_seconds * 1000))
        }
