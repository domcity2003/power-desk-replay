"use strict";

const scenarios = (() => {
  const dayAhead = [29, 27, 25, 25, 27, 33, 39, 45, 44, 40, 35, 32, 31, 30, 31, 34, 38, 42, 40, 43, 40, 36, 33, 30];
  const realTime = [28, 24, 21, 20, 26, 36, 47, 58, 49, 35, 29, 23, 18, -8, 17, 31, 41, 61, 55, 53, 45, 40, 34, 31];
  const usage = [92, 90, 87, 88, 93, 98, 103, 110, 109, 102, 98, 95, 95, 94, 94, 97, 101, 105, 110, 106, 104, 100, 96, 94];
  const coldRealTime = [39, 32, 31, 31, 34, 48, 92, 143, 108, 59, 52, 41, 38, 33, 42, 56, 91, 213, 480, 196, 128, 75, 59, 46];
  const rows = values => values.map((value, hour) => ({ hour, value }));
  const normal = {
    schedule: rows(usage.map(() => 100)),
    usage: rows(usage),
    dayAhead: rows(dayAhead.map(price => price * 100)),
    realTime: rows(realTime.map(price => price * 100)),
  };
  const cold = {
    schedule: rows(usage.map((_, hour) => hour >= 16 && hour <= 20 ? 108 : 104)),
    usage: rows(usage.map((amount, hour) => amount + (hour === 18 ? 20 : coldRealTime[hour] >= 100 ? 13 : 7))),
    dayAhead: rows(dayAhead.map((price, hour) => (price + (hour === 18 ? 32 : coldRealTime[hour] >= 100 ? 24 : 10)) * 100)),
    realTime: rows(coldRealTime.map(price => price * 100)),
  };
  const broken = structuredClone(cold);
  broken.realTime = broken.realTime.filter(row => row.hour !== 18);
  broken.schedule.push({ hour: 17, value: 112 });
  return [
    { id: "normal", title: "Normal day", inputs: normal, repairs: [] },
    { id: "cold", title: "Cold snap", inputs: cold, repairs: [] },
    { id: "broken", title: "Broken inputs", inputs: broken, repairs: [
      { hour: 17, field: "schedule", value: 108, source: "Confirmed demo schedule" },
      { hour: 18, field: "realTime", value: 48000, source: "Verified demo price record" },
    ] },
  ];
})();

if (typeof module !== "undefined") module.exports = scenarios;
