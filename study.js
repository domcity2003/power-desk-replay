"use strict";

if (globalThis.marketStudyData) {
  const data = globalThis.marketStudyData;
  const $ = id => document.getElementById(id);
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const money = cents => formatter.format(cents / 100);
  const delta = cents => (cents > 0 ? "+" : "") + money(cents);
  const exactDelta = cents => (cents > 0 ? "+" : "") + priceFormatter.format(cents / 100);
  const labelHour = hour => String(hour).padStart(2, "0") + ":00";
  const dayDelta = (day, index) => day.costs[index] - day.costs[0];
  let result, worst, best;

  function renderRows(id, rows) {
    $(id).replaceChildren(...rows.map(values => {
      const row = document.createElement("tr");
      values.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      return row;
    }));
  }

  function renderCurve(days) {
    let fixed = 0, calibrated = 0;
    const points = [[0, 0], ...days.map(day => [
      fixed += dayDelta(day, 1), calibrated += dayDelta(day, 2),
    ])];
    const values = points.flat();
    const low = Math.min(...values, -100);
    const high = Math.max(...values, 100);
    const y = value => 13 + 172 * (high - value) / (high - low);
    const x = i => 103 + 723 * i / days.length;
    const guides = [high, 0, low / 2, low].filter(value => value === 0 || Math.abs(y(value) - y(0)) >= 22);
    const axes = guides.map(value =>
      '<line x1="100" y1="' + y(value) + '" x2="826" y2="' + y(value) +
      '" stroke="' + (value === 0 ? "#697c77" : "#d9dfd9") + '"/>' +
      '<text x="0" y="' + (y(value) + 5) + '">' + delta(value) + '</text>'
    );
    const slopes = ["#216256", "#a74429"].map((color, index) =>
      '<polyline fill="none" stroke="' + color + '" stroke-width="3" ' +
      (index ? 'stroke-dasharray="7 4" ' : '') + 'points="' +
      points.map((pair, i) => x(i).toFixed(1) + "," + y(pair[index]).toFixed(1)).join(" ") + '"/>'
    );
    const monthNames = { "04": "Apr", "06": "Jun", "08": "Aug", "10": "Oct", "12": "Dec" };
    const ticks = days.map((day, i) => {
      const name = monthNames[day.date.slice(5, 7)];
      return name && day.date.endsWith("-01") ? '<text x="' + x(i) + '" y="218">' + name + '</text>' : "";
    });
    $("curve").innerHTML = [...axes, ...slopes, ...ticks].join("");
  }

  function renderDate() {
    const day = result.days.find(item => item.date === $("study-date").value);
    const strongest = day.rows.reduce((largest, row) =>
      Math.abs(row.costs[1] - row.costs[0]) > Math.abs(largest.costs[1] - largest.costs[0]) ? row : largest
    );
    const effect = strongest.costs[1] - strongest.costs[0];
    $("day-note").textContent = "Fixed buffer " + exactDelta(dayDelta(day, 1)) +
      " · Calibrated buffer " + exactDelta(dayDelta(day, 2)) + (effect ? ". Largest fixed-buffer move at " +
      labelHour(strongest.hour) + " ET: " + (strongest.scheduled[1] - strongest.forecast) +
      " extra MWh × " + priceFormatter.format((strongest.dayAhead - strongest.realTime) / 100) +
      "/MWh (day-ahead minus real-time) = " + exactDelta(effect) + "." : ". The fixed buffer had no cost effect.");
    renderRows("study-hours", day.rows.map(row => [
      labelHour(row.hour), row.forecast, row.used, priceFormatter.format(row.dayAhead / 100),
      priceFormatter.format(row.realTime / 100), row.scheduled[1] - row.forecast, exactDelta(row.costs[1] - row.costs[0]),
      row.scheduled[2] - row.forecast, exactDelta(row.costs[2] - row.costs[0]),
    ]));
  }

  function renderStudy() {
    result = MarketStudy.evaluate(data, Number($("buffer").value));
    const { days, summary, hours } = result;
    const [baseline, fixed] = summary;
    worst = days.reduce((max, day) => dayDelta(day, 1) > dayDelta(max, 1) ? day : max);
    best = days.reduce((min, day) => dayDelta(day, 1) < dayDelta(min, 1) ? day : min);
    $("worst").disabled = dayDelta(worst, 1) <= 0;
    $("best").disabled = dayDelta(best, 1) >= 0;
    $("day-count").textContent = days.length;
    $("net").textContent = delta(fixed.total - baseline.total);
    $("net-detail").textContent = "Fixed buffer vs forecast only";
    const changedDays = fixed.lowerCostDays + fixed.higherCostDays;
    $("loss-days").textContent = changedDays ? fixed.higherCostDays + " / " + changedDays : "0";
    $("loss-detail").textContent = "Days when the fixed buffer changed cost";
    $("penalty").textContent = delta(dayDelta(worst, 1));
    $("penalty-date").textContent = dayDelta(worst, 1) > 0 ? worst.date + " · Fixed buffer" : "No higher-cost day";
    const [first, second] = [...days].sort((a, b) => dayDelta(a, 1) - dayDelta(b, 1));
    const topTwo = dayDelta(first, 1) + dayDelta(second, 1);
    $("concentration").textContent = topTwo < 0
      ? "The fixed buffer saved " + money(-topTwo) + " across " + first.date + " and " + second.date +
        ". Without those dates, its total cost change was " + delta(fixed.total - baseline.total - topTwo) + "."
      : "The fixed buffer produced no savings days.";
    const enabledHours = hours.flatMap((enabled, hour) => enabled ? [labelHour(hour)] : []);
    $("calibrated-hours").textContent = enabledHours.length ? enabledHours.join(", ") + " ET." : "No hours qualified.";
    renderRows("scorecard", summary.map((item, index) => [
      item.policy, money(item.total), delta(item.total - baseline.total), money(item.worst),
      money(item.tailMean), index ? item.lowerCostDays + " / " + item.higherCostDays : "—",
    ]));
    const months = new Map();
    for (const day of days) {
      const month = day.date.slice(0, 7);
      const [fixedDelta, calibratedDelta] = months.get(month) || [0, 0];
      months.set(month, [fixedDelta + dayDelta(day, 1), calibratedDelta + dayDelta(day, 2)]);
    }
    renderRows("months", Array.from(months, ([month, [fixedDelta, calibratedDelta]]) => [
      month, delta(fixedDelta), delta(calibratedDelta),
    ]));
    renderCurve(days);
    if (!$("study-date").value) {
      $("study-date").replaceChildren(...days.map(day => new Option(day.date, day.date)));
      $("study-date").value = worst.date;
    }
    renderDate();
  }

  $("buffer").addEventListener("change", renderStudy);
  $("study-date").addEventListener("change", renderDate);
  $("worst").addEventListener("click", () => { $("study-date").value = worst.date; renderDate(); });
  $("best").addEventListener("click", () => { $("study-date").value = best.date; renderDate(); });
  $("study-export").addEventListener("click", () => {
    const header = "date,forecast_only_usd,fixed_peak_usd,calibrated_peak_usd,fixed_change_usd,calibrated_change_usd";
    const lines = result.days.map(day => [
      day.date, ...[...day.costs, dayDelta(day, 1), dayDelta(day, 2)].map(cents => (cents / 100).toFixed(2)),
    ].join(","));
    const url = URL.createObjectURL(new Blob([[header, ...lines].join("\r\n") + "\r\n"], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nyiso-scheduling-" + $("buffer").value + "mwh.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  renderStudy();
  $("data-needed").hidden = true;
  $("results").hidden = false;
}
