const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#0f766e'];
function color(i) { return COLORS[i % COLORS.length]; }

let tickers = ['AAPL','MSFT','GOOGL','JPM','JNJ','SPY'];
let csvData = null;

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

// ── Basic math on log returns ──
function computeLogReturns(prices) {
    const rets = [];
    for (let i = 1; i < prices.length; i++) {
    rets.push(Math.log(prices[i] / prices[i - 1]));
    }
    return rets;
}

function annReturn(rets) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    return mean * 252;
}

function annVol(rets) {
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const variance = rets.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (rets.length - 1);
    return Math.sqrt(variance * 252);
}

// ── Load CSV and draw a simple bar chart ──
async function loadData() {
    document.getElementById('loadBtn').disabled = true;
    document.getElementById('statusDot').className = 'dot loading';
    document.getElementById('statusText').textContent = 'Loading…';

    try {
    csvData = await d3.csv('data/prices.csv');
    const allTickers = csvData.columns.filter(c => c !== 'Date');
    tickers = allTickers;
    renderChips();

    // Compute returns for each ticker
    const stats = tickers.map((t, i) => {
        const prices = csvData.map(r => +r[t]);
        const rets = computeLogReturns(prices);
        return { ticker: t, ret: annReturn(rets), vol: annVol(rets), idx: i };
    });

    // Update KPIs
    document.getElementById('kpi-n').textContent = tickers.length;
    document.getElementById('kpi-obs').textContent = csvData.length;
    document.getElementById('kpi-range').textContent =
        csvData[0].Date.slice(0, 7) + ' → ' + csvData[csvData.length - 1].Date.slice(0, 7);

    drawBarChart(stats);

    document.getElementById('statusDot').className = 'dot ready';
    document.getElementById('statusText').textContent = tickers.length + ' assets loaded';

    } catch (e) {
    document.getElementById('statusDot').className = 'dot error';
    document.getElementById('statusText').textContent = 'Error';
    console.error(e);
    }

    document.getElementById('loadBtn').disabled = false;
}

// ── Simple D3 bar chart ──
function drawBarChart(stats) {
    const wrap = d3.select('#barChartWrap');
    wrap.html('');

    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const width = 500, height = 280;
    const cw = width - margin.left - margin.right;
    const ch = height - margin.top - margin.bottom;

    const svg = wrap.append('svg').attr('viewBox', '0 0 ' + width + ' ' + height);
    const g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const x = d3.scaleBand().domain(stats.map(d => d.ticker)).range([0, cw]).padding(0.25);
    const yMax = Math.max(d3.max(stats, d => d.ret), 0.01);
    const yMin = Math.min(d3.min(stats, d => d.ret), -0.01);
    const y = d3.scaleLinear().domain([yMin * 1.15, yMax * 1.15]).range([ch, 0]);

    // Axes
    g.append('g').attr('transform', 'translate(0,' + ch + ')')
    .call(d3.axisBottom(x)).selectAll('text').style('font-size', '10px');
    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d => (d * 100).toFixed(1) + '%'))
    .selectAll('text').style('font-size', '9px');

    // Zero line
    g.append('line').attr('x1', 0).attr('x2', cw)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', '#ccc').attr('stroke-dasharray', '3,3');

    // Bars
    g.selectAll('rect').data(stats).enter().append('rect')
    .attr('x', d => x(d.ticker))
    .attr('y', d => d.ret >= 0 ? y(d.ret) : y(0))
    .attr('width', x.bandwidth())
    .attr('height', d => Math.abs(y(d.ret) - y(0)))
    .attr('fill', d => color(d.idx))
    .attr('rx', 3);

    // Value labels
    g.selectAll('.val-label').data(stats).enter().append('text')
    .attr('x', d => x(d.ticker) + x.bandwidth() / 2)
    .attr('y', d => d.ret >= 0 ? y(d.ret) - 5 : y(d.ret) + 13)
    .attr('text-anchor', 'middle')
    .style('font-size', '9px').style('font-weight', '600')
    .style('fill', d => color(d.idx))
    .text(d => (d.ret * 100).toFixed(1) + '%');

    // Axis label
    svg.append('text')
    .attr('x', margin.left + cw / 2).attr('y', height - 4)
    .attr('text-anchor', 'middle').style('font-size', '10px').style('fill', '#999')
    .text('Annualised Return (log)');
}

renderChips();