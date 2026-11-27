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
  let result, worst, best, error;

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
    let fixed = 0, calibrated = 0, highLoad = 0;
    const points = [[0, 0, 0], ...days.map(day => [
      fixed += dayDelta(day, 1), calibrated += dayDelta(day, 2), highLoad += dayDelta(day, 3),
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
    const dashes = ["", 'stroke-dasharray="7 4" ', 'stroke-dasharray="1 6" stroke-linecap="round" '];
    const slopes = ["#216256", "#a74429", "#3b4f8f"].map((color, index) =>
      '<polyline fill="none" stroke="' + color + '" stroke-width="3" ' + dashes[index] + 'points="' +
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
    const peakRow = day.rows.reduce((largest, row) => row.actualMW > largest.actualMW ? row : largest);
    const highHours = day.rows.filter(row => row.highLoad).length;
    const load = " NYC load peaked at " + peakRow.actualMW.toLocaleString("en-US") + " MW at " + labelHour(peakRow.hour) +
      " ET against a " + peakRow.forecastMW.toLocaleString("en-US") + " MW forecast (" +
      (peakRow.actualMW >= peakRow.forecastMW ? "+" : "−") + Math.abs(peakRow.actualMW - peakRow.forecastMW).toLocaleString("en-US") +
      " MW). The high-load threshold was " + day.threshold.toLocaleString("en-US") + " MW and the rule fired in " + highHours + " hours.";
    $("day-note").textContent = "Fixed buffer " + exactDelta(dayDelta(day, 1)) +
      " · Calibrated buffer " + exactDelta(dayDelta(day, 2)) + " · High-load buffer " + exactDelta(dayDelta(day, 3)) + "." + load + (effect ? " Largest fixed-buffer move at " +
      labelHour(strongest.hour) + " ET: " + (strongest.scheduled[1] - strongest.forecast) +
      " extra MWh × " + priceFormatter.format((strongest.dayAhead - strongest.realTime) / 100) +
      "/MWh (day-ahead minus real-time) = " + exactDelta(effect) + "." : " The fixed buffer had no cost effect.");
    renderRows("study-hours", day.rows.map(row => [
      labelHour(row.hour), row.forecastMW.toLocaleString("en-US"), row.actualMW.toLocaleString("en-US"), row.forecast, row.used, priceFormatter.format(row.dayAhead / 100),
      priceFormatter.format(row.realTime / 100), row.scheduled[1] - row.forecast, exactDelta(row.costs[1] - row.costs[0]),
      row.scheduled[2] - row.forecast, exactDelta(row.costs[2] - row.costs[0]),
      row.scheduled[3] - row.forecast, exactDelta(row.costs[3] - row.costs[0]),
    ]));
  }

  // The forecast-error numbers describe the forecast-only schedule, so they do not depend on the buffer size.
  function renderImbalance(days) {
    if (!error) error = { ...MarketStudy.imbalance(days), baseline: MarketStudy.permutation(days) };
    const { baseline } = error;
    const beaten = Math.round((1 - baseline.shareAtLeastObserved) * baseline.draws);
    $("imbalance").textContent = "Forecast misses cost " + money(error.total) + " over " + days.length + " days (" +
      (100 * error.total / error.forecastOnlyCost).toFixed(2) + "% of the forecast-only bill). " +
      Math.round(100 * error.underForecastShare) + "% came from hours when the buyer used more than forecast. " +
      "The hourly miss and the real-time minus day-ahead spread have a correlation of " + error.correlation.toFixed(2) +
      " (rank correlation " + error.rankCorrelation.toFixed(2) + "). The costliest day was " + error.worstDay.date +
      " at " + money(error.worstDay.cost) + ".";
    $("permutation").textContent = "Shuffle the same misses across days within each hour of the day and the cost averages " +
      money(baseline.mean) + " (95% range " + delta(baseline.low) + " to " + delta(baseline.high) + ", " +
      baseline.draws.toLocaleString("en-US") + " seeded shuffles). The real figure was higher than " +
      (beaten === baseline.draws ? "all " : beaten.toLocaleString("en-US") + " of ") + baseline.draws.toLocaleString("en-US") + ".";
  }

  function renderStudy() {
    result = MarketStudy.evaluate(data, Number($("buffer").value));
    const { days, summary, hours } = result;
    // The headline tiles follow the high-load buffer, the rule the memo discusses.
    const lead = 3;
    const baseline = summary[0], rule = summary[lead];
    worst = days.reduce((max, day) => dayDelta(day, lead) > dayDelta(max, lead) ? day : max);
    best = days.reduce((min, day) => dayDelta(day, lead) < dayDelta(min, lead) ? day : min);
    $("worst").disabled = dayDelta(worst, lead) <= 0;
    $("best").disabled = dayDelta(best, lead) >= 0;
    $("day-count").textContent = days.length;
    $("net").textContent = delta(rule.total - baseline.total);
    $("net-detail").textContent = "High-load buffer vs forecast only";
    const changedDays = rule.lowerCostDays + rule.higherCostDays;
    $("loss-days").textContent = changedDays ? rule.higherCostDays + " / " + changedDays : "0";
    $("loss-detail").textContent = "Days when the high-load buffer changed cost";
    $("penalty").textContent = delta(dayDelta(worst, lead));
    $("penalty-date").textContent = dayDelta(worst, lead) > 0 ? worst.date + " · High-load buffer" : "No higher-cost day";
    const [first, second] = [...days].sort((a, b) => dayDelta(a, lead) - dayDelta(b, lead));
    const topTwo = dayDelta(first, lead) + dayDelta(second, lead);
    $("concentration").textContent = topTwo < 0
      ? "The high-load buffer saved " + money(-topTwo) + " across " + first.date + " and " + second.date +
        ". Without those dates, its total cost change was " + delta(rule.total - baseline.total - topTwo) + "."
      : "The high-load buffer produced no savings days.";
    const intervals = [3, 1, 2].filter(index => summary[index].total !== baseline.total).map(index => {
      const interval = MarketStudy.bootstrap(days, index);
      return summary[index].policy + " " + delta(interval.low) + " to " + delta(interval.high) +
        " (" + Math.round(interval.shareNotSaving * 100) + "% of resamples saved nothing)";
    });
    const note = document.createElement("p");
    note.className = "hour-review";
    note.textContent = intervals.length ? "95% intervals for the total change, resampling the test period in seven-day blocks: " +
      intervals.join(" · ") + "." : "";
    $("uncertainty").replaceChildren(...(intervals.length ? [note] : []));
    $("high-load-hours").textContent = result.highLoadHours.toLocaleString("en-US") + " of " + (days.length * 24).toLocaleString("en-US") + " evaluation hours";
    renderImbalance(days);
    const enabledHours = hours.flatMap((enabled, hour) => enabled ? [labelHour(hour)] : []);
    $("calibrated-hours").textContent = enabledHours.length ? enabledHours.join(", ") + " ET." : "No hours qualified.";
    renderRows("scorecard", summary.map((item, index) => [
      item.policy, money(item.total), delta(item.total - baseline.total), money(item.worst),
      money(item.tailMean), index ? item.lowerCostDays + " / " + item.higherCostDays : "—",
    ]));
    const months = new Map();
    for (const day of days) {
      const month = day.date.slice(0, 7);
      const sums = months.get(month) || [0, 0, 0];
      months.set(month, sums.map((sum, index) => sum + dayDelta(day, index + 1)));
    }
    renderRows("months", Array.from(months, ([month, sums]) => [month, ...sums.map(delta)]));
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
    const header = "date,forecast_only_usd,fixed_peak_usd,calibrated_peak_usd,high_load_usd,fixed_change_usd,calibrated_change_usd,high_load_change_usd,imbalance_usd,high_load_hours,high_load_threshold_mw";
    const lines = result.days.map(day => [
      day.date, ...[...day.costs, dayDelta(day, 1), dayDelta(day, 2), dayDelta(day, 3),
        day.rows.reduce((sum, row) => sum + (row.used - row.forecast) * (row.realTime - row.dayAhead), 0)]
        .map(cents => (cents / 100).toFixed(2)),
      day.rows.filter(row => row.highLoad).length, day.threshold,
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
