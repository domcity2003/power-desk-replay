"use strict";

const byId = id => document.getElementById(id);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd = cents => cents == null ? "—" : money.format(cents / 100);
const signedUsd = cents => (cents > 0 ? "+" : "") + usd(cents);
const time = hour => String(hour).padStart(2, "0") + ":00";
const baseline = PowerDesk.ledger(scenarios[0].inputs);
const reviews = new Map(scenarios.map(scenario => [scenario.id, PowerDesk.createReview(scenario, baseline.rows)]));
const scenarioButtons = [...document.querySelectorAll("[data-scenario]")];
const nameField = byId("reviewer");
const signButton = byId("sign-form").querySelector("button");
const canvas = byId("price-chart");
let activeScenario = "normal";
let selectedHour = 18;
let snapshot;

function showScenario() {
  snapshot = reviews.get(activeScenario).snapshot();
  const { total, issues, drivers, reviewer, events, rows } = snapshot;
  const difference = total === null ? null : total - baseline.total;
  const status = byId("status");
  status.className = issues.length ? "hold" : "cleared";
  status.textContent = issues.length ? "On hold" : reviewer ? "Signed off" : "Ready for review";
  byId("total").textContent = total === null ? "Withheld" : usd(total);
  byId("baseline").textContent = usd(baseline.total);
  byId("variance").textContent = difference === null ? "Resolve the input issues to see the total." : signedUsd(difference) + " vs. normal day";
  byId("review-summary").textContent = issues.length
    ? `${issues.length} unresolved input ${issues.length === 1 ? "issue" : "issues"}. Sign-off is blocked.`
    : reviewer ? `Signed off by ${reviewer}.` : "All 24 hours have one valid value per input. Review the cost before signing.";

  for (const button of scenarioButtons) button.setAttribute("aria-pressed", button.dataset.scenario === activeScenario);
  const labels = ["Day-ahead price", "Scheduled volume", "Real-time price", "Volume above or below schedule"];
  byId("drivers").innerHTML = drivers ? [...labels, "Net cost change"].map((label, index) =>
    `<div><dt>${label}</dt><dd>${signedUsd(index === 4 ? difference : drivers[index])}</dd></div>`).join("") : "";
  byId("driver-note").textContent = drivers
    ? "Compares the same hours. Within each cost component, the price change is counted first, then the change in volume."
    : "The cost breakdown is available when all 24 hours are clear.";

  const scenario = scenarios.find(item => item.id === activeScenario);
  const issueList = byId("issues");
  issueList.replaceChildren();
  for (const { hour, field, label, reason, values } of issues) {
    const replacement = scenario.repairs.find(item => item.hour === hour && item.field === field);
    const issue = document.createElement("div");
    issue.className = "issue";
    const description = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = `${time(hour)} · ${reason} ${label.toLowerCase()}`;
    const detail = document.createElement("p");
    const observed = values.length ? values.map(value => formatInput(field, value)).join(" and ") : "No record";
    detail.textContent = `${observed}. ${replacement.source} supplies ${formatInput(field, replacement.value)}.`;
    description.append(heading, detail);
    const button = document.createElement("button");
    button.className = "button";
    button.type = "button";
    button.textContent = field === "schedule" ? "Use confirmed schedule" : "Restore demo price";
    button.addEventListener("click", () => {
      if (!reviews.get(activeScenario).repair(hour, field)) return;
      selectedHour = hour;
      showScenario();
      (issueList.querySelector("button") ?? nameField).focus();
    });
    issue.append(description, button);
    issueList.append(issue);
  }

  byId("sign-form").hidden = Boolean(reviewer);
  nameField.disabled = signButton.disabled = Boolean(issues.length || reviewer);
  byId("export").disabled = !reviewer;
  byId("review-log").hidden = events.length === 0;
  byId("events").replaceChildren(...events.map(event => {
    const item = document.createElement("li");
    const previous = event.values?.map(value => formatInput(event.field, value)).join(" / ");
    item.textContent = event.type === "sign" ? `Signed off by ${event.name}.`
      : `${time(event.hour)} · ${event.label}: ${previous || "missing"} → ${formatInput(event.field, event.value)} (${event.source}).`;
    return item;
  }));

  byId("hourly").innerHTML = rows.map(row => `<tr data-hour="${row.hour}" class="${row.cost === null ? "blocked" : ""}">
    <td><button type="button" aria-label="Review ${time(row.hour)} ET">${time(row.hour)}</button></td>
    <td>${row.schedule ?? "—"}</td><td>${row.usage ?? "—"}</td>
    <td>${usd(row.dayAhead)}</td><td>${usd(row.realTime)}</td><td>${usd(row.dayAheadCost)}</td>
    <td>${usd(row.balancingCost)}</td><td>${usd(row.cost)}</td></tr>`).join("");
  showHour();
}

function formatInput(field, value) {
  return field === "schedule" || field === "usage" ? `${value} MWh` : `${usd(value)}/MWh`;
}

function showHour() {
  const row = snapshot.rows[selectedHour];
  byId("hour-title").textContent = `${time(selectedHour)} ET · ${row.cost === null ? "Cost withheld" : usd(row.cost)}`;
  byId("hour-detail").textContent = row.cost === null
    ? snapshot.issues.filter(issue => issue.hour === selectedHour).map(issue => `${issue.reason} ${issue.label.toLowerCase()}`).join(". ") + ". See input review."
    : `${row.schedule} MWh × ${usd(row.dayAhead)} day-ahead + (${row.usage} − ${row.schedule}) MWh × ${usd(row.realTime)} real-time. ${signedUsd(row.cost - baseline.rows[selectedHour].cost)} vs. this hour on the normal day.`;
  for (const tr of byId("hourly").rows) {
    const selected = Number(tr.dataset.hour) === selectedHour;
    tr.classList.toggle("selected", selected);
    tr.querySelector("button").setAttribute("aria-pressed", selected);
  }
  drawChart();
}

function drawChart() {
  const { width, height } = canvas.getBoundingClientRect();
  if (!snapshot || width === 0 || height === 0) return;
  const dpi = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpi);
  canvas.height = Math.round(height * dpi);
  const context = canvas.getContext("2d");
  context.scale(dpi, dpi);
  const left = 37;
  const right = width - 17;
  const top = 10;
  const bottom = height - 24;
  const prices = snapshot.rows.flatMap(row => [row.dayAhead, row.realTime]).filter(value => value !== null);
  const step = Math.max(...prices) > 10000 ? 100 : 25;
  const min = Math.min(0, Math.floor(Math.min(...prices) / 100 / step) * step);
  const max = Math.max(step, Math.ceil(Math.max(...prices) / 100 / step) * step);
  const x = hour => left + hour / 23 * (right - left);
  const y = dollars => bottom - (dollars - min) / (max - min) * (bottom - top);
  context.font = '11px "Segoe UI", sans-serif';
  context.fillStyle = "#4f6265";
  context.textAlign = "right";
  for (let mark = min; mark <= max; mark += step) {
    context.strokeStyle = mark === 0 ? "#a2b0a8" : "#d9dfd9";
    context.beginPath();
    context.moveTo(left, y(mark));
    context.lineTo(right, y(mark));
    context.stroke();
    context.fillText(String(mark), left - 7, y(mark) + 3);
  }
  context.textAlign = "center";
  for (const hour of [0, 6, 12, 18, 23]) context.fillText(time(hour), x(hour), height - 5);
  context.strokeStyle = "#84958a";
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(x(selectedHour), top);
  context.lineTo(x(selectedHour), bottom);
  context.stroke();
  context.setLineDash([]);
  for (const [field, color] of [["dayAhead", "#437a72"], ["realTime", "#a74429"]]) {
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    let previous = false;
    for (const row of snapshot.rows) {
      if (row[field] !== null) {
        const command = previous ? "lineTo" : "moveTo";
        context[command](x(row.hour), y(row[field] / 100));
      }
      previous = row[field] !== null;
    }
    context.stroke();
    const selected = snapshot.rows[selectedHour][field];
    if (selected === null) continue;
    context.fillStyle = color;
    context.beginPath();
    context.arc(x(selectedHour), y(selected / 100), 4, 0, 2 * Math.PI);
    context.fill();
  }
}

for (const button of scenarioButtons) button.addEventListener("click", () => {
  if (activeScenario === button.dataset.scenario) return;
  activeScenario = button.dataset.scenario;
  selectedHour = 18;
  nameField.value = "";
  nameField.setCustomValidity("");
  showScenario();
});
byId("hourly").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  selectedHour = Number(button.closest("tr").dataset.hour);
  showHour();
  byId("hour-title").tabIndex = -1;
  byId("hour-title").focus();
});
canvas.addEventListener("click", event => {
  const bounds = canvas.getBoundingClientRect();
  selectedHour = Math.max(0, Math.min(23, Math.round((event.clientX - bounds.left - 37) * 23 / (bounds.width - 54))));
  showHour();
});
byId("sign-form").addEventListener("submit", event => {
  event.preventDefault();
  if (reviews.get(activeScenario).sign(nameField.value)) {
    showScenario();
    byId("export").focus();
  } else {
    nameField.setCustomValidity("Enter a reviewer name.");
    nameField.reportValidity();
  }
});
nameField.addEventListener("input", () => nameField.setCustomValidity(""));
byId("export").addEventListener("click", () => {
  const csv = reviews.get(activeScenario).csv();
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `power-desk-${activeScenario}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
new ResizeObserver(drawChart).observe(canvas);
showScenario();
