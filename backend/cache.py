import os
import pathlib
import shutil
from typing import Optional

import pandas as pd

DATA_DIR = pathlib.Path(__file__).parent / "data"
CACHE_DIR = DATA_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

CACHE_LIMIT_BYTES = 100 * 1024 * 1024  # ~100MB


def cache_path(symbol: str, interval: str, start: str, end: str, aggregate: str | None = None) -> pathlib.Path:
    safe_symbol = symbol.upper().replace("/", "-")
    agg_suffix = f"_{aggregate}" if aggregate else ""
    filename = f"{safe_symbol}_{interval}_{start}_{end}{agg_suffix}.parquet"
    return CACHE_DIR / filename


def read_parquet_or_none(path: pathlib.Path) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    try:
        return pd.read_parquet(path)
    except Exception:
        try:
            path.unlink(missing_ok=True)
        finally:
            return None


def write_parquet(df: pd.DataFrame, path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=True)
    _enforce_cache_limit()


def _enforce_cache_limit() -> None:
    total_size = 0
    files: list[tuple[pathlib.Path, float]] = []
    for file in CACHE_DIR.glob("*.parquet"):
        try:
            stat = file.stat()
        except FileNotFoundError:
            continue
        total_size += stat.st_size
        files.append((file, stat.st_mtime))
    if total_size <= CACHE_LIMIT_BYTES:
        return
    files.sort(key=lambda x: x[1])
    for file, _ in files:
        try:
            size = file.stat().st_size
        except FileNotFoundError:
            size = 0
        try:
            file.unlink()
        except FileNotFoundError:
            pass
        total_size -= size
        if total_size <= CACHE_LIMIT_BYTES:
            break


def aggregate(df: pd.DataFrame, freq: str) -> pd.DataFrame:
    if df.empty:
        return df
    if not df.index.tzinfo:
        df = df.tz_localize("UTC")
    agg = df.resample(freq).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna()
    return agg


__all__ = [
    "cache_path",
    "read_parquet_or_none",
    "write_parquet",
    "aggregate",
]
