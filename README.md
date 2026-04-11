# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
|Petrit Arifi|362548|
|Adam Ait Bousselham|356365|
|Florian Dinant|361013| 


[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

### Dataset

Our project relies on financial market data initially fetched from Yahoo Finance via the `yfinance` Python library. To ensure perfect reproducibility and avoid unofficial API rate limits during grading, we have extracted a static dataset (CSV) covering daily closing prices **from January 2010 to December 2025** for a universe of 9 assets: 5 equities (AAPL, MSFT, GOOGL, JPM, JNJ), 3 ETFs (SPY, QQQ, GLD), and 1 bond ETF (TLT).

The data quality is high: Yahoo Finance provides adjusted prices that account for stock splits and dividends, which is essential for computing meaningful long-run returns. Preprocessing requirements were minimal but non-trivial: we aligned all assets to a common set of trading dates, handled occasional missing values due to instrument-specific trading halts, and computed log returns from price series. No scraping is involved. The static CSV is stored in `data/prices.csv` and can be regenerated with `python data/fetch_data.py`.


### Problematic

Modern portfolio theory has existed since Markowitz (1952), yet most retail investors and even finance students like us have never interacted with its core concepts in an intuitive, hands-on way. Our visualization project aims to bridge this gap by building an interactive Portfolio Allocation Engine that makes the abstract mathematics of portfolio construction tangible and explorable.

The central question we address is: how does the choice of risk estimation method and optimization objective affect the composition and performance of a portfolio? We want users to see, not just read, how covariance structure shapes diversification, how the efficient frontier shifts when you change assumptions, and how different methods (minimum variance, tangency, risk parity, mean-variance) lead to fundamentally different asset allocations.

Our target audience is finance and data science students, quantitative analysts early in their careers, and technically curious individuals who want to go beyond pie-chart portfolio tools. The project would ideally be structured around three progressive parts: an Asset Explorer for statistical understanding, a Risk Estimation Studio for covariance comparison, and a Portfolio Builder with an interactive efficient frontier.


### Exploratory Data Analysis

Our dataset consists of daily closing prices for 9 assets (from Jan 2010 to Dec 2025), fetched via `yfinance`. After aligning trading dates and dropping missing values, our final static dataset contains **4022 trading days**. We computed daily log returns to extract the following empirical insights, confirming the stylized facts of financial markets:

* **Risk vs. Return:** As expected, US large-cap equities are more volatile than diversified ETFs. For instance, AAPL showed an annualized return of **23.50%** with **28.16%** volatility, compared to the broader market (SPY) which had a **13.09%** return and **17.25%** volatility.
* **Diversification properties:** Safe-haven assets proved their theoretical role. The long-term bond ETF (TLT) and Gold (GLD) exhibited negative or near-zero correlation with SPY (**-0.30** and **0.05** respectively), validating them as strong portfolio diversifiers during risk-off periods.
* **Non-normality of returns:** We confirmed that daily return distributions strongly deviate from normality. Across our asset universe, we observed negative skewness (e.g., SPY: **-0.56**) and extreme excess kurtosis/fat tails (e.g., AAPL: **6.15**, SPY: **12.48**). 

Ultimately, this empirical reality is what drives our project. The data clearly shows that extreme market movements are far more common than standard Gaussian models predict, highlighting the need for better risk visualization. It demonstrates exactly why users need an interactive tool to explore different risk and covariance estimation methods (beyond simple historical variance) when building robust portfolios.

Full analysis with charts: [`eda.ipynb`](eda.ipynb).

### Related work

Several existing tools explore portfolio construction visually. Portfolio Visualizer and Riskalyze offer efficient frontier plots and risk scoring, but are closed black boxes, users cannot inspect or change the underlying estimation methodology. Academic libraries like PyPortfolioOpt implement the same mathematics in Python, but with no interactive interface. Bloomberg Terminal provides professional-grade analytics but is inaccessible outside industry.

Our approach aims to make the assumptions of portfolio construction visible and interactive, particularly the choice of covariance estimator, which is rarely surfaced in consumer tools but has a significant impact on the resulting weights. Rather than presenting a single "optimal" portfolio, we want users to explore how outputs change when inputs and methods change.

Visual inspiration comes from the Financial Times's clean, annotation-driven chart style, and from Observable notebooks, which make mathematical processes explorable through linked interactive graphics.

**Declaration of Originality:** We confirm that we have not explored this specific dataset combination nor developed this portfolio visualization concept in any previous context (such as ML, ADA courses, or past semester projects). This is an entirely original submission for this class.
## Milestone 2 (17th April, 5pm)

**10% of the final grade**

````md
# Portfolio Allocation Engine

Interactive web-based dashboard for portfolio analysis, risk visualization, and asset allocation.

---

## 🚀 How to run the project

This project is fully static (HTML + JS + D3.js). No build step is required.

### 1. Clone the repository

```bash
git clone <repo-url>
cd <repo-name>
````

---

### 2. Install a local server

You need a local HTTP server because browsers block local file access (CSV loading, etc.).

#### Option A (recommended): npx serve

If you already have Node.js installed:

```bash
npx serve
```

Then open the URL shown in the terminal (usually):

```
http://localhost:3000
```

---

#### If `npx` is not available

Install Node.js (which includes npm + npx):

* [https://nodejs.org/](https://nodejs.org/)

After installation, verify:

```bash
node -v
npm -v
npx -v
```

Then run again:

```bash
npx serve
```

---

#### Option B: install serve globally

```bash
npm install -g serve
serve
```

---

## 📁 Project structure

```
.
├── index.html
├── style.css
├── engine.js
├── data/
│   └── prices.csv
└── README.md
```

---

## ⚠️ Important notes

* Do NOT open `index.html` directly in the browser (`file://...`)
  → CSV loading will fail due to CORS restrictions.

* Always use a local server (`npx serve` or equivalent)

---

## 🧠 Features

* Asset Explorer (returns, volatility, Sharpe ratio)
* Correlation matrix heatmap
* Return distribution histograms
* Interactive portfolio analytics (WIP)

---

## 🛠 Tech stack

* Vanilla JavaScript
* D3.js v7
* HTML / CSS


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

