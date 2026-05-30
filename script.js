const SHEETS = {
  amc: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQcfDBuovLxJGPP3YbjzFRH1BYIwboAl7k-Pf2iLngvURF1VjFF0FMpxq8gzWeeZtKy2xiuMPgfkIVp/pub?gid=0&single=true&output=csv",
  service: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQcfDBuovLxJGPP3YbjzFRH1BYIwboAl7k-Pf2iLngvURF1VjFF0FMpxq8gzWeeZtKy2xiuMPgfkIVp/pub?gid=326388322&single=true&output=csv"
};

const REFRESH_EVERY_MS = 60000;
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const AGEING_BUCKETS = [
  { label:"0–30 days", min:0, max:30 },
  { label:"31–60 days", min:31, max:60 },
  { label:"61–120 days", min:61, max:120 },
  { label:"121–240 days", min:121, max:240 },
  { label:"241–500 days", min:241, max:500 },
  { label:"500+ days", min:501, max:Infinity }
];

const FIELD_ALIASES = {
  date: ["date","invoice date","bill date"],
  invoiceNo: ["invoice no","invoice number","invoice"],
  customer: ["customer name","customer","client"],
  engineer: ["engineer","engineer name","name"],
  region: ["region","zone","location"],
  overdueBy: ["overdue by","overdue","ageing","aging"],
  balance: ["balance","pending amount","outstanding","gross total","invoice amount","invoice value","amount"],
  dueDate: ["due date"],
  priority: ["priority"],
  status: ["payment status","status"]
};

const CHART_COLORS = ["#4ea8b0","#6daa40","#f5a623","#d9606e","#8b73c4","#3b87c0"];
let allRows = [];
let filteredRows = [];
let charts = {};

const $ = id => document.getElementById(id);
const el = {
  totalValue: $("totalValue"), totalInvoices: $("totalInvoices"), amcValue: $("amcValue"), serviceValue: $("serviceValue"),
  amcCount: $("amcCount"), serviceCount: $("serviceCount"), rowCount: $("rowCount"), rowCount2: $("rowCount2"),
  invoiceTableBody: $("invoiceTableBody"), ageingTableBody: $("ageingTableBody"),
  globalSearch: $("globalSearch"), refreshData: $("refreshData"), themeToggle: $("themeToggle"), themeIcon: $("themeIcon"),
  navInvoiceCount: $("navInvoiceCount"), filterYear: $("filterYear"), filterType: $("filterType"), filterRegion: $("filterRegion"), filterEngineer: $("filterEngineer"),
  age0to30: $("age0to30"), age0to30c: $("age0to30c"), age31to90: $("age31to90"), age31to90c: $("age31to90c"), age90plus: $("age90plus"), age90plusc: $("age90plusc"), avgOverdue: $("avgOverdue"),
  top10TableBody: $("top10TableBody"), ageingDetailBody: $("ageingDetailBody"),
  totalEngineers: $("totalEngineers"), highestEngVal: $("highestEngVal"), highestEngName: $("highestEngName"), mostOverdueCount: $("mostOverdueCount"), mostOverdueName: $("mostOverdueName"), avgPerEngineer: $("avgPerEngineer"),
  invTotalCount: $("invTotalCount"), invAmcCount: $("invAmcCount"), invServiceCount: $("invServiceCount"), invOverdueCount: $("invOverdueCount"),
  invType: $("invType"), invRegion: $("invRegion"), invEngineer: $("invEngineer"), invStatus: $("invStatus"), invRowCount: $("invRowCount"), invoiceTableBodyView: $("invoiceTableBodyView")
};

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  bindEvents();
  bindSidebarViews();
  loadDashboardData();
  setInterval(loadDashboardData, REFRESH_EVERY_MS);
});

function bindEvents() {
  el.globalSearch?.addEventListener("input", applyFilters);
  el.refreshData?.addEventListener("click", loadDashboardData);
  el.themeToggle?.addEventListener("click", toggleTheme);
  [el.filterYear, el.filterType, el.filterRegion, el.filterEngineer].forEach(s => s?.addEventListener("change", applyFilters));
  [el.invType, el.invRegion, el.invEngineer, el.invStatus].forEach(s => s?.addEventListener("change", renderInvoices));
}

function bindSidebarViews() {
  const items = document.querySelectorAll('.nav-item[data-view]');
  const views = document.querySelectorAll('.view-section');
  items.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      items.forEach(x => x.classList.remove('active'));
      item.classList.add('active');
      views.forEach(v => v.classList.remove('active'));
      const target = document.getElementById(`view-${view}`);
      if (target) target.classList.add('active');
    });
  });
}

async function loadDashboardData() {
  try {
    const [amcRows, serviceRows] = await Promise.all([fetchSheet(SHEETS.amc, "AMC"), fetchSheet(SHEETS.service, "Service")]);
    allRows = [...amcRows, ...serviceRows].filter(r => r.balance > 0);
    populateFilters();
    populateInvoiceFilters();
    applyFilters();
  } catch (err) {
    console.error(err);
    if (el.invoiceTableBody) el.invoiceTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">Unable to fetch data.</td></tr>`;
  }
}

async function fetchSheet(url, invoiceType) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${invoiceType}`);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
  return parsed.data.map(row => normalizeRow(row, invoiceType));
}

function normalizeRow(raw, invoiceType) {
  const dateVal = getField(raw, FIELD_ALIASES.date);
  const parsedDt = parseDate(dateVal);
  return {
    invoiceType,
    date: dateVal || "—",
    invoiceNo: getField(raw, FIELD_ALIASES.invoiceNo),
    customer: getField(raw, FIELD_ALIASES.customer),
    engineer: getField(raw, FIELD_ALIASES.engineer),
    region: getField(raw, FIELD_ALIASES.region),
    overdueBy: parseAmount(getField(raw, FIELD_ALIASES.overdueBy)),
    balance: parseAmount(getField(raw, FIELD_ALIASES.balance)),
    dueDate: getField(raw, FIELD_ALIASES.dueDate),
    priority: getField(raw, FIELD_ALIASES.priority),
    status: getField(raw, FIELD_ALIASES.status),
    year: parsedDt ? parsedDt.getFullYear() : null,
    month: parsedDt ? MONTH_NAMES[parsedDt.getMonth()] : "No date",
    monthIndex: parsedDt ? parsedDt.getMonth() : 99,
    raw
  };
}

function getField(row, aliases) {
  const k = Object.keys(row).find(key => aliases.includes(normalizeKey(key)));
  return k ? String(row[k] ?? "").trim() : "";
}
const normalizeKey = v => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

function populateFilters() {
  const years = [...new Set(allRows.map(r => r.year).filter(Boolean))].sort();
  const regions = [...new Set(allRows.map(r => r.region).filter(Boolean))].sort();
  const engineers = [...new Set(allRows.map(r => r.engineer).filter(Boolean))].sort();
  populateSelect(el.filterYear, years, "All years");
  populateSelect(el.filterRegion, regions, "All regions");
  populateSelect(el.filterEngineer, engineers, "All engineers");
}

function populateSelect(sel, values, placeholder) {
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` + values.map(v => `<option value="${v}"${v == current ? " selected" : ""}>${v}</option>`).join("");
}

function populateInvoiceFilters() {
  if (el.invRegion) {
    const regions = [...new Set(allRows.map(r => r.region).filter(Boolean))].sort();
    el.invRegion.innerHTML = `<option value="">All regions</option>` + regions.map(v => `<option value="${v}">${v}</option>`).join("");
  }
  if (el.invEngineer) {
    const engineers = [...new Set(allRows.map(r => r.engineer).filter(Boolean))].sort();
    el.invEngineer.innerHTML = `<option value="">All engineers</option>` + engineers.map(v => `<option value="${v}">${v}</option>`).join("");
  }
}

function applyFilters() {
  const search = (el.globalSearch?.value || "").trim().toLowerCase();
  const year = el.filterYear?.value;
  const type = el.filterType?.value;
  const region = el.filterRegion?.value;
  const engineer = el.filterEngineer?.value;

  filteredRows = allRows.filter(r => {
    if (year && String(r.year) !== year) return false;
    if (type && r.invoiceType !== type) return false;
    if (region && r.region !== region) return false;
    if (engineer && r.engineer !== engineer) return false;
    if (search) {
      const haystack = [r.invoiceNo, r.customer, r.engineer, r.region, r.invoiceType].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  renderDashboard();
}

function renderDashboard() {
  renderKPIs();
  renderTrendChart();
  renderRegionChart();
  renderTypeChart();
  renderSparklines();
  renderAnalytics();
  renderEngineers();
  renderInvoices();
}

function renderKPIs() {
  const amcRows = filteredRows.filter(r => r.invoiceType === "AMC");
  const serviceRows = filteredRows.filter(r => r.invoiceType === "Service");
  const total = sum(filteredRows, "balance");
  const amcVal = sum(amcRows, "balance");
  const svcVal = sum(serviceRows, "balance");

  animateValue(el.totalInvoices, 0, filteredRows.length, 900, false);
  animateCurrency(el.totalValue, total);
  animateCurrency(el.amcValue, amcVal);
  animateCurrency(el.serviceValue, svcVal);

  if (el.amcCount) el.amcCount.textContent = `${formatNumber(amcRows.length)} invoices`;
  if (el.serviceCount) el.serviceCount.textContent = `${formatNumber(serviceRows.length)} invoices`;
  if (el.rowCount) el.rowCount.textContent = `${formatNumber(filteredRows.length)} pending rows`;
  if (el.rowCount2) el.rowCount2.textContent = `${formatNumber(filteredRows.length)} rows`;
  if (el.navInvoiceCount) el.navInvoiceCount.textContent = formatNumber(filteredRows.length);
}

function renderTrendChart() {
  const { labels, values } = groupByMonth(filteredRows);
  const isDark = document.documentElement.dataset.theme === "dark";
  const axisColor = isDark ? "#8c8a85" : "#9d9a94";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(40,37,29,0.07)";

  const palette = [
    { base: "#56b4c8", glow: "rgba(86,180,200,0.25)" },
    { base: "#8bc34a", glow: "rgba(139,195,74,0.25)" },
    { base: "#f6a623", glow: "rgba(246,166,35,0.25)" },
    { base: "#e35d6a", glow: "rgba(227,93,106,0.25)" },
    { base: "#8c6bd6", glow: "rgba(140,107,214,0.25)" },
    { base: "#4a90e2", glow: "rgba(74,144,226,0.25)" }
  ];

  function barGradient(chart, color) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return color.base;
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, color.base);
    g.addColorStop(0.55, color.base + "cc");
    g.addColorStop(1, color.base + "55");
    return g;
  }

  upsertChart("monthChart", {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Outstanding",
        data: values,
        backgroundColor: ctx => barGradient(ctx.chart, palette[ctx.dataIndex % palette.length]),
        borderColor: ctx => palette[ctx.dataIndex % palette.length].base,
        borderWidth: 0,
        borderRadius: 0,
        borderSkipped: false,
        maxBarThickness: 35,
        categoryPercentage: 0.72,
        barPercentage: 0.80,
        hoverBackgroundColor: ctx => palette[ctx.dataIndex % palette.length].base,
        hoverBorderColor: "#ffffff",
        hoverBorderWidth: 2,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        shadowBlur: 12,
        shadowColor: ctx => palette[ctx.dataIndex % palette.length].glow
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onHover: (evt, elements) => {
        evt.native.target.style.cursor = elements.length ? "pointer" : "default";
      },
      onClick: (evt, elements) => {
        if (!elements.length) {
          if (typeof filterState !== "undefined") {
            filterState.month = "";
            applyFilters();
          }
          return;
        }
        const idx = elements[0].index;
        if (typeof filterState !== "undefined") {
          filterState.month = labels[idx];
          applyFilters();
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "rgba(24,23,20,0.95)" : "rgba(255,255,255,0.95)",
          titleColor: isDark ? "#f5f4f0" : "#28251d",
          bodyColor: isDark ? "#d1cfcc" : "#28251d",
          borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(40,37,29,0.10)",
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: c => " " + compactCurrency(c.raw)
          }
        }
      },
      scales: {
        x: {
          ticks: { color: axisColor, font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: axisColor,
            font: { size: 11 },
            callback: v => compactCurrency(v)
          },
          grid: { color: gridColor }
        }
      }
    }
  });
}

function renderRegionChart() {
  const { labels, values } = groupAndLimit(filteredRows, "region", 6);
  const total = values.reduce((a, b) => a + b, 0);
  upsertChart("regionChart", {
    type: "pie",
    data: { labels, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 2, hoverOffset: 12 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => { const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0; return ` ${c.label}: ${compactCurrency(c.raw)} (${pct}%)`; } } } } }
  });
}

function renderTypeChart() {
  const amc = sum(filteredRows.filter(r => r.invoiceType === "AMC"), "balance");
  const svc = sum(filteredRows.filter(r => r.invoiceType === "Service"), "balance");
  const total = amc + svc;
  upsertChart("typeChart", {
    type: "doughnut",
    data: { labels: ["AMC", "Service"], datasets: [{ data: [amc, svc], backgroundColor: [CHART_COLORS[0], CHART_COLORS[2]], borderWidth: 2, hoverOffset: 12 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "45%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: c => { const pct = total > 0 ? ((c.raw / total) * 100).toFixed(1) : 0; return ` ${c.label}: ${compactCurrency(c.raw)} (${pct}%)`; } } } } }
  });
}

function renderSparklines() {
  const { values } = groupByMonth(filteredRows);
  if (!values.length) return;
  upsertChart("sparkTotal", {
    type: "line",
    data: { labels: values.map((_, i) => i), datasets: [{ data: values, borderColor: "#4ea8b0", backgroundColor: "rgba(78,168,176,0.15)", borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
  });
}

function renderAgeingTable() {
  const rows = AGEING_BUCKETS.map(b => {
    const matched = filteredRows.filter(r => r.overdueBy >= b.min && r.overdueBy <= b.max);
    return { label: b.label, count: matched.length, value: sum(matched, "balance") };
  }).filter(r => r.count > 0);

  if (!rows.length) { el.ageingTableBody.innerHTML = `<tr><td colspan="3" class="empty-state">No overdue data</td></tr>`; return; }
  el.ageingTableBody.innerHTML = rows.map(r => `<tr><td>${r.label}</td><td>${formatNumber(r.count)}</td><td class="amount-cell">${formatCurrency(r.value)}</td></tr>`).join("");
}

function renderInvoiceTable() {
  if (!el.invoiceTableBody) return;
  if (!filteredRows.length) {
    el.invoiceTableBody.innerHTML = `<tr><td colspan="8" class="empty-state">No matching records</td></tr>`;
    return;
  }
  el.invoiceTableBody.innerHTML = filteredRows.map(r => {
    const statusClass = r.overdueBy > 60 ? "overdue" : r.overdueBy > 0 ? "pending" : "paid";
    const statusLabel = r.overdueBy > 60 ? "Overdue" : r.overdueBy > 0 ? "Pending" : "Current";
    return `<tr>
      <td><span class="type-pill ${r.invoiceType === 'Service' ? 'service' : ''}">${r.invoiceType}</span></td>
      <td>${r.date}</td>
      <td>${r.invoiceNo || "—"}</td>
      <td>${r.customer || "—"}</td>
      <td>${r.engineer || "—"}</td>
      <td>${r.region || "—"}</td>
      <td><span class="status ${statusClass}">${statusLabel}</span></td>
      <td class="amount-cell">${formatCurrency(r.balance)}</td>
    </tr>`;
  }).join("");
}

function renderAnalytics() {
  const a0 = filteredRows.filter(r => r.overdueBy >= 0 && r.overdueBy <= 30);
  const a31 = filteredRows.filter(r => r.overdueBy >= 31 && r.overdueBy <= 90);
  const a90 = filteredRows.filter(r => r.overdueBy > 90);
  const allOverdue = filteredRows.filter(r => r.overdueBy > 0);
  const avgDays = allOverdue.length ? Math.round(allOverdue.reduce((s, r) => s + r.overdueBy, 0) / allOverdue.length) : 0;

  if (el.age0to30) el.age0to30.textContent = compactCurrency(sum(a0, "balance"));
  if (el.age0to30c) el.age0to30c.textContent = `${a0.length} invoices`;
  if (el.age31to90) el.age31to90.textContent = compactCurrency(sum(a31, "balance"));
  if (el.age31to90c) el.age31to90c.textContent = `${a31.length} invoices`;
  if (el.age90plus) el.age90plus.textContent = compactCurrency(sum(a90, "balance"));
  if (el.age90plusc) el.age90plusc.textContent = `${a90.length} invoices`;
  if (el.avgOverdue) el.avgOverdue.textContent = avgDays + " days";

  const ageLabels = AGEING_BUCKETS.map(b => b.label);
  const ageValues = AGEING_BUCKETS.map(b => sum(filteredRows.filter(r => r.overdueBy >= b.min && r.overdueBy <= b.max), "balance"));
  upsertChart("ageingChart", { type: "bar", data: { labels: ageLabels, datasets: [{ label: "Outstanding", data: ageValues, backgroundColor: CHART_COLORS, borderRadius: 8, borderSkipped: false, maxBarThickness: 48 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + compactCurrency(c.raw) } } } } });

  const priorityMap = {};
  filteredRows.forEach(r => { const p = r.priority || "Unknown"; priorityMap[p] = (priorityMap[p] || 0) + 1; });
  const pLabels = Object.keys(priorityMap);
  const pValues = Object.values(priorityMap);
  upsertChart("priorityChart", { type: "doughnut", data: { labels: pLabels, datasets: [{ data: pValues, backgroundColor: CHART_COLORS, borderWidth: 2, hoverOffset: 10 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "45%", plugins: { legend: { position: "bottom" } } } });

  const engMap = buildEngineerMap(filteredRows);
  const sorted = Object.values(engMap).sort((a, b) => b.balance - a.balance).slice(0, 10);
  if (el.top10TableBody) {
    el.top10TableBody.innerHTML = sorted.length ? sorted.map((e, i) => `<tr><td>${i + 1}</td><td>${e.name}</td><td>${e.region || "—"}</td><td>${e.count}</td><td>${e.amc}</td><td>${e.service}</td><td>${e.avgOverdue} days</td><td class="amount-cell">${formatCurrency(e.balance)}</td></tr>`).join("") : `<tr><td colspan="8" class="empty-state">No data</td></tr>`;
  }

  if (el.ageingDetailBody) {
    el.ageingDetailBody.innerHTML = AGEING_BUCKETS.map(b => {
      const matched = filteredRows.filter(r => r.overdueBy >= b.min && r.overdueBy <= b.max);
      return `<tr><td>${b.label}</td><td>${matched.length}</td><td>${matched.filter(r => r.invoiceType === "AMC").length}</td><td>${matched.filter(r => r.invoiceType === "Service").length}</td><td class="amount-cell">${formatCurrency(sum(matched, "balance"))}</td></tr>`;
    }).join("");
  }
}

function renderEngineers() {
  const engMap = buildEngineerMap(filteredRows);
  const sorted = Object.values(engMap).sort((a, b) => b.balance - a.balance);

  if (el.totalEngineers) el.totalEngineers.textContent = sorted.length;
  if (el.highestEngVal) el.highestEngVal.textContent = sorted.length ? compactCurrency(sorted[0].balance) : "—";
  if (el.highestEngName) el.highestEngName.textContent = sorted.length ? sorted[0].name : "—";
  const mostOverdue = [...sorted].sort((a, b) => b.overdue - a.overdue)[0];
  if (el.mostOverdueCount) el.mostOverdueCount.textContent = mostOverdue ? mostOverdue.overdue : "—";
  if (el.mostOverdueName) el.mostOverdueName.textContent = mostOverdue ? mostOverdue.name : "—";
  if (el.avgPerEngineer) el.avgPerEngineer.textContent = compactCurrency(sorted.length ? sum(filteredRows, "balance") / sorted.length : 0);

  const top10 = sorted.slice(0, 10);
  upsertChart("engineerBarChart", { type: "bar", data: { labels: top10.map(e => e.name.split(" ")[0]), datasets: [{ label: "Outstanding", data: top10.map(e => e.balance), backgroundColor: CHART_COLORS[0], borderRadius: 8, borderSkipped: false, maxBarThickness: 40 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + compactCurrency(c.raw) } } } } });

  if (el.engineerTableBody) {
    el.engineerTableBody.innerHTML = sorted.length ? sorted.map((e, i) => `<tr><td>${i + 1}</td><td>${e.name}</td><td>${e.region || "—"}</td><td>${e.count}</td><td>${e.amc}</td><td>${e.service}</td><td>${e.overdue}</td><td>${e.avgOverdue} days</td><td class="amount-cell">${formatCurrency(e.balance)}</td></tr>`).join("") : `<tr><td colspan="9" class="empty-state">No data</td></tr>`;
  }
}

function renderInvoices() {
  const type = el.invType?.value || "";
  const region = el.invRegion?.value || "";
  const engineer = el.invEngineer?.value || "";
  const status = el.invStatus?.value || "";

  const rows = filteredRows.filter(r => {
    const s = r.overdueBy > 60 ? "Overdue" : r.overdueBy > 0 ? "Pending" : "Current";
    if (type && r.invoiceType !== type) return false;
    if (region && r.region !== region) return false;
    if (engineer && r.engineer !== engineer) return false;
    if (status && s !== status) return false;
    return true;
  });

  if (el.invTotalCount) el.invTotalCount.textContent = rows.length;
  if (el.invAmcCount) el.invAmcCount.textContent = rows.filter(r => r.invoiceType === "AMC").length;
  if (el.invServiceCount) el.invServiceCount.textContent = rows.filter(r => r.invoiceType === "Service").length;
  if (el.invOverdueCount) el.invOverdueCount.textContent = rows.filter(r => r.overdueBy > 0).length;
  if (el.invRowCount) el.invRowCount.textContent = `${rows.length} rows`;

  if (!el.invoiceTableBodyView) return;
  el.invoiceTableBodyView.innerHTML = rows.length ? rows.map(r => {
    const s = r.overdueBy > 60 ? "Overdue" : r.overdueBy > 0 ? "Pending" : "Current";
    const cls = r.overdueBy > 60 ? "overdue" : r.overdueBy > 0 ? "pending" : "paid";
    return `<tr>
      <td><span class="type-pill ${r.invoiceType === 'Service' ? 'service' : ''}">${r.invoiceType}</span></td>
      <td>${r.date || "—"}</td>
      <td>${r.invoiceNo || "—"}</td>
      <td>${r.customer || "—"}</td>
      <td>${r.engineer || "—"}</td>
      <td>${r.region || "—"}</td>
      <td>${r.priority || "—"}</td>
      <td><span class="status ${cls}">${s}</span></td>
      <td>${r.dueDate || "—"}</td>
      <td>${r.overdueBy || 0}</td>
      <td class="amount-cell">${formatCurrency(r.balance)}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="11" class="empty-state">No matching records</td></tr>`;
}

function buildEngineerMap(rows) {
  const map = {};
  rows.forEach(r => {
    const name = r.engineer || "Unknown";
    if (!map[name]) map[name] = { name, region: r.region || "—", count: 0, amc: 0, service: 0, overdue: 0, balance: 0, totalOverdueDays: 0 };
    map[name].count++;
    map[name].balance += r.balance;
    if (r.invoiceType === "AMC") map[name].amc++;
    else map[name].service++;
    if (r.overdueBy > 0) { map[name].overdue++; map[name].totalOverdueDays += r.overdueBy; }
  });
  Object.values(map).forEach(e => { e.avgOverdue = e.overdue > 0 ? Math.round(e.totalOverdueDays / e.overdue) : 0; });
  return map;
}

function upsertChart(id, config) {
  if (charts[id]) charts[id].destroy();
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts[id] = new Chart(canvas.getContext("2d"), config);
}

function groupByMonth(rows) {
  const map = new Map();

  rows.forEach(r => {
    if (r.year == null) return;
    const key = `${r.year}-${String(r.monthIndex).padStart(2, "0")}`;
    const label = `${r.month} '${String(r.year).slice(2)}`;
    const current = map.get(key) || { key, label, value: 0 };
    current.value += r.balance;
    map.set(key, current);
  });

  const top10 = [...map.values()]
    .sort((a, b) => b.value - a.value)   // highest value first
    .slice(0, 10)                          // only top 10
    .sort((a, b) => a.key.localeCompare(b.key)); // chronological order for display

  return {
    labels: top10.map(x => x.label),
    values: top10.map(x => x.value)
  };
}

function groupAndLimit(rows, field, limit) {
  const map = {};
  rows.forEach(r => {
    const k = r[field] || "Unknown";
    map[k] = (map[k] || 0) + r.balance;
  });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (sorted.length <= limit) return { labels: sorted.map(x => x[0]), values: sorted.map(x => x[1]) };
  const top = sorted.slice(0, limit - 1);
  const others = sorted.slice(limit - 1).reduce((s, x) => s + x[1], 0);
  return { labels: [...top.map(x => x[0]), "Others"], values: [...top.map(x => x[1]), others] };
}

function parseDate(v) {
  if (!v) return null;

  const s = String(v).trim();

  // DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }

  // DD-MM-YY or DD/MM/YY
  const ddmmyy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
  if (ddmmyy) {
    const [, dd, mm, yy] = ddmmyy;
    const yyyy = Number(yy) >= 50 ? 1900 + Number(yy) : 2000 + Number(yy);
    const d = new Date(yyyy, Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? null : d;
  }

  // fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function parseAmount(v) { const n = parseFloat(String(v || "").replace(/[^0-9.-]/g, "")); return isNaN(n) ? 0 : n; }
function sum(arr, key) { return arr.reduce((s, r) => s + (r[key] || 0), 0); }
function formatCurrency(n) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0); }
function compactCurrency(n) { if (n >= 1e7) return "₹" + (n / 1e7).toFixed(1) + "Cr"; if (n >= 1e5) return "₹" + (n / 1e5).toFixed(1) + "L"; if (n >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "K"; return "₹" + (n || 0).toFixed(0); }
function formatNumber(n) { return new Intl.NumberFormat("en-IN").format(n || 0); }

function animateValue(elm, from, to, duration, isCurrency) {
  if (!elm) return;
  const start = performance.now();
  const step = now => {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * ease;
    elm.textContent = isCurrency ? formatCurrency(v) : formatNumber(Math.round(v));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function animateCurrency(elm, to) { animateValue(elm, 0, to, 900, true); }

function setupTheme() {
  const saved = (() => { try { return localStorage.getItem("theme"); } catch(e) { return null; } })();
  setTheme(saved || "dark");
}
function toggleTheme() { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); }
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("theme", theme); } catch(e) {}
  if (el.themeIcon) el.themeIcon.textContent = theme === "dark" ? "🌙" : "☀️";
  if (Object.keys(charts).length > 0) renderDashboard();
}