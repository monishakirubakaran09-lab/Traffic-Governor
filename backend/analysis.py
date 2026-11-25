"""TrafficGovernor analysis for US-08 (status counts) and US-09 (trip latency).

Run from project root:
    python3 -m backend.analysis --csv data/sample_traces.csv --output-dir reports
"""
from argparse import ArgumentParser
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Render PNGs without a graphical window.
import matplotlib.pyplot as plt

REQUIRED_COLUMNS = ['timestamp', 'endpoint', 'statusCode', 'latencyMs', 'circuitState']


def load_traces(csv_path):
    path = Path(csv_path)
    if not path.is_file():
        raise FileNotFoundError(f'CSV file not found: {path}')
    data = pd.read_csv(path)
    missing = [column for column in REQUIRED_COLUMNS if column not in data.columns]
    if missing:
        raise ValueError(f'Missing columns: {missing}')
    data['timestamp'] = pd.to_datetime(data['timestamp'], errors='coerce', utc=True)
    data['statusCode'] = pd.to_numeric(data['statusCode'], errors='coerce')
    data['latencyMs'] = pd.to_numeric(data['latencyMs'], errors='coerce')
    if data[REQUIRED_COLUMNS].isna().any().any():
        raise ValueError('CSV contains missing/invalid values (check duplicate headers)')
    if (data['latencyMs'] < 0).any():
        raise ValueError('Latency cannot be negative')
    if ((data['statusCode'] % 1) != 0).any():
        raise ValueError('Status code must be a whole number')
    data['statusCode'] = data['statusCode'].astype(int)
    return data.sort_values('timestamp').reset_index(drop=True)


def status_distribution(data):
    counts = data['statusCode'].value_counts()
    total = len(data)
    success = int(counts.get(200, 0))
    unavailable = int(counts.get(503, 0))
    other = total - success - unavailable

    def percentage(count):
        return round(count / total * 100, 2) if total else 0.0

    return {
        'total': total,
        '200': {'count': success, 'percentage': percentage(success)},
        '503': {'count': unavailable, 'percentage': percentage(unavailable)},
        'other': {'count': other, 'percentage': percentage(other)},
    }


def plot_status_distribution(data, output_path):
    result = status_distribution(data)
    labels = ['HTTP 200', 'HTTP 503', 'Other']
    keys = ['200', '503', 'other']
    counts = [result[key]['count'] for key in keys]
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(labels, counts)
    ax.set_title('TrafficGovernor - HTTP Status Distribution (CSV)')
    ax.set_xlabel('HTTP response status')
    ax.set_ylabel('Number of requests')
    ax.set_ylim(0, max(counts + [1]) * 1.25)
    for bar, key in zip(bars, keys):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(),
                f"{result[key]['count']} ({result[key]['percentage']:.2f}%)",
                ha='center', va='bottom')
    fig.tight_layout()
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return output_path


def detect_circuit_trips(data):
    traces = data.copy()
    traces['_state'] = traces['circuitState'].astype(str).str.strip().str.upper()
    traces = traces.sort_values(['endpoint', 'timestamp'])
    previous_state = traces.groupby('endpoint')['_state'].shift(1)
    trips = traces[(previous_state == 'CLOSED') & (traces['_state'] == 'OPEN')]
    return [{'endpoint': row['endpoint'], 'trip_time': row['timestamp'].isoformat()}
            for _, row in trips.iterrows()]


def _trip_windows(data, trip, window_seconds):
    trip_time = pd.Timestamp(trip['trip_time'])
    duration = pd.Timedelta(seconds=window_seconds)
    relevant = data[data['endpoint'] == trip['endpoint']].sort_values('timestamp')
    before = relevant[(relevant['timestamp'] >= trip_time - duration) &
                      (relevant['timestamp'] < trip_time)]
    after = relevant[(relevant['timestamp'] >= trip_time) &
                     (relevant['timestamp'] < trip_time + duration)]
    return trip_time, before, after


def compare_latency_around_trips(data, window_seconds=60):
    if window_seconds <= 0:
        raise ValueError('Window must be positive')
    results = []
    for trip in detect_circuit_trips(data):
        _, before, after = _trip_windows(data, trip, window_seconds)
        before_avg = round(float(before['latencyMs'].mean()), 2) if len(before) else None
        after_avg = round(float(after['latencyMs'].mean()), 2) if len(after) else None
        change = round(after_avg - before_avg, 2) if before_avg is not None and after_avg is not None else None
        results.append({'endpoint': trip['endpoint'], 'trip_time': trip['trip_time'],
                        'before_count': len(before), 'after_count': len(after),
                        'before_avg_ms': before_avg, 'after_avg_ms': after_avg, 'change_ms': change})
    return results


def plot_latency_comparison(data, output_path, window_seconds=60):
    """Draw sample-by-sample latency curves; 0 seconds marks CLOSED -> OPEN."""
    if window_seconds <= 0:
        raise ValueError('Window must be positive')
    comparisons = compare_latency_around_trips(data, window_seconds)
    valid = [item for item in comparisons if item['change_ms'] is not None]
    if not valid:
        raise ValueError('No circuit trips have sufficient latency data')
    fig, axes = plt.subplots(len(valid), 1, figsize=(9, max(4.5, 3.6 * len(valid))), squeeze=False)
    for ax, item in zip(axes[:, 0], valid):
        trip = {'endpoint': item['endpoint'], 'trip_time': item['trip_time']}
        trip_time, before, after = _trip_windows(data, trip, window_seconds)
        # Negative x-values: before trip; zero and positive x-values: after.
        before_seconds = (before['timestamp'] - trip_time).dt.total_seconds()
        after_seconds = (after['timestamp'] - trip_time).dt.total_seconds()
        ax.plot(before_seconds, before['latencyMs'], 'o-', label='Before trip')
        ax.plot(after_seconds, after['latencyMs'], 'o-', label='From trip onward')
        ax.axvline(0, linestyle='--', color='black', label='CLOSED → OPEN trip')
        ax.set_title(f"{item['endpoint']} | Trip: {trip_time.strftime('%Y-%m-%d %H:%M:%S UTC')}")
        ax.set_xlabel('Time relative to circuit trip (seconds)')
        ax.set_ylabel('Request latency (ms)')
        # Zoom around observed samples while keeping the trip time visible.
        extent = max(abs(before_seconds.min()), abs(after_seconds.max()), 1)
        zoom = min(window_seconds, max(5, extent * 1.25))
        ax.set_xlim(-zoom, zoom)
        ax.set_ylim(bottom=0)
        ax.grid(True, alpha=0.25)
        ax.legend()
    fig.suptitle('TrafficGovernor - Latency Before and After Circuit Trip')
    fig.tight_layout()
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return output_path


def main(argv=None):
    """The original script had no entry point; this prints US-08 evidence."""
    parser = ArgumentParser(description='Analyze TrafficGovernor CSV trace')
    parser.add_argument('--csv', default='data/sample_traces.csv')
    parser.add_argument('--output-dir', default='reports')
    parser.add_argument('--window-seconds', type=float, default=60)
    args = parser.parse_args(argv)
    data = load_traces(args.csv)
    stats = status_distribution(data)
    print(f"Source CSV: {args.csv}\nTotal trace requests: {stats['total']}")
    for key, label in [('200', 'HTTP 200'), ('503', 'HTTP 503'), ('other', 'Other codes')]:
        print(f"{label}: {stats[key]['count']} ({stats[key]['percentage']:.2f}%)")
    status_path = plot_status_distribution(data, Path(args.output_dir) / 'status_distribution.png')
    print(f'Status chart saved: {status_path}')
    comparisons = compare_latency_around_trips(data, args.window_seconds)
    print(f'CLOSED → OPEN trips: {len(comparisons)}')
    for item in comparisons:
        print(f"{item['endpoint']} @ {item['trip_time']}")
        if item['change_ms'] is None:
            print('  No comparison: missing before/after samples')
        else:
            print(f"  Before: {item['before_avg_ms']:.2f} ms; From trip onward: {item['after_avg_ms']:.2f} ms; Change: {item['change_ms']:+.2f} ms")
    if any(item['change_ms'] is not None for item in comparisons):
        latency_path = plot_latency_comparison(data, Path(args.output_dir) / 'latency_comparison.png', args.window_seconds)
        print(f'Latency curves saved: {latency_path}')
    else:
        print('Latency curve not generated: insufficient before/after samples')


if __name__ == '__main__':
    main()
