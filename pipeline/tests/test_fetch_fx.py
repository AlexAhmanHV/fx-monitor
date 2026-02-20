from pipeline.fetch_fx import parse_series, validate_series


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
