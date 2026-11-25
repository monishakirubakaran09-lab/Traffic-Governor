
// TRAFFIC GOVERNOR - DASHBOARD JAVASCRIPT

const traffic = {
    total: 1000,
    allowed: 850,
    denied: 150,


    getDenyRate: function() {

        if (this.total === 0) {
            return 0;
        }

        // Formula: (Denied Requests / Total Requests) * 100
        const rate = (this.denied / this.total) * 100;

        return rate.toFixed(1);
    }
};


// Function to update the HTML dashboard
function updateDashboard() {

    const totalElement = document.getElementById("total-requests");

    const allowedElement = document.getElementById("allowed-requests");

    const deniedElement = document.getElementById("denied-requests");

    const denyRateElement = document.getElementById("deny-rate");


    totalElement.textContent = traffic.total.toLocaleString("en-US");

    allowedElement.textContent = traffic.allowed.toLocaleString("en-US");

    deniedElement.textContent = traffic.denied.toLocaleString("en-US");

    // Update the deny rate only if the HTML element exists
    // Find the HTML element displaying the deny rate
    // Display the calculated deny-rate percentage
    // Update the deny rate only if the HTML element exists
    if (denyRateElement) {
        denyRateElement.textContent =
            traffic.getDenyRate() + "% deny rate (spike throttle)";
        }
}



// updateDashboard();


// Request history is separate from /metrics so a long session does not
// download thousands of old decisions with every metric refresh.
const HISTORY_BATCH_SIZE = 100;
let historyVisibleLimit = HISTORY_BATCH_SIZE;
let historyLoading = false;

async function fetchHistoryPage(offset, limit) {
    const response = await fetch(
        `http://127.0.0.1:5001/logs?offset=${offset}&limit=${limit}`
    );
    if (!response.ok) {
        throw new Error("History API returned HTTP " + response.status);
    }
    return response.json();
}

// Retrieve the whole server-session history in 200-request pages.
// Used only when exporting, not by the frequently refreshed dashboard.
async function fetchAllRequestHistory() {
    const all = [];
    let offset = 0;
    while (true) {
        const page = await fetchHistoryPage(offset, 200);
        all.push(...page.logs);
        offset += page.logs.length;
        if (!page.has_more || page.logs.length === 0) break;
    }
    return all;
}

function formatHistoryTime(timestamp) {
    if (!timestamp) return "—";
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function renderHistoryTable(elementId, logs, buildCells) {
    const body = document.getElementById(elementId);
    if (!body) return;
    const fragment = document.createDocumentFragment();
    if (!logs.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "No API requests recorded since server startup.";
        row.appendChild(cell);
        fragment.appendChild(row);
    }
    for (const log of logs) {
        const row = document.createElement("tr");
        buildCells(log).forEach((value, index) => {
            const cell = document.createElement("td");
            cell.textContent = String(value ?? "—");
            // Decision is the third dashboard column and second report column.
            if ((elementId === "recent-requests-body" && index === 2) ||
                (elementId === "report-logs-body" && index === 1)) {
                cell.className = log.decision === "ALLOWED"
                    ? "positive" : "danger-text";
            }
            row.appendChild(cell);
        });
        fragment.appendChild(row);
    }
    body.replaceChildren(fragment);
}

function renderRequestHistory(logs, total) {
    const latency = (log) => typeof log.latency_ms === "number"
        ? log.latency_ms.toFixed(2) + " ms" : "—";
    const time = (log) => formatHistoryTime(log.timestamp);

    renderHistoryTable("recent-requests-body", logs, (log) => [
        log.client_id, log.endpoint, log.decision,
        log.status, latency(log), time(log)
    ]);
    renderHistoryTable("report-logs-body", logs, (log) => [
        log.endpoint, log.decision, log.status, latency(log),
        log.status === 200 ? "Request allowed" : "Rate limit exceeded",
        time(log)
    ]);

    // The simulator shows the same complete backend history, not merely
    // 20 entries from the most recent burst.
    const simulatorLog = document.getElementById("simulation-log");
    if (simulatorLog) {
        const fragment = document.createDocumentFragment();
        if (!logs.length) {
            const item = document.createElement("li");
            item.textContent = "No API requests recorded yet.";
            fragment.appendChild(item);
        }
        for (const log of logs) {
            const item = document.createElement("li");
            const heading = document.createElement("span");
            heading.textContent = `Request #${log.id ?? "?"} · ${time(log)}`;
            const decision = document.createElement("strong");
            decision.textContent = `${log.decision} · ${log.status}`;
            decision.className = log.decision === "ALLOWED" ? "positive" : "danger-text";
            const client = document.createElement("span");
            client.textContent = `Client: ${log.client_id} | Algorithm: ${
                log.algorithm === "sliding_window" ? "Sliding Window" : "Token Bucket"
            }`;
            const details = document.createElement("span");
            details.textContent = `Latency: ${latency(log)} | Remaining: ${
                log.remaining ?? "—"
            }${log.status === 429 ? ` | Retry after: ${log.retry_after_ms ?? 0} ms` : ""}`;
            item.append(heading, decision, client, details);
            fragment.appendChild(item);
        }
        simulatorLog.replaceChildren(fragment);
    }

    const text = `Showing ${logs.length} of ${total} requests recorded since server startup.`;
    for (const id of ["dashboard-history-count", "report-history-count", "simulator-history-count"]) {
        const label = document.getElementById(id);
        if (label) label.textContent = text;
    }
    document.querySelectorAll(".load-older-history").forEach((button) => {
        button.hidden = logs.length >= total;
    });
}

async function loadRequestHistory() {
    if (historyLoading) return;
    historyLoading = true;
    try {
        const logs = [];
        let offset = 0;
        let total = 0;
        while (offset < historyVisibleLimit) {
            const page = await fetchHistoryPage(
                offset, Math.min(200, historyVisibleLimit - offset)
            );
            total = page.total;
            logs.push(...page.logs);
            offset += page.logs.length;
            if (!page.has_more || page.logs.length === 0) break;
        }
        renderRequestHistory(logs, total);
    } catch (error) {
        console.error("Could not load request history:", error);
        for (const id of ["dashboard-history-count", "report-history-count", "simulator-history-count"]) {
            const label = document.getElementById(id);
            if (label) label.textContent = "Request history unavailable. Check backend connection.";
        }
    } finally {
        historyLoading = false;
    }
}

document.querySelectorAll(".load-older-history").forEach((button) => {
    button.addEventListener("click", () => {
        historyVisibleLimit += HISTORY_BATCH_SIZE;
        loadRequestHistory();
    });
});

async function loadMetrics() {

    try {

    // Send a GET request to our Python backend
    const response = await fetch("http://127.0.0.1:5001/metrics");



    // Check whether the server returned a successful HTTP response
    if (!response.ok) {
        throw new Error("Metrics API returned HTTP " + response.status);


    }


    // Convert the JSON response into a JavaScript object
    const data = await response.json();

    // Refresh all three decision histories from GET /logs.
    loadRequestHistory();


        // Find the denied requests field in the Analysis Report
        const reportDenied = document.getElementById("report-denied-count");

        // Display the actual denied request count
        if (reportDenied) {
            reportDenied.textContent = data.denied;
        }

        // Find the average latency field in the Analysis Report
        const reportLatency = document.getElementById("report-avg-latency");

        // Display measured latency, or a dash if no data exists
        if (reportLatency) {
            reportLatency.textContent = data.avg_latency_ms != null
                ? Number(data.avg_latency_ms).toFixed(2)
                : "—";
        }


        updateLatencyChart(data.latency);

        // Find the summary cards in the Analysis Report
        const reportTotal = document.getElementById("report-total");
        const reportDeniedCard = document.getElementById("report-denied");
        const reportLatencyCard = document.getElementById("report-latency");
        const reportTrafficVolume = document.getElementById("report-traffic-volume");

        // Display the total requests received by the backend
        if (reportTotal) {
            reportTotal.textContent = Number(data.total).toLocaleString();
        }

        // Display the number of denied requests
        if (reportDeniedCard) {
            reportDeniedCard.textContent = Number(data.denied).toLocaleString();
        }

        // Display the measured average processing latency
        if (reportLatencyCard) {
            reportLatencyCard.textContent = data.avg_latency_ms != null
                ? Number(data.avg_latency_ms).toFixed(2)
                : "—";
        }

        // Update the Traffic Volume finding
        if (reportTrafficVolume) {
            reportTrafficVolume.textContent = Number(data.total).toLocaleString();
        }


        // Find the Average Latency card
        const avgElement = document.getElementById("metrics-avg-latency");

        // Display the value measured by the Python backend
        if (avgElement) {
            avgElement.textContent = data.avg_latency_ms != null
                ? Number(data.avg_latency_ms).toFixed(2)
                : "--";
        }
        // Find the P95 latency value on the dashboard
        const p95Element = document.getElementById("dashboard-p95-latency");

        // Display the live latency received from Python
        if (p95Element) {
            p95Element.textContent = data.p95_latency_ms != null
                ? Number(data.p95_latency_ms).toFixed(2)
                : "--";
        }

        // Update both charts using real API traffic
        updateLiveTrafficCharts(data.volume);
    // Display the live chart data received from Python
        console.log("Live request volume:", data.volume);
        // Display the live chart data received from Python
        console.log("Live request volume:", data.volume);

        // Find the Per-Client Metrics table body
        const clientTable = document.getElementById("client-metrics-body");

        // Check whether the table and client data are available
        if (clientTable && data.clients) {

            // Remove the placeholder or previous rows
            clientTable.replaceChildren();

            // Convert the clients object into an array of entries


            // Read the text entered in the client search box
            const searchInput = document.getElementById("client-filter");
            const searchText = searchInput
                ? searchInput.value.trim().toLowerCase()
                : "";

            // Read the selected decision filter
            // 0 = All, 1 = Allowed, 2 = Denied
            const decisionFilter = document.getElementById("decision-filter");
            const decisionMode = decisionFilter
                ? decisionFilter.selectedIndex
                : 0;

            // Read the selected sorting option
            // 0 = Highest deny rate, 1 = Highest total requests
            const sortSelect = document.getElementById("sort-metrics");
            const sortMode = sortSelect
                ? sortSelect.selectedIndex
                : 0;

            // Filter clients by name and request decision
            const clients = Object.entries(data.clients).filter(([clientId, stats]) => {
                const matchesSearch = clientId.toLowerCase().includes(searchText);

                const matchesDecision =
                    decisionMode === 0 ||
                    (decisionMode === 1 && stats.allowed > 0) ||
                    (decisionMode === 2 && stats.denied > 0);

                return matchesSearch && matchesDecision;
            });

            // Sort the filtered clients
            clients.sort((a, b) => {
                if (sortMode === 1) {
                    return b[1].total - a[1].total;
                }

                return b[1].deny_rate - a[1].deny_rate;
            });



            if (clients.length === 0) {
                // Show a message when no requests have been recorded
                const row = document.createElement("tr");
                const cell = document.createElement("td");

                cell.colSpan = 6;
                cell.textContent = searchText ? "No matching clients found.": "No client requests recorded yet.";

                row.appendChild(cell);
                clientTable.appendChild(row);
            } else {
                // Create a row for every client
                clients.forEach(([clientId, stats]) => {
                    const row = document.createElement("tr");

                    const values = [
                        clientId,
                        stats.total,
                        stats.allowed,
                        stats.denied,
                        stats.deny_rate + "%"
                    ];

                    // Create the five table cells
                    values.forEach((value) => {
                        const cell = document.createElement("td");
                        cell.textContent = String(value);
                        row.appendChild(cell);
                    });

                    // Create a reset button for this client
                    const actionCell = document.createElement("td");

                    const resetButton = document.createElement("button");

                    resetButton.type = "button";
                    resetButton.className = "outline-button reset-client-metrics";

                    // Store the corresponding client ID on the button
                    resetButton.dataset.clientId = clientId;

                    resetButton.textContent = "Reset Metrics";

                    // Make the button accessible
                    resetButton.setAttribute(
                        "aria-label",
                        "Reset metrics for client " + clientId
                    );

                    // Display the last reset time when available
                    if (stats.last_reset_at) {
                        resetButton.title = "Last reset: " + stats.last_reset_at;
                    }

                    // Insert the button into the table row
                    actionCell.appendChild(resetButton);
                    row.appendChild(actionCell);

                    // Display the completed row
                    clientTable.appendChild(row);
                });
            }
        }

        // Find the Quick Insights text on the Metrics page
        const insightElement = document.getElementById("quick-insights-text");

        if (insightElement) {
            // Read actual request counts from the Python backend
            const total = Number(data.total) || 0;
            const allowed = Number(data.allowed) || 0;
            const denied = Number(data.denied) || 0;

            if (total === 0) {
                // Show this when no API requests have been processed
                insightElement.textContent =
                    "No requests recorded yet. Run a traffic simulation.";
            } else {
                // Calculate the percentage of allowed requests
                const allowedRate = ((allowed / total) * 100).toFixed(1);

                // Calculate the percentage of denied requests
                const deniedRate = ((denied / total) * 100).toFixed(1);

                // Display live insights instead of sample text
                insightElement.textContent =
                    `${allowed} requests allowed (${allowedRate}%) and ` +
                    `${denied} requests denied (${deniedRate}%) ` +
                    `since server startup.`;
            }
        }



        // Find the server status element in HTML
        const serverStatus = document.getElementById("server-status");

        // Check whether the HTML element exists

        if (serverStatus) {

            // Check whether the backend was previously disconnected
            const wasDisconnected =
                serverStatus.textContent === "Server not connected";

            // Show the successful connection
            serverStatus.textContent = "Server connected";

            // Change the status color to green
            serverStatus.classList.remove("warning-text");
            serverStatus.classList.add("positive");

            // Reload the active policy when the backend reconnects

            // Find the current policy status badge
            const policyBadge = document.getElementById("policy-status");

            // Check whether the policy shows Unavailable
            const policyUnavailable =
                policyBadge?.textContent.includes("Unavailable");

            // Reload the policy when the server reconnects
            // Also retry if the policy badge is still unavailable
            if (wasDisconnected || policyUnavailable) {
                loadPolicy();
            }


        }

        // Search input listener is registered once below, not every refresh.


    // Display the received metrics in the browser console
    console.log("Live TrafficGovernor Metrics:", data);


    // Get the Metrics page KPI elements
    const metricsTotal = document.getElementById("metrics-total");
    const metricsAllowed = document.getElementById("metrics-allowed");
    const metricsDenied = document.getElementById("metrics-denied");

    // Get the allowed and denied percentage elements
    const allowedRateElement = document.getElementById("metrics-allowed-rate");
    const deniedRateElement = document.getElementById("metrics-denied-rate");

    // Calculate allowed percentage safely
    const allowedRate = data.total > 0
        ? ((data.allowed / data.total) * 100).toFixed(1)
        : "0.0";

    // Read deny rate returned by Python
    const deniedRate = Number(data.deny_rate).toFixed(1);

    // Display actual request counts
    if (metricsTotal) {
        metricsTotal.textContent = data.total.toLocaleString("en-US");
    }

    if (metricsAllowed) {
        metricsAllowed.textContent = data.allowed.toLocaleString("en-US");
    }

    if (metricsDenied) {
        metricsDenied.textContent = data.denied.toLocaleString("en-US");
    }

    // Display the live percentages
    if (allowedRateElement) {
        allowedRateElement.textContent = allowedRate + "% of total requests";
    }

    if (deniedRateElement) {
        deniedRateElement.textContent = deniedRate + "% of total requests";
    }

    // getting the Dashboard KPI elements using their HTML IDs

    const totalElement = document.getElementById("total-requests");
    const allowedElement = document.getElementById("allowed-requests");
    const deniedElement = document.getElementById("denied-requests");
    const denyRateElement = document.getElementById("deny-rate");

    // displying the data fetched from python backend
    if (totalElement) {
        totalElement.textContent = data.total.toLocaleString("en-US");
    }

    if (allowedElement) {
        allowedElement.textContent = data.allowed.toLocaleString("en-US");
    }

    if (deniedElement) {
        deniedElement.textContent = data.denied.toLocaleString("en-US");
    }

    if (denyRateElement) {
        denyRateElement.textContent = data.deny_rate + "% deny rate (live)";
    }


    // Get the decision distribution elements
    const distributionAllowed = document.getElementById("distribution-allowed");
    const distributionDenied = document.getElementById("distribution-denied");

    const allowedBar = document.getElementById("distribution-allowed-bar");
    const deniedBar = document.getElementById("distribution-denied-bar");

    // Calculate allowed and denied percentages
    const allowedPct = data.total > 0
        ? (data.allowed / data.total) * 100
        : 0;

    const deniedPct = data.total > 0
        ? (data.denied / data.total) * 100
        : 0;

    // Display the live allowed percentage and count
    if (distributionAllowed) {
        distributionAllowed.textContent =
            allowedPct.toFixed(1) + "% · " + data.allowed;
    }

    // Display the live denied percentage and count
    if (distributionDenied) {
        distributionDenied.textContent =
            deniedPct.toFixed(1) + "% · " + data.denied;
    }

    // Update the green progress bar
    if (allowedBar) {
        allowedBar.style.width = allowedPct + "%";
    }

    // Update the red progress bar
    if (deniedBar) {
        deniedBar.style.width = deniedPct + "%";
    }


    }
    catch (error) {

        // Display the error in the browser console
        console.error("Unable to load TrafficGovernor metrics:", error);

        // Find the server status element
        const serverStatus = document.getElementById("server-status");

        // Update the status if the element exists
        if (serverStatus) {

            // Show that the backend cannot be reached
            serverStatus.textContent = "Server not connected";

            // Remove the green connected style
            serverStatus.classList.remove("positive");

            // Apply the warning style
            serverStatus.classList.add("warning-text");
        }

        // Find the Dashboard request counters
        const total = document.getElementById("total-requests");
        const allowed = document.getElementById("allowed-requests");
        const denied = document.getElementById("denied-requests");

        // Clear live counters when the backend is disconnected
        if (total) {
            total.textContent = "—";
        }

        if (allowed) {
            allowed.textContent = "—";
        }

        if (denied) {
            denied.textContent = "—";
        }

        // Find the policy status badge and values
        const policyStatus = document.getElementById("policy-status");
        const policyCapacity = document.getElementById("dashboard-policy-capacity");
        const policyRefill = document.getElementById("dashboard-policy-refill");

        // Show Unavailable when the backend request fails
        if (policyStatus) {
            policyStatus.textContent = "● Unavailable";
            policyStatus.classList.add("warning-text");

        }

        // Clear the values when the backend is unavailable
        if (policyCapacity) {
            policyCapacity.textContent = "—";
        }

        if (policyRefill) {
            policyRefill.textContent = "—";
        }

    }

}

loadMetrics();
// Update the latency graph using live backend measurements

setInterval(loadMetrics, 3000);    // Refresh live metrics every 3 seconds.
document.getElementById("client-filter")?.addEventListener("input", loadMetrics);


async function sendTrafficRequest(clientId) {

    try {

        // Convert the client ID into a safe URL parameter
        const encodedId = encodeURIComponent(clientId);

        // Send a real request to the TrafficGovernor backend
        const response = await fetch(
            "http://127.0.0.1:5001/check?client_id=" + encodedId
        );

        // Read the response message sent by Python
        const message = await response.text();

        // Display the HTTP status and response message
        console.log("Client:", clientId);
        console.log("HTTP status:", response.status);
        console.log("Decision:", message);

        // Refresh the Dashboard metrics after the request
        loadMetrics();

        // Return the result for later use in the simulator UI
        return {
            status: response.status,
            message: message
        };

    } catch (error) {

        // Handle errors when the backend cannot be reached
        console.error("Traffic request failed:", error);

        return null;
    }

}


// Find the theme button in HTML
const themeButton = document.getElementById("theme-toggle");

// Read the previously saved theme
const savedTheme = localStorage.getItem("trafficGovernorTheme");

// Use the saved theme, otherwise start in light mode
const initialTheme = savedTheme === "dark" ? "dark" : "light";

// Apply the initial theme
applyTheme(initialTheme);

// Function to change the current theme
function applyTheme(theme) {

    // Store the selected theme on the HTML element
    document.documentElement.setAttribute("data-theme", theme);

    // Check whether dark mode is selected
    const isDark = theme === "dark";

    // Update the button label and accessibility information
    if (themeButton) {
        themeButton.textContent = isDark ? "☀️ Light mode" : "🌙 Dark mode";
        themeButton.setAttribute("aria-pressed", String(isDark));
        themeButton.setAttribute(
            "aria-label",
            isDark ? "Switch to light mode" : "Switch to dark mode"
        );
    }
}

// Listen for clicks on the theme button
if (themeButton) {

    themeButton.addEventListener("click", function () {

        // Read the current theme
        const currentTheme =
            document.documentElement.getAttribute("data-theme");

        // Switch to the opposite theme
        const newTheme = currentTheme === "dark" ? "light" : "dark";

        // Apply the new theme
        applyTheme(newTheme);

        // Remember the user's selected theme
        localStorage.setItem("trafficGovernorTheme", newTheme);
    });
}


// Find the simulator form and its controls
const simulationForm = document.getElementById("simulation-form");
const simulationButton = document.getElementById("send-burst");
const simulationFeedback = document.getElementById("simulation-feedback");

// Wait for a specified number of milliseconds
function simulationDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run a real traffic simulation
async function runSimulation(event) {

    // Prevent the form from reloading the page
    event.preventDefault();

    // Read the values entered by the user
    const clientId = document.getElementById("client-id").value.trim();
    const count = Number(document.getElementById("request-count").value);
    const sendRate = document.getElementById("send-rate").value;

    // Validate client ID and request count
    if (!clientId || clientId.length > 80 ||
        !Number.isInteger(count) || count < 1 || count > 200) {

        simulationFeedback.textContent =
            "Enter a valid client ID and a request count between 1 and 200.";
        return;
    }

    // Disable the button while a simulation is running
    simulationButton.disabled = true;
    simulationButton.textContent = "Sending requests...";

    // Start the counters at zero
    let allowed = 0;
    let denied = 0;
    let total = 0;

    // Find the result elements
    const totalElement = document.getElementById("sim-total");
    const allowedElement = document.getElementById("sim-allowed");
    const deniedElement = document.getElementById("sim-denied");
    // The decision log now reflects every request saved by the backend.

    // Clear previous simulation results
    totalElement.textContent = "0";
    allowedElement.textContent = "0";
    deniedElement.textContent = "0";

    // Calculate delay between requests
    // "burst" means no intentional delay
    const delay = sendRate === "burst" ? 0 : 1000 / Number(sendRate);

    simulationFeedback.textContent = "Simulation running...";

    try {

        // Send the selected number of requests
        for (let i = 1; i <= count; i++) {

            // Encode the client ID before adding it to the URL
            const encodedId = encodeURIComponent(clientId);

            // Send one request to the Python backend
            const response = await fetch(
                "http://127.0.0.1:5001/check?client_id=" + encodedId
            );

            // Only count recognized rate-limit responses
            if (response.status === 200) {
                allowed++;
            } else if (response.status === 429) {
                denied++;
            } else {
                throw new Error("Unexpected HTTP status: " + response.status);
            }

            // Convert the backend JSON response into a JavaScript object
            await response.json();

            total++;

            // Update the visible result counters
            totalElement.textContent = total;
            allowedElement.textContent = allowed;
            deniedElement.textContent = denied;

            // GET /logs refreshes the full history after the burst.
            // The simulator counters above still update for each request.

            // Wait before sending the next request when a rate is selected
            if (delay > 0 && i < count) {
                await simulationDelay(delay);
            }
        }

        // Display the final summary
        simulationFeedback.textContent =
            "Completed: " + total + " requests, " +
            allowed + " allowed, " + denied + " denied.";

    } catch (error) {

        // Handle connection failures or unexpected responses
        console.error("Simulation error:", error);

        simulationFeedback.textContent =
            "Simulation stopped after " + total +
            " requests. Check the backend connection.";
    } finally {

        // Enable the button again, even when an error occurs
        simulationButton.disabled = false;
        simulationButton.textContent = "Send Burst";

        // Refresh Dashboard metrics after the simulation
        if (typeof loadMetrics === "function") {
            loadMetrics();
        }
    }
}

// Run the simulation when the form is submitted
if (simulationForm) {
    simulationForm.addEventListener("submit", runSimulation);
}


// Policy controls are reused for both algorithms. The server owns the active choice.
const policyForm = document.getElementById("policy-form");
const algorithmInput = document.getElementById("algorithm");
const tokenSettings = document.getElementById("token-settings");
const slidingSettings = document.getElementById("sliding-settings");

function updatePolicyFields() {
    const isSliding = algorithmInput.value === "sliding_window";

    // Hide settings irrelevant to the selected algorithm.
    tokenSettings.hidden = isSliding;
    tokenSettings.disabled = isSliding;
    slidingSettings.hidden = !isSliding;
    slidingSettings.open = isSliding;
    document.getElementById("window-limit").disabled = !isSliding;
    document.getElementById("window-seconds").disabled = !isSliding;
}

algorithmInput?.addEventListener("change", updatePolicyFields);
document.getElementById("reset-policy-fields")?.addEventListener("click", loadPolicy);

function showActivePolicy(saved) {
    const isSliding = saved.algorithm === "sliding_window";
    const algorithmName = isSliding ? "Sliding Window" : "Token Bucket";
    const primary = isSliding ? saved.window_limit : saved.capacity;
    const secondary = isSliding ? saved.window_seconds : saved.refill_rate;

    // Update the current policy summary on both pages.
    document.getElementById("dashboard-policy-algorithm").textContent = algorithmName;
    document.getElementById("dashboard-policy-first-label").textContent =
        isSliding ? "REQUEST LIMIT" : "CAPACITY";
    document.getElementById("dashboard-policy-second-label").textContent =
        isSliding ? "WINDOW SIZE" : "REFILL RATE";
    document.getElementById("dashboard-policy-capacity").textContent =
        isSliding ? primary + " requests" : primary + " tokens";
    document.getElementById("dashboard-policy-refill").textContent =
        isSliding ? secondary + " seconds" : secondary + " tokens/sec";
    document.getElementById("dashboard-policy-window").textContent =
        isSliding ? secondary + " sec sliding window" : "Continuous refill";
    document.getElementById("dashboard-policy-description").textContent = isSliding
        ? "Accepted requests are counted within a moving time window for each client."
        : "Token availability is tracked separately for each client.";

    document.getElementById("active-policy-title").textContent =
        "Active " + algorithmName + " Policy";
    document.getElementById("active-policy-capacity").textContent = primary;
    document.getElementById("active-policy-main-label").textContent = isSliding
        ? "Maximum accepted requests per client in a window"
        : "Maximum burst capacity per client";
    document.getElementById("active-policy-secondary-label").textContent =
        isSliding ? "Window duration:" : "Refill rate:";
    document.getElementById("active-policy-refill").textContent = secondary;
    document.getElementById("active-policy-unit").textContent =
        isSliding ? "seconds" : "tokens/second";

    document.getElementById("policy-status").textContent = "● Active";
    document.getElementById("policy-status").classList.remove("warning-text");

    // The simulator always uses the active server policy, not an unsaved selection.
    const simulatorPolicy = document.getElementById("sim-policy");
    simulatorPolicy.options[0].textContent = "Active: " + algorithmName;
    document.getElementById("simulator-algorithm-note").textContent =
        "Uses the active " + algorithmName + " policy.";
    document.getElementById("simulation-policy-explanation").textContent = isSliding
        ? "Sliding Window counts recent accepted requests per client. Requests beyond the limit receive HTTP 429 until an old request expires."
        : "Token Bucket starts each new client with available tokens. Tokens refill over time; requests without a token receive HTTP 429.";
}

async function loadPolicy() {
    try {
        const response = await fetch("http://127.0.0.1:5001/policy");
        if (!response.ok) throw new Error("Unable to load policy");
        const saved = await response.json();

        // Read the saved values, not stale demo defaults from the HTML.
        algorithmInput.value = saved.algorithm || "token_bucket";
        document.getElementById("capacity").value = saved.capacity;
        document.getElementById("refill").value = saved.refill_rate;
        document.getElementById("window-limit").value = saved.window_limit;
        document.getElementById("window-seconds").value = saved.window_seconds;
        updatePolicyFields();
        showActivePolicy(saved);
    } catch (error) {
        console.error("Error loading policy:", error);
        document.getElementById("policy-status").textContent = "● Unavailable";
        document.getElementById("policy-status").classList.add("warning-text");
    }
}

if (policyForm) {
    policyForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const feedback = document.getElementById("policy-feedback");
        const saveButton = document.getElementById("save-policy");
        const algorithm = algorithmInput.value;
        let settings;

        if (algorithm === "sliding_window") {
            const limit = Number(document.getElementById("window-limit").value);
            const seconds = Number(document.getElementById("window-seconds").value);
            if (!Number.isInteger(limit) || limit < 1 || limit > 10000 ||
                !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
                feedback.textContent = "Use a limit of 1–10,000 and a window of 1–86,400 whole seconds.";
                return;
            }
            settings = {algorithm, window_limit: limit, window_seconds: seconds};
        } else {
            const capacity = Number(document.getElementById("capacity").value);
            const refillRate = Number(document.getElementById("refill").value);
            if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000 ||
                !Number.isFinite(refillRate) || refillRate <= 0 || refillRate > 1000) {
                feedback.textContent = "Use capacity 1–10,000 and refill rate above 0 and at most 1,000.";
                return;
            }
            settings = {algorithm, capacity, refill_rate: refillRate};
        }

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
        feedback.textContent = "Applying selected policy...";
        try {
            const response = await fetch("http://127.0.0.1:5001/policy", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(settings)
            });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const saved = await response.json();
            showActivePolicy(saved);
            feedback.textContent = "Saved " +
                (saved.algorithm === "sliding_window" ? "Sliding Window" : "Token Bucket") +
                " policy. Previous rate-limit histories were reset.";
            await loadMetrics();
        } catch (error) {
            console.error("Policy save failed:", error);
            feedback.textContent = "Could not save policy. Check the backend and your input.";
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Save Policy";
        }
    });
}

updatePolicyFields();
loadPolicy();

// Update the table when the decision filter changes
document.getElementById("decision-filter")?.addEventListener("change", loadMetrics);

// Update the table when the sorting option changes
document.getElementById("sort-metrics")?.addEventListener("change", loadMetrics);


// Handle clicks on per-client Reset Metrics buttons
document.getElementById("client-metrics-body")
    ?.addEventListener("click", async (event) => {

    const button = event.target.closest(
        "button.reset-client-metrics"
    );

    if (!button || button.disabled) {
        return;
    }

    // Identify the selected client
    const clientId = button.dataset.clientId;

    const status = document.getElementById(
        "client-reset-status"
    );

    // Ask for confirmation before resetting
    const confirmed = window.confirm(
        `Reset metrics for ${clientId}?\n\n` +
        "Only this client's counters will reset. " +
        "Global metrics and request history will remain unchanged."
    );

    if (!confirmed) {
        return;
    }

    button.disabled = true;
    button.textContent = "Resetting...";

    try {
        // Send the reset request to Python
        const response = await fetch(
            "http://127.0.0.1:5001/metrics/reset",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    client_id: clientId
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                "Reset failed: HTTP " + response.status
            );
        }

        // Display a success message
        if (status) {
            status.textContent =
                `${clientId}: metrics reset successfully.`;
        }

        // Refresh the metrics table
        await loadMetrics();

    } catch (error) {
        console.error("Client metrics reset failed:", error);

        if (status) {
            status.textContent =
                "Reset failed. Check your backend connection.";
        }

    } finally {
        button.disabled = false;
        button.textContent = "Reset Metrics";
    }
});

// Get the Export CSV button
const exportClientButton = document.getElementById("export-client-csv");

// Run the export function when the button is clicked
if (exportClientButton) {
    exportClientButton.addEventListener("click", () => {

        // Get all rows currently displayed in the live client table
        const tableRows = document.querySelectorAll("#client-metrics-body tr");

        // Define CSV column headings
        const csvRows = [
            ["Client ID", "Total", "Allowed", "Denied", "Deny Rate"]
        ];

        // Read each visible table row
        tableRows.forEach((row) => {
            const cells = row.querySelectorAll("td");

            // Only export actual client rows, not empty-state messages
        if (cells.length === 6) {
            // Export the five metrics columns, not the action button
            const values = Array.from(cells).slice(0, 5).map((cell) =>
                cell.textContent.trim()
            );

                csvRows.push(values);
            }
        });

        // Stop when no client records are available
        if (csvRows.length === 1) {
            alert("No client metrics available to export.");
            return;
        }

        // Escape special characters to produce valid CSV
        const csv = csvRows.map((row) =>
            row.map((value) => {
                // Prevent spreadsheet apps from interpreting values as formulas
                const safeValue = /^[=+\-@\t\r\n]/.test(value)
                    ? "'" + value
                    : value;

                return '"' + safeValue.replace(/"/g, '""') + '"';
            }).join(",")
        ).join("\r\n");

        // Create a downloadable CSV file
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        // Create a temporary download link
        const link = document.createElement("a");
        link.href = url;
        link.download = "trafficgovernor-client-metrics.csv";

        document.body.appendChild(link);
        link.click();

        // Remove the link after triggering the download
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}


function updateLiveTrafficCharts(volume) {
    // Check that the backend sent six intervals
    if (!Array.isArray(volume) || volume.length !== 6) {
        return;
    }

    // Locate the two existing request-volume charts
    const charts = [
        document.querySelector("#dashboard .chart-card svg"),
        document.querySelector("#metrics .chart-card svg")
    ];

    charts.forEach((svg) => {
        if (!svg) return;

        // X-coordinates of the six chart points
        const xPositions = [65, 159, 253, 347, 441, 535];

        // Find the largest request count to calculate chart scale
        const highest = Math.max(
            4,
            ...volume.map(item => item.requests)
        );

        const maxScale = Math.ceil(highest / 4) * 4;

        // Convert request counts into SVG coordinates
        const points = volume.map((item, index) => ({
            x: xPositions[index],
            y: 200 - (item.requests / maxScale) * 170
        }));

        // Update the blue line
        const line = svg.querySelector(".chart-line");

        if (line) {
            line.setAttribute(
                "points",
                points.map(point => `${point.x},${point.y}`).join(" ")
            );
        }

        // Move the blue circles
        svg.querySelectorAll(".chart-point").forEach((circle, index) => {
            if (points[index]) {
                circle.setAttribute("cy", points[index].y);
            }
        });

        // Update the vertical axis numbers
        svg.querySelectorAll('text[text-anchor="end"]')
            .forEach((label, index) => {
                if (index < 5) {
                    label.textContent = (maxScale * index) / 4;
                }
            });

        // Update the six horizontal-axis time labels
        const timeLabels = svg.querySelectorAll(
            'text[y="225"][text-anchor="middle"]'
        );

        volume.forEach((item, index) => {
            if (timeLabels[index]) {
                timeLabels[index].textContent = item.minute;
            }
        });

        // Update the chart description
        const title = svg.querySelector("title");
        const description = svg.querySelector("desc");

        if (title) {
            title.textContent = "Live API request volume";
        }

        if (description) {
            description.textContent = volume
                .map(item => `${item.minute}: ${item.requests} requests`)
                .join(", ");
        }

        // Change the horizontal-axis title
        const axisTitle = svg.querySelector('text[x="300"][y="255"]');

        if (axisTitle) {
            axisTitle.textContent = "Time (HH:MM)";
        }

        // Update the labels around the chart
        const card = svg.closest(".chart-card");

        if (card) {
            const badge = card.querySelector(".status-pill");

            if (badge) {
                badge.textContent = "Live";
            }

            const footer = card.querySelector(".chart-foot") ||
                           card.querySelector("figure + p");

            if (footer) {
                footer.textContent =
                    "Live API requests during the last six minutes.";
            }
        }
    });
}


// Listen for clicks on the Reset Filters button
document.addEventListener("click", (event) => {

    // Only run this code when Reset Filters is clicked
    if (event.target.id !== "reset-metrics-filters") {
        return;
    }

    // Find the three filter controls
    const searchInput = document.getElementById("client-filter");
    const decisionFilter = document.getElementById("decision-filter");
    const sortFilter = document.getElementById("sort-metrics");

    // Clear the client search
    if (searchInput) {
        searchInput.value = "";
    }

    // Select "All decisions"
    if (decisionFilter) {
        decisionFilter.selectedIndex = 0;
    }

    // Restore the default sorting option
    if (sortFilter) {
        sortFilter.selectedIndex = 0;
    }

    // Reload the metrics table with the default filters
    loadMetrics();


});


function updateLatencyChart(latencyData) {
    // Find the latency SVG chart
    const svg = document.getElementById("latency-chart");

    // Stop if the chart or data is unavailable
    if (!svg || !Array.isArray(latencyData) || latencyData.length !== 6) {
        return;
    }

    // Horizontal positions of the six minutes
    const xPositions = [65, 159, 253, 347, 441, 535];

    // Read each minute's average latency
    // null means no requests were measured
    const values = latencyData.map(item =>
        typeof item.avg_latency_ms === "number"
            ? item.avg_latency_ms
            : null
    );

    // Find the largest actual measurement
    const validValues = values.filter(value => value !== null);
    const maxLatency = Math.max(0.1, ...validValues);

    // Convert milliseconds to a position on the graph
    function getY(value) {
        return 200 - (value / maxLatency) * 170;
    }

    // Find the existing chart line
    let line = svg.querySelector(".chart-line");

    // Replace the polyline with a path, if needed
    if (line && line.tagName.toLowerCase() !== "path") {
        const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );

        path.setAttribute("class", "chart-line");
        path.setAttribute("fill", "none");
        line.replaceWith(path);
        line = path;
    }

    // Build the line, leaving gaps for minutes without data
    if (line) {
        let connected = false;

        const pathData = values.map((value, index) => {
            if (value === null) {
                connected = false;
                return "";
            }

            const command = connected ? "L" : "M";
            connected = true;

            return `${command} ${xPositions[index]} ${getY(value)}`;
        }).join(" ");

        line.setAttribute("d", pathData);
    }

    // Update the six blue chart points
    svg.querySelectorAll(".chart-point").forEach((circle, index) => {
        const value = values[index];

        if (value === null || value === undefined) {
            circle.style.display = "none";
        } else {
            circle.style.display = "";
            circle.setAttribute("cx", xPositions[index]);
            circle.setAttribute("cy", getY(value));
        }
    });

    // Find all text labels inside the chart
    const labels = Array.from(svg.querySelectorAll("text"));

    // Replace 01, 02, 03... with actual time labels
    latencyData.forEach((item, index) => {
        const label = labels.find(text =>
            Number(text.getAttribute("x")) === xPositions[index] &&
            Number(text.getAttribute("y")) === 225
        );

        if (label) {
            label.textContent = item.minute;
        }
    });

    // Update vertical-axis numbers to match the real latency
    const yPositions = [205, 162.5, 120, 77.5, 35];

    yPositions.forEach((y, index) => {
        const label = labels.find(text =>
            Number(text.getAttribute("x")) === 55 &&
            Number(text.getAttribute("y")) === y
        );

        if (label) {
            label.textContent = (maxLatency * index / 4).toFixed(2);
        }
    });

    // Update the horizontal-axis label
    const axisLabel = labels.find(text =>
        Number(text.getAttribute("x")) === 300 &&
        Number(text.getAttribute("y")) === 255
    );

    if (axisLabel) {
        axisLabel.textContent = "Time (HH:MM)";
    }
}


 // Find the Export Report button
const exportReportButton = document.getElementById("export-report");

if (exportReportButton) {

    // Enable the button now that JavaScript is ready
    exportReportButton.disabled = false;

    // Run this function when the button is clicked
    exportReportButton.addEventListener("click", async () => {

        // Prevent multiple downloads while processing
        exportReportButton.disabled = true;

        try {
            // Request the latest statistics from the Python backend
            const response = await fetch("http://127.0.0.1:5001/metrics");

            // Stop if the API request fails
            if (!response.ok) {
                throw new Error("Unable to fetch report data");
            }

            // Convert the JSON response into a JavaScript object
            const data = await response.json();

            // Calculate the deny percentage
            const denyRate = data.total > 0
                ? ((data.denied / data.total) * 100).toFixed(2)
                : "0.00";

            // Format latency measurements
            const formatLatency = (value) =>
                value == null ? "Not available" : Number(value).toFixed(2) + " ms";

            // Export EVERY stored request, retrieving all pages from /logs.
            const logs = await fetchAllRequestHistory();

            // Prepare the report content
            const lines = [
                "TRAFFICGOVERNOR - ANALYSIS REPORT",
                "Generated: " + new Date().toLocaleString(),
                "",
                "TRAFFIC SUMMARY",
                "Total requests: " + data.total,
                "Allowed requests: " + data.allowed,
                "Denied requests: " + data.denied,
                "Deny rate: " + denyRate + "%",
                "Average latency: " + formatLatency(data.avg_latency_ms),
                "P95 latency: " + formatLatency(data.p95_latency_ms),
                "",
                "ALL REQUEST DECISIONS SINCE SERVER STARTUP"
            ];

            // Add each API request to the report
            logs.forEach((log) => {
                lines.push(
                    "#" + (log.id ?? "?") +
                    " | Time: " + (log.timestamp || "Unknown") +
                    " | Client: " + (log.client_id || "Unknown") +
                    " | Endpoint: " + (log.endpoint || "/check") +
                    " | Decision: " + log.decision +
                    " | HTTP: " + log.status
                );
            });

            if (logs.length === 0) {
                lines.push("No request records available.");
            }

            // Join all lines into a single text document
            const reportText = lines.join("\n");

            // Create a downloadable text file
            const blob = new Blob([reportText], {
                type: "text/plain;charset=utf-8"
            });

            // Generate a temporary download URL
            const url = URL.createObjectURL(blob);

            // Create a temporary download link
            const link = document.createElement("a");
            link.href = url;
            link.download = "TrafficGovernor_Analysis_Report.txt";

            // Start downloading the report
            document.body.appendChild(link);
            link.click();
            link.remove();

            // Release the temporary URL after downloading starts
            setTimeout(() => URL.revokeObjectURL(url), 1000);

        } catch (error) {
            console.error("Report export failed:", error);
            alert("Could not export report. Check the backend connection.");

        } finally {
            // Enable the button again
            exportReportButton.disabled = false;
        }
    });
}



// US-06: Role-based policy editing (local demo)

const roleSelector = document.getElementById("role");

const policyRoleMessage = document.getElementById("policy-role-message");

const roleApi = "http://127.0.0.1:5001/role";

// Show or hide policy editing based on the selected role
function applyRole(role) {
    const isNetworkOps = role === "network_ops";

    // Update the sidebar to display the active role
const sidebarRoleLabel = document.getElementById("sidebar-role-label");

    if (sidebarRoleLabel) {
        sidebarRoleLabel.textContent =
            role === "network_ops"
                ? "Network Ops"
                : "Infrastructure Engineer";
        }

    if (roleSelector) {
        roleSelector.value = role;
    }

    if (policyForm) {
        policyForm.hidden = isNetworkOps;
    }

    if (policyRoleMessage) {
        policyRoleMessage.hidden = !isNetworkOps;
    }
}

// Read the active role when the page opens
async function loadRole() {
    try {
        const response = await fetch(roleApi);

        if (!response.ok) {
            throw new Error("Unable to load role");
        }

        const data = await response.json();
        applyRole(data.role);
    } catch (error) {
        console.error("Role loading failed:", error);

        // Avoid showing editable controls when role is unknown
        applyRole("network_ops");
        if (roleSelector) roleSelector.disabled = true;
        if (policyRoleMessage) {
            policyRoleMessage.textContent =
                "Unable to verify permissions. Policy editing is unavailable.";
        }
    }
}

// Change the role when the dropdown changes
if (roleSelector) {
    roleSelector.addEventListener("change", async () => {
        const previousRole = (
            policyForm && policyForm.hidden
        ) ? "network_ops" : "infrastructure_engineer";

        const selectedRole = roleSelector.value;
        roleSelector.disabled = true;

        try {
            const response = await fetch(roleApi, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    role: selectedRole
                })
            });

            if (!response.ok) {
                throw new Error("Role update failed");
            }

            const data = await response.json();
            applyRole(data.role);
        } catch (error) {
            console.error(error);
            applyRole(previousRole);
            alert("Unable to change role. Check the backend.");
        } finally {
            roleSelector.disabled = false;
        }
    });
}

// Initialize the role selector
loadRole();
