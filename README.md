# S&P 500 Explorer — Assignment 3 - 2023345

An interactive data visualization dashboard built with **D3.js v7** implementing all 7 required interaction types.

## Dataset
- **Source**: S&P 500 Companies, Index & Stocks (2010–2024)
- **Files**: `sp500_companies.csv` (502 companies), `sp500_index.csv` (2,517 rows), `sp500_stocks_monthly.csv` (aggregated monthly data for top 30 stocks)
- **Total rows**: 1,891,537 (stocks) + 2,517 (index) + 502 (companies)

## Interaction Types Implemented

| # | Type | Where / How |
|---|------|-------------|
| 1 | **Select** | Click any bubble in the scatter plot to select a company |
| 2 | **Filter** | Sector pills (top-left) and treemap cells filter all views |
| 3 | **Encode** | "Color Encode" buttons change bubble colors by Sector / Revenue Growth / Performance |
| 4 | **Connect** | Selecting a company links the scatter plot to the time series chart (stock overlay appears) |
| 5 | **Reconfigure** | "Y-Axis" buttons switch the scatter plot Y-axis between Revenue Growth / EBITDA / Index Weight |
| 6 | **Elaborate** | Hovering shows rich tooltips; clicking a bubble populates the Detail Panel |
| 7 | **Abstract** | "View" toggle switches between individual Companies and aggregated Sectors; brush on time series zooms in/out |

## File Structure

```
sp500-dashboard/
├── index.html          # Main page
├── style.css           # Styles
├── main.js             # D3.js visualization logic
└── data/
    ├── sp500_companies.csv       # 502 S&P 500 companies
    ├── sp500_index.csv           # S&P 500 index prices 2020–2024
    └── sp500_stocks_monthly.csv  # Monthly stock prices (top 30 by weight)
```

## GitHub Pages Deployment

1. Create a new public GitHub repository (e.g. `sp500-dashboard`)
2. Upload all files **preserving the folder structure** (data/ subfolder must exist)
3. Go to **Settings → Pages**
4. Under **Source**, select `main` branch and `/ (root)` folder
5. Click **Save** — your site will be live at:
   `https://<your-username>.github.io/sp500-dashboard/`

> **Tip**: You can drag-and-drop all files via the GitHub web UI, or use `git push`.

## Tech Stack
- D3.js v7 (CDN)
- Vanilla HTML/CSS/JS (no build step required)
- Google Fonts: Syne + DM Mono
