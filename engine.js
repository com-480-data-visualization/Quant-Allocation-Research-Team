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
  portfolios: {},
  rollWin: 90
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
    if (name === 'risk') renderRisk();
    if (name === 'portfolio') renderPortfolio();
    if (name === 'explorer') renderExplorer(tickers);
  });
}

function updateEwmaLabel() {
  document.getElementById('ewmaLambdaLabel').textContent =
    parseFloat(document.getElementById('ewmaLambda').value).toFixed(2);
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
  computeCovariances(tickers);
  computePortfolios(tickers);
  renderExplorer(tickers);
  renderRisk();
  renderPortfolio();
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

// ----- Covariance estimators -----

function sampleCov(tickers) {
  const n = STATE.logRet.length;
  const p = tickers.length;
  const means = tickers.map(t => d3.mean(STATE.logRet.map(r => r[t])));
  const mat = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++) {
    const vi = STATE.logRet.map(r => r[tickers[i]]);
    for (let j = i; j < p; j++) {
      const vj = STATE.logRet.map(r => r[tickers[j]]);
      let s = 0;
      for (let k = 0; k < n; k++) s += (vi[k] - means[i]) * (vj[k] - means[j]);
      mat[i][j] = mat[j][i] = s / (n - 1);
    }
  }
  return mat;
}

function ledoitWolf(tickers) {
  const S = sampleCov(tickers);
  const p = tickers.length;
  const n = STATE.logRet.length;
  const trS = d3.sum(d3.range(p), i => S[i][i]);
  const mu = trS / p;
  const target = Array.from({ length: p }, (_, i) =>
    Float64Array.from({ length: p }, (_, j) => i === j ? mu : 0));

  const X = tickers.map(t => STATE.logRet.map(r => r[t]));
  const means = tickers.map(t => d3.mean(STATE.logRet.map(r => r[t])));
  let delta2 = 0;
  for (let i = 0; i < p; i++)
    for (let j = 0; j < p; j++)
      delta2 += (S[i][j] - target[i][j]) ** 2;

  let beta2 = 0;
  for (let k = 0; k < n; k++) {
    let bk = 0;
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        bk += ((X[i][k] - means[i]) * (X[j][k] - means[j]) - S[i][j]) ** 2;
    beta2 += bk;
  }
  beta2 /= n * n;
  const alpha = Math.min(beta2 / delta2, 1);

  const res = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++)
    for (let j = 0; j < p; j++)
      res[i][j] = alpha * target[i][j] + (1 - alpha) * S[i][j];
  STATE._lwAlpha = alpha;
  return res;
}

function ewmaCov(tickers) {
  const lambda = parseFloat(document.getElementById('ewmaLambda').value) || 0.94;
  const p = tickers.length;
  const n = STATE.logRet.length;
  const means = tickers.map(t => d3.mean(STATE.logRet.map(r => r[t])));
  const mat = Array.from({ length: p }, () => new Float64Array(p));

  for (let i = 0; i < p; i++)
    for (let j = i; j < p; j++) {
      let s = 0, w = 0;
      for (let k = n - 1; k >= 0; k--) {
        const wk = Math.pow(lambda, n - 1 - k);
        s += wk * (STATE.logRet[k][tickers[i]] - means[i]) * (STATE.logRet[k][tickers[j]] - means[j]);
        w += wk;
      }
      mat[i][j] = mat[j][i] = s / w;
    }
  return mat;
}

function computeCovariances(tickers) {
  STATE.covSample = sampleCov(tickers);
  STATE.covLW = ledoitWolf(tickers);
  STATE.covEWMA = ewmaCov(tickers);
}

// ----- Matrix utilities -----

function matInv(A) {
  const n = A.length;
  const aug = A.map((row, i) => {
    const r = new Float64Array(2 * n);
    for (let j = 0; j < n; j++) r[j] = row[j];
    r[n + i] = 1;
    return r;
  });
  for (let c = 0; c < n; c++) {
    let maxR = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(aug[r][c]) > Math.abs(aug[maxR][c])) maxR = r;
    [aug[c], aug[maxR]] = [aug[maxR], aug[c]];
    const piv = aug[c][c];
    if (Math.abs(piv) < 1e-14) return null;
    for (let j = 0; j < 2 * n; j++) aug[c][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = aug[r][c];
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= f * aug[c][j];
    }
  }
  return aug.map(r => Array.from(r.slice(n)));
}

function matVecMul(A, v) {
  return A.map(row => d3.sum(row.map((a, j) => a * v[j])));
}

function dot(a, b) { return d3.sum(a.map((v, i) => v * b[i])); }

function eigenvalues(A) {
  const n = A.length;
  let M = A.map(r => [...r]);
  const eigvals = [];
  for (let iter = 0; iter < 200 * n; iter++) {
    let maxOff = 0, p = 0, q = 1;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(M[i][j]) > maxOff) { maxOff = Math.abs(M[i][j]); p = i; q = j; }
    if (maxOff < 1e-12) break;
    const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
    const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    const tau = s / (1 + c);
    const app = M[p][p], aqq = M[q][q], apq = M[p][q];
    M[p][p] -= t * apq;
    M[q][q] += t * apq;
    M[p][q] = M[q][p] = 0;
    for (let r = 0; r < n; r++) {
      if (r === p || r === q) continue;
      const rp = M[r][p], rq = M[r][q];
      M[r][p] = M[p][r] = rp - s * (rq + tau * rp);
      M[r][q] = M[q][r] = rq + s * (rp - tau * rq);
    }
  }
  for (let i = 0; i < n; i++) eigvals.push(M[i][i]);
  return eigvals.sort((a, b) => b - a);
}

// ----- Portfolio optimisation -----

function minVariancePortfolio(cov) {
  const inv = matInv(cov);
  if (!inv) return null;
  const ones = new Array(cov.length).fill(1);
  const w = matVecMul(inv, ones);
  const s = d3.sum(w);
  return w.map(v => v / s);
}

function tangencyPortfolio(cov, mu, rf) {
  const inv = matInv(cov);
  if (!inv) return null;
  const excess = mu.map(m => m - rf);
  const w = matVecMul(inv, excess);
  const s = d3.sum(w);
  if (Math.abs(s) < 1e-14) return null;
  return w.map(v => v / s);
}

function riskParityPortfolio(cov) {
  const n = cov.length;
  let w = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 500; iter++) {
    const sigma_w = matVecMul(cov, w);
    const portVol = Math.sqrt(dot(w, sigma_w));
    const mrc = sigma_w.map(s => s / portVol);
    const rc = w.map((wi, i) => wi * mrc[i]);
    const target = portVol / n;
    const newW = w.map((wi, i) => wi * target / (rc[i] || 1e-10));
    const s = d3.sum(newW);
    w = newW.map(v => v / s);
  }
  return w;
}

function equalWeightPortfolio(n) {
  return new Array(n).fill(1 / n);
}

function meanVariancePortfolio(cov, mu, targetRet) {
  const n = cov.length;
  const inv = matInv(cov);
  if (!inv) return null;
  const ones = Array(n).fill(1);
  const a = dot(ones, matVecMul(inv, ones));
  const b = dot(ones, matVecMul(inv, mu));
  const c = dot(mu, matVecMul(inv, mu));
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-18) return null;
  const l1 = (c - b * targetRet) / det;
  const l2 = (a * targetRet - b) / det;
  const w = [];
  for (let j = 0; j < n; j++) {
    let wj = 0;
    for (let k = 0; k < n; k++) wj += inv[j][k] * (l1 + l2 * mu[k]);
    w.push(wj);
  }
  return w;
}

function updateTargetLabel() {
  document.getElementById('targetRetLabel').textContent =
    parseFloat(document.getElementById('targetRetSlider').value).toFixed(1) + '%';
}

function portfolioStats(w, mu, cov) {
  const ret = dot(w, mu);
  const vol = Math.sqrt(dot(w, matVecMul(cov, w)));
  return { ret, vol, sharpe: ret / vol };
}

function efficientFrontier(cov, mu, nPoints) {
  const n = cov.length;
  const inv = matInv(cov);
  if (!inv) return [];
  const ones = Array(n).fill(1);
  const a = dot(ones, matVecMul(inv, ones));
  const b = dot(ones, matVecMul(inv, mu));
  const c = dot(mu, matVecMul(inv, mu));
  const det = a * c - b * b;
  if (Math.abs(det) < 1e-18) return [];

  const muMin = b / a;
  const muMax = d3.max(mu) * 1.2;
  const pts = [];
  for (let i = 0; i <= nPoints; i++) {
    const target = muMin + (muMax - muMin) * i / nPoints;
    const l1 = (c - b * target) / det;
    const l2 = (a * target - b) / det;
    const w = [];
    for (let j = 0; j < n; j++) {
      let wj = 0;
      for (let k = 0; k < n; k++) wj += inv[j][k] * (l1 + l2 * mu[k]);
      w.push(wj);
    }
    const vol = Math.sqrt(dot(w, matVecMul(cov, w)));
    pts.push({ ret: target, vol, w });
  }
  return pts;
}

function computePortfolios(tickers) {
  const getCov = () => {
    const sel = document.getElementById('pfCovSelect').value;
    return sel === 'lw' ? STATE.covLW : sel === 'ewma' ? STATE.covEWMA : STATE.covSample;
  };
  const daily = getCov();
  const p = tickers.length;
  const cov = daily.map(r => Array.from(r).map(v => v * TRADING_DAYS));
  const mu = tickers.map(t => STATE.annRet[t]);
  const rf = (parseFloat(document.getElementById('rfRate').value) || 0) / 100;

  const targetRet = (parseFloat(document.getElementById('targetRetSlider').value) || 15) / 100;

  STATE.portfolios.minvar = minVariancePortfolio(cov);
  STATE.portfolios.tangency = tangencyPortfolio(cov, mu, rf);
  STATE.portfolios.riskparity = riskParityPortfolio(cov);
  STATE.portfolios.meanvar = meanVariancePortfolio(cov, mu, targetRet);
  STATE.portfolios.frontier = efficientFrontier(cov, mu, 80);
  STATE.portfolios.mu = mu;
  STATE.portfolios.cov = cov;
  STATE.portfolios.rf = rf;
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
  renderRollingStats(tickers);
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

// ----- Rolling statistics -----

function rollingMean(vals, w) {
  const out = new Array(vals.length).fill(null);
  if (vals.length < w) return out;
  let s = 0;
  for (let i = 0; i < w; i++) s += vals[i];
  out[w - 1] = s / w;
  for (let i = w; i < vals.length; i++) {
    s += vals[i] - vals[i - w];
    out[i] = s / w;
  }
  return out;
}

function rollingStd(vals, w) {
  const out = new Array(vals.length).fill(null);
  if (vals.length < w) return out;
  for (let i = w - 1; i < vals.length; i++) {
    let s = 0;
    for (let k = i - w + 1; k <= i; k++) s += vals[k];
    const mu = s / w;
    let v = 0;
    for (let k = i - w + 1; k <= i; k++) v += (vals[k] - mu) ** 2;
    out[i] = Math.sqrt(v / (w - 1));
  }
  return out;
}

function rollingCorr(a, b, w) {
  const out = new Array(a.length).fill(null);
  if (a.length < w) return out;
  for (let i = w - 1; i < a.length; i++) {
    let sa = 0, sb = 0;
    for (let k = i - w + 1; k <= i; k++) { sa += a[k]; sb += b[k]; }
    const ma = sa / w, mb = sb / w;
    let cov = 0, va = 0, vb = 0;
    for (let k = i - w + 1; k <= i; k++) {
      const da = a[k] - ma, db = b[k] - mb;
      cov += da * db; va += da * da; vb += db * db;
    }
    const denom = Math.sqrt(va * vb);
    out[i] = denom > 1e-14 ? cov / denom : null;
  }
  return out;
}

function setRollWin(w, el) {
  STATE.rollWin = w;
  document.querySelectorAll('#rollWinGroup .win-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  if (!STATE.logRet) return;
  const tickers = STATE.active || STATE.tickers;
  renderRollingStats(tickers);
}

function renderRollingStats(tickers) {
  const w = STATE.rollWin || 90;
  document.getElementById('rollVolSub').textContent = `${w}d rolling · annualised`;
  document.getElementById('rollSharpeSub').textContent = `${w}d rolling · annualised · rf = 0`;
  renderRollVol(tickers, w);
  renderRollSharpe(tickers, w);
  populateRollCorrSelect(tickers);
  renderRollCorr();
}

function drawRollingLines(container, dates, seriesArr, labels, opts) {
  container.innerHTML = '';
  const flat = seriesArr.flat().filter(v => v != null && !isNaN(v));
  if (!flat.length) {
    container.innerHTML = `<div class="empty">Window (${opts.win}d) exceeds available observations (${dates.length})</div>`;
    return;
  }

  const W = container.clientWidth, H = 280;
  const m = { t: 15, r: 15, b: 35, l: 55 };
  const svg = d3.select(container).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  let firstValid = dates.length;
  for (const s of seriesArr) {
    for (let i = 0; i < s.length; i++) {
      if (s[i] != null && !isNaN(s[i])) { if (i < firstValid) firstValid = i; break; }
    }
  }
  const xStart = firstValid < dates.length ? dates[firstValid] : dates[0];
  const x = d3.scaleTime().domain([xStart, dates[dates.length - 1]]).range([m.l, W - m.r]);
  let yDom = opts.yDomain;
  if (!yDom) {
    const [lo, hi] = d3.extent(flat);
    const pad = (hi - lo) * 0.08 || Math.max(Math.abs(hi), 1) * 0.1;
    yDom = [lo - pad, hi + pad];
    if (opts.clipZero) yDom[0] = Math.max(yDom[0], 0);
  }
  const y = d3.scaleLinear().domain(yDom).range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(opts.yFmt))
    .call(g => g.select('.domain').remove());
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', 14)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text(opts.yLabel);

  if (opts.refLines) {
    opts.refLines.forEach(v => {
      if (v >= yDom[0] && v <= yDom[1]) {
        svg.append('line').attr('x1', m.l).attr('x2', W - m.r)
          .attr('y1', y(v)).attr('y2', y(v))
          .attr('stroke', v === 0 ? '#999' : '#ddd').attr('stroke-width', 1).attr('stroke-dasharray', '3,3');
      }
    });
  }

  const line = d3.line().defined(d => d.val != null && !isNaN(d.val))
    .x(d => x(d.date)).y(d => y(d.val)).curve(d3.curveMonotoneX);

  seriesArr.forEach((s, i) => {
    const pts = s.map((v, k) => ({ date: dates[k], val: v }));
    svg.append('path').datum(pts).attr('d', line)
      .attr('fill', 'none').attr('stroke', col(STATE.tickers.indexOf(labels[i])))
      .attr('stroke-width', 1.4).attr('stroke-opacity', 0.85);
  });

  const legendDiv = document.createElement('div');
  legendDiv.className = 'legend-row';
  labels.forEach(t => {
    legendDiv.innerHTML += `<span class="legend-item"><span class="legend-swatch" style="background:${col(STATE.tickers.indexOf(t))}"></span>${t}</span>`;
  });
  container.appendChild(legendDiv);
}

function renderRollVol(tickers, w) {
  const wrap = document.getElementById('rollVolWrap');
  const dates = STATE.logRet.map(r => r.Date);
  const series = tickers.map(t => {
    const vals = STATE.logRet.map(r => r[t]);
    const sd = rollingStd(vals, w);
    return sd.map(v => v == null ? null : v * Math.sqrt(TRADING_DAYS) * 100);
  });
  drawRollingLines(wrap, dates, series, tickers, {
    win: w, yFmt: d => d.toFixed(0) + '%', yLabel: 'Annualised Volatility', clipZero: true
  });
}

function renderRollSharpe(tickers, w) {
  const wrap = document.getElementById('rollSharpeWrap');
  const dates = STATE.logRet.map(r => r.Date);
  const series = tickers.map(t => {
    const vals = STATE.logRet.map(r => r[t]);
    const mu = rollingMean(vals, w);
    const sd = rollingStd(vals, w);
    return mu.map((m, i) => (m == null || sd[i] == null || sd[i] === 0)
      ? null
      : (m * Math.sqrt(TRADING_DAYS)) / sd[i]);
  });
  drawRollingLines(wrap, dates, series, tickers, {
    win: w, yFmt: d => d.toFixed(1), yLabel: 'Sharpe', refLines: [0]
  });
}

function populateRollCorrSelect(tickers) {
  const sel = document.getElementById('rollCorrAnchor');
  const prev = sel.value;
  sel.innerHTML = '';
  tickers.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    sel.appendChild(opt);
  });
  sel.value = tickers.includes(prev) ? prev : tickers[0];
}

function renderRollCorr() {
  const wrap = document.getElementById('rollCorrWrap');
  if (!wrap || !STATE.logRet) return;
  const tickers = STATE.active || STATE.tickers;
  const anchor = document.getElementById('rollCorrAnchor').value;
  if (!anchor || !tickers.includes(anchor)) { wrap.innerHTML = ''; return; }
  const others = tickers.filter(t => t !== anchor);
  if (!others.length) {
    wrap.innerHTML = '<div class="empty">Select at least 2 assets</div>';
    return;
  }
  const w = STATE.rollWin || 90;
  const dates = STATE.logRet.map(r => r.Date);
  const anchorVals = STATE.logRet.map(r => r[anchor]);
  const series = others.map(t => {
    const vals = STATE.logRet.map(r => r[t]);
    return rollingCorr(anchorVals, vals, w);
  });
  drawRollingLines(wrap, dates, series, others, {
    win: w, yFmt: d => d.toFixed(1), yLabel: `Correlation vs ${anchor}`,
    yDomain: [-1, 1], refLines: [0]
  });
}

// ===============================================
//  RENDERERS - Tab 2: Risk Estimation
// ===============================================

function renderRisk() {
  if (!STATE.logRet) return;
  const tickers = STATE.active || STATE.tickers;
  STATE.covEWMA = ewmaCov(tickers);

  const annFactor = TRADING_DAYS;
  const toArr = mat => mat.map(r => Array.from(r).map(v => v * annFactor));
  const annSample = toArr(STATE.covSample);
  const annLW = toArr(STATE.covLW);
  const annEWMA = toArr(STATE.covEWMA);

  const allVals = [annSample, annLW, annEWMA].flatMap(m => m.flatMap(r => r));
  const domain = [d3.min(allVals), d3.max(allVals)];

  const wrap1 = document.getElementById('covSampleWrap');
  const wrap2 = document.getElementById('covLWWrap');
  const wrap3 = document.getElementById('covEWMAWrap');
  wrap1.innerHTML = ''; wrap2.innerHTML = ''; wrap3.innerHTML = '';

  const showDiff = document.getElementById('diffToggle') && document.getElementById('diffToggle').checked;
  const annotateOk = tickers.length <= 7;

  if (showDiff) {
    const diffLW = annLW.map((r, i) => r.map((v, j) => v - annSample[i][j]));
    const diffEW = annEWMA.map((r, i) => r.map((v, j) => v - annSample[i][j]));
    const diffInterp = d3.interpolateRdBu;

    const maxAbsLW = d3.max(diffLW.flatMap(r => r).map(Math.abs)) || 0.001;
    const maxAbsEW = d3.max(diffEW.flatMap(r => r).map(Math.abs)) || 0.001;

    drawHeatmap(wrap1, annSample, tickers, d3.interpolateYlOrRd, domain, annotateOk);
    drawHeatmap(wrap2, diffLW, tickers, diffInterp, [maxAbsLW, -maxAbsLW], annotateOk);
    drawHeatmap(wrap3, diffEW, tickers, diffInterp, [maxAbsEW, -maxAbsEW], annotateOk);
  } else {
    const interp = d3.interpolateYlOrRd;
    drawHeatmap(wrap1, annSample, tickers, interp, domain, annotateOk);
    drawHeatmap(wrap2, annLW, tickers, interp, domain, annotateOk);
    drawHeatmap(wrap3, annEWMA, tickers, interp, domain, annotateOk);
  }

  document.getElementById('lwAlpha').textContent = 'α = ' + (STATE._lwAlpha || 0).toFixed(3);
  document.getElementById('ewmaInfo').textContent = 'λ = ' + (document.getElementById('ewmaLambda').value);

  renderEigenSpectrum(tickers, annSample, annLW, annEWMA);
  renderConditionTable(annSample, annLW, annEWMA);
}

function renderEigenSpectrum(tickers, S, LW, EW) {
  const wrap = document.getElementById('eigenWrap');
  wrap.innerHTML = '';
  const eigS = eigenvalues(S.map(r => [...r]));
  const eigLW = eigenvalues(LW.map(r => [...r]));
  const eigEW = eigenvalues(EW.map(r => [...r]));

  const W = wrap.clientWidth, H = 250;
  const m = { t: 15, r: 15, b: 40, l: 55 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const n = eigS.length;
  const x = d3.scaleBand().domain(d3.range(n)).range([m.l, W - m.r]).padding(.3);
  const allE = [...eigS, ...eigLW, ...eigEW];
  const y = d3.scaleLinear().domain([0, d3.max(allE) * 1.1]).range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).tickFormat(i => i + 1)).call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5)).call(g => g.select('.domain').remove());
  svg.append('text').attr('x', W / 2).attr('y', H - 2).attr('text-anchor', 'middle')
    .attr('font-size', 10).attr('fill', '#888').text('Eigenvalue index');

  const bw = x.bandwidth() / 3;
  const colors = ['#2563eb', '#16a34a', '#d97706'];
  const names = ['Sample', 'Ledoit-Wolf', 'EWMA'];
  [eigS, eigLW, eigEW].forEach((eig, si) => {
    eig.forEach((v, i) => {
      svg.append('rect').attr('x', x(i) + si * bw).attr('y', y(v))
        .attr('width', bw - 1).attr('height', y(0) - y(v))
        .attr('fill', colors[si]).attr('fill-opacity', .75)
        .on('mousemove', e => showTooltip(`${names[si]} λ${i + 1}: ${v.toFixed(4)}`, e))
        .on('mouseleave', hideTooltip);
    });
  });

  const legendDiv = document.createElement('div');
  legendDiv.className = 'legend-row';
  names.forEach((nm, i) => {
    legendDiv.innerHTML += `<span class="legend-item"><span class="legend-swatch" style="background:${colors[i]}"></span>${nm}</span>`;
  });
  wrap.appendChild(legendDiv);
}

function renderConditionTable(S, LW, EW) {
  const wrap = document.getElementById('condTableWrap');
  const cond = mat => {
    const e = eigenvalues(mat.map(r => [...r]));
    return (d3.max(e) / d3.min(e.filter(v => v > 1e-12))).toFixed(1);
  };
  const frobDiff = (A, B) => {
    let s = 0;
    for (let i = 0; i < A.length; i++)
      for (let j = 0; j < A.length; j++)
        s += (A[i][j] - B[i][j]) ** 2;
    return Math.sqrt(s).toFixed(4);
  };
  wrap.innerHTML = `<table class="stats-table">
    <thead><tr><th>Metric</th><th class="num">Sample</th><th class="num">Ledoit-Wolf</th><th class="num">EWMA</th></tr></thead>
    <tbody>
      <tr><td>Condition number</td><td class="num">${cond(S)}</td><td class="num">${cond(LW)}</td><td class="num">${cond(EW)}</td></tr>
      <tr><td>Frobenius dist. to Sample</td><td class="num">0</td><td class="num">${frobDiff(S, LW)}</td><td class="num">${frobDiff(S, EW)}</td></tr>
    </tbody></table>`;
}

// ===============================================
//  RENDERERS - Tab 3: Portfolio Builder
// ===============================================

function renderPortfolio() {
  if (!STATE.logRet) return;
  const tickers = STATE.active || STATE.tickers;
  computePortfolios(tickers);
  renderFrontier(tickers);
  renderStackedWeights(tickers);
  renderMonteCarlo(tickers);
  renderPortfolioComparison(tickers);
}

// ----- Monte Carlo feasible set -----

function sampleDirichletUniform(n) {
  const w = new Array(n);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const u = -Math.log(1 - Math.random());
    w[i] = u; s += u;
  }
  for (let i = 0; i < n; i++) w[i] /= s;
  return w;
}

function monteCarloCloud(mu, cov, N, rf) {
  const n = mu.length;
  const pts = new Array(N);
  for (let k = 0; k < N; k++) {
    const w = sampleDirichletUniform(n);
    const ret = dot(w, mu);
    const vol = Math.sqrt(dot(w, matVecMul(cov, w)));
    pts[k] = { w, ret, vol, sharpe: (ret - rf) / vol };
  }
  return pts;
}

let MC_SEED_BUMP = 0;
const MC_STATE = { key: '', cloud: null };
function resampleMc() { MC_SEED_BUMP++; MC_STATE.key = ''; renderPortfolio(); }

function starPath(r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 5 * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return 'M' + pts.map(p => p.map(v => v.toFixed(2)).join(',')).join('L') + 'Z';
}

function weightBarsHtml(w, tickers) {
  const pairs = tickers.map((t, i) => ({ t, w: w[i] })).sort((a, b) => b.w - a.w);
  let html = '<div style="margin-top:4px">';
  pairs.forEach(p => {
    html += `<div style="display:flex;align-items:center;gap:6px;font-size:10px;margin-top:2px">
      <span style="width:34px;font-weight:600">${p.t}</span>
      <div style="flex:1;min-width:70px;background:rgba(255,255,255,0.15);height:5px;border-radius:3px;overflow:hidden">
        <div style="width:${(p.w*100).toFixed(1)}%;height:100%;background:#60a5fa"></div>
      </div>
      <span style="width:34px;text-align:right;opacity:.75">${(p.w*100).toFixed(1)}%</span>
    </div>`;
  });
  return html + '</div>';
}

function renderMonteCarlo(tickers) {
  const wrap = document.getElementById('mcWrap');
  wrap.innerHTML = '';
  const mcOn = document.getElementById('mcToggle').checked;
  if (!mcOn) {
    wrap.innerHTML = '<div class="empty">Monte Carlo disabled — toggle to enable</div>';
    return;
  }
  const mu = STATE.portfolios.mu;
  const cov = STATE.portfolios.cov;
  const rf = STATE.portfolios.rf;
  const frontier = STATE.portfolios.frontier;
  if (!mu || !cov || !frontier.length) return;

  const N = parseInt(document.getElementById('mcN').value, 10);
  const covSel = document.getElementById('pfCovSelect').value;
  const key = `${N}|${covSel}|${STATE.window}|${tickers.join(',')}|${MC_SEED_BUMP}`;
  let animate = false;
  if (key !== MC_STATE.key) {
    MC_STATE.key = key;
    MC_STATE.cloud = monteCarloCloud(mu, cov, N, rf);
    animate = true;
  } else {
    for (const p of MC_STATE.cloud) p.sharpe = (p.ret - rf) / p.vol;
  }
  const cloud = MC_STATE.cloud;

  const W = wrap.clientWidth, H = 400;
  const m = { t: 28, r: 120, b: 48, l: 60 };

  const allVols = cloud.map(d => d.vol).concat(frontier.map(d => d.vol));
  const allRets = cloud.map(d => d.ret).concat(frontier.map(d => d.ret));
  const xDom = [d3.min(allVols) * 100 * 0.9, d3.max(allVols) * 100 * 1.05];
  const yDom = [d3.min(allRets) * 100 - 1, d3.max(allRets) * 100 + 1];
  const x = d3.scaleLinear().domain(xDom).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain(yDom).range([H - m.b, m.t]);

  const sharpeExt = d3.extent(cloud, d => d.sharpe);
  const color = d3.scaleSequential(d3.interpolateViridis).domain(sharpeExt);

  wrap.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas.style.position = 'absolute';
  canvas.style.pointerEvents = 'none';
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  function drawPoint(d) {
    ctx.fillStyle = color(d.sharpe);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x(d.vol * 100), y(d.ret * 100), 1.9, 0, 2 * Math.PI);
    ctx.fill();
  }

  const svg = d3.select(wrap).append('svg').attr('class', 'chart')
    .attr('viewBox', `0 0 ${W} ${H}`).style('position', 'relative');

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => d.toFixed(0) + '%'))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toFixed(0) + '%'))
    .call(g => g.select('.domain').remove());
  svg.append('text').attr('x', (W - m.r + m.l) / 2).attr('y', H - 6)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('Volatility');
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', 14)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('Expected Return');

  const counterText = svg.append('text').attr('x', m.l + 8).attr('y', m.t - 10)
    .attr('font-size', 11).attr('fill', '#555').attr('font-weight', 600).text('');

  tickers.forEach(t => {
    svg.append('circle').attr('cx', x(STATE.annVol[t] * 100)).attr('cy', y(STATE.annRet[t] * 100))
      .attr('r', 3).attr('fill', '#555').attr('stroke', 'white').attr('stroke-width', 1);
    svg.append('text').attr('x', x(STATE.annVol[t] * 100) + 5).attr('y', y(STATE.annRet[t] * 100) + 3)
      .attr('font-size', 9).attr('fill', '#555').text(t);
  });

  const bestG = svg.append('g').attr('class', 'mc-best').style('display', 'none');
  const bestPulse = bestG.append('circle').attr('r', 8).attr('fill', 'none')
    .attr('stroke', '#fbbf24').attr('stroke-width', 2);
  bestG.append('path').attr('d', starPath(9))
    .attr('fill', '#fbbf24').attr('stroke', '#b45309').attr('stroke-width', 1);
  const bestLabel = bestG.append('text').attr('y', -14).attr('text-anchor', 'middle')
    .attr('font-size', 10).attr('font-weight', 700).attr('fill', '#b45309').text('');

  function pulseBest() {
    bestPulse.attr('r', 6).attr('stroke-opacity', 0.9)
      .transition().duration(1200).ease(d3.easeCubicOut)
      .attr('r', 22).attr('stroke-opacity', 0)
      .on('end', pulseBest);
  }

  const lineGen = d3.line().x(d => x(d.vol * 100)).y(d => y(d.ret * 100)).curve(d3.curveMonotoneX);
  const frontierPath = svg.append('path').datum(frontier).attr('d', lineGen)
    .attr('fill', 'none').attr('stroke', '#111').attr('stroke-width', 2).attr('stroke-opacity', 0.85);

  const specials = [
    { key: 'minvar',     label: 'Min Var',     color: '#16a34a' },
    { key: 'tangency',   label: 'Tangency',    color: '#dc2626' },
    { key: 'riskparity', label: 'Risk Parity', color: '#d97706' },
  ];
  const specialsG = svg.append('g').attr('class', 'mc-specials');
  specials.forEach(sp => {
    const w = STATE.portfolios[sp.key];
    if (!w) return;
    const st = portfolioStats(w, mu, cov);
    const g = specialsG.append('g').attr('transform', `translate(${x(st.vol*100)},${y(st.ret*100)})`);
    g.append('circle').attr('r', 6).attr('fill', sp.color)
      .attr('stroke', 'white').attr('stroke-width', 2)
      .on('mousemove', e => showTooltip(
        `<b>${sp.label}</b><br>Return: ${(st.ret*100).toFixed(1)}%<br>Vol: ${(st.vol*100).toFixed(1)}%<br>Sharpe: ${st.sharpe.toFixed(2)}`, e))
      .on('mouseleave', hideTooltip);
    g.append('text').attr('x', 10).attr('y', 3).attr('font-size', 9)
      .attr('fill', sp.color).attr('font-weight', 600).text(sp.label);
  });

  const legX = W - m.r + 18, legY = m.t + 10, legW = 14, legH = H - m.b - m.t - 20;
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id', 'mcGrad')
    .attr('x1', '0%').attr('y1', '100%').attr('x2', '0%').attr('y2', '0%');
  d3.range(0, 1.01, 0.1).forEach(t => {
    grad.append('stop').attr('offset', (t * 100) + '%')
      .attr('stop-color', color(sharpeExt[0] + t * (sharpeExt[1] - sharpeExt[0])));
  });
  svg.append('rect').attr('x', legX).attr('y', legY).attr('width', legW).attr('height', legH)
    .attr('fill', 'url(#mcGrad)').attr('stroke', '#bbb').attr('stroke-width', 0.5);
  svg.append('text').attr('x', legX + legW / 2).attr('y', legY - 6)
    .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#555')
    .attr('font-weight', 600).text('Sharpe');
  const legScale = d3.scaleLinear().domain(sharpeExt).range([legY + legH, legY]);
  svg.append('g').attr('transform', `translate(${legX + legW},0)`)
    .call(d3.axisRight(legScale).ticks(5).tickFormat(d => d.toFixed(2)).tickSize(4))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('text').attr('font-size', 9).attr('fill', '#666'));

  const hoverRing = svg.append('circle').style('display', 'none')
    .attr('r', 6).attr('fill', 'none').attr('stroke', '#2563eb').attr('stroke-width', 2);

  const hoverRect = svg.append('rect')
    .attr('x', m.l).attr('y', m.t).attr('width', W - m.r - m.l).attr('height', H - m.b - m.t)
    .attr('fill', 'transparent').style('cursor', 'crosshair');

  function attachHover() {
    hoverRect.on('mousemove', function(e) {
      const [mx, my] = d3.pointer(e, svg.node());
      let best = -1, bestDist = 64;
      for (let i = 0; i < cloud.length; i++) {
        const d = cloud[i];
        const dx = x(d.vol * 100) - mx, dy = y(d.ret * 100) - my;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best >= 0) {
        const d = cloud[best];
        hoverRing.attr('cx', x(d.vol * 100)).attr('cy', y(d.ret * 100)).style('display', null);
        showTooltip(
          `<b>Random portfolio</b><br>Return: ${(d.ret*100).toFixed(1)}%<br>Vol: ${(d.vol*100).toFixed(1)}%<br>Sharpe: ${d.sharpe.toFixed(2)}${weightBarsHtml(d.w, tickers)}`,
          e);
      } else {
        hoverRing.style('display', 'none');
        hideTooltip();
      }
    }).on('mouseleave', () => { hoverRing.style('display', 'none'); hideTooltip(); });
  }

  if (!animate) {
    for (const d of cloud) drawPoint(d);
    let bi = 0;
    for (let i = 1; i < cloud.length; i++) if (cloud[i].sharpe > cloud[bi].sharpe) bi = i;
    const b = cloud[bi];
    bestG.style('display', null)
      .attr('transform', `translate(${x(b.vol*100)},${y(b.ret*100)})`);
    bestLabel.text(`★ Best Sharpe ${b.sharpe.toFixed(2)}`);
    pulseBest();
    counterText.text(`${N.toLocaleString()} portfolios · uniform Dirichlet weights`);
    attachHover();
    return;
  }

  frontierPath.style('opacity', 0);
  specialsG.style('opacity', 0);

  const DURATION = 2600;
  const start = performance.now();
  let drawn = 0;
  let bestIdx = -1;

  function step(now) {
    const t = Math.min(1, (now - start) / DURATION);
    const target = Math.floor(d3.easeCubicOut(t) * cloud.length);
    for (let i = drawn; i < target; i++) {
      drawPoint(cloud[i]);
      if (bestIdx < 0 || cloud[i].sharpe > cloud[bestIdx].sharpe) bestIdx = i;
    }
    drawn = target;
    counterText.text(`${drawn.toLocaleString()} / ${N.toLocaleString()} portfolios sampled`);
    if (bestIdx >= 0) {
      const b = cloud[bestIdx];
      bestG.style('display', null)
        .transition().duration(220).ease(d3.easeCubicOut)
        .attr('transform', `translate(${x(b.vol*100)},${y(b.ret*100)})`);
      bestLabel.text(`★ Best Sharpe ${b.sharpe.toFixed(2)}`);
    }
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      counterText.text(`${N.toLocaleString()} portfolios · uniform Dirichlet weights`);
      pulseBest();
      frontierPath.transition().delay(100).duration(600).style('opacity', 1)
        .attrTween('stroke-dasharray', function() {
          const len = this.getTotalLength();
          return u => `${len * u},${len}`;
        });
      specialsG.transition().delay(700).duration(400).style('opacity', 1);
      attachHover();
    }
  }
  requestAnimationFrame(step);
}

function renderFrontier(tickers) {
  const wrap = document.getElementById('frontierWrap');
  wrap.innerHTML = '';
  const frontier = STATE.portfolios.frontier;
  if (!frontier.length) return;

  const W = wrap.clientWidth, H = 340;
  const m = { t: 20, r: 20, b: 45, l: 60 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLinear()
    .domain([d3.min(frontier, d => d.vol) * .85 * 100, d3.max(frontier, d => d.vol) * 1.15 * 100])
    .range([m.l, W - m.r]);
  const y = d3.scaleLinear()
    .domain([d3.min(frontier, d => d.ret) * 100 - 1, d3.max(frontier, d => d.ret) * 100 + 1])
    .range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d => d.toFixed(0) + '%'))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(6).tickFormat(d => d.toFixed(0) + '%'))
    .call(g => g.select('.domain').remove());
  svg.append('text').attr('x', W / 2).attr('y', H - 4).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('Portfolio Volatility');
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', 14).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('Expected Return');

  const line = d3.line().x(d => x(d.vol * 100)).y(d => y(d.ret * 100)).curve(d3.curveMonotoneX);
  const path = svg.append('path').datum(frontier).attr('d', line)
    .attr('fill', 'none').attr('stroke', '#2563eb').attr('stroke-width', 2);
  const totalLen = path.node().getTotalLength();
  path.attr('stroke-dasharray', totalLen).attr('stroke-dashoffset', totalLen)
    .transition().duration(800).attr('stroke-dashoffset', 0);

  tickers.forEach((t, i) => {
    svg.append('circle').attr('cx', x(STATE.annVol[t] * 100)).attr('cy', y(STATE.annRet[t] * 100))
      .attr('r', 4).attr('fill', '#aaa').attr('stroke', 'white').attr('stroke-width', 1);
    svg.append('text').attr('x', x(STATE.annVol[t] * 100) + 6).attr('y', y(STATE.annRet[t] * 100) + 3)
      .attr('font-size', 9).attr('fill', '#888').text(t);
  });

  const mu = STATE.portfolios.mu;
  const cov = STATE.portfolios.cov;
  const rf = STATE.portfolios.rf;
  const specials = [
    { key: 'minvar', label: 'Min Var', color: '#16a34a' },
    { key: 'tangency', label: 'Tangency', color: '#dc2626' },
    { key: 'riskparity', label: 'Risk Parity', color: '#d97706' },
    { key: 'meanvar', label: 'Mean-Var', color: '#7c3aed' },
  ];

  specials.forEach(sp => {
    const w = STATE.portfolios[sp.key];
    if (!w) return;
    const st = portfolioStats(w, mu, cov);
    const cx = x(st.vol * 100), cy = y(st.ret * 100);
    svg.append('circle').attr('cx', cx).attr('cy', cy)
      .attr('r', 7).attr('fill', sp.color).attr('stroke', 'white').attr('stroke-width', 2)
      .on('mousemove', e => showTooltip(
        `<b>${sp.label}</b><br>Return: ${(st.ret*100).toFixed(1)}%<br>Vol: ${(st.vol*100).toFixed(1)}%<br>Sharpe: ${st.sharpe.toFixed(2)}`, e))
      .on('mouseleave', hideTooltip);
    svg.append('text').attr('x', cx + 10).attr('y', cy + 3)
      .attr('font-size', 9).attr('fill', sp.color).attr('font-weight', 600).text(sp.label);
  });

  if (STATE.portfolios.tangency) {
    const tSt = portfolioStats(STATE.portfolios.tangency, mu, cov);
    svg.append('line')
      .attr('x1', x(0)).attr('y1', y(rf * 100))
      .attr('x2', x(tSt.vol * 200)).attr('y2', y((rf + (tSt.ret - rf) / tSt.vol * tSt.vol * 2) * 100))
      .attr('stroke', '#dc2626').attr('stroke-width', 1).attr('stroke-dasharray', '5,4').attr('stroke-opacity', .5);
  }
}

function renderStackedWeights(tickers) {
  const wrap = document.getElementById('stackedWeightsWrap');
  wrap.innerHTML = '';
  const methods = [
    { key: 'minvar', label: 'Min Var' },
    { key: 'tangency', label: 'Tangency' },
    { key: 'riskparity', label: 'Risk Parity' },
    { key: 'meanvar', label: 'Mean-Var' },
  ];
  const available = methods.filter(m => STATE.portfolios[m.key]);
  if (!available.length) { wrap.innerHTML = '<div class="empty">Not available</div>'; return; }

  const W = wrap.clientWidth, H = 320;
  const mg = { t: 15, r: 15, b: 50, l: 50 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const x0 = d3.scaleBand().domain(available.map(m => m.label)).range([mg.l, W - mg.r]).padding(.25);
  const y = d3.scaleLinear().domain([0, 1]).range([H - mg.b, mg.t]);

  svg.append('g').attr('transform', `translate(0,${H - mg.b})`)
    .call(d3.axisBottom(x0)).call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${mg.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%'))).call(g => g.select('.domain').remove());

  available.forEach(method => {
    const weights = STATE.portfolios[method.key];
    const absW = weights.map(v => Math.max(0, v));
    const total = d3.sum(absW) || 1;
    const normed = absW.map(v => v / total);

    let cumY = 0;
    tickers.forEach((t, i) => {
      if (normed[i] < 0.005) { cumY += normed[i]; return; }
      const barY = y(cumY + normed[i]);
      const barH = y(cumY) - barY;
      const idx = STATE.tickers.indexOf(t);
      svg.append('rect')
        .attr('x', x0(method.label)).attr('y', barY)
        .attr('width', x0.bandwidth()).attr('height', barH)
        .attr('fill', col(idx)).attr('fill-opacity', .85)
        .on('mousemove', e => showTooltip(`<b>${method.label}</b><br>${t}: ${(weights[i]*100).toFixed(1)}%`, e))
        .on('mouseleave', hideTooltip);
      if (barH > 14) {
        svg.append('text')
          .attr('x', x0(method.label) + x0.bandwidth() / 2).attr('y', barY + barH / 2 + 4)
          .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', 'white').attr('font-weight', 600)
          .text(t);
      }
      cumY += normed[i];
    });
  });

  const legendDiv = document.createElement('div');
  legendDiv.className = 'legend-row';
  tickers.forEach((t, i) => {
    legendDiv.innerHTML += `<span class="legend-item"><span class="legend-swatch" style="background:${col(STATE.tickers.indexOf(t))}"></span>${t}</span>`;
  });
  wrap.appendChild(legendDiv);
}

function renderPortfolioComparison(tickers) {
  const wrap = document.getElementById('pfCompareWrap');
  const mu = STATE.portfolios.mu;
  const cov = STATE.portfolios.cov;
  const methods = [
    { key: 'minvar', label: 'Min Variance' },
    { key: 'tangency', label: 'Tangency' },
    { key: 'riskparity', label: 'Risk Parity' },
    { key: 'meanvar', label: 'Mean-Variance' },
  ];
  let html = `<table class="stats-table"><thead><tr><th>Method</th><th class="num">Return</th><th class="num">Volatility</th><th class="num">Sharpe</th><th class="num">Max Weight</th></tr></thead><tbody>`;
  methods.forEach(m => {
    const w = STATE.portfolios[m.key];
    if (!w) { html += `<tr><td>${m.label}</td><td colspan="4" class="num">-</td></tr>`; return; }
    const st = portfolioStats(w, mu, cov);
    html += `<tr>
      <td class="ticker-cell">${m.label}</td>
      <td class="num ${st.ret >= 0 ? 'pos' : 'neg'}">${(st.ret*100).toFixed(1)}%</td>
      <td class="num">${(st.vol*100).toFixed(1)}%</td>
      <td class="num">${st.sharpe.toFixed(2)}</td>
      <td class="num">${(d3.max(w)*100).toFixed(1)}%</td>
    </tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ----- Init -----
renderChips();
