# ChatTrack

ChatTrack is a chat-driven trading playground. Type allocation instructions, backtest them against 1-minute candles, and visualize equity, drawdown, and core performance metrics in real time.

## Project Structure

```
chattrack/
  backend/   # FastAPI + yfinance service
  frontend/  # Vite + React dashboard
```

## Prerequisites

- Python 3.11+
- Node.js 18+

## Quickstart

### Backend

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The FastAPI service exposes:
- `GET /api/health`
- `GET /api/candles?symbol=SPY&interval=1m&start=YYYY-MM-DD&end=YYYY-MM-DD`
- `POST /api/metrics`

Minute candles are cached to Parquet in `backend/data/cache/`. If Yahoo Finance is unavailable, sample CSVs (`spy_sample_1m.csv`, `aapl_sample_1m.csv`) are used as a fallback and an offline banner is shown in the UI.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) to open the ChatTrack dashboard.

## Usage Tips

1. Click **“Load SPY (1m, last 2 days)”** to fetch recent minute candles.
2. Try chat prompts like:
   - `Start with 100k`
   - `Buy 10 SPY`
   - `Allocate 40% to AAPL`
   - `Backtest 2024-10-01 to 2024-10-03`
3. Toggle **“Compare vs SPY”** to overlay a buy-and-hold benchmark.

The backtest runs in a web worker to keep the UI responsive. Equity curve and drawdown charts update with every instruction, while the backend computes CAGR, Sharpe, total return, and more.

## Run Scripts

One-liners for convenience:

```bash
./backend/run.sh    # starts FastAPI on :8000
./frontend/run.sh   # starts Vite dev server on :5173
```
