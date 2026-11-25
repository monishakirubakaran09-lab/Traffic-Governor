# TrafficGovernor

**Traffic Intelligence. Clear Decisions.**

TrafficGovernor is an API rate-limiting, traffic-simulation, and monitoring project developed for OJT (Product Development). It provides an interactive React interface connected to a local Python backend, allowing engineers to configure request limits, simulate API traffic, and inspect request decisions and reports.

## Features

- **Landing page:** Traffic-inspired interface with an illustrative traffic demo and direct entry into the application.
- **Dashboard:** Backend connection status, total/allowed/denied requests, denial rate, P95 latency, recent traffic volume, active policy, and request activity.
- **Policy Settings:** Select **Token Bucket** (capacity and refill rate) or **Sliding Window** (request limit and window duration). Limits are applied **per client ID**.
- **Traffic Simulator:** Choose a client ID and endpoint, set request count and request rate, send a burst, and view **HTTP 200 (allowed)** or **HTTP 429 (denied)** decisions.
- **Metrics:** Per-client request counts, denial rates, search/filter/sort options, and CSV export.
- **Live Traffic Analysis:** Monitors current backend HTTP 200/429 decisions and recent recorded request latency; refreshes periodically while the backend is running.
- **Offline CSV Analysis:** HTTP 200/503 response distributions and latency before/after recorded circuit trips, generated with pandas and matplotlib.
- **Demo roles:** Infrastructure Engineer can configure policies; Network Ops has restricted policy-editing access. This is a demonstration role system, **not production authentication**.

## Technology stack

| Component | Technology |
| --- | --- |
| Main frontend | React, TypeScript, Vite, CSS |
| Backend/API | Python (`http.server`) |
| Rate limiting | Token Bucket and Sliding Window |
| Data analysis | pandas, matplotlib |
| Testing | Python `unittest`, TypeScript and Vite build checks |

## Project structure

```text
.
├── backend/             # Python HTTP server, algorithms, CSV analysis and tests
│   ├── server.py
│   ├── token_bucket.py
│   ├── sliding_window.py
│   ├── analysis.py
│   └── test_*.py
├── data/
│   └── sample_traces.csv
├── reports/             # Offline chart output
├── frontend/            # Earlier HTML/CSS/JavaScript frontend (retained for reference)
├── TG_FINAL_RELEASE/    # Current React + TypeScript frontend
│   ├── public/reports/  # Images shown by the offline Analysis Report
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

## Getting started (macOS)

Run commands from the project root (the directory containing `backend/` and `TG_FINAL_RELEASE/`). Your local directory may be named `OJTT_INTEGRATION`; the name is not required.

### 1. Start the Python backend

Open **Terminal 1**:

```bash
cd ~/Desktop/OJTT_INTEGRATION
source .venv/bin/activate
python3 backend/server.py
```

> **Correct command:** `python3 backend/server.py` — **not** `python3 backend/server.python3`.
>
> If `.venv` does not exist on a newly cloned copy, create it and install the dependencies first:
>
> ```bash
> python3 -m venv .venv
> source .venv/bin/activate
> python3 -m pip install pandas matplotlib
> ```

The API listens locally on **http://127.0.0.1:5001**.

### 2. Start the React frontend

Open **Terminal 2**:

```bash
cd ~/Desktop/OJTT_INTEGRATION/TG_FINAL_RELEASE
npm ci
npm run dev
```

Open the address printed by Vite (normally **http://localhost:5173**; it may use another port if occupied).

The Vite development proxy forwards requests under `/backend/*` to the Python API on port 5001.

### 3. Verify connectivity

From another terminal:

```bash
curl http://127.0.0.1:5001/metrics
curl http://127.0.0.1:5001/policy
```

In the browser, open **Enter TrafficGovernor → Dashboard** and confirm that the backend connection indicator is active.

## Demo workflow

1. Open **Policy Settings**, choose Token Bucket, set a capacity of **3** and refill rate of **1 token/second**, then select **Save to Python Backend**.
2. Open **Traffic Simulator**, use a **new client ID**, and send **5 requests at 100 requests/second**. For a fresh full bucket and sufficiently quick burst, expect **3 allowed** and **2 denied** responses. Actual results depend on timing and existing client state.
3. Return to **Dashboard**, **Metrics**, and **Live Traffic Analysis** to inspect updated data.
4. To demonstrate Sliding Window, switch to **3 requests per 10 seconds**, save, then send **5 quick requests using a different fresh client ID**. Under those conditions, expect **3 allowed** and **2 denied**.
5. Visit **Analysis Report** to inspect the separate, offline CSV-based HTTP 200/503 and circuit-trip charts.

## Generate offline analysis reports (US-08 and US-09)

From the project root, with the Python environment active:

```bash
python3 -m backend.analysis \
  --csv data/sample_traces.csv \
  --output-dir reports

cp reports/*.png TG_FINAL_RELEASE/public/reports/
```

The included sample CSV has **5 recorded requests**: **3 HTTP 200 (60%)** and **2 HTTP 503 (40%)**. It also includes a recorded `CLOSED → OPEN` circuit transition for the latency chart.

**Important:** Offline graphs are **saved images** generated from a CSV. They do **not** automatically update when you send new requests in the live simulator. To show new offline data, supply a compatible CSV, regenerate the charts, and copy the PNGs into the React public reports directory.

Live rate limiting uses **HTTP 200/429**. Offline incident traces use **HTTP 200/503**; these codes must not be treated as interchangeable. The demo does **not** implement a live circuit breaker.

## Tests and build

From the project root:

```bash
source .venv/bin/activate
python3 -m unittest discover -s backend -p 'test_*.py' -v
```

For the frontend:

```bash
cd TG_FINAL_RELEASE
npx tsc --noEmit
npm run build
```

Generated folders such as `.venv/`, `node_modules/`, and `dist/` should remain excluded from Git commits via `.gitignore`.

## Limitations

- Backend policies, request counters, and history are held **in memory** and may reset when the backend restarts.
- Current rate limiting uses **per-client ID** isolation.
- Demo roles are not a substitute for real user authentication/authorization.
- The live charts describe simulator/backend activity, not production traffic.
- Offline CSV reports must be regenerated explicitly after updating trace data.

## Collaboration

Project work is shared through the team GitHub repository and reviewed via feature branches and pull requests. Keep the main branch stable, commit only source files and required sample/report assets, and avoid checking in local environments or build outputs.
