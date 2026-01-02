const CSV_PATH = "data/companies.csv";

let rawData = [];
let filtered = [];

const elSector = document.getElementById("sectorSelect");
const elRegion = document.getElementById("regionSelect");
const elMinESG = document.getElementById("minESG");
const elMaxCont = document.getElementById("maxCont");
const elReset = document.getElementById("resetBtn");

const elInsights = document.getElementById("insightsList");
const elTable = document.getElementById("dataTable");

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    // simple CSV parser (assumes no commas inside fields)
    const parts = line.split(",").map(x => x.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = parts[i]);
    return obj;
  });
  return rows.map(r => ({
    Company: r.Company,
    Ticker: r.Ticker,
    Sector: r.Sector,
    Region: r.Region,
    ESG_Score: Number(r.ESG_Score),
    Controversies: Number(r.Controversies),
    MarketCap_USD_B: Number(r.MarketCap_USD_B)
  }));
}

function uniq(arr) {
  return [...new Set(arr)].sort((a,b) => a.localeCompare(b));
}

function populateSelect(selectEl, values, allLabel = "All") {
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "All";
  optAll.textContent = allLabel;
  selectEl.appendChild(optAll);

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

function applyFilters() {
  const sector = elSector.value;
  const region = elRegion.value;
  const minESG = Number(elMinESG.value || 0);
  const maxCont = Number(elMaxCont.value || 1e9);

  filtered = rawData.filter(d => {
    const okSector = (sector === "All") || (d.Sector === sector);
    const okRegion = (region === "All") || (d.Region === region);
    const okESG = d.ESG_Score >= minESG;
    const okCont = d.Controversies <= maxCont;
    return okSector && okRegion && okESG && okCont;
  });

  renderChart(filtered);
  renderInsights(filtered);
  renderTable(filtered);
}

function renderChart(data) {
  const x = data.map(d => d.ESG_Score);
  const y = data.map(d => d.Controversies);
  const text = data.map(d => `${d.Company} (${d.Ticker})`);

  // Bubble size by market cap (soft scale)
  const sizes = data.map(d => Math.max(8, Math.sqrt(Math.max(d.MarketCap_USD_B, 0.1)) * 3));

  // Color by sector (categorical)
  const sectors = uniq(data.map(d => d.Sector));
  const colorMap = new Map(sectors.map((s, i) => [s, i]));
  const colors = data.map(d => colorMap.get(d.Sector));

  const trace = {
    type: "scatter",
    mode: "markers",
    x, y,
    text,
    hovertemplate:
      "<b>%{text}</b><br>" +
      "ESG: %{x}<br>" +
      "Controversies: %{y}<extra></extra>",
    marker: {
      size: sizes,
      color: colors,
      opacity: 0.9
    }
  };

  const layout = {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: {l: 50, r: 10, t: 10, b: 50},
    xaxis: {
      title: "ESG Score (0–100)",
      range: [0, 100],
      gridcolor: "rgba(255,255,255,0.06)",
      zerolinecolor: "rgba(255,255,255,0.08)"
    },
    yaxis: {
      title: "Controversies (count)",
      gridcolor: "rgba(255,255,255,0.06)",
      zerolinecolor: "rgba(255,255,255,0.08)"
    },
    font: {color: "#e6edf3"},
    showlegend: false
  };

  const config = {responsive: true, displayModeBar: false};

  Plotly.newPlot("chart", [trace], layout, config);
}

function renderInsights(data) {
  elInsights.innerHTML = "";

  if (data.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nessun dato con i filtri correnti.";
    elInsights.appendChild(li);
    return;
  }

  // Best quadrant: high ESG, low controversies
  const sortedBest = [...data].sort((a,b) =>
    (b.ESG_Score - a.ESG_Score) || (a.Controversies - b.Controversies)
  );
  const top = sortedBest[0];

  // “Risky”: high controversies
  const risky = [...data].sort((a,b) => b.Controversies - a.Controversies)[0];

  // Simple correlation (Pearson) between ESG and controversies
  const corr = pearsonCorr(data.map(d => d.ESG_Score), data.map(d => d.Controversies));

  const items = [
  `Best overall profile (high ESG, low controversies): ${top.Company} — ESG score ${top.ESG_Score}, controversies ${top.Controversies}.`,
  `Most controversial case in the filtered sample: ${risky.Company} — ${risky.Controversies} controversies (ESG score ${risky.ESG_Score}).`,
  `Correlation between ESG score and controversies in the filtered sample: ${formatNumber(corr, 2)} (illustrative, small sample size).`
];


  items.forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    elInsights.appendChild(li);
  });
}

function renderTable(data) {
  const headers = ["Company","Ticker","Sector","Region","ESG_Score","Controversies","MarketCap_USD_B"];

  // head
  const thead = elTable.querySelector("thead");
  thead.innerHTML = "";
  const trh = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    trh.appendChild(th);
  });
  thead.appendChild(trh);

  // body
  const tbody = elTable.querySelector("tbody");
  tbody.innerHTML = "";
  data.forEach(d => {
    const tr = document.createElement("tr");
    headers.forEach(h => {
      const td = document.createElement("td");
      td.textContent = (typeof d[h] === "number") ? String(d[h]) : d[h];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function pearsonCorr(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return NaN;
  const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i=0;i<n;i++){
    const vx = xs[i]-mx;
    const vy = ys[i]-my;
    num += vx*vy;
    dx += vx*vx;
    dy += vy*vy;
  }
  const den = Math.sqrt(dx*dy);
  return den === 0 ? NaN : num/den;
}

function formatNumber(x, digits=2) {
  if (!isFinite(x)) return "n/a";
  return x.toFixed(digits);
}

function wireLinks() {
  // Metti qui i tuoi link reali
  document.getElementById("cvLink").href = "./CV.pdf";       // se aggiungi CV.pdf in repo
  document.getElementById("linkedinLink").href = "https://www.linkedin.com/";
  document.getElementById("githubLink").href = "https://github.com/";
  document.getElementById("cvLink").target = "_blank";
  document.getElementById("linkedinLink").target = "_blank";
  document.getElementById("githubLink").target = "_blank";
}

async function init() {
  wireLinks();

  const res = await fetch(CSV_PATH);
  const text = await res.text();
  rawData = parseCSV(text);

  populateSelect(elSector, uniq(rawData.map(d => d.Sector)), "All sectors");
  populateSelect(elRegion, uniq(rawData.map(d => d.Region)), "All regions");

  // default max controversies: max in dataset
  const maxC = Math.max(...rawData.map(d => d.Controversies));
  elMaxCont.value = String(maxC);

  // listeners
  [elSector, elRegion, elMinESG, elMaxCont].forEach(el => el.addEventListener("change", applyFilters));
  elReset.addEventListener("click", () => {
    elSector.value = "All";
    elRegion.value = "All";
    elMinESG.value = "0";
    elMaxCont.value = String(maxC);
    applyFilters();
  });

  applyFilters();
}

init();
