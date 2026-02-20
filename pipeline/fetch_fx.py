#!/usr/bin/env python3
"""Fetch ECB FX reference rates and export static JSON files for the frontend."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

ECB_BASE_URL = "https://data-api.ecb.europa.eu/service/data/EXR"
DEFAULT_START_PERIOD = "2015-01-01"
REQUEST_TIMEOUT_SECONDS = 30
MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2


@dataclass(frozen=True)
class PairConfig:
    pair: str
    quote: str
    file_name: str

    @property
    def series_key(self) -> str:
        # Dataset key format for daily reference series: D.<QUOTE>.EUR.SP00.A
        return f"D.{self.quote}.EUR.SP00.A"


PAIR_CONFIGS = (
    PairConfig(pair="EUR/SEK", quote="SEK", file_name="fx_EURSEK.json"),
    PairConfig(pair="EUR/USD", quote="USD", file_name="fx_EURUSD.json"),
    PairConfig(pair="EUR/GBP", quote="GBP", file_name="fx_EURGBP.json"),
    PairConfig(pair="EUR/JPY", quote="JPY", file_name="fx_EURJPY.json"),
    PairConfig(pair="EUR/NOK", quote="NOK", file_name="fx_EURNOK.json"),
    PairConfig(pair="EUR/CHF", quote="CHF", file_name="fx_EURCHF.json"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch ECB FX rates into static JSON files")
    parser.add_argument(
        "--output-dir",
        default="site/public/data",
        help="Directory where JSON files are written (default: site/public/data)",
    )
    parser.add_argument(
        "--start-period",
        default=DEFAULT_START_PERIOD,
        help=f"ECB startPeriod in YYYY-MM-DD format (default: {DEFAULT_START_PERIOD})",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Log level",
    )
    return parser.parse_args()


def fetch_csv_rows(client: requests.Session, pair_config: PairConfig, start_period: str) -> list[dict[str, str]]:
    params = {
        "startPeriod": start_period,
        "format": "csvdata",
    }
    url = f"{ECB_BASE_URL}/{pair_config.series_key}"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logging.info("Fetching %s (attempt %d/%d)", pair_config.pair, attempt, MAX_RETRIES)
            response = client.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            response.raise_for_status()
            rows = list(csv.DictReader(response.text.splitlines()))
            if not rows:
                raise ValueError(f"ECB returned an empty response for {pair_config.pair}")
            return rows
        except (requests.RequestException, ValueError) as exc:
            if attempt == MAX_RETRIES:
                raise RuntimeError(f"Failed to fetch {pair_config.pair} after {MAX_RETRIES} attempts") from exc
            sleep_seconds = RETRY_BACKOFF_SECONDS * attempt
            logging.warning("Fetch failed for %s: %s. Retrying in %ds", pair_config.pair, exc, sleep_seconds)
            time.sleep(sleep_seconds)

    raise RuntimeError(f"Unreachable: fetch loop did not return for {pair_config.pair}")


def parse_series(rows: list[dict[str, str]], pair: str) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []

    for row in rows:
        date = row.get("TIME_PERIOD")
        value = row.get("OBS_VALUE")
        if not date or not value:
            continue

        try:
            rate = float(value)
        except ValueError:
            logging.debug("Skipping invalid rate for %s: %s", pair, value)
            continue

        if rate <= 0:
            logging.debug("Skipping non-positive rate for %s: %s", pair, value)
            continue

        series.append({"date": date, "rate": round(rate, 6)})

    series.sort(key=lambda x: x["date"])
    return series


def validate_series(series: list[dict[str, Any]], pair: str) -> None:
    if not series:
        raise ValueError(f"Series is empty for {pair}")
    for item in series:
        rate = item["rate"]
        if not isinstance(rate, (int, float)) or rate <= 0:
            raise ValueError(f"Invalid rate in {pair}: {rate!r}")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(message)s",
    )

    output_dir = Path(args.output_dir)
    generated_utc = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    with requests.Session() as client:
        for pair_config in PAIR_CONFIGS:
            rows = fetch_csv_rows(client, pair_config, args.start_period)
            series = parse_series(rows, pair_config.pair)
            validate_series(series, pair_config.pair)

            payload = {
                "pair": pair_config.pair,
                "source": "ECB",
                "generated_utc": generated_utc,
                "series": series,
            }
            write_json(output_dir / pair_config.file_name, payload)
            logging.info("Wrote %s (%d points)", pair_config.file_name, len(series))

    manifest_payload = {
        "source": "ECB",
        "generated_utc": generated_utc,
        "pairs": [
            {
                "pair": pair_config.pair,
                "file": pair_config.file_name,
                "series_key": pair_config.series_key,
            }
            for pair_config in PAIR_CONFIGS
        ],
    }
    write_json(output_dir / "manifest.json", manifest_payload)
    logging.info("Wrote manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
