from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf
from dateutil import parser as dateparser
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator

from . import cache

logger = logging.getLogger("chattrack.backend")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ChatTrack API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"


class CandleResponse(BaseModel):
    symbol: str
    interval: str
    aggregate: str = Field(default="1m")
    candles: list[dict[str, Any]]
    offline: bool = False


class EquityPoint(BaseModel):
    t: int
    value: float


class MetricsRequest(BaseModel):
    equity: list[EquityPoint]
    rf_rate_annual: float = Field(default=0.02)
    trades_count: int | None = None

    @validator("equity")
    def validate_equity(cls, value: list[EquityPoint]) -> list[EquityPoint]:
        if len(value) < 1:
            raise ValueError("equity series must contain at least one point")
        return value


class MetricsResponse(BaseModel):
    totalReturnPct: float
    cagr: float
    sharpe: float
    maxDDPct: float
    volAnnualized: float
    tradesCount: int


@app.on_event("startup")
async def preload_latest_data() -> None:
    loop = asyncio.get_running_loop()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    symbols = ["SPY", "AAPL", "MSFT"]
    tasks = []
    for symbol in symbols:
        tasks.append(
            loop.run_in_executor(
                None,
                lambda sym=symbol: _preload_symbol(sym, start, end),
            )
        )
    await asyncio.gather(*tasks, return_exceptions=True)


def _preload_symbol(symbol: str, start: datetime, end: datetime) -> None:
    try:
        fetch_candles(symbol=symbol, interval="1m", start=start.isoformat(), end=end.isoformat())
    except Exception as exc:  # noqa: BLE001
        logger.info("preload failed for %s: %s", symbol, exc)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/candles", response_model=CandleResponse)
def get_candles(
    symbol: str = Query(..., description="Ticker symbol"),
    interval: str = Query("1m", regex=r"^\d+[mdwk]$|^1m$"),
    start: str | None = Query(None, description="ISO start date/time"),
    end: str | None = Query(None, description="ISO end date/time"),
    aggregate: str | None = Query(None, regex=r"^(1m|5m|15m)$"),
) -> CandleResponse:
    df, offline = fetch_candles(symbol=symbol, interval=interval, start=start, end=end, aggregate=aggregate)
    candles = _df_to_candles(df)
    return CandleResponse(
        symbol=symbol.upper(),
        interval=interval,
        aggregate=aggregate or "1m",
        candles=candles,
        offline=offline,
    )


@app.post("/api/metrics", response_model=MetricsResponse)
def post_metrics(payload: MetricsRequest) -> MetricsResponse:
    equity_df = pd.DataFrame([{"t": point.t, "value": point.value} for point in payload.equity])
    equity_df = equity_df.sort_values("t").drop_duplicates("t")
    values = equity_df["value"]
    returns = values.pct_change().dropna()
    if len(values) < 2:
        total_return = 0.0
    else:
        total_return = (values.iloc[-1] / values.iloc[0]) - 1

    duration_seconds = max((equity_df["t"].iloc[-1] - equity_df["t"].iloc[0]) / 1000, 1)
    period_seconds = duration_seconds / max(len(values) - 1, 1)
    annual_factor = (365 * 24 * 60 * 60) / period_seconds

    excess_returns = returns - (payload.rf_rate_annual / annual_factor)
    vol = returns.std() * (annual_factor ** 0.5) if not returns.empty else 0.0
    sharpe = (excess_returns.mean() * annual_factor / vol) if vol else 0.0

    max_dd = _max_drawdown(values)
    cagr_value = _cagr(values, duration_seconds)
    trades_count = payload.trades_count if payload.trades_count is not None else 0

    return MetricsResponse(
        totalReturnPct=total_return * 100,
        cagr=cagr_value * 100,
        sharpe=sharpe,
        maxDDPct=max_dd * 100,
        volAnnualized=vol * 100,
        tradesCount=trades_count,
    )


def fetch_candles(
    *,
    symbol: str,
    interval: str,
    start: str | None,
    end: str | None,
    aggregate: str | None = None,
) -> tuple[pd.DataFrame, bool]:
    if end:
        end_dt = dateparser.isoparse(end)
    else:
        end_dt = datetime.now(timezone.utc)
    if start:
        start_dt = dateparser.isoparse(start)
    else:
        start_dt = end_dt - timedelta(days=2)

    start_key = start_dt.strftime("%Y%m%d%H%M")
    end_key = end_dt.strftime("%Y%m%d%H%M")
    cache_path = cache.cache_path(symbol, interval, start_key, end_key, aggregate)
    df = cache.read_parquet_or_none(cache_path)
    offline = False
    if df is None:
        df, offline = _download_or_fallback(symbol, interval, start_dt, end_dt)
        if aggregate and aggregate != interval:
            df_to_cache = cache.aggregate(df, aggregate)
        else:
            df_to_cache = df
        try:
            cache.write_parquet(df_to_cache, cache_path)
        except Exception as exc:  # noqa: BLE001
            logger.info("cache write failed for %s: %s", cache_path, exc)
    if aggregate and aggregate != interval:
        df = cache.aggregate(df, aggregate)
    return df, offline


def _download_or_fallback(symbol: str, interval: str, start_dt: datetime, end_dt: datetime) -> tuple[pd.DataFrame, bool]:
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(interval=interval, start=start_dt, end=end_dt, auto_adjust=False)
        if hist is not None and not hist.empty:
            df = hist.rename(columns={col: col.lower() for col in hist.columns})
            df = df[["open", "high", "low", "close", "volume"]]
            df.index = pd.to_datetime(df.index, utc=True)
            _persist_csv(symbol, interval, df)
            return df, False
    except Exception as exc:  # noqa: BLE001
        logger.info("yfinance fetch failed for %s: %s", symbol, exc)
    fallback = _load_fallback(symbol, interval)
    if fallback is not None:
        return fallback, True
    raise HTTPException(status_code=404, detail="No data available online or offline for requested symbol")


def _persist_csv(symbol: str, interval: str, df: pd.DataFrame) -> None:
    filename = f"{symbol.lower()}_sample_{interval}.csv"
    path = DATA_DIR / filename
    if path.exists():
        return
    out_df = df.copy()
    out_df.index = out_df.index.tz_convert("UTC")
    out_df.reset_index(inplace=True)
    out_df.rename(columns={"index": "timestamp"}, inplace=True)
    out_df.to_csv(path, index=False)


def _load_fallback(symbol: str, interval: str) -> pd.DataFrame | None:
    filename = f"{symbol.lower()}_sample_{interval}.csv"
    path = DATA_DIR / filename
    if not path.exists():
        return None
    csv_df = pd.read_csv(path, parse_dates=["timestamp"])
    csv_df.set_index(pd.to_datetime(csv_df["timestamp"], utc=True), inplace=True)
    csv_df = csv_df[["open", "high", "low", "close", "volume"]]
    return csv_df


def _df_to_candles(df: pd.DataFrame) -> list[dict[str, Any]]:
    candles: list[dict[str, Any]] = []
    for ts, row in df.iterrows():
        timestamp = int(pd.Timestamp(ts).tz_convert("UTC").value // 10**6)
        candles.append(
            {
                "t": timestamp,
                "o": float(row["open"]),
                "h": float(row["high"]),
                "l": float(row["low"]),
                "c": float(row["close"]),
                "v": float(row["volume"]),
            }
        )
    return candles


def _max_drawdown(values: pd.Series) -> float:
    running_max = values.cummax()
    drawdown = (values / running_max) - 1
    return drawdown.min() if not drawdown.empty else 0.0


def _cagr(values: pd.Series, duration_seconds: float) -> float:
    if len(values) < 2:
        return 0.0
    total_return = values.iloc[-1] / values.iloc[0]
    duration_years = duration_seconds / (365 * 24 * 3600)
    if duration_years <= 1 / 365:
        return total_return - 1
    return total_return ** (1 / duration_years) - 1


__all__ = ["app"]
