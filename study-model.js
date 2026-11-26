"use strict";

const MarketStudy = (() => {
  const { calculate } = typeof module === "undefined" ? PowerDesk : require("./model");
  const policies = ["Forecast only", "Fixed peak buffer", "Calibrated peak buffer"];
  const amounts = [0, 5, 10];
  const peak = hour => hour >= 7 && hour < 23;
  const weekday = date => {
    const day = new Date(date + "T00:00:00Z").getUTCDay();
    return day >= 1 && day <= 5;
  };
  const profile = [72, 69, 67, 66, 68, 73, 82, 93, 101, 104, 105, 105,
    104, 104, 106, 110, 115, 119, 120, 117, 110, 99, 87, 78];

  function fit(days) {
    const byHour = Array(24).fill(0);
    for (const { date, prices } of days) {
      if (!weekday(date)) continue;
      prices.forEach(([dayAhead, realTime], hour) => { byHour[hour] += realTime - dayAhead; });
    }
    return byHour.map((spread, hour) => peak(hour) && spread > 0 ? 1 : 0);
  }

  function runDay({ date, prices }, hours, bufferMWh) {
    const workday = weekday(date);
    const dayNumber = Date.parse(date + "T00:00:00Z") / 86400000;
    const rows = prices.map(([dayAhead, realTime], hour) => {
      const forecast = profile[hour] - (workday ? 0 : 10);
      // Deterministic meter error, independent of prices. It is revealed only at settlement.
      const error = (Math.imul(dayNumber * 24 + hour, 2654435761) >>> 16) % 17 - 8;
      const used = forecast + error;
      const scheduled = [
        forecast, forecast + (workday && peak(hour) ? bufferMWh : 0),
        forecast + (workday ? hours[hour] * bufferMWh : 0),
      ];
      const costs = scheduled.map(schedule => calculate({ schedule, usage: used, dayAhead, realTime }).cost);
      return { hour, forecast, used, dayAhead, realTime, scheduled, costs };
    });
    const costs = policies.map((_, index) => rows.reduce((sum, row) => sum + row.costs[index], 0));
    return { date, rows, costs };
  }

  function summarize(days) {
    const tailCount = Math.ceil(days.length * 0.1);
    return policies.map((policy, index) => {
      const ranked = days.map(day => day.costs[index]).sort((a, b) => b - a);
      const total = ranked.reduce((sum, cost) => sum + cost, 0);
      return {
        policy, total, worst: ranked[0],
        tailMean: ranked.slice(0, tailCount).reduce((sum, cost) => sum + cost, 0) / tailCount,
        lowerCostDays: days.filter(day => day.costs[index] < day.costs[0]).length,
        higherCostDays: days.filter(day => day.costs[index] > day.costs[0]).length,
      };
    });
  }

  function evaluate(data, bufferMWh = 5) {
    if (!amounts.includes(bufferMWh)) throw new Error("Unknown buffer size.");
    const { calibration, evaluation } = data;
    if (!calibration.length || !evaluation.length || calibration.at(-1).date >= evaluation[0].date) {
      throw new Error("Calibration must precede the evaluation period.");
    }
    const hours = fit(calibration);
    const days = evaluation.map(day => runDay(day, hours, bufferMWh));
    return { hours, days, summary: summarize(days) };
  }

  // Moving-block bootstrap of the total change versus forecast only. Seven-day blocks keep
  // weekly and weather-driven runs of price spikes together. The seeded generator makes the
  // interval reproducible.
  function bootstrap(days, index, { draws = 20000, block = 7, seed = 12345 } = {}) {
    const deltas = days.map(day => day.costs[index] - day.costs[0]);
    const n = deltas.length;
    let state = seed;
    const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    const totals = [];
    for (let draw = 0; draw < draws; draw++) {
      let total = 0;
      for (let filled = 0; filled < n;) {
        const start = Math.floor(random() * (n - block + 1));
        for (let step = 0; step < block && filled < n; step++, filled++) total += deltas[start + step];
      }
      totals.push(total);
    }
    totals.sort((a, b) => a - b);
    return {
      low: totals[Math.floor(draws * 0.025)],
      high: totals[Math.floor(draws * 0.975)],
      shareNotSaving: totals.filter(total => total >= 0).length / draws,
    };
  }

  return { policies, amounts, evaluate, bootstrap };
})();

if (typeof module !== "undefined") module.exports = MarketStudy;
