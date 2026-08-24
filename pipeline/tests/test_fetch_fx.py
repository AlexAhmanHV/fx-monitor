from pipeline.fetch_fx import build_status_payload, parse_series, validate_series


def test_parse_and_validate_series_smoke() -> None:
    rows = [
        {"TIME_PERIOD": "2026-02-18", "OBS_VALUE": "11.1234"},
        {"TIME_PERIOD": "2026-02-19", "OBS_VALUE": "11.2234"},
        {"TIME_PERIOD": "2026-02-20", "OBS_VALUE": "11.3234"},
    ]

    series = parse_series(rows, "EUR/SEK")

    assert len(series) == 3
    assert all(item["rate"] > 0 for item in series)
    assert series[0]["date"] == "2026-02-18"

    validate_series(series, "EUR/SEK")


def test_build_status_payload_all_ok() -> None:
    pair_results = [
        {"pair": "EUR/SEK", "status": "ok", "points": 100},
        {"pair": "EUR/USD", "status": "ok", "points": 100},
    ]

    payload = build_status_payload(pair_results, "2026-08-24T04:30:00Z")

    assert payload == {
        "generated_utc": "2026-08-24T04:30:00Z",
        "status": "ok",
        "pairs": pair_results,
    }


def test_build_status_payload_partial_failure() -> None:
    pair_results = [
        {"pair": "EUR/SEK", "status": "ok", "points": 100},
        {"pair": "EUR/JPY", "status": "error", "message": "boom"},
    ]

    payload = build_status_payload(pair_results, "2026-08-24T04:30:00Z")

    assert payload["status"] == "partial"


def test_build_status_payload_total_failure() -> None:
    pair_results = [
        {"pair": "EUR/SEK", "status": "error", "message": "boom"},
        {"pair": "EUR/JPY", "status": "error", "message": "boom"},
    ]

    payload = build_status_payload(pair_results, "2026-08-24T04:30:00Z")

    assert payload["status"] == "failed"
