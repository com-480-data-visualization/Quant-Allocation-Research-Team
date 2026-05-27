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
  window: 'max',
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
  rollWin: 90,
  riskRollWin: 252,      // Rolling window for risk-tab spectral time-series
  userWeights: null      // E4 — Custom Weight Playground (length = active tickers)
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
  document.querySelectorAll('.controls-bar .win-btn').forEach(b => b.classList.remove('active'));
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
      for (const k in d) {
        if (k === 'Date' || k === '') continue;
        const v = +d[k];
        if (!isNaN(v)) row[k] = v;
      }
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
  // Only render the currently visible panel - hidden panels have clientWidth=0
  // which would produce negative SVG dimensions. Other panels are rendered on tab switch.
  const active = document.querySelector('.panel.active')?.id || 'panel-explorer';
  if (active === 'panel-explorer')  renderExplorer(tickers);
  if (active === 'panel-risk')      renderRisk();
  if (active === 'panel-portfolio') renderPortfolio();
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
    const apq = M[p][q];
    const diff = M[q][q] - M[p][p];
    let t;
    if (Math.abs(diff) < 1e-30 * Math.abs(apq)) {
      t = apq >= 0 ? 1 : -1;
    } else {
      const theta = diff / (2 * apq);
      t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    }
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    const tau = s / (1 + c);
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
  if (s <= 1e-14) return null;
  return w.map(v => v / s);
}

function riskParityPortfolio(cov) {
  const n = cov.length;
  let w = new Array(n).fill(1 / n);
  let last = w.slice();
  for (let iter = 0; iter < 500; iter++) {
    const sigma_w = matVecMul(cov, w);
    const portVol = Math.sqrt(Math.max(1e-18, dot(w, sigma_w)));
    const mrc = sigma_w.map(s => s / portVol);
    const rc = w.map((wi, i) => wi * mrc[i]);
    const target = portVol / n;
    const newW = w.map((wi, i) => {
      const safeRc = Math.max(rc[i], 1e-10);
      return Math.max(0, wi * target / safeRc);
    });
    const s = d3.sum(newW);
    if (!isFinite(s) || s <= 0) return last;
    last = w;
    w = newW.map(v => v / s);
  }
  if (w.some(v => !isFinite(v))) return new Array(n).fill(1 / n);
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

function tweenNumber(el, from, to, duration, formatter) {
  const i = d3.interpolateNumber(from, to);
  const start = performance.now();
  function step(now) {
    const tt = Math.min(1, (now - start) / duration);
    const eased = d3.easeCubicOut(tt);
    el.textContent = formatter(i(eased));
    if (tt < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderKPIs(tickers) {
  const best = tickers.reduce((a, b) => STATE.sharpe[a] > STATE.sharpe[b] ? a : b);
  const elN = document.getElementById('kpi-n');
  const elObs = document.getElementById('kpi-obs');
  const elSharpe = document.getElementById('kpi-sharpe');
  const elBest = document.getElementById('kpi-best');

  const prevN = parseFloat(elN.textContent.replace(/[^0-9.\-]/g, '')) || 0;
  const prevObs = parseFloat(elObs.textContent.replace(/[^0-9.\-]/g, '')) || 0;
  const prevSharpe = parseFloat(elSharpe.textContent) || 0;

  tweenNumber(elN, prevN, tickers.length, 600, v => Math.round(v).toString());
  tweenNumber(elObs, prevObs, STATE.logRet.length, 700, v => Math.round(v).toLocaleString());
  tweenNumber(elSharpe, prevSharpe, STATE.sharpe[best], 700, v => v.toFixed(2));

  const d0 = STATE.prices[0].Date, d1 = STATE.prices[STATE.prices.length - 1].Date;
  document.getElementById('kpi-range').textContent =
    d3.timeFormat('%b %Y')(d0) + ' - ' + d3.timeFormat('%b %Y')(d1);
  elBest.textContent = best;
}

function renderScatter(tickers) {
  const wrap = document.getElementById('scatterWrap');
  wrap.innerHTML = '';
  const W = wrap.clientWidth, H = 320;
  if (W < 100) return;
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
  if (W < 80) return;            // container not laid out yet - skip; will re-render on tab switch / resize
  const cellSize = Math.min(Math.floor((W - 60) / n), 52);
  if (cellSize < 4) return;
  const mL = 48, mT = 10;
  const totalW = mL + n * cellSize;
  const totalH = mT + n * cellSize + 30;
  const svg = d3.select(container).append('svg').attr('class', 'chart')
    .attr('viewBox', `0 0 ${totalW} ${totalH}`);
  const colorScale = d3.scaleSequential(interpolator).domain(domain);

  // Use chroma.js to pick a luminance-aware text color for cells (better contrast than a fixed |v|>0.6 threshold)
  const useChroma = typeof chroma !== 'undefined';
  const textColor = (rgbStr) => {
    if (!useChroma) return '#333';
    try { return chroma(rgbStr).luminance() > 0.55 ? '#1f2937' : '#ffffff'; }
    catch (e) { return '#333'; }
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = mat[i][j];
      const fillCol = colorScale(v);
      const g = svg.append('g');
      g.append('rect')
        .attr('x', mL + j * cellSize).attr('y', mT + i * cellSize)
        .attr('width', cellSize - 1).attr('height', cellSize - 1)
        .attr('rx', 2).attr('fill', fillCol).attr('opacity', 0)
        .on('mousemove', e => showTooltip(`${labels[i]} × ${labels[j]}: ${v.toFixed(3)}`, e))
        .on('mouseleave', hideTooltip)
        .transition().duration(380).delay((i + j) * 22).ease(d3.easeCubicOut)
        .attr('opacity', 1);
      if (annotate && cellSize >= 28) {
        g.append('text')
          .attr('x', mL + j * cellSize + cellSize / 2 - .5)
          .attr('y', mT + i * cellSize + cellSize / 2 + 3.5)
          .attr('text-anchor', 'middle').attr('font-size', cellSize > 38 ? 10 : 8)
          .attr('fill', textColor(fillCol)).attr('opacity', 0)
          .text(v.toFixed(2))
          .transition().duration(300).delay((i + j) * 22 + 200).attr('opacity', 1);
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
  if (W < 100) return;
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
    .attr('x', d => x(d.x0) + .5).attr('y', d => y(d.length))
    .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr('height', d => Math.max(0, y(0) - y(d.length)))
    .attr('fill', col(idx >= 0 ? idx : 0)).attr('fill-opacity', 0)
    .on('mousemove', (e, d) => showTooltip(`${d.length} obs in [${(d.x0*100).toFixed(1)}%, ${(d.x1*100).toFixed(1)}%]`, e))
    .on('mouseleave', hideTooltip)
    .transition().duration(450).delay((d, i) => i * 5).ease(d3.easeCubicOut)
    .attr('fill-opacity', 0.65);

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
  const W = wrap.clientWidth;
  if (W < 100) return;
  const H_main = 240, H_ctx = 56, GAP = 18;
  const H = H_main + GAP + H_ctx + 28;
  const m = { t: 15, r: 15, b: 24, l: 55 };
  const ctxM = { t: 6, r: 15, b: 22, l: 55 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const startDate = STATE.prices[0].Date;
  const endDate = STATE.logRet[STATE.logRet.length - 1].Date;
  const series = tickers.map(t => {
    let cum = 0;
    const path = [{ date: startDate, val: 1 }];
    STATE.logRet.forEach(r => { cum += r[t]; path.push({ date: r.Date, val: Math.exp(cum) }); });
    return path;
  });

  const xFull = d3.scaleTime().domain([startDate, endDate]).range([m.l, W - m.r]);
  const x = d3.scaleTime().domain([startDate, endDate]).range([m.l, W - m.r]);
  const allVals = series.flat().map(d => d.val);
  const yFull = d3.scaleLinear().domain([d3.min(allVals) * .95, d3.max(allVals) * 1.05]).range([H_main - m.b, m.t]);
  const y = d3.scaleLinear().domain(yFull.domain()).range([H_main - m.b, m.t]);

  // ---- Main chart ----
  const mainG = svg.append('g').attr('class', 'cumul-main');
  const xAxisG = mainG.append('g').attr('transform', `translate(0,${H_main - m.b})`);
  const yAxisG = mainG.append('g').attr('transform', `translate(${m.l},0)`);
  xAxisG.call(d3.axisBottom(x).ticks(6)).call(g => g.select('.domain').remove());
  yAxisG.call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d.toFixed(1))).call(g => g.select('.domain').remove());

  // Clip path so brushed lines never escape the plot area
  svg.append('defs').append('clipPath').attr('id', 'cumulClip')
    .append('rect').attr('x', m.l).attr('y', m.t)
    .attr('width', W - m.l - m.r).attr('height', H_main - m.t - m.b);

  const line = d3.line().x(d => x(d.date)).y(d => y(d.val)).curve(d3.curveMonotoneX);
  const linesG = mainG.append('g').attr('clip-path', 'url(#cumulClip)');
  const linePaths = series.map((s, i) => {
    const path = linesG.append('path').datum(s).attr('d', line)
      .attr('fill', 'none').attr('stroke', col(STATE.tickers.indexOf(tickers[i])))
      .attr('stroke-width', 1.6).attr('stroke-opacity', .9);
    const len = path.node().getTotalLength();
    path.attr('stroke-dasharray', len).attr('stroke-dashoffset', len)
      .transition().duration(900).delay(i * 60).ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0)
      .on('end', function() { d3.select(this).attr('stroke-dasharray', null); });
    return path;
  });

  // ---- Context (mini) chart with brush ----
  const ctxTop = H_main + GAP;
  const ctxX = d3.scaleTime().domain([startDate, endDate]).range([ctxM.l, W - ctxM.r]);
  const ctxY = d3.scaleLinear().domain(yFull.domain()).range([ctxTop + H_ctx - ctxM.b, ctxTop + ctxM.t]);
  const ctxG = svg.append('g').attr('class', 'cumul-ctx');
  ctxG.append('g').attr('transform', `translate(0,${ctxTop + H_ctx - ctxM.b})`)
    .call(d3.axisBottom(ctxX).ticks(6).tickSize(3)).call(g => g.select('.domain').remove())
    .call(g => g.selectAll('text').attr('font-size', 9).attr('fill', '#94a3b8'));
  ctxG.append('text').attr('x', ctxM.l).attr('y', ctxTop - 2)
    .attr('class', 'cumul-brush-label').text('Drag to focus on a sub-period · double-click to reset');

  const ctxLine = d3.line().x(d => ctxX(d.date)).y(d => ctxY(d.val)).curve(d3.curveMonotoneX);
  series.forEach((s, i) => {
    ctxG.append('path').datum(s).attr('d', ctxLine)
      .attr('class', 'cumul-context-line')
      .attr('stroke', col(STATE.tickers.indexOf(tickers[i])));
  });

  // ---- Brush ----
  const brush = d3.brushX()
    .extent([[ctxM.l, ctxTop + ctxM.t], [W - ctxM.r, ctxTop + H_ctx - ctxM.b]])
    .on('brush end', brushed);
  const brushG = ctxG.append('g').attr('class', 'cumul-brush').call(brush);

  function brushed(event) {
    if (event.sourceEvent && event.sourceEvent.type === 'zoom') return;
    const sel = event.selection;
    const newDomain = sel ? sel.map(ctxX.invert, ctxX) : [startDate, endDate];
    x.domain(newDomain);

    // Recompute y-domain for the visible window only
    const t0 = newDomain[0], t1 = newDomain[1];
    const visibleVals = [];
    series.forEach(s => s.forEach(d => { if (d.date >= t0 && d.date <= t1) visibleVals.push(d.val); }));
    if (visibleVals.length) {
      const lo = d3.min(visibleVals), hi = d3.max(visibleVals);
      y.domain([lo * 0.97, hi * 1.03]);
    }

    xAxisG.transition().duration(120).call(d3.axisBottom(x).ticks(6))
      .call(g => g.select('.domain').remove());
    yAxisG.transition().duration(120).call(d3.axisLeft(y).ticks(5).tickFormat(d => '$' + d.toFixed(1)))
      .call(g => g.select('.domain').remove());
    linePaths.forEach(p => p.attr('d', line));
  }

  // Double-click on context = reset
  ctxG.on('dblclick', () => brushG.call(brush.move, null));

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
  if (W < 100) return;
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
  renderMarchenkoPastur(tickers);
  renderRollingSpectral(tickers);
}

function setRiskRollWin(w, btn) {
  STATE.riskRollWin = w;
  document.querySelectorAll('#riskRollWinGroup .win-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (STATE.logRet) renderRollingSpectral();
}

function corrFromCov(C) {
  const p = C.length;
  const d = Array.from({ length: p }, (_, i) => Math.sqrt(Math.max(C[i][i], 1e-18)));
  const out = Array.from({ length: p }, () => new Float64Array(p));
  for (let i = 0; i < p; i++)
    for (let j = 0; j < p; j++)
      out[i][j] = C[i][j] / (d[i] * d[j]);
  return out;
}

function renderMarchenkoPastur(tickers) {
  const wrap = document.getElementById('mpWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (wrap.clientWidth < 100) return;

  const p = tickers.length;
  const n = STATE.logRet.length;
  if (p < 2 || n <= p) {
    wrap.innerHTML = '<div class="empty">Need at least 2 assets and more observations than assets</div>';
    return;
  }

  const corr = corrFromCov(STATE.covSample);
  const eig = eigenvalues(corr.map(r => [...r])).map(v => Math.max(0, v));

  const q = p / n;
  const sqrtQ = Math.sqrt(q);
  const lamMinus = (1 - sqrtQ) ** 2;
  const lamPlus  = (1 + sqrtQ) ** 2;

  const xMax = Math.max(lamPlus * 1.15, (d3.max(eig) || 1) * 1.05);
  const grid = 240;
  const xs = d3.range(grid + 1).map(i => xMax * i / grid);
  const density = xs.map(x => {
    if (x <= lamMinus || x >= lamPlus || x <= 0) return 0;
    return Math.sqrt(Math.max(0, (lamPlus - x) * (x - lamMinus))) / (2 * Math.PI * q * x);
  });

  const W = wrap.clientWidth, H = 320;
  const m = { t: 22, r: 20, b: 50, l: 55 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLinear().domain([0, xMax]).range([m.l, W - m.r]);
  const yTop = Math.max(d3.max(density) || 0, 0.5) * 1.2;
  const y = d3.scaleLinear().domain([0, yTop]).range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(7))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5))
    .call(g => g.select('.domain').remove());
  svg.append('text').attr('x', W / 2).attr('y', H - 8)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('Eigenvalue λ');
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', 14)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text('MP density f(λ)');

  const area = d3.area()
    .x((d, i) => x(xs[i]))
    .y0(y(0))
    .y1(d => y(d))
    .curve(d3.curveMonotoneX);
  svg.append('path').datum(density)
    .attr('fill', '#60a5fa').attr('fill-opacity', 0.20)
    .attr('stroke', '#2563eb').attr('stroke-width', 1.6)
    .attr('d', area);

  [['λ₋', lamMinus], ['λ₊', lamPlus]].forEach(([lab, v]) => {
    svg.append('line').attr('x1', x(v)).attr('x2', x(v))
      .attr('y1', y(0)).attr('y2', m.t)
      .attr('stroke', '#666').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');
    svg.append('text').attr('x', x(v)).attr('y', m.t - 6)
      .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#444').text(lab);
  });

  const tickH = 24;
  eig.forEach((v, i) => {
    const isSignal = v > lamPlus + 1e-6;
    svg.append('line')
      .attr('x1', x(v)).attr('x2', x(v))
      .attr('y1', y(0)).attr('y2', y(0) + tickH)
      .attr('stroke', isSignal ? '#dc2626' : '#2563eb')
      .attr('stroke-width', isSignal ? 2.4 : 1.6)
      .attr('stroke-linecap', 'round')
      .style('cursor', 'pointer')
      .on('mousemove', e => showTooltip(
        `λ${i + 1}: <b>${v.toFixed(3)}</b><br/>${isSignal
          ? '<span style="color:#dc2626">Signal</span> &middot; above MP bulk'
          : '<span style="color:#2563eb">Noise</span> &middot; inside MP bulk'}`, e))
      .on('mouseleave', hideTooltip);
  });

  const nSignal = eig.filter(v => v > lamPlus + 1e-6).length;
  const sub = document.getElementById('mpInfo');
  if (sub) sub.innerHTML =
    `q = ${q.toFixed(3)} &middot; bulk = [${lamMinus.toFixed(3)}, ${lamPlus.toFixed(3)}] &middot; <b>${nSignal}/${p}</b> signal eigenvalue${nSignal === 1 ? '' : 's'}`;

  const legend = document.createElement('div');
  legend.className = 'legend-row';
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#60a5fa"></span>MP density (theory)</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#2563eb"></span>Empirical λ &middot; noise</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#dc2626"></span>Empirical λ &middot; signal</span>`;
  wrap.appendChild(legend);
}

function renderRollingSpectral(tickers) {
  tickers = tickers || STATE.active || STATE.tickers;
  const wrapE = document.getElementById('rollEigenWrap');
  const wrapC = document.getElementById('rollCondWrap');
  if (!wrapE || !wrapC) return;
  wrapE.innerHTML = ''; wrapC.innerHTML = '';

  const Wlen = STATE.riskRollWin || 252;
  const orig = STATE.logRet;
  const n = orig ? orig.length : 0;
  if (!orig || n < Wlen + 5) {
    const msg = `<div class="empty">Window (${Wlen}d) exceeds available observations (${n})</div>`;
    wrapE.innerHTML = msg; wrapC.innerHTML = msg;
    return;
  }

  // ~80 windows max for snappy redraws
  const step = Math.max(5, Math.floor((n - Wlen) / 80) || 1);
  const ann = TRADING_DAYS;
  const rolls = [];

  try {
    for (let end = Wlen; end <= n; end += step) {
      const slice = orig.slice(end - Wlen, end);
      STATE.logRet = slice;
      const cs = sampleCov(tickers);
      const cl = ledoitWolf(tickers);
      const ce = ewmaCov(tickers);
      const stat = mat => {
        const e = eigenvalues(mat.map(r => [...r])).map(v => Math.max(0, v));
        const emax = e[0];
        const emin = Math.max(e[e.length - 1], 1e-12);
        return { lmax: emax * ann, cond: emax / emin };
      };
      rolls.push({
        date: slice[slice.length - 1].Date,
        sample: stat(cs), lw: stat(cl), ewma: stat(ce)
      });
    }
  } finally {
    STATE.logRet = orig;
  }

  drawSpectralLines(wrapE, rolls, 'lmax', { yLabel: 'λ₁ (annualised variance)', log: false });
  drawSpectralLines(wrapC, rolls, 'cond', { yLabel: 'Condition number κ',        log: true  });
}

function drawSpectralLines(container, rolls, key, opts) {
  const W = container.clientWidth, H = 280;
  if (W < 100) return;
  const m = { t: 15, r: 15, b: 35, l: 60 };
  const svg = d3.select(container).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const dates = rolls.map(r => r.date);
  const series = [
    { name: 'Sample',      key: 'sample', color: '#2563eb' },
    { name: 'Ledoit-Wolf', key: 'lw',     color: '#16a34a' },
    { name: 'EWMA',        key: 'ewma',   color: '#d97706' }
  ];

  const allVals = rolls.flatMap(r => series.map(s => r[s.key][key]));
  const x = d3.scaleTime().domain(d3.extent(dates)).range([m.l, W - m.r]);
  let y;
  if (opts.log) {
    const positives = allVals.filter(v => v > 0 && isFinite(v));
    const lo = Math.max(d3.min(positives) || 1, 1);
    const hi = (d3.max(positives) || 10) * 1.2;
    y = d3.scaleLog().domain([lo, hi]).range([H - m.b, m.t]).clamp(true);
  } else {
    const [lo, hi] = d3.extent(allVals);
    const pad = (hi - lo) * 0.08 || Math.max(Math.abs(hi), 1) * 0.05;
    y = d3.scaleLinear().domain([Math.max(0, lo - pad), hi + pad]).range([H - m.b, m.t]);
  }

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(6))
    .call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(opts.log
      ? d3.axisLeft(y).ticks(5, '~s')
      : d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(2)))
    .call(g => g.select('.domain').remove());
  svg.append('text').attr('transform', 'rotate(-90)').attr('x', -H / 2).attr('y', 14)
    .attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#888').text(opts.yLabel);

  const line = d3.line()
    .defined(d => d != null && isFinite(d) && (!opts.log || d > 0))
    .x((d, i) => x(dates[i]))
    .y(d => y(d))
    .curve(d3.curveMonotoneX);

  series.forEach(s => {
    const vals = rolls.map(r => r[s.key][key]);
    svg.append('path').datum(vals).attr('d', line)
      .attr('fill', 'none').attr('stroke', s.color)
      .attr('stroke-width', 1.7).attr('stroke-opacity', 0.9);
  });

  // Hover layer with crosshair
  const focus = svg.append('g').style('display', 'none');
  focus.append('line').attr('y1', m.t).attr('y2', H - m.b)
    .attr('stroke', '#999').attr('stroke-width', 1).attr('stroke-dasharray', '3,3');
  series.forEach(s => {
    focus.append('circle').attr('r', 3.5).attr('fill', s.color)
      .attr('stroke', '#fff').attr('stroke-width', 1.2)
      .attr('class', 'sp-dot-' + s.key);
  });

  const bisect = d3.bisector(d => +d).left;
  svg.append('rect')
    .attr('x', m.l).attr('y', m.t)
    .attr('width', Math.max(0, W - m.r - m.l))
    .attr('height', H - m.b - m.t)
    .attr('fill', 'transparent')
    .on('mouseover', () => focus.style('display', null))
    .on('mouseout', () => { focus.style('display', 'none'); hideTooltip(); })
    .on('mousemove', function (event) {
      const xv = x.invert(d3.pointer(event)[0]);
      let i = bisect(dates, xv);
      if (i >= dates.length) i = dates.length - 1;
      if (i > 0 && (xv - dates[i - 1] < dates[i] - xv)) i--;
      const r = rolls[i];
      focus.select('line').attr('x1', x(dates[i])).attr('x2', x(dates[i]));
      series.forEach(s => {
        const v = r[s.key][key];
        focus.select('.sp-dot-' + s.key)
          .attr('cx', x(dates[i]))
          .attr('cy', isFinite(v) && (!opts.log || v > 0) ? y(v) : -10);
      });
      const fmt = opts.log ? (v => v >= 1000 ? d3.format('~s')(v) : v.toFixed(0)) : (v => v.toFixed(2));
      const tip = `<b>${dates[i].toISOString().slice(0, 10)}</b><br/>` +
        series.map(s => `<span style="color:${s.color}">●</span> ${s.name}: ${fmt(r[s.key][key])}`).join('<br/>');
      showTooltip(tip, event);
    });

  const legend = document.createElement('div');
  legend.className = 'legend-row';
  series.forEach(s => {
    legend.innerHTML += `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${s.name}</span>`;
  });
  container.appendChild(legend);
}

function renderEigenSpectrum(tickers, S, LW, EW) {
  const wrap = document.getElementById('eigenWrap');
  wrap.innerHTML = '';
  if (wrap.clientWidth < 100) return;
  // Clamp tiny numerical noise: covariance eigenvalues should be >= 0
  const clamp0 = arr => arr.map(v => Math.max(0, v));
  const eigS = clamp0(eigenvalues(S.map(r => [...r])));
  const eigLW = clamp0(eigenvalues(LW.map(r => [...r])));
  const eigEW = clamp0(eigenvalues(EW.map(r => [...r])));

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
      const targetH = Math.max(0, y(0) - y(v));
      svg.append('rect').attr('x', x(i) + si * bw).attr('y', y(0))
        .attr('width', bw - 1).attr('height', 0)
        .attr('fill', colors[si]).attr('fill-opacity', .8)
        .on('mousemove', e => showTooltip(`${names[si]} λ${i + 1}: ${v.toFixed(4)}`, e))
        .on('mouseleave', hideTooltip)
        .transition().duration(550).delay(i * 30 + si * 80).ease(d3.easeCubicOut)
        .attr('y', y(0) - targetH).attr('height', targetH);
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
  syncUserWeights(tickers);
  renderFrontier(tickers);
  renderStackedWeights(tickers);
  renderMonteCarlo(tickers);
  renderWeightPlayground(tickers);
  renderPortfolioComparison(tickers);
}

// ===============================================
//  E4 - Custom Weight Playground
// ===============================================

function syncUserWeights(tickers) {
  // Re-init or pad/trim user weights to match active tickers
  if (!STATE.userWeights || STATE.userWeights.length !== tickers.length) {
    STATE.userWeights = new Array(tickers.length).fill(1 / tickers.length);
  }
}

function resetUserWeights() {
  const tickers = STATE.active || STATE.tickers;
  STATE.userWeights = new Array(tickers.length).fill(1 / tickers.length);
  renderWeightPlayground(tickers);
  renderFrontier(tickers);
}

function copyPortfolio(key) {
  const src = STATE.portfolios[key];
  if (!src) return;
  const tickers = STATE.active || STATE.tickers;
  // Long-only clip then renormalise - playground sliders are [0,1]
  const w = src.map(v => Math.max(0, v));
  const s = d3.sum(w) || 1;
  STATE.userWeights = w.map(v => v / s);
  renderWeightPlayground(tickers, { animate: true });
  renderFrontier(tickers);
}

function setUserWeight(idx, value, tickers) {
  // Lock-and-redistribute: when user drags slider idx to value v,
  // the remaining (1 - v) is redistributed proportionally to the other sliders'
  // *previous* weights. If others were all zero, distribute equally.
  const w = [...STATE.userWeights];
  const v = Math.max(0, Math.min(1, value));
  const otherIdx = w.map((_, i) => i).filter(i => i !== idx);
  const prevOthersSum = d3.sum(otherIdx.map(i => w[i]));
  w[idx] = v;
  if (otherIdx.length === 0) { STATE.userWeights = [1]; return; }
  const remainder = 1 - v;
  if (prevOthersSum > 1e-9) {
    otherIdx.forEach(i => { w[i] = w[i] * remainder / prevOthersSum; });
  } else {
    otherIdx.forEach(i => { w[i] = remainder / otherIdx.length; });
  }
  STATE.userWeights = w;
}

function userPortfolioStats(tickers) {
  const mu = STATE.portfolios.mu;
  const cov = STATE.portfolios.cov;
  if (!mu || !cov) return null;
  const w = STATE.userWeights;
  const ret = dot(w, mu);
  const vol = Math.sqrt(dot(w, matVecMul(cov, w)));
  const rf = STATE.portfolios.rf || 0;
  return { ret, vol, sharpe: (ret - rf) / vol };
}

function renderWeightPlayground(tickers, opts = {}) {
  const wrap = document.getElementById('weightSliders');
  if (!wrap) return;
  syncUserWeights(tickers);

  // Use chroma.js to color slider fill from neutral → ticker color based on weight magnitude
  const useChroma = typeof chroma !== 'undefined';

  wrap.innerHTML = '';
  tickers.forEach((t, i) => {
    const cIdx = STATE.tickers.indexOf(t);
    const baseCol = col(cIdx);
    const row = document.createElement('div');
    row.className = 'wslider';
    row.innerHTML = `
      <span class="wslider-name" style="color:${baseCol}">${t}</span>
      <div class="wslider-track" data-idx="${i}">
        <div class="wslider-fill"></div>
        <div class="wslider-handle" style="color:${baseCol}"></div>
      </div>
      <span class="wslider-val" data-idx="${i}">0.0%</span>
    `;
    wrap.appendChild(row);

    const track = row.querySelector('.wslider-track');
    const fill = row.querySelector('.wslider-fill');
    const handle = row.querySelector('.wslider-handle');
    const val = row.querySelector('.wslider-val');

    function paint(v) {
      const pct = (v * 100).toFixed(1);
      fill.style.width = (v * 100) + '%';
      handle.style.left = (v * 100) + '%';
      val.textContent = pct + '%';
      if (useChroma) {
        // Light grey at 0 → vivid at 1 (max weight reached if 100%)
        const tCol = chroma.mix('#cbd5e1', baseCol, Math.min(1, v * 1.4), 'lab').css();
        fill.style.background = tCol;
      } else {
        fill.style.background = baseCol;
        fill.style.opacity = 0.35 + 0.6 * v;
      }
    }
    paint(STATE.userWeights[i]);

    // Drag handler - uses d3.drag for a clean cross-browser experience
    // Throttle the frontier redraw so we get a live "You" point without lag
    const liveUpdate = (typeof _ !== 'undefined' ? _.throttle : (fn => fn))(
      () => renderFrontier(tickers), 80, { leading: true, trailing: true });
    const dragHandler = d3.drag()
      .on('start', () => handle.classList.add('dragging'))
      .on('drag', (event) => {
        const rect = track.getBoundingClientRect();
        const v = Math.max(0, Math.min(1, (event.x) / rect.width));
        setUserWeight(i, v, tickers);
        // Repaint *all* sliders since they were redistributed
        repaintAll();
        liveUpdate();
      })
      .on('end', () => {
        handle.classList.remove('dragging');
        if (liveUpdate.flush) liveUpdate.flush();
        renderFrontier(tickers);
      });
    d3.select(track).call(dragHandler);
    // Click-to-set
    track.addEventListener('click', (e) => {
      if (handle.classList.contains('dragging')) return;
      const rect = track.getBoundingClientRect();
      const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setUserWeight(i, v, tickers);
      repaintAll();
      renderFrontier(tickers);
    });
  });

  function repaintAll() {
    document.querySelectorAll('#weightSliders .wslider').forEach((row, i) => {
      const baseCol = col(STATE.tickers.indexOf(tickers[i]));
      const fill = row.querySelector('.wslider-fill');
      const handle = row.querySelector('.wslider-handle');
      const val = row.querySelector('.wslider-val');
      const v = STATE.userWeights[i];
      const pct = (v * 100).toFixed(1);
      fill.style.width = (v * 100) + '%';
      handle.style.left = (v * 100) + '%';
      val.textContent = pct + '%';
      if (useChroma) {
        const tCol = chroma.mix('#cbd5e1', baseCol, Math.min(1, v * 1.4), 'lab').css();
        fill.style.background = tCol;
      } else {
        fill.style.background = baseCol;
        fill.style.opacity = 0.35 + 0.6 * v;
      }
    });
    updateUserStats();
    drawUserMini(tickers);
  }

  function updateUserStats() {
    const st = userPortfolioStats(tickers);
    const sumW = d3.sum(STATE.userWeights);
    const fmt = (v, c) => v == null ? '-' : (v * 100).toFixed(1) + (c ? '%' : '');
    if (st) {
      document.getElementById('userRet').textContent = fmt(st.ret, true);
      document.getElementById('userRet').className = 'playground-stat-val ' + (st.ret >= 0 ? '' : 'bad');
      document.getElementById('userVol').textContent = fmt(st.vol, true);
      document.getElementById('userSharpe').textContent = st.sharpe.toFixed(2);
    }
    const sumEl = document.getElementById('userSum');
    sumEl.textContent = (sumW * 100).toFixed(1) + '%';
    // Sliders should always sum to 100% by construction
    const drift = Math.abs(sumW - 1);
    sumEl.className = 'playground-stat-val ' + (drift > 0.01 ? 'warn' : '');
  }

  updateUserStats();
  drawUserMini(tickers);
}

function drawUserMini(tickers) {
  const wrap = document.getElementById('userMiniWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  const frontier = STATE.portfolios.frontier;
  if (!frontier || !frontier.length) {
    wrap.innerHTML = '<div class="empty">Load data</div>';
    return;
  }

  const W = wrap.clientWidth || 320, H = 230;
  const m = { t: 22, r: 14, b: 36, l: 54 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  const userSt = userPortfolioStats(tickers);
  const allVols = frontier.map(d => d.vol).concat(tickers.map(t => STATE.annVol[t]));
  const allRets = frontier.map(d => d.ret).concat(tickers.map(t => STATE.annRet[t]));
  if (userSt) { allVols.push(userSt.vol); allRets.push(userSt.ret); }

  const x = d3.scaleLinear().domain([d3.min(allVols) * 0.85 * 100, d3.max(allVols) * 1.10 * 100])
    .range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([d3.min(allRets) * 100 - 1, d3.max(allRets) * 100 + 1])
    .range([H - m.b, m.t]);

  svg.append('g').attr('transform', `translate(0,${H - m.b})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => d.toFixed(0) + '%'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('text').attr('font-size', 9));
  svg.append('g').attr('transform', `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toFixed(0) + '%'))
    .call(g => g.select('.domain').remove())
    .call(g => g.selectAll('text').attr('font-size', 9));

  // Axis titles - y label rotated to the left of the y-axis (no overlap)
  svg.append('text').attr('x', (W + m.l - m.r) / 2).attr('y', H - 4)
    .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#64748b')
    .text('Volatility');
  svg.append('text')
    .attr('transform', `translate(14, ${(H - m.b + m.t) / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', '#64748b')
    .text('Return');

  // Frontier curve (dashed)
  const line = d3.line().x(d => x(d.vol * 100)).y(d => y(d.ret * 100)).curve(d3.curveMonotoneX);
  svg.append('path').datum(frontier).attr('d', line)
    .attr('fill', 'none').attr('stroke', '#94a3b8').attr('stroke-width', 1.4)
    .attr('stroke-dasharray', '3,3').attr('opacity', 0.85);

  // Legend on top-right inside the plot area
  const lg = svg.append('g').attr('transform', `translate(${W - m.r - 96}, ${m.t - 8})`);
  lg.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 0).attr('y2', 0)
    .attr('stroke', '#94a3b8').attr('stroke-width', 1.4).attr('stroke-dasharray', '3,3');
  lg.append('text').attr('x', 22).attr('y', 3)
    .attr('font-size', 9).attr('fill', '#94a3b8').text('Efficient frontier');

  // Asset points (greyed)
  tickers.forEach(t => {
    svg.append('circle').attr('cx', x(STATE.annVol[t] * 100)).attr('cy', y(STATE.annRet[t] * 100))
      .attr('r', 2.5).attr('fill', '#cbd5e1');
  });

  // User portfolio point - pulses
  if (userSt) {
    const cx = x(userSt.vol * 100), cy = y(userSt.ret * 100);
    const halo = svg.append('circle').attr('cx', cx).attr('cy', cy)
      .attr('r', 6).attr('fill', 'none').attr('stroke', '#7c3aed').attr('stroke-width', 2).attr('stroke-opacity', 0.85);
    function pulse() {
      halo.attr('r', 6).attr('stroke-opacity', 0.85)
        .transition().duration(1100).ease(d3.easeCubicOut)
        .attr('r', 18).attr('stroke-opacity', 0).on('end', pulse);
    }
    pulse();
    svg.append('circle').attr('cx', cx).attr('cy', cy)
      .attr('r', 0).attr('fill', '#7c3aed').attr('stroke', 'white').attr('stroke-width', 2)
      .transition().duration(450).ease(d3.easeBackOut.overshoot(1.4)).attr('r', 6);
    svg.append('text').attr('x', cx + 9).attr('y', cy + 3)
      .attr('font-size', 10).attr('font-weight', 700).attr('fill', '#7c3aed').text('You');
  }
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
const MC_STATE = { key: '', cloud: null, rafId: null, anim: 0 };
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
  // Cancel any in-flight Monte Carlo animation from a previous render so we
  // don't have two concurrent rAF loops fighting over the chart (which caused
  // the counter going negative when you changed N or resampled rapidly).
  if (MC_STATE.rafId !== null) {
    cancelAnimationFrame(MC_STATE.rafId);
    MC_STATE.rafId = null;
  }
  MC_STATE.anim++; // invalidate any stale closure
  wrap.innerHTML = '';
  const mcOn = document.getElementById('mcToggle').checked;
  if (!mcOn) {
    wrap.innerHTML = '<div class="empty">Monte Carlo disabled - toggle to enable</div>';
    return;
  }
  if (wrap.clientWidth < 100) return;
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

  // Robust axes: use cloud quantiles (not raw min/max) to avoid the chart
  // shifting "way to the right" when a single Dirichlet draw lands on a very
  // concentrated, high-vol portfolio. Frontier + asset positions are always
  // included so they remain visible.
  const cloudVols = cloud.map(d => d.vol).sort(d3.ascending);
  const cloudRets = cloud.map(d => d.ret).sort(d3.ascending);
  const q = (a, p) => d3.quantileSorted(a, p);
  const assetVols = tickers.map(t => STATE.annVol[t]);
  const assetRets = tickers.map(t => STATE.annRet[t]);
  // Include specials so Risk Parity / Tangency / Min Var don't fall off the chart
  const spVols = [], spRets = [];
  ['minvar','tangency','riskparity','meanvar'].forEach(k => {
    const w = STATE.portfolios[k];
    if (!w) return;
    const st = portfolioStats(w, mu, cov);
    if (!st || !isFinite(st.vol) || !isFinite(st.ret)) return;
    spVols.push(st.vol); spRets.push(st.ret);
  });
  const xMin = Math.min(d3.min(frontier, d => d.vol), d3.min(assetVols), q(cloudVols, 0.005), ...(spVols.length ? [d3.min(spVols)] : []));
  const xMax = Math.max(d3.max(frontier, d => d.vol), d3.max(assetVols), q(cloudVols, 0.995), ...(spVols.length ? [d3.max(spVols)] : []));
  const yMin = Math.min(d3.min(frontier, d => d.ret), d3.min(assetRets), q(cloudRets, 0.005), ...(spRets.length ? [d3.min(spRets)] : []));
  const yMax = Math.max(d3.max(frontier, d => d.ret), d3.max(assetRets), q(cloudRets, 0.995), ...(spRets.length ? [d3.max(spRets)] : []));
  const xDom = [Math.max(0, xMin * 0.9) * 100, xMax * 1.05 * 100];
  const yDom = [yMin * 100 - 1, yMax * 100 + 1];
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
    { key: 'minvar',     label: 'Min Var',     color: '#16a34a', depends: 'covariance only' },
    { key: 'tangency',   label: 'Tangency',    color: '#dc2626', depends: 'covariance, returns, risk-free rate' },
    { key: 'meanvar',    label: 'Mean-Var',    color: '#7c3aed', depends: 'covariance, returns, target return' },
    { key: 'riskparity', label: 'Risk Parity', color: '#d97706', depends: 'covariance only' },
  ];
  const placedSpecials = specials
    .map(sp => {
      const w = STATE.portfolios[sp.key];
      if (!w) return null;
      const st = portfolioStats(w, mu, cov);
      if (!st || !isFinite(st.vol) || !isFinite(st.ret)) return null;
      return { ...sp, st, cx: x(st.vol * 100), cy: y(st.ret * 100) };
    })
    .filter(Boolean);

  // Greedy label de-overlap (same logic as Frontier chart)
  const spLabelPos = placedSpecials.map(p => ({ x: p.cx + 10, y: p.cy + 3 }));
  for (let i = 0; i < spLabelPos.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(spLabelPos[i].x - spLabelPos[j].x);
      const dy = Math.abs(spLabelPos[i].y - spLabelPos[j].y);
      if (dx < 70 && dy < 14) {
        spLabelPos[i].y = spLabelPos[j].y + (spLabelPos[i].y >= spLabelPos[j].y ? 14 : -14);
      }
    }
  }

  const specialsG = svg.append('g').attr('class', 'mc-specials');
  placedSpecials.forEach((sp, i) => {
    specialsG.append('circle').attr('cx', sp.cx).attr('cy', sp.cy)
      .attr('r', 6).attr('fill', sp.color)
      .attr('stroke', 'white').attr('stroke-width', 2)
      .style('pointer-events', 'none');
    const lp = spLabelPos[i];
    if (Math.abs(lp.y - (sp.cy + 3)) > 1) {
      specialsG.append('line').attr('x1', sp.cx + 7).attr('y1', sp.cy)
        .attr('x2', lp.x - 1).attr('y2', lp.y - 3)
        .attr('stroke', sp.color).attr('stroke-width', 1).attr('stroke-opacity', 0.5);
    }
    specialsG.append('text').attr('x', lp.x).attr('y', lp.y).attr('font-size', 9)
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

  // Declared up here so the attachHover closure can capture it in both the
  // animated and non-animated branches (the non-animated branch returns early,
  // so a later `let` would leave it in the TDZ → ReferenceError on hover).
  let bestIdx = -1;

  function attachHover() {
    hoverRect.on('mousemove', function(e) {
      const [mx, my] = d3.pointer(e, svg.node());

      // 1) Best Sharpe star (top priority - biggest hit radius, ~14px)
      if (bestIdx >= 0 && bestIdx < cloud.length) {
        const b = cloud[bestIdx];
        const bx = x(b.vol * 100), by = y(b.ret * 100);
        if ((bx - mx) ** 2 + (by - my) ** 2 < 14 * 14) {
          hoverRing.attr('cx', bx).attr('cy', by).attr('stroke', '#fbbf24')
            .style('display', null);
          showTooltip(
            `<b>★ Best Sharpe in cloud</b><br>Return: ${(b.ret*100).toFixed(1)}%<br>Vol: ${(b.vol*100).toFixed(1)}%<br>Sharpe: ${b.sharpe.toFixed(2)}${weightBarsHtml(b.w, tickers)}`, e);
          return;
        }
      }

      // 2) Special portfolios (Min Var / Tangency / Mean-Var / Risk Parity), 12px hit radius
      for (const sp of placedSpecials) {
        if ((sp.cx - mx) ** 2 + (sp.cy - my) ** 2 < 12 * 12) {
          hoverRing.attr('cx', sp.cx).attr('cy', sp.cy).attr('stroke', sp.color)
            .style('display', null);
          showTooltip(
            `<b>${sp.label}</b><br>Return: ${(sp.st.ret*100).toFixed(1)}%<br>Vol: ${(sp.st.vol*100).toFixed(1)}%<br>Sharpe: ${sp.st.sharpe.toFixed(2)}<br><span style="opacity:.65">Depends on: ${sp.depends}</span>`, e);
          return;
        }
      }

      // 3) Random cloud portfolios - nearest-neighbor within ~8px
      let best = -1, bestDist = 64;
      for (let i = 0; i < cloud.length; i++) {
        const d = cloud[i];
        const dx = x(d.vol * 100) - mx, dy = y(d.ret * 100) - my;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
      if (best >= 0) {
        const d = cloud[best];
        hoverRing.attr('cx', x(d.vol * 100)).attr('cy', y(d.ret * 100))
          .attr('stroke', '#2563eb').style('display', null);
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
    bestIdx = bi;
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
  const myAnim = MC_STATE.anim;

  function step(now) {
    // If a newer render started, abort this loop quietly
    if (myAnim !== MC_STATE.anim) return;
    // Clamp t to [0,1] - defends against now < start (clock jitter) which would
    // make d3.easeCubicOut(t) negative and produce a negative `drawn` counter.
    const t = Math.max(0, Math.min(1, (now - start) / DURATION));
    const target = Math.max(0, Math.min(cloud.length, Math.floor(d3.easeCubicOut(t) * cloud.length)));
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
      MC_STATE.rafId = requestAnimationFrame(step);
    } else {
      MC_STATE.rafId = null;
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
  MC_STATE.rafId = requestAnimationFrame(step);
}

function renderFrontier(tickers) {
  const wrap = document.getElementById('frontierWrap');
  wrap.innerHTML = '';
  const frontier = STATE.portfolios.frontier;
  if (!frontier.length) return;

  const W = wrap.clientWidth, H = 340;
  if (W < 100) return;
  const m = { t: 20, r: 20, b: 45, l: 60 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);

  // Clip-path so off-chart elements (e.g. CML at high rf) are clipped to the plot area
  const clipId = 'frontier-clip-' + Math.floor(Math.random() * 1e9);
  svg.append('defs').append('clipPath').attr('id', clipId)
    .append('rect')
    .attr('x', m.l).attr('y', m.t)
    .attr('width', Math.max(0, W - m.l - m.r))
    .attr('height', Math.max(0, H - m.t - m.b));

  // Domain must include ALL plotted points: frontier curve, individual assets,
  // every special portfolio (Mean-Var can sit far below MinVar; Risk Parity can
  // sit far to the right), the user portfolio and the rf y-intercept of the CML.
  const muP = STATE.portfolios.mu;
  const covP = STATE.portfolios.cov;
  const rfP  = STATE.portfolios.rf;
  const domVols = frontier.map(d => d.vol).concat(tickers.map(t => STATE.annVol[t]));
  const domRets = frontier.map(d => d.ret).concat(tickers.map(t => STATE.annRet[t]));
  ['minvar', 'tangency', 'meanvar', 'riskparity'].forEach(k => {
    const wK = STATE.portfolios[k];
    if (!wK) return;
    const stK = portfolioStats(wK, muP, covP);
    if (!stK || !isFinite(stK.vol) || !isFinite(stK.ret)) return;
    domVols.push(stK.vol); domRets.push(stK.ret);
  });
  if (STATE.userWeights && STATE.userWeights.length === tickers.length) {
    const uSt0 = userPortfolioStats(tickers);
    if (uSt0 && isFinite(uSt0.vol) && isFinite(uSt0.ret)) {
      domVols.push(uSt0.vol); domRets.push(uSt0.ret);
    }
  }
  if (isFinite(rfP)) domRets.push(rfP);

  const vMin = d3.min(domVols), vMax = d3.max(domVols);
  const rMin = d3.min(domRets), rMax = d3.max(domRets);
  const x = d3.scaleLinear()
    .domain([Math.max(0, vMin * 0.85) * 100, vMax * 1.15 * 100])
    .range([m.l, W - m.r]);
  const y = d3.scaleLinear()
    .domain([rMin * 100 - 2, rMax * 100 + 2])
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
    { key: 'minvar',     label: 'Min Var',     color: '#16a34a', depends: 'covariance only' },
    { key: 'tangency',   label: 'Tangency',    color: '#dc2626', depends: 'covariance, returns, risk-free rate' },
    { key: 'meanvar',    label: 'Mean-Var',    color: '#7c3aed', depends: 'covariance, returns, target return' },
    { key: 'riskparity', label: 'Risk Parity', color: '#d97706', depends: 'covariance only' },
  ];

  // Pre-compute positions, then resolve label overlaps (vertical stagger)
  const placed = specials
    .map(sp => {
      const w = STATE.portfolios[sp.key];
      if (!w) return null;
      const st = portfolioStats(w, mu, cov);
      if (!st || !isFinite(st.vol) || !isFinite(st.ret)) return null;
      return { ...sp, st, cx: x(st.vol * 100), cy: y(st.ret * 100) };
    })
    .filter(Boolean);

  // Greedy label de-overlap: if two labels are within 14px in y AND 60px in x, push later ones
  const labelPos = placed.map(p => ({ x: p.cx + 10, y: p.cy + 3 }));
  for (let i = 0; i < labelPos.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(labelPos[i].x - labelPos[j].x);
      const dy = Math.abs(labelPos[i].y - labelPos[j].y);
      if (dx < 60 && dy < 14) {
        labelPos[i].y = labelPos[j].y + (labelPos[i].y >= labelPos[j].y ? 14 : -14);
      }
    }
  }

  placed.forEach((sp, i) => {
    svg.append('circle').attr('cx', sp.cx).attr('cy', sp.cy)
      .attr('r', 7).attr('fill', sp.color).attr('stroke', 'white').attr('stroke-width', 2)
      .on('mousemove', e => showTooltip(
        `<b>${sp.label}</b><br>Return: ${(sp.st.ret*100).toFixed(1)}%<br>Vol: ${(sp.st.vol*100).toFixed(1)}%<br>Sharpe: ${sp.st.sharpe.toFixed(2)}<br><span style="opacity:.65">Depends on: ${sp.depends}</span>`, e))
      .on('mouseleave', hideTooltip);
    // Connector line if label was pushed away from the dot
    const lp = labelPos[i];
    if (Math.abs(lp.y - (sp.cy + 3)) > 1) {
      svg.append('line').attr('x1', sp.cx + 8).attr('y1', sp.cy)
        .attr('x2', lp.x - 1).attr('y2', lp.y - 3)
        .attr('stroke', sp.color).attr('stroke-width', 1).attr('stroke-opacity', .5);
    }
    svg.append('text').attr('x', lp.x).attr('y', lp.y)
      .attr('font-size', 9).attr('fill', sp.color).attr('font-weight', 600).text(sp.label);
  });

  // Capital Market Line - draw across the whole visible plot area (clipped),
  // so it stays visible even when the tangency portfolio sits far off-chart.
  if (STATE.portfolios.tangency) {
    const tSt = portfolioStats(STATE.portfolios.tangency, mu, cov);
    if (tSt && isFinite(tSt.vol) && tSt.vol > 1e-9 && isFinite(tSt.ret)) {
      const slope = (tSt.ret - rf) / tSt.vol; // return per unit vol
      const xDom = x.domain();
      const v1 = 0;                           // vol = 0 → ret = rf (y-intercept)
      const v2 = xDom[1] / 100 * 1.2;         // extend past visible right edge
      const r1 = rf;
      const r2 = rf + slope * v2;
      svg.append('line')
        .attr('clip-path', `url(#${clipId})`)
        .attr('x1', x(v1 * 100)).attr('y1', y(r1 * 100))
        .attr('x2', x(v2 * 100)).attr('y2', y(r2 * 100))
        .attr('stroke', '#dc2626').attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,4').attr('stroke-opacity', .55)
        .on('mousemove', e => showTooltip(
          `<b>Capital Market Line</b><br>Slope (Sharpe): ${slope.toFixed(2)}<br>Intercept: ${(rf*100).toFixed(1)}%`, e))
        .on('mouseleave', hideTooltip);
    }
  } else {
    // rf is too high for a positive tangency portfolio → tell the user instead of silently hiding the line
    svg.append('text')
      .attr('x', W - m.r - 6).attr('y', m.t + 12)
      .attr('text-anchor', 'end').attr('font-size', 10)
      .attr('fill', '#dc2626').attr('font-style', 'italic')
      .text('CML unavailable - risk-free rate exceeds attainable returns');
  }

  // User portfolio point (E4) - live updated by the Custom Weight Playground
  if (STATE.userWeights && STATE.userWeights.length === tickers.length) {
    const uSt = userPortfolioStats(tickers);
    if (uSt && isFinite(uSt.vol) && isFinite(uSt.ret)) {
      const cx = x(uSt.vol * 100), cy = y(uSt.ret * 100);
      const halo = svg.append('circle').attr('cx', cx).attr('cy', cy)
        .attr('r', 8).attr('fill', 'none').attr('stroke', '#7c3aed')
        .attr('stroke-width', 2.5).attr('stroke-opacity', 0.9);
      (function pulseUser() {
        halo.attr('r', 8).attr('stroke-opacity', 0.9)
          .transition().duration(1100).ease(d3.easeCubicOut)
          .attr('r', 22).attr('stroke-opacity', 0).on('end', pulseUser);
      })();
      svg.append('circle').attr('cx', cx).attr('cy', cy)
        .attr('r', 0).attr('fill', '#7c3aed').attr('stroke', 'white').attr('stroke-width', 2.5)
        .on('mousemove', e => showTooltip(
          `<b>Your portfolio</b><br>Return: ${(uSt.ret*100).toFixed(1)}%<br>Vol: ${(uSt.vol*100).toFixed(1)}%<br>Sharpe: ${uSt.sharpe.toFixed(2)}`, e))
        .on('mouseleave', hideTooltip)
        .transition().duration(420).ease(d3.easeBackOut.overshoot(1.4)).attr('r', 7);
      svg.append('text').attr('x', cx + 12).attr('y', cy + 3)
        .attr('font-size', 10).attr('font-weight', 700).attr('fill', '#7c3aed').text('You');
    }
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
  if (W < 100) return;
  const mg = { t: 15, r: 15, b: 50, l: 50 };
  const svg = d3.select(wrap).append('svg').attr('class', 'chart').attr('viewBox', `0 0 ${W} ${H}`);
  const x0 = d3.scaleBand().domain(available.map(m => m.label)).range([mg.l, W - mg.r]).padding(.25);
  let posMax = 0, negMin = 0;
  available.forEach(m => {
    const w = STATE.portfolios[m.key];
    let pos = 0, neg = 0;
    w.forEach(v => { if (v > 0) pos += v; else neg += v; });
    if (pos > posMax) posMax = pos;
    if (neg < negMin) negMin = neg;
  });
  posMax = Math.max(posMax, 1);
  const yDom = [Math.min(negMin * 1.05, 0), posMax * 1.05];
  const y = d3.scaleLinear().domain(yDom).range([H - mg.b, mg.t]);

  svg.append('g').attr('transform', `translate(0,${y(0)})`)
    .call(d3.axisBottom(x0)).call(g => g.select('.domain').remove());
  svg.append('g').attr('transform', `translate(${mg.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format('.0%')))
    .call(g => g.select('.domain').remove());
  svg.append('line')
    .attr('x1', mg.l).attr('x2', W - mg.r)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', '#999').attr('stroke-width', 1);

  available.forEach((method, mi) => {
    const weights = STATE.portfolios[method.key];
    let cumPos = 0, cumNeg = 0;
    tickers.forEach((t, i) => {
      const v = weights[i];
      if (Math.abs(v) < 0.005) return;
      const idx = STATE.tickers.indexOf(t);
      let y0, y1;
      if (v >= 0) { y0 = cumPos; y1 = cumPos + v; cumPos = y1; }
      else        { y0 = cumNeg + v; y1 = cumNeg; cumNeg = y0; }
      const barY = y(y1);
      const barH = y(y0) - y(y1);
      svg.append('rect')
        .attr('x', x0(method.label)).attr('y', y(0)).attr('width', x0.bandwidth()).attr('height', 0)
        .attr('fill', col(idx)).attr('fill-opacity', v >= 0 ? .85 : .55)
        .attr('stroke', v >= 0 ? 'none' : '#dc2626')
        .attr('stroke-width', v >= 0 ? 0 : 1)
        .attr('stroke-dasharray', v >= 0 ? '0' : '3,2')
        .on('mousemove', e => showTooltip(
          `<b>${method.label}</b><br>${t}: ${(v*100).toFixed(1)}%${v < 0 ? ' (short)' : ''}`, e))
        .on('mouseleave', hideTooltip)
        .transition().duration(620).delay(mi * 80 + i * 30).ease(d3.easeCubicOut)
        .attr('y', barY).attr('height', Math.max(0, barH));
      if (barH > 14) {
        svg.append('text')
          .attr('x', x0(method.label) + x0.bandwidth() / 2).attr('y', barY + barH / 2 + 4)
          .attr('text-anchor', 'middle').attr('font-size', 9)
          .attr('fill', v >= 0 ? 'white' : '#7f1d1d').attr('font-weight', 600)
          .attr('opacity', 0).text(t)
          .transition().duration(280).delay(mi * 80 + i * 30 + 400).attr('opacity', 1);
      }
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

// Re-render charts on window resize so SVGs stay crisp at any width.
// Debounced via lodash so resizing while dragging doesn't trigger a redraw storm.
if (typeof _ !== 'undefined') {
  window.addEventListener('resize', _.debounce(() => {
    if (!STATE.logRet) return;
    const tickers = STATE.active || STATE.tickers;
    const activePanel = document.querySelector('.panel.active')?.id || 'panel-explorer';
    if (activePanel === 'panel-explorer')  renderExplorer(tickers);
    if (activePanel === 'panel-risk')      renderRisk();
    if (activePanel === 'panel-portfolio') renderPortfolio();
  }, 250));
}
