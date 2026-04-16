/* ===================================================================
   Portfolio Allocation Engine - engine.js
   COM-480 Data Visualization - EPFL
   =================================================================== */

const COLORS = [
  '#2563eb','#16a34a','#dc2626','#d97706','#7c3aed',
  '#0891b2','#db2777','#65a30d','#ea580c','#0f766e',
  '#6366f1','#ca8a04','#be185d','#059669','#9333ea'
];
const TRADING_DAYS = 252;
const col = i => COLORS[i % COLORS.length];

const STATE = {
  tickers: ['AAPL','MSFT','GOOGL','JPM','JNJ','SPY','QQQ','GLD','TLT'],
  active: null,
  window: '3y',
  rawPrices: null,
  prices: null,
  logRet: null,
  annRet: null,
  annVol: null,
  sharpe: null,
  corr: null,
  covSample: null,
  covLW: null,
  covEWMA: null,
  portfolios: {}
};

// ----- Helpers -----

function setStatus(cls, txt) {
  document.getElementById('statusDot').className = 'dot ' + cls;
  document.getElementById('statusText').textContent = txt;
}

function switchTab(name, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  if (!STATE.logRet) return;
  requestAnimationFrame(() => {
    const tickers = STATE.active || STATE.tickers;
    if (name === 'explorer') renderExplorer(tickers);
  });
}

// ----- Chip rendering -----

function renderChips() {
  const list = document.getElementById('chipList');
  list.innerHTML = '';
  STATE.tickers.forEach((t, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    const isActive = !STATE.active || STATE.active.includes(t);
    if (!isActive) c.classList.add('disabled');
    c.style.borderColor = col(i);
    c.style.color = col(i);
    c.style.background = col(i) + '18';
    c.textContent = t;
    c.onclick = () => toggleChip(t);
    list.appendChild(c);
  });
}

function toggleChip(t) {
  if (!STATE.active) STATE.active = [...STATE.tickers];
  if (STATE.active.includes(t)) {
    if (STATE.active.length <= 2) return;
    STATE.active = STATE.active.filter(x => x !== t);
  } else {
    STATE.active.push(t);
  }
  renderChips();
  if (STATE.logRet) computeAndRender();
}

function addTicker() {
  const inp = document.getElementById('tickerInput');
  const v = inp.value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!v || STATE.tickers.includes(v) || STATE.tickers.length >= 15) { inp.value = ''; return; }
  if (STATE.rawPrices && !(v in STATE.rawPrices[0])) {
    inp.value = '';
    setStatus('error', v + ' not in dataset');
    return;
  }
  STATE.tickers.push(v);
  if (STATE.active) STATE.active.push(v);
  inp.value = '';
  renderChips();
  if (STATE.logRet) computeAndRender();
}

function setWin(w, el) {
  STATE.window = w;
  document.querySelectorAll('.win-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  if (STATE.rawPrices) computeAndRender();
}

// ----- Data loading -----

async function loadData() {
  const btn = document.getElementById('loadBtn');
  btn.disabled = true;
  setStatus('loading', 'Loading…');

  try {
    const raw = await d3.csv('data/prices.csv', d => {
      const row = { Date: d3.timeParse('%Y-%m-%d')(d.Date) };
      STATE.tickers.forEach(t => { if (d[t] !== undefined) row[t] = +d[t]; });
      return row;
    });
    STATE.rawPrices = raw;
    STATE.active = [...STATE.tickers];
    computeAndRender();
    setStatus('ready', STATE.prices.length + ' days loaded');
  } catch (e) {
    console.error(e);
    setStatus('error', 'Failed to load data');
  }
  btn.disabled = false;
}

function computeAndRender() {
  const tickers = STATE.active || STATE.tickers;
  filterPrices(tickers);
  computeStats(tickers);
  renderExplorer(tickers);
}

function filterPrices(tickers) {
  let data = STATE.rawPrices.filter(r => tickers.every(t => r[t] != null && !isNaN(r[t])));
  const end = data[data.length - 1].Date;
  const winMap = { '1y': 1, '3y': 3, '5y': 5, 'max': 100 };
  const years = winMap[STATE.window] || 3;
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - years);
  data = data.filter(r => r.Date >= start);
  STATE.prices = data;

  const logRet = [];
  for (let i = 1; i < data.length; i++) {
    const row = { Date: data[i].Date };
    tickers.forEach(t => { row[t] = Math.log(data[i][t] / data[i - 1][t]); });
    logRet.push(row);
  }
  STATE.logRet = logRet;
}

// ----- Statistics -----

function computeStats(tickers) {
  const n = STATE.logRet.length;
  const means = {}, stds = {};
  tickers.forEach(t => {
    const vals = STATE.logRet.map(r => r[t]);
    const mu = d3.mean(vals);
    const sigma = d3.deviation(vals);
    means[t] = mu;
    stds[t] = sigma;
  });
  STATE.annRet = {};
  STATE.annVol = {};
  STATE.sharpe = {};
  tickers.forEach(t => {
    STATE.annRet[t] = means[t] * TRADING_DAYS;
    STATE.annVol[t] = stds[t] * Math.sqrt(TRADING_DAYS);
    STATE.sharpe[t] = STATE.annRet[t] / STATE.annVol[t];
  });

  const corrMat = [];
  tickers.forEach((t1, i) => {
    corrMat[i] = [];
    const v1 = STATE.logRet.map(r => r[t1]);
    tickers.forEach((t2, j) => {
      if (i === j) { corrMat[i][j] = 1; return; }
      if (j < i) { corrMat[i][j] = corrMat[j][i]; return; }
      const v2 = STATE.logRet.map(r => r[t2]);
      const mu1 = d3.mean(v1), mu2 = d3.mean(v2);
      let cov = 0, s1 = 0, s2 = 0;
      for (let k = 0; k < v1.length; k++) {
        const d1 = v1[k] - mu1, d2 = v2[k] - mu2;
        cov += d1 * d2; s1 += d1 * d1; s2 += d2 * d2;
      }
      corrMat[i][j] = cov / Math.sqrt(s1 * s2);
    });
  });
  STATE.corr = corrMat;
}

// ----- Tooltip -----

let tooltipEl;
function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(html, event) {
  const tip = ensureTooltip();
  tip.innerHTML = html;
  tip.classList.add('visible');
  tip.style.left = (event.pageX + 12) + 'px';
  tip.style.top = (event.pageY - 10) + 'px';
}

function hideTooltip() {
  ensureTooltip().classList.remove('visible');
}

// ===============================================
//  RENDERERS - Tab 1: Asset Explorer
// ===============================================

function renderExplorer(tickers) {
  renderKPIs(tickers);
  renderScatter(tickers);
  renderStatsTable(tickers);
  renderHeatmap(tickers);
  populateHistSelect(tickers);
  renderHistogram();
  renderCumulative(tickers);
}

function renderKPIs(tickers) {
  const best = tickers.reduce((a, b) => STATE.sharpe[a] > STATE.sharpe[b] ? a : b);
  document.getElementById('kpi-n').textContent = tickers.length;
  document.getElementById('kpi-obs').textContent = STATE.logRet.length.toLocaleString();
  const d0 = STATE.prices[0].Date, d1 = STATE.prices[STATE.prices.length - 1].Date;
  document.getElementById('kpi-range').textContent =
    d3.timeFormat('%b %Y')(d0) + ' - ' + d3.timeFormat('%b %Y')(d1);
  document.getElementById('kpi-sharpe').textContent = STATE.sharpe[best].toFixed(2);
  document.getElementById('kpi-best').textContent = best;
}

function renderScatter(tickers) {
  const wrap = document.getElementById('scatterWrap');
  wrap.innerHTML = '';
  const W = wrap.clientWidth, H = 320;
  const m = { t: 20, r: 20, b: 45, l: 55 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart')
    .attr('viewBox', `0 0 ${W} ${H}`);
  const xExt = d3.extent(tickers, t => STATE.annVol[t] * 100);
  const yExt = d3.extent(tickers, t => STATE.annRet[t] * 100);
  const xPad = (xExt[1] - xExt[0]) * .15 || 2;
  const yPad = (yExt[1] - yExt[0]) * .15 || 2;
  const x = d3.scaleLinear().domain([xExt[0] - xPad, xExt[1] + xPad]).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([yExt[0] - yPad, yExt[1] + yPad]).range([H - m.b, m.t]);
  const sMin = d3.min(tickers, t => STATE.sharpe[t]);
  const rScale = d3.scaleSqrt().domain([sMin, d3.max(tickers, t => STATE.sharpe[t])]).range([5, 22]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d => d + '%'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line').attr('stroke', '#ddd'));
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d => d + '%'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('.tick line').attr('stroke', '#ddd'));
  svg.append('text').attr('x', W / 2).attr('y', H - 4).attr('text-anchor', 'middle')
    .attr('font-size', 11).attr('fill', '#888').text('Annualised Volatility');
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', 14)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('Annualised Return');

  tickers.forEach((t, i) => {
    const cx = x(STATE.annVol[t] * 100), cy = y(STATE.annRet[t] * 100);
    svg.append('circle').attr('cx', cx).attr('cy', cy)
      .attr('r', 0).attr('fill', col(STATE.tickers.indexOf(t))).attr('fill-opacity', .7)
      .attr('stroke', 'white').attr('stroke-width', 1.5)
      .on('mousemove', e => showTooltip(
        `<b>${t}</b><br>Return: ${(STATE.annRet[t]*100).toFixed(1)}%<br>Vol: ${(STATE.annVol[t]*100).toFixed(1)}%<br>Sharpe: ${STATE.sharpe[t].toFixed(2)}`, e))
      .on('mouseleave', hideTooltip)
      .transition().duration(500).delay(i * 40).attr('r', rScale(STATE.sharpe[t]));
    svg.append('text').attr('x', cx).attr('y', cy - rScale(STATE.sharpe[t]) - 4)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#444').attr('font-weight', 600)
      .attr('opacity', 0).text(t)
      .transition().duration(400).delay(i * 40 + 200).attr('opacity', 1);
  });
}

function renderStatsTable(tickers) {
  const wrap = document.getElementById('statsTableWrap');
  let html = '<table class="stats-table"><thead><tr><th>Ticker</th><th class="num">Return</th><th class="num">Vol</th><th class="num">Sharpe</th><th class="num">Skew</th><th class="num">Kurt</th></tr></thead><tbody>';
  tickers.forEach((t, i) => {
    const vals = STATE.logRet.map(r => r[t]);
    const mu = d3.mean(vals), n = vals.length;
    let m3 = 0, m4 = 0;
    const std = d3.deviation(vals);
    vals.forEach(v => { const d = (v - mu) / std; m3 += d ** 3; m4 += d ** 4; });
    const skew = m3 / n, kurt = m4 / n - 3;
    const retPct = (STATE.annRet[t] * 100).toFixed(1);
    const volPct = (STATE.annVol[t] * 100).toFixed(1);
    const retCls = STATE.annRet[t] >= 0 ? 'pos' : 'neg';
    html += `<tr>
      <td class="ticker-cell" style="color:${col(STATE.tickers.indexOf(t))}">${t}</td>
      <td class="num ${retCls}">${retPct}%</td>
      <td class="num">${volPct}%</td>
      <td class="num">${STATE.sharpe[t].toFixed(2)}</td>
      <td class="num">${skew.toFixed(2)}</td>
      <td class="num">${kurt.toFixed(1)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function renderHeatmap(tickers) {
  const wrap = document.getElementById('heatmapWrap');
  wrap.innerHTML = '';
  drawHeatmap(wrap, STATE.corr, tickers, d3.interpolateRdBu, [-1, 1], true);
}

function drawHeatmap(container, mat, labels, interpolator, domain, annotate) {
  const n = labels.length;
  const W = container.clientWidth;
  const cellSize = Math.min(Math.floor((W - 60) / n), 52);
  const mL = 48, mT = 10;
  const totalW = mL + n * cellSize;
  const totalH = mT + n * cellSize + 30;
  const svg = d3.select(container).append('svg').attr('class', 'chart')
    .attr('viewBox', `0 0 ${totalW} ${totalH}`);
  const colorScale = d3.scaleSequential(interpolator).domain(domain);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = mat[i][j];
      const g = svg.append('g');
      g.append('rect')
        .attr('x', mL + j * cellSize).attr('y', mT + i * cellSize)
        .attr('width', cellSize - 1).attr('height', cellSize - 1)
        .attr('rx', 2).attr('fill', colorScale(v))
        .on('mousemove', e => showTooltip(`${labels[i]} × ${labels[j]}: ${v.toFixed(3)}`, e))
        .on('mouseleave', hideTooltip);
      if (annotate && cellSize >= 28) {
        g.append('text')
          .attr('x', mL + j * cellSize + cellSize / 2 - .5)
          .attr('y', mT + i * cellSize + cellSize / 2 + 3.5)
          .attr('text-anchor', 'middle').attr('font-size', cellSize > 38 ? 10 : 8)
          .attr('fill', Math.abs(v) > 0.6 ? 'white' : '#333')
          .text(v.toFixed(2));
      }
    }
    svg.append('text').attr('x', mL - 4).attr('y', mT + i * cellSize + cellSize / 2 + 3)
      .attr('text-anchor', 'end').attr('font-size', 10).attr('fill', '#555').text(labels[i]);
    svg.append('text').attr('x', mL + i * cellSize + cellSize / 2)
      .attr('y', mT + n * cellSize + 14)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#555').text(labels[i]);
  }
}

function populateHistSelect(tickers) {
  const sel = document.getElementById('histAssetSelect');
  const prev = sel.value;
  sel.innerHTML = '';
  tickers.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
  if (tickers.includes(prev)) sel.value = prev;
}

function renderHistogram() {
  const wrap = document.getElementById('histWrap');
  wrap.innerHTML = '';
  const t = document.getElementById('histAssetSelect').value;
  if (!STATE.logRet || !t || t === '-') return;
  const vals = STATE.logRet.map(r => r[t]).filter(v => v != null);
  const W = wrap.clientWidth, H = 280;
  const m = { t: 15, r: 15, b: 40, l: 45 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLinear().domain(d3.extent(vals)).nice().range([m.l, W - m.r]);
  const bins = d3.bin().domain(x.domain()).thresholds(60)(vals);
  const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.length)]).nice().range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('.1%')))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5))
    .call(g => g.select('.domain').remove());

  const idx = STATE.tickers.indexOf(t);
  svg.selectAll('.bar').data(bins).enter().append('rect')
    .attr('x', d => x(d.x0) + .5).attr('y', y(0))
    .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr('height', 0)
    .attr('fill', col(idx >= 0 ? idx : 0)).attr('fill-opacity', .6)
    .on('mousemove', (e, d) => showTooltip(`${d.length} obs in [${(d.x0*100).toFixed(1)}%, ${(d.x1*100).toFixed(1)}%]`, e))
    .on('mouseleave', hideTooltip)
    .transition().duration(500).delay((d, i) => i * 5)
    .attr('y', d => y(d.length)).attr('height', d => y(0) - y(d.length));

  const mu = d3.mean(vals), sigma = d3.deviation(vals);
  const xVals = d3.range(x.domain()[0], x.domain()[1], (x.domain()[1] - x.domain()[0]) / 200);
  const binW = bins[0] ? bins[0].x1 - bins[0].x0 : 0.001;
  const normLine = xVals.map(xv => ({
    x: xv,
    y: vals.length * binW * (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xv - mu) / sigma) ** 2)
  }));
  const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveBasis);
  svg.append('path').datum(normLine).attr('d', line)
    .attr('fill', 'none').attr('stroke', '#dc2626').attr('stroke-width', 1.8).attr('stroke-dasharray', '4,3');

  svg.append('text').attr('x', W - m.r).attr('y', m.t + 12).attr('text-anchor', 'end')
    .attr('font-size', 10).attr('fill', '#dc2626').text('Normal fit');
}

function renderCumulative(tickers) {
  const wrap = document.getElementById('cumulWrap');
  wrap.innerHTML = '';
  const W = wrap.clientWidth, H = 280;
  const m = { t: 15, r: 15, b: 35, l: 55 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const series = tickers.map(t => {
    let cum = 0;
    return STATE.logRet.map(r => { cum += r[t]; return { date: r.Date, val: Math.exp(cum) }; });
  });

  const x = d3.scaleTime()
    .domain(d3.extent(STATE.logRet, r => r.Date)).range([m.l, W - m.r]);
  const allVals = series.flat().map(d => d.val);
  const y = d3.scaleLinear()
    .domain([d3.min(allVals) * .95, d3.max(allVals) * 1.05]).range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d.toFixed(1)))
    .call(g => g.select('.domain').remove());

  const line = d3.line().x(d => x(d.date)).y(d => y(d.val)).curve(d3.curveMonotoneX);
  series.forEach((s, i) => {
    svg.append('path').datum(s).attr('d', line)
      .attr('fill', 'none').attr('stroke', col(STATE.tickers.indexOf(tickers[i]))).attr('stroke-width', 1.5).attr('stroke-opacity', .85);
  });

  const legendDiv = document.createElement('div');
  legendDiv.className = 'legend-row';
  tickers.forEach((t, i) => {
    legendDiv.innerHTML += `<span class="legend-item"><span class="legend-swatch" style="background:${col(STATE.tickers.indexOf(t))}"></span>${t}</span>`;
  });
  wrap.appendChild(legendDiv);
}

// ----- Init -----
renderChips();
