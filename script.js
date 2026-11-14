const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "astraHealthHistoryV1";
const LIMITS = {
  heart: { low: 50, high: 100, criticalLow: 40, criticalHigh: 130, label: "Heart rate" },
  spo2: { low: 95, high: 100, criticalLow: 90, criticalHigh: 100, label: "Oxygen saturation" },
  temp: { low: 36.0, high: 37.5, criticalLow: 35.0, criticalHigh: 39.0, label: "Body temperature" },
  systolic: { low: 90, high: 120, criticalLow: 80, criticalHigh: 180, label: "Systolic blood pressure" },
  diastolic: { low: 60, high: 80, criticalLow: 50, criticalHigh: 120, label: "Diastolic blood pressure" }
};

let current = { heart: 72, spo2: 98, temp: 36.8, systolic: 118, diastolic: 78 };
let paused = false;
let tick = 0;
let alerts = [];
let history = loadHistory();
let chart;

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.slice(-40) : [];
  } catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); }
  catch { showToast("Browser storage unavailable; history is temporary."); }
}
function timeLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function classify(key, value) {
  const l = LIMITS[key];
  if (value < l.criticalLow || value > l.criticalHigh) return "critical";
  if (value < l.low || value > l.high) return "warning";
  return "normal";
}
function readingStatus() {
  const statuses = [
    classify("heart", current.heart), classify("spo2", current.spo2),
    classify("temp", current.temp), classify("systolic", current.systolic),
    classify("diastolic", current.diastolic)
  ];
  return statuses.includes("critical") ? "critical" : statuses.includes("warning") ? "warning" : "normal";
}
function setState(id, state) {
  const el = $(id);
  el.className = `state ${state}`;
  el.textContent = `● ${state.toUpperCase()}`;
}
function updateDashboard() {
  $("heartValue").textContent = current.heart;
  $("spo2Value").textContent = current.spo2;
  $("tempValue").textContent = current.temp.toFixed(1);
  $("bpValue").textContent = `${current.systolic}/${current.diastolic}`;
  setState("heartState", classify("heart", current.heart));
  setState("spo2State", classify("spo2", current.spo2));
  setState("tempState", classify("temp", current.temp));
  const bpStatus = [classify("systolic", current.systolic), classify("diastolic", current.diastolic)]
    .includes("critical") ? "critical" :
    ([classify("systolic", current.systolic), classify("diastolic", current.diastolic)].includes("warning") ? "warning" : "normal");
  setState("bpState", bpStatus);
  $("spo2Bar").style.width = `${Math.max(0, Math.min(100, current.spo2))}%`;
  $("tempMarker").style.left = `${Math.max(0, Math.min(100, (current.temp - 34) / 6 * 100))}%`;
  $("sysBar").style.width = `${Math.min(100, current.systolic / 180 * 100)}%`;
  $("diaBar").style.width = `${Math.min(100, current.diastolic / 120 * 100)}%`;
  const status = readingStatus();
  $("overallStatus").textContent = status.toUpperCase();
  $("overallStatus").style.color = status === "normal" ? "var(--green)" : status === "warning" ? "var(--orange)" : "var(--red)";
  $("statusDescription").textContent = status === "normal" ? "All monitored values in configured range" : status === "warning" ? "One or more values need review" : "Critical simulated value detected";
  $("lastUpdate").textContent = timeLabel();
}
function addAlert(level, title, detail) {
  const item = { level, title, detail, time: timeLabel() };
  alerts.unshift(item);
  alerts = alerts.slice(0, 20);
  renderAlerts();
}
function checkAlerts() {
  const labels = [
    ["heart", current.heart, "BPM"], ["spo2", current.spo2, "%"],
    ["temp", current.temp, "°C"], ["systolic", current.systolic, "mmHg"],
    ["diastolic", current.diastolic, "mmHg"]
  ];
  let found = false;
  labels.forEach(([key, value, unit]) => {
    const status = classify(key, value);
    if (status !== "normal") {
      found = true;
      const limit = LIMITS[key];
      const range = `${limit.low}–${limit.high}`;
      addAlert(status, `${status === "critical" ? "Critical" : "Warning"}: ${limit.label}`,
        `Simulated reading ${value}${unit}; configured reference range ${range}${unit}.`);
    }
  });
  if (!found) $("navAlertCount").textContent = alerts.length;
}
function renderAlerts() {
  $("navAlertCount").textContent = alerts.length;
  const list = $("alertList");
  if (!alerts.length) {
    list.innerHTML = '<div class="empty-state">✓ No alerts recorded in this session.</div>';
    return;
  }
  list.innerHTML = alerts.map(a => `
    <div class="alert-item ${a.level}">
      <span class="alert-indicator"></span>
      <div><strong>${escapeHTML(a.title)}</strong><small>${escapeHTML(a.detail)} · ${escapeHTML(a.time)}</small></div>
    </div>`).join("");
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}
function recordReading() {
  history.push({ ...current, time: timeLabel() });
  history = history.slice(-40);
  saveHistory();
  updateChart();
}
function updateChart() {
  if (!chart) return;
  const points = history.slice(-20);
  chart.data.labels = points.map(p => p.time);
  chart.data.datasets[0].data = points.map(p => p.heart);
  chart.update("none");
}
function applyReadings(values, source = "simulated") {
  current = values;
  updateDashboard();
  recordReading();
  checkAlerts();
  if (source === "manual") showToast("Manual readings applied to the dashboard.");
}
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function generateReadings() {
  // Mostly normal sample values, with occasional deliberately unusual values for demonstration.
  const makeAnomaly = Math.random() < 0.16;
  const anomalyType = randomBetween(0, 3);
  const next = {
    heart: randomBetween(65, 90),
    spo2: randomBetween(96, 100),
    temp: Number((Math.random() * 0.8 + 36.3).toFixed(1)),
    systolic: randomBetween(105, 125),
    diastolic: randomBetween(65, 82)
  };
  if (makeAnomaly) {
    if (anomalyType === 0) next.heart = randomBetween(105, 145);
    if (anomalyType === 1) next.spo2 = randomBetween(86, 93);
    if (anomalyType === 2) next.temp = Number((Math.random() * 2 + 38).toFixed(1));
    if (anomalyType === 3) { next.systolic = randomBetween(145, 190); next.diastolic = randomBetween(90, 125); }
  }
  applyReadings(next);
}
function resetNormal() {
  applyReadings({ heart: 72, spo2: 98, temp: 36.8, systolic: 118, diastolic: 78 });
  showToast("Readings reset to normal sample values.");
}
function applyManual() {
  const values = {
    heart: Number($("manualHeart").value),
    spo2: Number($("manualSpo2").value),
    temp: Number($("manualTemp").value),
    systolic: Number($("manualSys").value),
    diastolic: Number($("manualDia").value)
  };
  const valid = Object.entries(values).every(([key, value]) =>
    Number.isFinite(value) && value >= Number(document.getElementById(
      ({heart:"manualHeart",spo2:"manualSpo2",temp:"manualTemp",systolic:"manualSys",diastolic:"manualDia"})[key]
    ).min) && value <= Number(document.getElementById(
      ({heart:"manualHeart",spo2:"manualSpo2",temp:"manualTemp",systolic:"manualSys",diastolic:"manualDia"})[key]
    ).max));
  if (!valid) { showToast("Please enter valid values in all fields."); return; }
  applyReadings(values, "manual");
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function initChart() {
  if (!window.Chart) {
    $("heartChart").parentElement.innerHTML = '<div class="empty-state">Chart library could not load. Connect to the internet to view the graph.</div>';
    return;
  }
  const ctx = $("heartChart").getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, "rgba(67,217,232,.24)");
  gradient.addColorStop(1, "rgba(67,217,232,0)");
  chart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{ label: "Heart rate", data: [], borderColor: "#43d9e8", backgroundColor: gradient, fill: true, tension: .35, pointRadius: 2, pointBackgroundColor: "#a6f5f8", borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: "#10243a", titleColor: "#dcecf7", bodyColor: "#43d9e8", borderColor: "#29445e", borderWidth: 1 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#7189a1", maxTicksLimit: 7, font: { size: 9 } }, border: { display: false } },
        y: { min: 40, max: 160, grid: { color: "rgba(116,145,171,.12)" }, ticks: { color: "#7189a1", font: { size: 9 } }, border: { display: false } }
      }
    }
  });
  updateChart();
}
function updateMissionClock() {
  tick++;
  const total = 6 * 3600 + 42 * 60 + 10 + tick;
  const h = String(Math.floor(total / 3600) % 24).padStart(2, "0");
  const m = String(Math.floor(total / 60) % 60).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  $("missionClock").textContent = `DAY 018 · ${h}:${m}:${s}`;
}

$("generateBtn").addEventListener("click", generateReadings);
$("normalBtn").addEventListener("click", resetNormal);
$("applyBtn").addEventListener("click", applyManual);
$("pauseBtn").addEventListener("click", () => {
  paused = !paused;
  $("pauseBtn").textContent = paused ? "▶" : "Ⅱ";
  showToast(paused ? "Automatic simulation paused." : "Automatic simulation resumed.");
});
$("clearAlerts").addEventListener("click", () => { alerts = []; renderAlerts(); showToast("Alert log cleared."); });
document.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click", () => {
  document.querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
  link.classList.add("active");
}));

initChart();
if (!history.length) {
  history = Array.from({ length: 8 }, (_, i) => ({
    heart: [70, 73, 71, 76, 74, 78, 75, 72][i],
    spo2: 98, temp: 36.8, systolic: 118, diastolic: 78,
    time: new Date(Date.now() - (7 - i) * 60000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  }));
}
updateDashboard();
updateChart();
setInterval(() => {
  updateMissionClock();
  if (!paused) generateReadings();
}, 5000);
