/* ============================================================
   S&P 500 EXPLORER — main.js
   Implements: Select, Filter, Encode, Connect, Reconfigure,
               Elaborate, Abstract
   ============================================================ */

"use strict";

// ── STATE ─────────────────────────────────────────────────────
const state = {
  companies: [],
  indexData: [],
  stocksMonthly: {},       // { SYMBOL: [{Month, Close}, ...] }
  selectedSectors: new Set(["ALL"]),
  selectedCompany: null,
  encodeBy: "sector",      // "sector" | "revenuegrowth" | "perf"
  yAxis: "Revenuegrowth",  // "Revenuegrowth" | "Ebitda" | "Weight"
  viewMode: "companies",   // "companies" | "sectors"
  tsMode: "index",         // "index" | "stock" | "both"
  stockPerf: {},           // precomputed % change 2020→latest
};

// ── SECTOR COLORS ─────────────────────────────────────────────
const SECTOR_COLORS = {
  "Technology": "#3b82f6",
  "Healthcare": "#10b981",
  "Financial Services": "#f59e0b",
  "Consumer Cyclical": "#ef4444",
  "Industrials": "#8b5cf6",
  "Communication Services": "#06b6d4",
  "Consumer Defensive": "#f97316",
  "Energy": "#ec4899",
  "Utilities": "#84cc16",
  "Real Estate": "#14b8a6",
  "Basic Materials": "#a78bfa",
};

const SECTOR_LIST = Object.keys(SECTOR_COLORS);

// ── FORMAT HELPERS ────────────────────────────────────────────
const fmtB = d3.format("$.2s");
const fmtPct = v => (v == null || isNaN(v)) ? "N/A" : `${(v*100).toFixed(1)}%`;
const fmtNum = d3.format(",");
const fmtPrice = d3.format("$,.2f");

// ── LOAD DATA ─────────────────────────────────────────────────
Promise.all([
  d3.csv("data/sp500_companies.csv"),
  d3.csv("data/sp500_index.csv"),
  d3.csv("data/sp500_stocks_monthly.csv"),
]).then(([companiesRaw, indexRaw, stocksRaw]) => {

  // --- Companies ---
  state.companies = companiesRaw.map(d => ({
    ...d,
    Currentprice: +d.Currentprice || 0,
    Marketcap: +d.Marketcap || 0,
    Ebitda: +d.Ebitda || 0,
    Revenuegrowth: +d.Revenuegrowth || 0,
    Weight: +d.Weight || 0,
    Fulltimeemployees: +d.Fulltimeemployees || 0,
  }));

  // --- Index ---
  state.indexData = indexRaw.map(d => ({
    date: new Date(d.Date),
    value: +d["S&P500"],
  })).filter(d => !isNaN(d.value));

  // --- Stocks monthly ---
  stocksRaw.forEach(d => {
    const sym = d.Symbol;
    if (!state.stocksMonthly[sym]) state.stocksMonthly[sym] = [];
    state.stocksMonthly[sym].push({ month: d.Month, close: +d.Close });
  });

  // --- Precompute stock performance (2020→latest) ---
  Object.entries(state.stocksMonthly).forEach(([sym, arr]) => {
    const sorted = arr.filter(d => !isNaN(d.close)).sort((a, b) => a.month < b.month ? -1 : 1);
    if (sorted.length >= 2) {
      const first = sorted[0].close;
      const last  = sorted[sorted.length - 1].close;
      state.stockPerf[sym] = (last - first) / first;
    }
  });

  initUI();
  buildBubbleChart();
  buildTimeSeriesChart();
  buildTreemap();
  updateHeaderStats();

}).catch(err => {
  console.error("Data load error:", err);
  document.body.innerHTML += `<div style="color:red;padding:20px">Error loading data: ${err.message}</div>`;
});

// ── HEADER STATS ──────────────────────────────────────────────
function updateHeaderStats() {
  const filtered = getFilteredCompanies();
  const totalMcap = d3.sum(filtered, d => d.Marketcap);
  document.getElementById("stat-companies").textContent = `${filtered.length} companies`;
  document.getElementById("stat-sectors").textContent = `${new Set(filtered.map(d => d.Sector)).size} sectors`;
  document.getElementById("stat-mcap").textContent = `${(totalMcap / 1e12).toFixed(1)}T mkt cap`;
}

// ── UI INIT ───────────────────────────────────────────────────
function initUI() {
  // Sector pills
  const container = document.getElementById("sector-pills");
  const allPill = pill("ALL", true, "all-pill");
  allPill.addEventListener("click", () => {
    state.selectedSectors = new Set(["ALL"]);
    updateSectorPills();
    onFilterChange();
  });
  container.appendChild(allPill);

  SECTOR_LIST.forEach(s => {
    const p = pill(s, false);
    p.style.borderColor = SECTOR_COLORS[s] + "55";
    p.addEventListener("click", () => {
      state.selectedSectors.delete("ALL");
      if (state.selectedSectors.has(s)) {
        state.selectedSectors.delete(s);
        if (state.selectedSectors.size === 0) state.selectedSectors.add("ALL");
      } else {
        state.selectedSectors.add(s);
      }
      updateSectorPills();
      onFilterChange();
    });
    container.appendChild(p);
  });

  // Encode buttons
  document.querySelectorAll(".enc-btn[data-enc]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".enc-btn[data-enc]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.encodeBy = btn.dataset.enc;
      updateBubbleEncoding();
    });
  });

  // Y-axis buttons (Reconfigure)
  document.querySelectorAll(".enc-btn[data-y]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".enc-btn[data-y]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.yAxis = btn.dataset.y;
      document.getElementById("y-axis-label").textContent =
        {Revenuegrowth: "Revenue Growth", Ebitda: "EBITDA", Weight: "Index Weight"}[state.yAxis];
      rebuildBubbleChart();
    });
  });

  // Abstract buttons
  document.querySelectorAll(".enc-btn[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".enc-btn[data-view]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.viewMode = btn.dataset.view;
      rebuildBubbleChart();
    });
  });

  // TS mode buttons
  document.getElementById("ts-index-btn").addEventListener("click", () => setTsMode("index"));
  document.getElementById("ts-stock-btn").addEventListener("click", () => setTsMode("stock"));
  document.getElementById("ts-both-btn").addEventListener("click", () => setTsMode("both"));
}

function pill(text, active, extraClass) {
  const el = document.createElement("button");
  el.className = "sector-pill" + (active ? " active" : "") + (extraClass ? " " + extraClass : "");
  el.textContent = text;
  return el;
}

function updateSectorPills() {
  document.querySelectorAll(".sector-pill").forEach(p => {
    const t = p.textContent;
    p.classList.toggle("active",
      t === "ALL" ? state.selectedSectors.has("ALL") : state.selectedSectors.has(t));
  });
}

// ── FILTER HELPERS ────────────────────────────────────────────
function getFilteredCompanies() {
  if (state.selectedSectors.has("ALL")) return state.companies;
  return state.companies.filter(d => state.selectedSectors.has(d.Sector));
}

function onFilterChange() {
  updateBubbleFilter();
  rebuildTreemap();
  updateHeaderStats();
}

// ── ENCODE HELPER ─────────────────────────────────────────────
function getColor(d) {
  if (state.encodeBy === "sector") {
    return SECTOR_COLORS[d.Sector] || "#888";
  }
  if (state.encodeBy === "revenuegrowth") {
    const scale = d3.scaleSequential()
      .domain([-0.3, 1.5])
      .interpolator(d3.interpolateRdYlGn);
    return scale(d.Revenuegrowth);
  }
  if (state.encodeBy === "perf") {
    const perf = state.stockPerf[d.Symbol] ?? 0;
    const scale = d3.scaleSequential()
      .domain([-0.5, 5])
      .interpolator(d3.interpolateRdYlGn);
    return scale(perf);
  }
  return "#3b82f6";
}

// ── BUBBLE CHART ──────────────────────────────────────────────
let bubbleSvg, bubbleG, bubbleXScale, bubbleYScale, bubbleRScale;
let bubbleWidth, bubbleHeight;

function buildBubbleChart() {
  const container = document.getElementById("panel-bubble");
  const margin = { top: 20, right: 20, bottom: 50, left: 65 };
  const bbox = container.getBoundingClientRect();
  bubbleWidth = (bbox.width || 600) - margin.left - margin.right;
  bubbleHeight = (bbox.height - 80) - margin.top - margin.bottom;

  bubbleSvg = d3.select("#bubble-chart")
    .attr("width", bubbleWidth + margin.left + margin.right)
    .attr("height", bubbleHeight + margin.top + margin.bottom);

  bubbleG = bubbleSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  bubbleG.append("g").attr("class", "x-axis-g").attr("transform", `translate(0,${bubbleHeight})`);
  bubbleG.append("g").attr("class", "y-axis-g");
  bubbleG.append("text").attr("class", "axis-label x-lbl")
    .attr("x", bubbleWidth / 2).attr("y", bubbleHeight + 40)
    .attr("text-anchor", "middle").text("Market Cap (log scale)");
  bubbleG.append("text").attr("class", "axis-label y-lbl")
    .attr("transform", "rotate(-90)")
    .attr("x", -bubbleHeight / 2).attr("y", -50)
    .attr("text-anchor", "middle").text("Revenue Growth");

  renderBubbles();
}

function rebuildBubbleChart() {
  bubbleG.selectAll(".bubble, .grid-x, .grid-y").remove();
  renderBubbles();
}

function renderBubbles() {
  const data = getFilteredCompanies().filter(d => d.Marketcap > 0);

  let plotData = data;
  let getY = d => d.Revenuegrowth;
  let yLabel = "Revenue Growth";

  if (state.yAxis === "Ebitda") {
    plotData = data.filter(d => d.Ebitda > 0);
    getY = d => d.Ebitda;
    yLabel = "EBITDA ($)";
  } else if (state.yAxis === "Weight") {
    getY = d => d.Weight;
    yLabel = "Index Weight";
  }

  document.querySelector(".y-lbl").textContent = yLabel;

  // If sectors abstract mode → aggregate
  if (state.viewMode === "sectors") {
    const grouped = d3.rollup(data,
      v => ({
        Symbol: v[0].Sector.substring(0, 4).toUpperCase(),
        Sector: v[0].Sector,
        Shortname: v[0].Sector,
        Marketcap: d3.sum(v, d => d.Marketcap),
        Revenuegrowth: d3.mean(v, d => d.Revenuegrowth),
        Ebitda: d3.sum(v, d => d.Ebitda),
        Weight: d3.sum(v, d => d.Weight),
        Currentprice: null,
        count: v.length,
      }),
      d => d.Sector
    );
    plotData = Array.from(grouped.values()).filter(d => d.Marketcap > 0);
    if (state.yAxis === "Ebitda") plotData = plotData.filter(d => d.Ebitda > 0);
  }

  bubbleXScale = d3.scaleLog()
    .domain(d3.extent(plotData, d => d.Marketcap).map((v, i) => i === 0 ? v * 0.5 : v * 1.2))
    .range([0, bubbleWidth]);

  const yExtent = d3.extent(plotData, d => getY(d));
  bubbleYScale = d3.scaleLinear()
    .domain([yExtent[0] * (yExtent[0] < 0 ? 1.2 : 0.8), yExtent[1] * 1.2])
    .range([bubbleHeight, 0])
    .nice();

  bubbleRScale = d3.scaleSqrt()
    .domain([0, d3.max(plotData, d => d.Marketcap)])
    .range([3, 28]);

  // Axes
  const xAxis = d3.axisBottom(bubbleXScale).ticks(5, "$,.0s")
    .tickFormat(v => `$${d3.format(",.0s")(v)}`);
  const yAxis = d3.axisLeft(bubbleYScale).ticks(5)
    .tickFormat(state.yAxis === "Revenuegrowth" || state.yAxis === "Weight"
      ? d => `${(d * 100).toFixed(0)}%`
      : d3.format("$.2s"));

  bubbleG.select(".x-axis-g").call(xAxis)
    .call(g => {
      g.selectAll("text").attr("fill", "var(--text-dim)").style("font-family", "var(--font-mono)").style("font-size", "9px");
      g.selectAll("line, path").attr("stroke", "var(--border2)");
    });
  bubbleG.select(".y-axis-g").call(yAxis)
    .call(g => {
      g.selectAll("text").attr("fill", "var(--text-dim)").style("font-family", "var(--font-mono)").style("font-size", "9px");
      g.selectAll("line, path").attr("stroke", "var(--border2)");
    });

  // Grid
  bubbleG.append("g").attr("class", "grid-y")
    .call(d3.axisLeft(bubbleYScale).ticks(5).tickSize(-bubbleWidth).tickFormat(""))
    .call(g => {
      g.select(".domain").remove();
      g.selectAll("line").attr("stroke", "var(--border)").attr("stroke-width", 0.5).attr("opacity", 0.4);
    });

  // Zero line
  if (bubbleYScale(0) >= 0 && bubbleYScale(0) <= bubbleHeight) {
    bubbleG.append("line").attr("class", "grid-y")
      .attr("x1", 0).attr("x2", bubbleWidth)
      .attr("y1", bubbleYScale(0)).attr("y2", bubbleYScale(0))
      .attr("stroke", "var(--border2)").attr("stroke-width", 1).attr("stroke-dasharray", "4,3");
  }

  // Bubbles
  const tooltip = document.getElementById("tooltip");

  bubbleG.selectAll(".bubble")
    .data(plotData, d => d.Symbol)
    .join("circle")
    .attr("class", "bubble")
    .attr("cx", d => bubbleXScale(d.Marketcap))
    .attr("cy", d => bubbleYScale(getY(d)))
    .attr("r", d => bubbleRScale(d.Marketcap))
    .attr("fill", d => getColor(d) + "bb")
    .attr("stroke", d => getColor(d))
    .attr("stroke-width", 1)
    .on("mousemove", function(event, d) {
      tooltip.classList.remove("hidden");
      const perf = state.stockPerf[d.Symbol];
      tooltip.innerHTML = `
        <div class="tt-symbol">${d.Symbol}</div>
        <div class="tt-name">${d.Shortname || d.Symbol}</div>
        <div class="tt-sep"></div>
        <div class="tt-row"><span class="tt-key">Market Cap</span><span class="tt-val">${fmtB(d.Marketcap)}</span></div>
        <div class="tt-row"><span class="tt-key">Rev. Growth</span><span class="tt-val">${fmtPct(d.Revenuegrowth)}</span></div>
        <div class="tt-row"><span class="tt-key">EBITDA</span><span class="tt-val">${d.Ebitda ? fmtB(d.Ebitda) : "N/A"}</span></div>
        ${perf != null ? `<div class="tt-row"><span class="tt-key">Perf (2020→)</span><span class="tt-val" style="color:${perf >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(perf)}</span></div>` : ""}
        <div class="tt-row"><span class="tt-key">Sector</span><span class="tt-val">${d.Sector}</span></div>
      `;
      tooltip.style.left = (event.clientX + 12) + "px";
      tooltip.style.top  = (event.clientY - 10) + "px";
    })
    .on("mouseleave", () => tooltip.classList.add("hidden"))
    .on("click", function(event, d) {
      // SELECT
      const wasSel = state.selectedCompany && state.selectedCompany.Symbol === d.Symbol;
      state.selectedCompany = wasSel ? null : (state.viewMode === "sectors" ? null : d);
      updateBubbleSelection();
      if (state.selectedCompany) {
        showDetail(state.selectedCompany);
        connectToTimeSeries(state.selectedCompany.Symbol);
      } else {
        showDetailPlaceholder();
        connectToTimeSeries(null);
      }
    });
}

function updateBubbleEncoding() {
  bubbleG.selectAll(".bubble")
    .attr("fill", d => getColor(d) + "bb")
    .attr("stroke", d => getColor(d));
}

function updateBubbleFilter() {
  const filtered = getFilteredCompanies();
  const filtSet = new Set(filtered.map(d => d.Symbol));
  bubbleG.selectAll(".bubble")
    .classed("dimmed", d => !filtSet.has(d.Symbol));
}

function updateBubbleSelection() {
  bubbleG.selectAll(".bubble")
    .classed("selected", d => state.selectedCompany && d.Symbol === state.selectedCompany.Symbol)
    .attr("stroke-width", d => state.selectedCompany && d.Symbol === state.selectedCompany.Symbol ? 2.5 : 1)
    .attr("stroke", d =>
      state.selectedCompany && d.Symbol === state.selectedCompany.Symbol
        ? "#fff"
        : getColor(d));
}

// ── TIME SERIES CHART ─────────────────────────────────────────
let tsSvg, tsG, tsMargin, tsW, tsH;
let tsXScale, tsYScale, tsYScaleStock;
let tsBrushG, tsClipId = "ts-clip";
let tsCurrentDomain = null;

function buildTimeSeriesChart() {
  const container = document.getElementById("panel-ts");
  tsMargin = { top: 16, right: 20, bottom: 50, left: 60 };
  const bbox = container.getBoundingClientRect();
  tsW = (bbox.width || 600) - tsMargin.left - tsMargin.right;
  tsH = (bbox.height - 100) - tsMargin.top - tsMargin.bottom;

  tsSvg = d3.select("#ts-chart")
    .attr("width", tsW + tsMargin.left + tsMargin.right)
    .attr("height", tsH + tsMargin.top + tsMargin.bottom);

  tsSvg.append("defs").append("clipPath").attr("id", tsClipId)
    .append("rect").attr("width", tsW).attr("height", tsH + 10).attr("y", -5);

  tsG = tsSvg.append("g").attr("transform", `translate(${tsMargin.left},${tsMargin.top})`);
  tsG.append("g").attr("class", "ts-x-axis").attr("transform", `translate(0,${tsH})`);
  tsG.append("g").attr("class", "ts-y-axis");

  // axis labels
  tsG.append("text").attr("class", "axis-label")
    .attr("x", tsW / 2).attr("y", tsH + 40)
    .attr("text-anchor", "middle").text("Date");
  tsG.append("text").attr("class", "axis-label ts-y-lbl")
    .attr("transform", "rotate(-90)")
    .attr("x", -tsH / 2).attr("y", -48)
    .attr("text-anchor", "middle").text("S&P 500 Index");

  tsG.append("g").attr("class", "ts-lines").attr("clip-path", `url(#${tsClipId})`);

  // Brush for zoom (Abstract)
  const brush = d3.brushX()
    .extent([[0, 0], [tsW, tsH]])
    .on("end", tsOnBrush);

  tsBrushG = tsG.append("g").attr("class", "brush");
  tsBrushG.call(brush);

  renderTimeSeries();
}

function renderTimeSeries() {
  const data = state.indexData;
  const domain = tsCurrentDomain || d3.extent(data, d => d.date);

  tsXScale = d3.scaleTime().domain(domain).range([0, tsW]);
  const visible = data.filter(d => d.date >= domain[0] && d.date <= domain[1]);
  tsYScale = d3.scaleLinear()
    .domain(d3.extent(visible, d => d.value).map((v, i) => i === 0 ? v * 0.97 : v * 1.03))
    .range([tsH, 0]).nice();

  const xAxis = d3.axisBottom(tsXScale).ticks(6);
  const yAxis = d3.axisLeft(tsYScale).ticks(5).tickFormat(d3.format(",.0f"));

  tsG.select(".ts-x-axis").call(xAxis)
    .call(g => {
      g.selectAll("text").attr("fill", "var(--text-dim)").style("font-size", "9px").style("font-family", "var(--font-mono)");
      g.selectAll("line, path").attr("stroke", "var(--border2)");
    });
  tsG.select(".ts-y-axis").call(yAxis)
    .call(g => {
      g.selectAll("text").attr("fill", "var(--text-dim)").style("font-size", "9px").style("font-family", "var(--font-mono)");
      g.selectAll("line, path").attr("stroke", "var(--border2)");
    });

  const lineGroup = tsG.select(".ts-lines");
  lineGroup.selectAll("*").remove();

  // Grid
  lineGroup.append("g")
    .call(d3.axisLeft(tsYScale).ticks(5).tickSize(-tsW).tickFormat(""))
    .call(g => {
      g.select(".domain").remove();
      g.selectAll("line").attr("stroke", "var(--border)").attr("stroke-width", 0.5).attr("opacity", 0.4);
    });

  // Index line
  const drawIndex = state.tsMode === "index" || state.tsMode === "both";
  const drawStock = (state.tsMode === "stock" || state.tsMode === "both") && state.selectedCompany;

  if (drawIndex) {
    const indexLine = d3.line()
      .x(d => tsXScale(d.date))
      .y(d => tsYScale(d.value))
      .defined(d => !isNaN(d.value));

    // area
    lineGroup.append("path")
      .datum(data)
      .attr("fill", "url(#ts-area-grad)")
      .attr("d", d3.area()
        .x(d => tsXScale(d.date))
        .y0(tsH)
        .y1(d => tsYScale(d.value))
        .defined(d => !isNaN(d.value)));

    // gradient
    const defs = tsSvg.select("defs");
    if (defs.select("#ts-area-grad").empty()) {
      const g = defs.append("linearGradient").attr("id", "ts-area-grad")
        .attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
      g.append("stop").attr("offset", "0%").attr("stop-color", "#3b82f6").attr("stop-opacity", 0.18);
      g.append("stop").attr("offset", "100%").attr("stop-color", "#3b82f6").attr("stop-opacity", 0);
    }

    lineGroup.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 1.8)
      .attr("d", indexLine);
  }

  // Stock line overlay (Connect)
  if (drawStock) {
    const sym = state.selectedCompany.Symbol;
    const stockData = (state.stocksMonthly[sym] || [])
      .map(d => ({ date: new Date(d.month + "-01"), close: d.close }))
      .filter(d => !isNaN(d.close))
      .sort((a, b) => a.date - b.date);

    if (stockData.length > 0) {
      // Normalize to same start point for dual-axis comparison
      const stockVisible = stockData.filter(d => d.date >= domain[0] && d.date <= domain[1]);
      if (stockVisible.length > 1) {
        tsYScaleStock = d3.scaleLinear()
          .domain(d3.extent(stockVisible, d => d.close).map((v, i) => i === 0 ? v * 0.95 : v * 1.05))
          .range([tsH, 0]).nice();

        const stockLine = d3.line()
          .x(d => tsXScale(d.date))
          .y(d => (drawIndex ? tsYScaleStock : tsYScale)(d.close))
          .defined(d => !isNaN(d.close));

        lineGroup.append("path")
          .datum(stockData)
          .attr("fill", "none")
          .attr("stroke", SECTOR_COLORS[state.selectedCompany.Sector] || "#f59e0b")
          .attr("stroke-width", 1.8)
          .attr("stroke-dasharray", drawIndex ? "5,3" : "none")
          .attr("d", stockLine);

        // Legend
        lineGroup.append("text")
          .attr("x", tsW - 6).attr("y", 14)
          .attr("text-anchor", "end")
          .attr("font-family", "var(--font-mono)")
          .attr("font-size", 9)
          .attr("fill", SECTOR_COLORS[state.selectedCompany.Sector])
          .text(`── ${sym} stock price`);

        document.getElementById("ts-stock-label").textContent = `+ ${sym}`;
        document.querySelector(".ts-y-lbl").textContent = drawIndex ? "S&P 500 / Stock Price" : `${sym} Price ($)`;
      }
    }
  } else {
    document.getElementById("ts-stock-label").textContent = "";
  }

  // Hover crosshair + tooltip
  tsAddCrosshair(data, drawStock);
}

function tsAddCrosshair(indexData, drawStock) {
  const tooltip = document.getElementById("ts-tooltip");
  const overlay = tsG.append("rect")
    .attr("width", tsW).attr("height", tsH)
    .attr("fill", "transparent")
    .attr("class", "ts-overlay");

  const crossV = tsG.append("line")
    .attr("class", "ts-cross")
    .attr("y1", 0).attr("y2", tsH)
    .attr("stroke", "var(--border2)")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "3,3")
    .attr("opacity", 0);

  overlay.on("mousemove", function(event) {
    const [mx] = d3.pointer(event);
    const date = tsXScale.invert(mx);
    const bisect = d3.bisector(d => d.date).left;
    const idx = bisect(indexData, date);
    const d = indexData[Math.max(0, Math.min(idx, indexData.length - 1))];
    if (!d) return;

    crossV.attr("x1", tsXScale(d.date)).attr("x2", tsXScale(d.date)).attr("opacity", 1);

    let stockHtml = "";
    if (drawStock && state.selectedCompany) {
      const sym = state.selectedCompany.Symbol;
      const sd = (state.stocksMonthly[sym] || []);
      const dateStr = d.date.toISOString().substring(0, 7);
      const match = sd.find(r => r.month === dateStr);
      if (match) stockHtml = `<div class="tt-row"><span class="tt-key">${sym}</span><span class="tt-val">${fmtPrice(match.close)}</span></div>`;
    }

    tooltip.classList.remove("hidden");
    tooltip.innerHTML = `
      <div class="tt-row"><span class="tt-key">Date</span><span class="tt-val">${d.date.toLocaleDateString("en-US", {month:"short", year:"numeric"})}</span></div>
      <div class="tt-row"><span class="tt-key">S&P 500</span><span class="tt-val">${d3.format(",.0f")(d.value)}</span></div>
      ${stockHtml}
    `;
    const rect = document.getElementById("ts-chart").getBoundingClientRect();
    tooltip.style.left = (rect.left + tsXScale(d.date) + tsMargin.left + 10) + "px";
    tooltip.style.top  = (rect.top  + tsMargin.top + 20) + "px";
  })
  .on("mouseleave", () => {
    tooltip.classList.add("hidden");
    crossV.attr("opacity", 0);
  });
}

function tsOnBrush(event) {
  if (!event.selection) {
    // Reset zoom (Abstract)
    tsCurrentDomain = null;
    renderTimeSeries();
    return;
  }
  const [x0, x1] = event.selection.map(tsXScale.invert);
  tsCurrentDomain = [x0, x1];
  renderTimeSeries();
  // Clear brush selection so it doesn't persist visually
  tsBrushG.call(d3.brushX().move, null);
}

function setTsMode(mode) {
  state.tsMode = mode;
  document.querySelectorAll(".ts-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`ts-${mode}-btn`).classList.add("active");
  renderTimeSeries();
}

function connectToTimeSeries(symbol) {
  // CONNECT: when a company is selected in bubble, update TS chart
  if (symbol && state.stocksMonthly[symbol]) {
    document.getElementById("ts-stock-btn").disabled = false;
    document.getElementById("ts-both-btn").disabled = false;
    if (state.tsMode === "index") setTsMode("both");
    else renderTimeSeries();
  } else {
    document.getElementById("ts-stock-btn").disabled = true;
    document.getElementById("ts-both-btn").disabled = true;
    setTsMode("index");
  }
}

// ── TREEMAP ───────────────────────────────────────────────────
function buildTreemap() {
  rebuildTreemap();
}

function rebuildTreemap() {
  const container = document.getElementById("panel-treemap");
  const bbox = container.getBoundingClientRect();
  const w = bbox.width || 600;
  const h = (bbox.height - 50) || 250;

  const svg = d3.select("#treemap-chart")
    .attr("width", w)
    .attr("height", h);

  svg.selectAll("*").remove();

  const data = getFilteredCompanies().filter(d => d.Marketcap > 0);

  const grouped = d3.rollup(data,
    v => d3.sum(v, d => d.Marketcap),
    d => d.Sector
  );

  const root = d3.hierarchy({ children: Array.from(grouped, ([k, v]) => ({ name: k, value: v })) })
    .sum(d => d.value);

  d3.treemap().size([w, h]).padding(2)(root);

  const cell = svg.selectAll("g").data(root.leaves()).join("g")
    .attr("transform", d => `translate(${d.x0},${d.y0})`);

  // Filter highlight
  const activeSectors = state.selectedSectors.has("ALL")
    ? new Set(SECTOR_LIST)
    : state.selectedSectors;

  cell.append("rect")
    .attr("class", "treemap-cell")
    .attr("width", d => Math.max(0, d.x1 - d.x0))
    .attr("height", d => Math.max(0, d.y1 - d.y0))
    .attr("fill", d => (SECTOR_COLORS[d.data.name] || "#888") + (activeSectors.has(d.data.name) ? "cc" : "33"))
    .attr("stroke", d => activeSectors.has(d.data.name) ? (SECTOR_COLORS[d.data.name] || "#888") : "transparent")
    .attr("stroke-width", 1.5)
    .attr("rx", 2)
    .on("click", function(event, d) {
      // FILTER via treemap
      const sec = d.data.name;
      if (state.selectedSectors.has("ALL")) {
        state.selectedSectors = new Set([sec]);
      } else if (state.selectedSectors.has(sec) && state.selectedSectors.size === 1) {
        state.selectedSectors = new Set(["ALL"]);
      } else if (state.selectedSectors.has(sec)) {
        state.selectedSectors.delete(sec);
      } else {
        state.selectedSectors.add(sec);
      }
      if (state.selectedSectors.size === 0) state.selectedSectors.add("ALL");
      updateSectorPills();
      onFilterChange();
    })
    .on("mousemove", function(event, d) {
      const tooltip = document.getElementById("tooltip");
      tooltip.classList.remove("hidden");
      tooltip.innerHTML = `
        <div class="tt-symbol">${d.data.name}</div>
        <div class="tt-sep"></div>
        <div class="tt-row"><span class="tt-key">Market Cap</span><span class="tt-val">${fmtB(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-key">% of filtered</span><span class="tt-val">${((d.data.value / root.value) * 100).toFixed(1)}%</span></div>
      `;
      tooltip.style.left = (event.clientX + 12) + "px";
      tooltip.style.top  = (event.clientY - 10) + "px";
    })
    .on("mouseleave", () => document.getElementById("tooltip").classList.add("hidden"));

  // Labels
  cell.filter(d => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 22).append("text")
    .attr("x", 6).attr("y", 14)
    .attr("font-family", "var(--font-main)")
    .attr("font-size", d => Math.min(13, Math.max(8, (d.x1 - d.x0) / 10)))
    .attr("font-weight", 700)
    .attr("fill", "#fff")
    .attr("opacity", d => activeSectors.has(d.data.name) ? 1 : 0.3)
    .text(d => d.data.name);

  cell.filter(d => (d.x1 - d.x0) > 60 && (d.y1 - d.y0) > 38).append("text")
    .attr("x", 6).attr("y", 28)
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", 9)
    .attr("fill", "#fff")
    .attr("opacity", 0.6)
    .text(d => fmtB(d.data.value));
}

// ── DETAIL PANEL (Elaborate) ──────────────────────────────────
function showDetail(company) {
  const c = company;
  const perf = state.stockPerf[c.Symbol];
  const perfClass = perf == null ? "neutral" : perf >= 0 ? "positive" : "negative";

  const detailEl = document.getElementById("detail-content");
  detailEl.innerHTML = `
    <div class="detail-card">
      <div class="dc-header">
        <div>
          <div class="dc-symbol">${c.Symbol}</div>
          <div class="dc-name">${c.Longname || c.Shortname}</div>
          <div class="dc-sector" style="border-color:${SECTOR_COLORS[c.Sector] || '#888'}55; color:${SECTOR_COLORS[c.Sector] || '#888'}">${c.Sector} · ${c.Industry}</div>
        </div>
        <div class="dc-price-badge">
          ${c.Currentprice ? `<div class="dc-price">${fmtPrice(c.Currentprice)}</div>` : ""}
          ${perf != null ? `<div class="dc-badge ${perfClass}">${perf >= 0 ? "+" : ""}${fmtPct(perf)} since 2020</div>` : ""}
        </div>
      </div>
      <div class="dc-stats">
        <div class="dc-stat">
          <div class="dc-stat-key">Market Cap</div>
          <div class="dc-stat-val">${fmtB(c.Marketcap)}</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-key">EBITDA</div>
          <div class="dc-stat-val">${c.Ebitda ? fmtB(c.Ebitda) : "N/A"}</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-key">Rev. Growth</div>
          <div class="dc-stat-val" style="color:${c.Revenuegrowth >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(c.Revenuegrowth)}</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-key">Employees</div>
          <div class="dc-stat-val">${c.Fulltimeemployees ? fmtNum(c.Fulltimeemployees) : "N/A"}</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-key">Index Weight</div>
          <div class="dc-stat-val">${fmtPct(c.Weight)}</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-key">Location</div>
          <div class="dc-stat-val" style="font-size:0.72rem">${c.City || ""}${c.State ? ", " + c.State : ""}</div>
        </div>
      </div>
      ${c.Longbusinesssummary
        ? `<div class="dc-desc">${c.Longbusinesssummary}</div>`
        : ""}
    </div>
  `;
}

function showDetailPlaceholder() {
  document.getElementById("detail-content").innerHTML = `
    <div class="detail-placeholder">
      <div class="detail-icon">&#9670;</div>
      <p>Click any bubble to see<br/>company details here</p>
    </div>
  `;
}
