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

Our project relies on financial market data fetched live from Yahoo Finance via the *yfinance* Python library. The dataset covers daily adjusted closing prices for a universe of 9 assets: 5 equities (AAPL, MSFT, GOOGL, JPM, JNJ), 3 ETFs (SPY, QQQ, GLD), and 1 bond ETF (TLT).

The data quality is generally high, Yahoo Finance provides adjusted prices that account for stock splits and dividends, which is essential for computing meaningful long-run returns. Preprocessing requirements are minimal but non-trivial: we align all assets to a common set of trading dates (inner join on the date index), drop any remaining null values caused by instrument-specific holidays or halts, and compute log returns from price series. No scraping is involved, *yfinance* provides a clean programmatic interface to the data. The main limitation is that Yahoo Finance is an unofficial API and can be rate-limited, which we mitigate with a local Python proxy server.


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

US large-cap equities (AAPL, MSFT, GOOGL) are generally more volatile than diversified ETFs like SPY, while bond ETFs like TLT tend to exhibit lower volatility and historically low or negative correlation with equities during risk-off periods. Gold (GLD) is widely documented as a portfolio diversifier with near-zero equity correlation over long horizons.

We expect daily return distributions to deviate from normality, financial returns are well known to exhibit negative skew and excess kurtosis (fat tails), which motivates looking beyond simple mean/variance summaries. We plan to verify these properties through histograms, correlation matrices and rolling statistics once the data is loaded.

The main preprocessing steps we anticipate are: aligning all assets to a common set of trading dates, handling occasional missing values due to instrument-specific trading halts, and computing log returns from adjusted closing prices.

### Related work


> - What others have already done with the data?
> - Why is your approach original?
> - What source of inspiration do you take? Visualizations that you found on other websites or magazines (might be unrelated to your data).
> - In case you are using a dataset that you have already explored in another context (ML or ADA course, semester project...), you are required to share the report of that work to outline the differences with the submission for this class.

Several existing tools explore portfolio construction visually. Portfolio Visualizer and Riskalyze offer efficient frontier plots and risk scoring, but are closed black boxes, users cannot inspect or change the underlying estimation methodology. Academic libraries like PyPortfolioOpt implement the same mathematics in Python, but with no interactive interface. Bloomberg Terminal provides professional-grade analytics but is inaccessible outside industry.

Our approach aims to make the assumptions of portfolio construction visible and interactive, particularly the choice of covariance estimator, which is rarely surfaced in consumer tools but has a significant impact on the resulting weights. Rather than presenting a single "optimal" portfolio, we want users to explore how outputs change when inputs and methods change.

Visual inspiration comes from the Financial Times's clean, annotation-driven chart style, and from Observable notebooks, which make mathematical processes explorable through linked interactive graphics.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

