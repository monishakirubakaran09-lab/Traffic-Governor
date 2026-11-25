"""Run from project root: python3 -m unittest -v backend.test_analysis"""
import tempfile
import unittest
from pathlib import Path
from backend.analysis import (
    load_traces, status_distribution, plot_status_distribution,
    detect_circuit_trips, compare_latency_around_trips,
    plot_latency_comparison, main,
)

HEADER = 'timestamp,endpoint,statusCode,latencyMs,circuitState\n'
ROWS = (
    '2026-11-22 10:00:00,/api/data,200,35,CLOSED\n'
    '2026-11-22 10:00:01,/api/data,200,40,CLOSED\n'
    '2026-11-22 10:00:02,/api/data,503,120,OPEN\n'
    '2026-11-22 10:00:03,/api/data,503,110,OPEN\n'
    '2026-11-22 10:00:04,/api/data,200,42,CLOSED\n'
)

class TestAnalysis(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.csv_path = Path(self.temp_dir.name) / 'test.csv'

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_csv(self, text=HEADER + ROWS):
        self.csv_path.write_text(text, encoding='utf-8')
        return self.csv_path

    def test_valid_csv(self):
        self.assertEqual(len(load_traces(self.write_csv())), 5)

    def test_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            load_traces('not_a_real_trace_9923.csv')

    def test_missing_column(self):
        with self.assertRaises(ValueError):
            load_traces(self.write_csv('timestamp,endpoint,statusCode,latencyMs\n2026-11-22 10:00:00,/api,200,35\n'))

    def test_negative_latency(self):
        with self.assertRaises(ValueError):
            load_traces(self.write_csv(HEADER + '2026-11-22 10:00:00,/api,200,-35,CLOSED\n'))

    def test_repeated_csv_header_rejected(self):
        with self.assertRaises(ValueError):
            load_traces(self.write_csv(HEADER + ROWS + HEADER + ROWS))

    def test_invalid_timestamp_rejected(self):
        with self.assertRaises(ValueError):
            load_traces(self.write_csv(HEADER + 'not-a-date,/api,200,10,CLOSED\n'))

    def test_status_distribution(self):
        result = status_distribution(load_traces(self.write_csv()))
        self.assertEqual(result['total'], 5)
        self.assertEqual(result['200'], {'count': 3, 'percentage': 60.0})
        self.assertEqual(result['503'], {'count': 2, 'percentage': 40.0})
        self.assertEqual(result['other']['count'], 0)

    def test_other_status_counted(self):
        data = load_traces(self.write_csv(HEADER + ROWS + '2026-11-22 10:00:05,/api/data,429,10,CLOSED\n'))
        self.assertEqual(status_distribution(data)['other']['percentage'], 16.67)

    def test_empty_csv_distribution(self):
        result = status_distribution(load_traces(self.write_csv(HEADER)))
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['200']['percentage'], 0.0)

    def test_status_chart_export(self):
        output = Path(self.temp_dir.name) / 'status.png'
        self.assertTrue(plot_status_distribution(load_traces(self.write_csv()), output).is_file())
        self.assertGreater(output.stat().st_size, 0)

    def test_circuit_trip_detection(self):
        trips = detect_circuit_trips(load_traces(self.write_csv()))
        self.assertEqual(len(trips), 1)
        self.assertEqual(trips[0]['endpoint'], '/api/data')
        self.assertEqual(trips[0]['trip_time'], '2026-11-22T10:00:02+00:00')

    def test_independent_endpoint_trip_detection(self):
        rows = (HEADER + '2026-11-22 10:00:00,/a,200,10,CLOSED\n'
                + '2026-11-22 10:00:01,/b,503,20,OPEN\n'
                + '2026-11-22 10:00:02,/a,503,80,OPEN\n')
        trips = detect_circuit_trips(load_traces(self.write_csv(rows)))
        self.assertEqual(len(trips), 1)
        self.assertEqual(trips[0]['endpoint'], '/a')

    def test_latency_comparison(self):
        result = compare_latency_around_trips(load_traces(self.write_csv()))[0]
        self.assertEqual(result['before_count'], 2)
        self.assertEqual(result['after_count'], 3)
        self.assertEqual(result['before_avg_ms'], 37.50)
        self.assertEqual(result['after_avg_ms'], 90.67)
        self.assertEqual(result['change_ms'], 53.17)

    def test_latency_chart_export(self):
        output = Path(self.temp_dir.name) / 'latency.png'
        self.assertTrue(plot_latency_comparison(load_traces(self.write_csv()), output).is_file())
        self.assertGreater(output.stat().st_size, 0)

    def test_insufficient_latency_data(self):
        rows = (HEADER + '2026-11-22 10:00:00,/api,200,35,CLOSED\n'
                + '2026-11-22 10:02:00,/api,503,120,OPEN\n')
        data = load_traces(self.write_csv(rows))
        self.assertIsNone(compare_latency_around_trips(data)[0]['before_avg_ms'])
        with self.assertRaises(ValueError):
            plot_latency_comparison(data, Path(self.temp_dir.name) / 'invalid.png')

    def test_invalid_window(self):
        with self.assertRaises(ValueError):
            compare_latency_around_trips(load_traces(self.write_csv()), 0)

    def test_cli_outputs_two_charts(self):
        self.write_csv()
        dest = Path(self.temp_dir.name) / 'reports'
        main(['--csv', str(self.csv_path), '--output-dir', str(dest)])
        self.assertTrue((dest / 'status_distribution.png').is_file())
        self.assertTrue((dest / 'latency_comparison.png').is_file())

if __name__ == '__main__':
    unittest.main()
