# HTTPServer — creates the server and listens for incoming requests.
# BaseHTTPRequestHandler — allows us to handle requests and send responses.
from http.server import HTTPServer,BaseHTTPRequestHandler
# Importing urlparse to separate the URL path and query parameters

from urllib.parse import urlparse, parse_qs  # parse qs will saperate the url into parts
# Support running as a script and importing in automated integration tests.
if __package__:
    from .token_bucket import TokenBucket
    from .sliding_window import SlidingWindowLimiter
else:
    from token_bucket import TokenBucket
    from sliding_window import SlidingWindowLimiter
import json
from datetime import datetime, timezone
# The latency sample history stays bounded; request decisions do not.
from collections import deque
import math
import time
clients = {}


# Dictionary to store API request statistics
metrics = {
    "total": 0,      #Total
    "allowed": 0,    # allowed
    "denied": 0      # rejected
}
# Store EVERY valid /check decision since this server process started.
# This list is reset on server restart. /logs exposes paginated history.
request_logs = []

# Store the processing time of the latest 100 requests
# Each value will be measured in milliseconds
latency_samples = deque(maxlen=100)
# Store total latency and request count for each minute
latency_by_minute = {}

# Store how many API requests arrive in each minute
# Key = minute number, value = request count
request_volume = {}


# Store separate request statistics for each API client
# Key = client ID, value = that client's request counters
client_metrics = {}
# Current role used for the local demo
current_role = "infrastructure_engineer"


# Keep both algorithms' settings so switching back preserves the values.
# These settings are in memory and reset when the Python server restarts.
policy = {
    "algorithm": "token_bucket",
    "capacity": 3,
    "refill_rate": 1,
    "window_limit": 3,
    "window_seconds": 10
}

# A Sliding Window limiter holds separate accepted-request histories per client.
sliding_limiter = SlidingWindowLimiter(
    policy["window_limit"], policy["window_seconds"]
)



class TrafficGovernorServer(BaseHTTPRequestHandler):

    def do_GET(self):
        # Record when the HTTP request begins processing
        request_started_at = time.perf_counter()
        # Print the requested URL in the Python terminal
        print("Requested URL:", self.path)

        url = urlparse(self.path)
        # Return the currently selected demo role
        if url.path == "/role":
            response = {"role": current_role}

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header(
                "Access-Control-Allow-Origin",
                "http://127.0.0.1:5173"
            )
            self.end_headers()

            self.wfile.write(json.dumps(response).encode())
            return


        # Separate the URL into its components

        url = urlparse(self.path)

        # Print the requested endpoint
        print("Endpoint:", url.path)


        # Handle requests to view the current rate-limiting policy
        if url.path == "/policy":

            # Convert the policy dictionary into JSON
            message = json.dumps(policy)

            # Send HTTP 200 because the request succeeded
            self.send_response(200)

            # Inform the browser that the response contains JSON
            self.send_header("Content-Type", "application/json")

            # Allow our frontend to read the response
            self.send_header(
                "Access-Control-Allow-Origin",
                "http://127.0.0.1:5501"
            )

            # Finish sending the HTTP headers
            self.end_headers()

            # Convert the JSON string into bytes and send it
            self.wfile.write(message.encode())

            # Stop processing after handling /policy
            return

        # Return request history in pages (newest first).
        # Paginating keeps the website responsive when thousands of requests exist.
        if url.path == "/logs":
            try:
                args = parse_qs(url.query, keep_blank_values=True)
                offset = int(args.get("offset", ["0"])[0])
                limit = int(args.get("limit", ["100"])[0])
                if offset < 0 or not 1 <= limit <= 200:
                    raise ValueError("Invalid pagination")
            except (ValueError, TypeError):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5501")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "offset must be >= 0 and limit 1..200"}).encode())
                return

            total = len(request_logs)
            end = max(0, total - offset)
            start = max(0, end - limit)
            page = list(reversed(request_logs[start:end]))
            result = {
                "total": total,
                "offset": offset,
                "limit": limit,
                "has_more": offset + len(page) < total,
                "logs": page
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5501")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            return

# Handle requests to the /metrics endpoint
        if url.path == "/metrics":

            if metrics["total"] == 0:
                deny_rate = 0

            else:
                # Calculate the percentage of denied requests
                deny_rate = (metrics["denied"] / metrics["total"]) * 100

            # Store the deny rate for both cases
            metrics["deny_rate"] = round(deny_rate, 2)


            # Convert the metrics dictionary into a JSON string

            # Create a copy of the metrics dictionary
            response_data = metrics.copy()


            # Get the current minute
            current_minute = int(time.time() // 60)

            # Create six one-minute intervals for the live chart
            response_data["volume"] = []

            for minute in range(current_minute - 5, current_minute + 1):
                # Convert the minute into HH:MM format
                label = time.strftime("%H:%M", time.localtime(minute * 60))

                # Get the request count for this minute
                count = request_volume.get(minute, 0)

                # Add this interval to the API response
                response_data["volume"].append({
                    "minute": label,
                    "requests": count
                })


            # Display which algorithm generated the live request metrics.
            response_data["active_algorithm"] = policy["algorithm"]

            # Keep /metrics lightweight for frequent live refreshes.
            # Use GET /logs to retrieve ALL decisions since startup.
            response_data["logs"] = request_logs[-20:]
            response_data["log_total"] = len(request_logs)

            # Create a dictionary for client statistics in the API response
            response_data["clients"] = {}

            # Go through each client's stored statistics
            for client_id, stats in client_metrics.items():

                # Get the total requests from this client
                total = stats["total"]

                # Calculate deny percentage and avoid division by zero
                deny_rate = (stats["denied"] / total * 100) if total > 0 else 0

                # Copy the existing counters into the response
                response_data["clients"][client_id] = stats.copy()

                # Add this client's calculated deny rate
                response_data["clients"][client_id]["deny_rate"] = round(deny_rate, 2)


            # Calculate average and P95 latency from recent requests
            # Sort the recorded latency values from smallest to largest
            samples = sorted(latency_samples)

            # Check whether any requests have been measured
            if samples:
                # Number of recorded latency measurements
                count = len(samples)

                # Average latency = sum of latencies / number of requests
                average_latency = sum(samples) / count

                # Find the index of the 95th percentile
                p95_index = math.ceil(0.95 * count) - 1

                # Get the latency at that position
                p95_latency = samples[p95_index]

                # Add calculated statistics to the API response
                response_data["avg_latency_ms"] = round(average_latency, 2)
                response_data["p95_latency_ms"] = round(p95_latency, 2)

            else:
                # No measured requests yet
                response_data["avg_latency_ms"] = None
                response_data["p95_latency_ms"] = None

            # Tell the frontend how many requests were measured
            response_data["latency_sample_count"] = len(samples)


            # Get the current minute from the system clock
            current_minute = int(time.time() // 60)

            # Store the last six minutes of latency data
            latency_chart = []

            # Go through six minutes, from oldest to newest
            for minute in range(current_minute - 5, current_minute + 1):

                # Get recorded latency information for this minute
                record = latency_by_minute.get(minute)

                # Calculate average latency if requests were recorded
                if record and record["count"] > 0:
                    average = record["total_ms"] / record["count"]
                    average = round(average, 2)
                else:
                    # None means no latency measurements for this minute
                    average = None

                # Convert the minute into a readable HH:MM label
                time_label = time.strftime(
                    "%H:%M",
                    time.localtime(minute * 60)
                )

                # Add this minute's data to the chart
                latency_chart.append({
                    "minute": time_label,
                    "avg_latency_ms": average
                })

            # Include the latency chart in the API response
            response_data["latency"] = latency_chart

            # Remove old minute records to avoid unlimited memory growth
            for minute in list(latency_by_minute):
                if minute < current_minute - 5:
                    del latency_by_minute[minute]


            # Convert the complete response into JSON
            message = json.dumps(response_data)

            self.send_response(200)

            # Tells the client that the response contains JSON typ of content
            self.send_header("Content-Type", "application/json")

            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5501")


            self.end_headers()

            # Converting the JSON string to bytes and sending it
            self.wfile.write(message.encode())

            # Stop processing because /metrics is complete
            return

        # Check whether the request is for /check
        if url.path == "/check":


            parameters = parse_qs(url.query)


            client_list = parameters.get("client_id", [""])
            client_id = client_list[0]


            client_id = client_id.strip()


            if not client_id or len(client_id) > 80:

                # Send HTTP 400 Bad Request
                self.send_response(400)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()

                # Send the validation error message
                message = "Error: Client ID must be 1 to 80 characters"
                self.wfile.write(message.encode())    # it conversts string into byte

                # will stop processing this request
                return

            print("Valid Client ID:", client_id)


            if policy["algorithm"] == "sliding_window":
                # One limiter tracks independent histories for each client.
                decision = sliding_limiter.allow(client_id)
                allowed = decision["allowed"]
                remaining = decision["remaining"]
                retry_after_ms = decision["retry_after_ms"]
                tokens_remaining = None  # Sliding Window has no tokens.
            else:
                # Token Bucket continues to use one bucket per client.
                if client_id not in clients:
                    clients[client_id] = TokenBucket(
                        policy["capacity"], policy["refill_rate"]
                    )

                bucket = clients[client_id]
                allowed = bucket.allow_request()
                tokens_remaining = round(bucket.tokens, 2)
                remaining = tokens_remaining
                retry_after_ms = 0

                if not allowed and bucket.refill_rate > 0:
                    missing_tokens = max(0, 1 - bucket.tokens)
                    retry_after_ms = math.ceil(
                        (missing_tokens / bucket.refill_rate) * 1000
                    )



            print("Request allowed:", allowed)


            # Count every valid request checked by the selected algorithm

# Check whether this client already has stored statistics
            if client_id not in client_metrics:

                # Create separate counters for a new client
                client_metrics[client_id] = {
                    "total": 0,
                    "allowed": 0,
                    "denied": 0

                }

            metrics["total"] += 1

            # Get the current minute using the system clock
            current_minute = int(time.time() // 60)

            # Increase the number of requests recorded in this minute
            request_volume[current_minute] = request_volume.get(current_minute, 0) + 1

            # Keep only the most recent six minutes of chart data
            for minute in list(request_volume):
                if minute < current_minute - 5:
                    del request_volume[minute]

            # Increase the request count for this specific client
            client_metrics[client_id]["total"] += 1

            # Update the allowed or denied counter
            if allowed:
                metrics["allowed"] += 1
                client_metrics[client_id]["allowed"] += 1
            else:
                metrics["denied"] += 1
                client_metrics[client_id]["denied"] += 1

            # Display updated statistics in the Python terminal
            print("Updated metrics:", metrics)



            if allowed:

                # Request allowed
                status = 200
                message = "Request Allowed"

            else:

                # Client has exceeded the rate limit
                status = 429
                message = "Too Many Requests"


            # Create a JSON response for the API request
            response_data = {
                "client_id": client_id,
                "allowed": allowed,
                "decision": "ALLOWED" if allowed else "DENIED",
                "status": status,
                "message": message,
                "algorithm": policy["algorithm"],
                "remaining": remaining,
                "tokens_remaining": tokens_remaining,
                "retry_after_ms": retry_after_ms
            }

            # Convert the Python dictionary into a JSON string
            response_body = json.dumps(response_data)

            # Display status in the terminal
            print("HTTP status:", status)


            # Measure elapsed processing time in milliseconds
            elapsed_ms = (time.perf_counter() - request_started_at) * 1000

            # Record this decision with a sequential ID and timestamp.
            # Save it AFTER timing so individual history rows show real latency.
            request_logs.append({
                "id": metrics["total"],
                "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                "client_id": client_id,
                "endpoint": "/check",
                "decision": "ALLOWED" if allowed else "DENIED",
                "status": status,
                "algorithm": policy["algorithm"],
                "latency_ms": round(elapsed_ms, 2),
                "remaining": remaining,
                "tokens_remaining": tokens_remaining,
                "retry_after_ms": retry_after_ms
            })

            # Save the value for later analysis
            latency_samples.append(round(elapsed_ms, 2))

            # Identify the current minute using the system clock
            minute_key = int(time.time() // 60)

            # Create a record if this minute has no latency data yet
            if minute_key not in latency_by_minute:
                latency_by_minute[minute_key] = {
                    "total_ms": 0.0,
                    "count": 0
                }

            # Add this request's processing time
            latency_by_minute[minute_key]["total_ms"] += elapsed_ms

            # Increase the number of measured requests
            latency_by_minute[minute_key]["count"] += 1


            # Send the calculated HTTP status to the client
            self.send_response(status)

            # Specify the response content type
            self.send_header("Content-Type", "application/json")


            # Inform clients when they can retry a denied request
            if not allowed and retry_after_ms > 0:

                # HTTP Retry-After uses whole seconds
                retry_after_seconds = math.ceil(retry_after_ms / 1000)

                # Send the waiting time in the response headers
                self.send_header("Retry-After", str(retry_after_seconds))


            # Finish HTTP headers
            self.send_header(
                "Access-Control-Allow-Origin",
                "http://127.0.0.1:5501"
            )

            self.end_headers()

            # Convert the message to bytes and send it
            self.wfile.write(response_body.encode())

            # Stop after handling /check
            return

        # Handle requests to other endpoints
        self.send_response(404)

        self.send_header(
            "Access-Control-Allow-Origin",
            "http://127.0.0.1:5501"
        )

        self.send_header("Content-Type", "text/plain")

        # Allow our local frontend to read the rate-limit response

        self.end_headers()

        # Inform the client that the endpoint does not exist
        message = "Endpoint Not Found"
        self.wfile.write(message.encode())


    def do_POST(self):
        # Save the selected algorithm and its settings at /policy.
        global sliding_limiter,current_role
        url = urlparse(self.path)


        # Change the active role for the local demonstration
        if url.path == "/role":
            try:
                length = int(
                    self.headers.get("Content-Length", "0")
                )

                if not 1 <= length <= 256:
                    raise ValueError("Invalid request length")

                data = json.loads(
                    self.rfile.read(length).decode("utf-8")
                )

                if not isinstance(data, dict):
                    raise ValueError("Expected a JSON object")

                new_role = data.get("role")

                # Accept only the two supported roles
                if new_role not in (
                    "infrastructure_engineer",
                    "network_ops"
                ):
                    raise ValueError("Invalid role")

            except (
                ValueError,
                TypeError,
                UnicodeDecodeError,
                OverflowError
            ):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header(
                    "Access-Control-Allow-Origin",
                    "http://127.0.0.1:5501"
                )
                self.end_headers()

                self.wfile.write(
                    json.dumps({"error": "Invalid role"}).encode()
                )
                return

            # Save the chosen demo role
            current_role = new_role

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header(
                "Access-Control-Allow-Origin",
                "http://127.0.0.1:5501"
            )
            self.end_headers()

            self.wfile.write(
                json.dumps({"role": current_role}).encode()
            )
            return


        # Reset statistics for one selected client
        if url.path == "/metrics/reset":
            try:
                # Read the incoming JSON request
                content_length = int(
                    self.headers.get("Content-Length", "0")
                )

                if not 1 <= content_length <= 1024:
                    raise ValueError("Invalid request length")

                data = json.loads(
                    self.rfile.read(content_length).decode("utf-8")
                )

                if not isinstance(data, dict):
                    raise ValueError("Expected a JSON object")

                client_id = data.get("client_id")

                # Validate the client ID
                if (
                    not isinstance(client_id, str)
                    or not client_id.strip()
                    or client_id != client_id.strip()
                    or len(client_id) > 80
                ):
                    raise ValueError("Invalid client ID")

            except (ValueError, TypeError, UnicodeDecodeError, OverflowError):
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header(
                    "Access-Control-Allow-Origin",
                    "http://127.0.0.1:5501"
                )
                self.end_headers()
                self.wfile.write(
                    json.dumps({"error": "Invalid client ID"}).encode()
                )
                return

            # Check whether the client exists
            if client_id not in client_metrics:
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.send_header(
                    "Access-Control-Allow-Origin",
                    "http://127.0.0.1:5501"
                )
                self.end_headers()
                self.wfile.write(
                    json.dumps({"error": "Client not found"}).encode()
                )
                return

            # Reset only this client's statistics
            client_metrics[client_id].update({
                "total": 0,
                "allowed": 0,
                "denied": 0,
                "last_reset_at": datetime.now(
                    timezone.utc
                ).isoformat(timespec="seconds")
            })

            # Do not change global metrics or request history
            response = {
                "message": "Client metrics reset",
                "client_id": client_id,
                "stats": client_metrics[client_id].copy()
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header(
                "Access-Control-Allow-Origin",
                "http://127.0.0.1:5501"
            )
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            return

        if url.path != "/policy":
            self.send_error(404, "Endpoint Not Found")
            return

        # US-06: Prevent Network Ops from editing policies
        if current_role == "network_ops":
            response = {
                "error": "Unauthorized: Network Ops cannot edit policies"
            }

            self.send_response(403)
            self.send_header("Content-Type", "application/json")
            self.send_header(
                "Access-Control-Allow-Origin",
                "http://127.0.0.1:5501"
            )
            self.end_headers()

            self.wfile.write(json.dumps(response).encode())
            return


        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1024:
                raise ValueError("Invalid request size")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")

            # Existing Token Bucket clients without 'algorithm' still work.
            algorithm = data.get("algorithm", policy["algorithm"])
            if algorithm not in ("token_bucket", "sliding_window"):
                raise ValueError("Unsupported algorithm")

            # Start with current values; validate the active algorithm.
            updated = policy.copy()
            updated["algorithm"] = algorithm

            if algorithm == "token_bucket":
                capacity = data.get("capacity", policy["capacity"])
                refill_rate = data.get("refill_rate", policy["refill_rate"])
                if type(capacity) is not int or not 1 <= capacity <= 10000:
                    raise ValueError("Invalid capacity")
                if (type(refill_rate) not in (int, float)
                        or not math.isfinite(refill_rate)
                        or not 0 < refill_rate <= 1000):
                    raise ValueError("Invalid refill rate")
                updated["capacity"] = capacity
                updated["refill_rate"] = refill_rate
            else:
                window_limit = data.get("window_limit", policy["window_limit"])
                window_seconds = data.get("window_seconds", policy["window_seconds"])
                if type(window_limit) is not int or not 1 <= window_limit <= 10000:
                    raise ValueError("Invalid window limit")
                if type(window_seconds) is not int or not 1 <= window_seconds <= 86400:
                    raise ValueError("Invalid window duration")
                updated["window_limit"] = window_limit
                updated["window_seconds"] = window_seconds

        except (ValueError, UnicodeDecodeError, OverflowError):
            # Invalid input must never change the existing policy.
            self.send_response(400)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5501")
            self.end_headers()
            self.wfile.write(b"Invalid policy settings")
            return

        # Apply changes together. Reset limiter histories, not cumulative metrics.
        policy.update(updated)
        clients.clear()
        sliding_limiter = SlidingWindowLimiter(
            policy["window_limit"], policy["window_seconds"]
        )

        message = json.dumps(policy)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5501")
        self.end_headers()
        self.wfile.write(message.encode())

    # Handle browser CORS preflight requests
    def do_OPTIONS(self):

        # Identify the requested endpoint
        url = urlparse(self.path)

        # Only support preflight for the policy endpoint
        if url.path not in ("/policy", "/metrics/reset","/role"):
            self.send_error(404, "Endpoint Not Found")
            return

        # No Content means the preflight was successful
        self.send_response(204)

        # Allow requests from our frontend
        self.send_header(
            "Access-Control-Allow-Origin",
            "http://127.0.0.1:5501"
        )

        # Tell the browser which HTTP methods are permitted
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )

        # Allow the frontend to send JSON content
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )

        # Finish HTTP response headers
        self.end_headers()


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", 5001), TrafficGovernorServer)
    print("TrafficGovernor server started on http://127.0.0.1:5001")
    server.serve_forever()

