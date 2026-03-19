"""
Fetch daily adjusted closing prices from Yahoo Finance and save as a static CSV.
"""

import yfinance as yf
import pandas as pd
from pathlib import Path

TICKERS = ["AAPL", "MSFT", "GOOGL", "JPM", "JNJ", "SPY", "QQQ", "GLD", "TLT"]
START = "2010-01-01"
END = "2025-12-31"
OUT = Path(__file__).parent / "prices.csv"


def main():
    raw = yf.download(TICKERS, start=START, end=END, auto_adjust=True)["Close"]
    raw = raw[TICKERS]
    raw.dropna(inplace=True)
    raw.index.name = "Date"
    raw.to_csv(OUT)
    print(f"Saved {len(raw)} trading days x {len(TICKERS)} assets -> {OUT}")


if __name__ == "__main__":
    main()
