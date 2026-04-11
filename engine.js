const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#0f766e'];
function color(i) { return COLORS[i % COLORS.length]; }

let tickers = ['AAPL','MSFT','GOOGL','JPM','JNJ','SPY'];
let csvData = null;
let assetStats = [];
let assetReturns = {};
const RF = 0.04;

function switchTab(name, el) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('panel-' + name).classList.add('active');
}

function renderChips() {
    const list = document.getElementById('chipList');
    list.innerHTML = '';
    tickers.forEach((t, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.style.borderColor = color(i);
    c.style.color = color(i);
    c.style.background = color(i) + '18';
    c.textContent = t;
    list.appendChild(c);
    });
}

function addTicker() {
    const inp = document.getElementById('tickerInput');
    const v = inp.value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    if (!v || tickers.includes(v) || tickers.length >= 15) { inp.value = ''; return; }
    tickers.push(v);
    inp.value = '';
    renderChips();
}

function setWin(w, el) {
    document.querySelectorAll('.win-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
}

// ── Math helpers ──
function logReturns(prices) {
    const rets = [];
    for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]));
    return rets;
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stdev(arr) {
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}
function annRet(rets) { return mean(rets) * 252; }
function annVol(rets) { return stdev(rets) * Math.sqrt(252); }
function sharpe(rets) {
    const v = annVol(rets);
    return v === 0 ? 0 : (annRet(rets) - RF) / v;
}
function correlation(a, b) {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) {
    const dx = a[i] - ma, dy = b[i] - mb;
    num += dx * dy; da += dx * dx; db += dy * dy;
    }
    return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

// ── Load and render ──
async function loadData() {
    document.getElementById('loadBtn').disabled = true;
    document.getElementById('statusDot').className = 'dot loading';
    document.getElementById('statusText').textContent = 'Loading…';

    try {
    csvData = await d3.csv('data/prices.csv');
    tickers = csvData.columns.filter(c => c !== 'Date');
    renderChips();

    // Compute returns
    assetReturns = {};
    tickers.forEach(t => {
        assetReturns[t] = logReturns(csvData.map(r => +r[t]));
    });

    // Compute stats
    assetStats = tickers.map((t, i) => ({
        ticker: t, idx: i,
        ret: annRet(assetReturns[t]),
        vol: annVol(assetReturns[t]),
        sharpe: sharpe(assetReturns[t])
    }));

    // KPIs
    document.getElementById('kpi-n').textContent = tickers.length;
    document.getElementById('kpi-obs').textContent = csvData.length;
    document.getElementById('kpi-range').textContent =
        csvData[0].Date.slice(0, 7) + ' → ' + csvData[csvData.length - 1].Date.slice(0, 7);
    const best = assetStats.reduce((a, b) => a.sharpe > b.sharpe ? a : b);
    document.getElementById('kpi-sharpe').textContent = best.sharpe.toFixed(2);
    document.getElementById('kpi-best').textContent = best.ticker;
    document.getElementById('corrLabel').textContent = 'Full history';

    drawScatter(assetStats);
    renderStatsTable(assetStats);
    drawHeatmap(tickers);
    drawHistogram(assetReturns);

    document.getElementById('statusDot').className = 'dot ready';
    document.getElementById('statusText').textContent = tickers.length + ' assets loaded';

    } catch (e) {
    document.getElementById('statusDot').className = 'dot error';
    document.getElementById('statusText').textContent = 'Error';
    console.error(e);
    }
    document.getElementById('loadBtn').disabled = false;
}

// ── Stats table ──
function renderStatsTable(stats) {
    const rows = stats.map(s => {
    const retCls = s.ret > 0 ? 'td-green' : 'td-red';
    const shCls = s.sharpe > 0 ? 'td-green' : 'td-red';
    return '<tr>' +
        '<td><span style="color:' + color(s.idx) + ';font-weight:600">' + s.ticker + '</span></td>' +
        '<td class="' + retCls + '">' + (s.ret * 100).toFixed(2) + '%</td>' +
        '<td>' + (s.vol * 100).toFixed(2) + '%</td>' +
        '<td class="' + shCls + '">' + s.sharpe.toFixed(2) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('statsTableWrap').innerHTML =
    '<table class="data-table">' +
    '<thead><tr><th>Asset</th><th>Ann. Return</th><th>Ann. Vol</th><th>Sharpe</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
}

// ── Scatter: Return vs Volatility ──
function drawScatter(stats) {
    const wrap = d3.select('#scatterWrap');
    wrap.html('');

    const margin = { top: 16, right: 20, bottom: 42, left: 54 };
    const width = 520, height = 300;
    const cw = width - margin.left - margin.right;
    const ch = height - margin.top - margin.bottom;

    const svg = wrap.append('svg').attr('viewBox', '0 0 ' + width + ' ' + height);
    const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const xExt = d3.extent(stats, d => d.vol);
    const yExt = d3.extent(stats, d => d.ret);
    const x = d3.scaleLinear().domain([xExt[0] * 0.85, xExt[1] * 1.15]).range([0, cw]);
    const y = d3.scaleLinear().domain([Math.min(yExt[0], 0) - 0.02, yExt[1] * 1.15]).range([ch, 0]);

    // Grid
    y.ticks(5).forEach(t => {
    g.append('line').attr('x1', 0).attr('x2', cw)
        .attr('y1', y(t)).attr('y2', y(t)).attr('stroke', '#eee');
    });

    // Zero line
    if (y.domain()[0] < 0) {
    g.append('line').attr('x1', 0).attr('x2', cw)
        .attr('y1', y(0)).attr('y2', y(0))
        .attr('stroke', '#ccc').attr('stroke-dasharray', '4,3');
    }

    // Axes
    g.append('g').attr('transform', 'translate(0,' + ch + ')')
    .call(d3.axisBottom(x).ticks(5).tickFormat(d => (d * 100).toFixed(1) + '%'))
    .selectAll('text').style('font-size', '9px');
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => (d * 100).toFixed(1) + '%'))
    .selectAll('text').style('font-size', '9px');

    // Labels
    svg.append('text').attr('x', margin.left + cw / 2).attr('y', height - 4)
    .attr('text-anchor', 'middle').style('font-size', '10px').style('fill', '#999')
    .text('Annualised Volatility');
    svg.append('text').attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + ch / 2)).attr('y', 14)
    .attr('text-anchor', 'middle').style('font-size', '10px').style('fill', '#999')
    .text('Annualised Return');

    // Bubbles
    g.selectAll('circle').data(stats).enter().append('circle')
    .attr('cx', d => x(d.vol)).attr('cy', d => y(d.ret))
    .attr('r', d => Math.max(5, Math.min(13, 5 + d.sharpe * 3)))
    .attr('fill', d => color(d.idx)).attr('opacity', 0.85);

    // Ticker labels
    g.selectAll('.lbl').data(stats).enter().append('text')
    .attr('x', d => x(d.vol))
    .attr('y', d => y(d.ret) - Math.max(5, Math.min(13, 5 + d.sharpe * 3)) - 4)
    .attr('text-anchor', 'middle').style('font-size', '10px').style('font-weight', '600')
    .style('fill', d => color(d.idx)).text(d => d.ticker);
}

// ── Correlation heatmap (simple) ──
function drawHeatmap(tickers) {
    const wrap = d3.select('#heatmapWrap');
    wrap.html('');

    const n = tickers.length;
    const cell = Math.min(44, Math.floor(380 / n));
    const margin = 52;
    const W = margin + n * cell + 16;
    const H = margin + n * cell + 8;

    const svg = wrap.append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);

    // Compute correlation matrix
    for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
        const v = correlation(assetReturns[tickers[i]], assetReturns[tickers[j]]);
        // Color: blue (-1) -> white (0) -> red (+1)
        const r = v > 0 ? Math.round(220 + 35 * v) : Math.round(220 - 183 * Math.abs(v));
        const gr = v > 0 ? Math.round(220 - 180 * v) : Math.round(220 - 130 * Math.abs(v));
        const b = v > 0 ? Math.round(220 - 190 * v) : Math.round(220 + 35 * Math.abs(v));
        const col = 'rgb(' + r + ',' + gr + ',' + b + ')';

        svg.append('rect')
        .attr('x', margin + j * cell).attr('y', margin + i * cell)
        .attr('width', cell).attr('height', cell)
        .attr('fill', col);

        if (cell >= 30) {
        svg.append('text')
            .attr('x', margin + j * cell + cell / 2)
            .attr('y', margin + i * cell + cell / 2 + 4)
            .attr('text-anchor', 'middle')
            .style('font-size', '9px').style('font-weight', '500')
            .style('fill', Math.abs(v) > 0.6 ? '#fff' : '#333')
            .text(v.toFixed(2));
        }
    }
    // Row/col labels
    svg.append('text').attr('x', margin + i * cell + cell / 2).attr('y', margin - 6)
        .attr('text-anchor', 'middle').style('font-size', '9px').style('font-weight', '600').style('fill', '#444')
        .text(tickers[i]);
    svg.append('text').attr('x', margin - 4).attr('y', margin + i * cell + cell / 2 + 3)
        .attr('text-anchor', 'end').style('font-size', '9px').style('font-weight', '600').style('fill', '#444')
        .text(tickers[i]);
    }
}

// ── Return Distribution (Histogram) ──
function drawHistogram(assetReturns) {
  const wrap = d3.select('#histWrap');
  wrap.html('');

  // flatten all returns into one array
  const allReturns = Object.values(assetReturns).flat();

  const margin = { top: 16, right: 20, bottom: 42, left: 54 };
  const width = 520, height = 300;
  const cw = width - margin.left - margin.right;
  const ch = height - margin.top - margin.bottom;

  const svg = wrap.append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // X scale (returns)
  const x = d3.scaleLinear()
    .domain(d3.extent(allReturns))
    .nice()
    .range([0, cw]);

  // Histogram bins
  const bins = d3.bin()
    .domain(x.domain())
    .thresholds(40)(allReturns);

  const y = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .nice()
    .range([ch, 0]);

  // Bars
  g.selectAll('rect')
    .data(bins)
    .enter()
    .append('rect')
    .attr('x', d => x(d.x0))
    .attr('y', d => y(d.length))
    .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr('height', d => ch - y(d.length))
    .attr('fill', '#2563eb')
    .attr('opacity', 0.75);

  // Axes
  g.append('g')
    .attr('transform', `translate(0,${ch})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d => (d * 100).toFixed(1) + '%'))
    .selectAll('text')
    .style('font-size', '9px');

  g.append('g')
    .call(d3.axisLeft(y).ticks(5))
    .selectAll('text')
    .style('font-size', '9px');

  // Labels
  svg.append('text')
    .attr('x', margin.left + cw / 2)
    .attr('y', height - 4)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#999')
    .text('Daily Returns');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(margin.top + ch / 2))
    .attr('y', 14)
    .attr('text-anchor', 'middle')
    .style('font-size', '10px')
    .style('fill', '#999')
    .text('Frequency');
}

renderChips();