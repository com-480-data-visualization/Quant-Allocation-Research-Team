# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
|Petrit Arifi|362548|
|Adam Ait Bousselham|356365|
|Florian Dinant|361013| 


[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*


### Dataset

> Find a dataset (or multiple) that you will explore. Assess the quality of the data it contains and how much preprocessing / data-cleaning it will require before tackling visualization. We recommend using a standard dataset as this course is not about scraping nor data processing.
>
> Hint: some good pointers for finding quality publicly available datasets ([Google dataset search](https://datasetsearch.research.google.com/), [Kaggle](https://www.kaggle.com/datasets), [OpenSwissData](https://opendata.swiss/en/), [SNAP](https://snap.stanford.edu/data/) and [FiveThirtyEight](https://data.fivethirtyeight.com/)).

Our project relies on financial market data initially fetched from Yahoo Finance via the `yfinance` Python library. To ensure perfect reproducibility and avoid unofficial API rate limits during grading, we have extracted a static dataset (CSV) covering daily closing prices **from January 2010 to December 2025** for a universe of 9 assets: 5 equities (AAPL, MSFT, GOOGL, JPM, JNJ), 3 ETFs (SPY, QQQ, GLD), and 1 bond ETF (TLT).

The data quality is high: Yahoo Finance provides adjusted prices that account for stock splits and dividends, which is essential for computing meaningful long-run returns. Preprocessing requirements were minimal but non-trivial: we aligned all assets to a common set of trading dates, handled occasional missing values due to instrument-specific trading halts, and computed log returns from price series. No scraping is involved.


### Problematic

> Frame the general topic of your visualization and the main axis that you want to develop.
> - What am I trying to show with my visualization?
> - Think of an overview for the project, your motivation, and the target audience.

Modern portfolio theory has existed since Markowitz (1952), yet most retail investors and even finance students like us have never interacted with its core concepts in an intuitive, hands-on way. Our visualization project aims to bridge this gap by building an interactive Portfolio Allocation Engine that makes the abstract mathematics of portfolio construction tangible and explorable.

The central question we address is: how does the choice of risk estimation method and optimization objective affect the composition and performance of a portfolio? We want users to see, not just read, how covariance structure shapes diversification, how the efficient frontier shifts when you change assumptions, and how different methods (minimum variance, tangency, risk parity, mean-variance) lead to fundamentally different asset allocations.

Our target audience is finance and data science students, quantitative analysts early in their careers, and technically curious individuals who want to go beyond pie-chart portfolio tools. The project would ideally be structured around three progressive parts: an Asset Explorer for statistical understanding, a Risk Estimation Studio for covariance comparison, and a Portfolio Builder with an interactive efficient frontier.


### Exploratory Data Analysis

> Pre-processing of the data set you chose
> - Show some basic statistics and get insights about the data

Our dataset consists of daily closing prices for 9 assets (from Jan 2010 to Dec 2025), fetched via `yfinance`. After aligning trading dates and dropping missing values, our final static dataset contains **4022 trading days**. We computed daily log returns to extract the following empirical insights, confirming the stylized facts of financial markets:

* **Risk vs. Return:** As expected, US large-cap equities are more volatile than diversified ETFs. For instance, AAPL showed an annualized return of **23.50%** with **28.16%** volatility, compared to the broader market (SPY) which had a **13.09%** return and **17.25%** volatility.
* **Diversification properties:** Safe-haven assets proved their theoretical role. The long-term bond ETF (TLT) and Gold (GLD) exhibited negative or near-zero correlation with SPY (**-0.30** and **0.05** respectively), validating them as strong portfolio diversifiers during risk-off periods.
* **Non-normality of returns:** We confirmed that daily return distributions strongly deviate from normality. Across our asset universe, we observed negative skewness (e.g., SPY: **-0.56**) and extreme excess kurtosis/fat tails (e.g., AAPL: **6.15**, SPY: **12.48**). 

This empirical reality—specifically the massive kurtosis showing that extreme market movements are much more frequent than a standard Gaussian distribution predicts—motivates our project. It demonstrates exactly why users need an interactive tool to explore different risk and covariance estimation methods (beyond simple historical variance) when building robust portfolios.

### Related work


> - What others have already done with the data?
> - Why is your approach original?
> - What source of inspiration do you take? Visualizations that you found on other websites or magazines (might be unrelated to your data).
> - In case you are using a dataset that you have already explored in another context (ML or ADA course, semester project...), you are required to share the report of that work to outline the differences with the submission for this class.

Several existing tools explore portfolio construction visually. Portfolio Visualizer and Riskalyze offer efficient frontier plots and risk scoring, but are closed black boxes, users cannot inspect or change the underlying estimation methodology. Academic libraries like PyPortfolioOpt implement the same mathematics in Python, but with no interactive interface. Bloomberg Terminal provides professional-grade analytics but is inaccessible outside industry.

Our approach aims to make the assumptions of portfolio construction visible and interactive, particularly the choice of covariance estimator, which is rarely surfaced in consumer tools but has a significant impact on the resulting weights. Rather than presenting a single "optimal" portfolio, we want users to explore how outputs change when inputs and methods change.

Visual inspiration comes from the Financial Times's clean, annotation-driven chart style, and from Observable notebooks, which make mathematical processes explorable through linked interactive graphics.
**Declaration of Originality:** We confirm that we have not explored this specific dataset combination nor developed this portfolio visualization concept in any previous context (such as ML, ADA courses, or past semester projects). This is an entirely original submission for this class.
## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

