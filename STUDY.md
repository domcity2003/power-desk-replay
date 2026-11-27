# Forecast misses cluster with price spikes

**Decision memo · November 26, 2026**

## Keep the forecast-only schedule; trial the high-load buffer on paper

The simulated buyer takes 1.5% of real New York City zone load, which averaged 87 MWh an hour. Over April–December 2025 its forecast misses cost **$182,900** (0.54% of a $33.9M energy bill). That is about twice what the best buffer rule saved, and it is not random. Shuffle the same misses across days within each hour and the cost averages $8,917. The real figure beat all 2,000 shuffles. Load beat forecast when real-time prices spiked.

The rule that targets those hours did best. The **High-load buffer** adds 5 MWh whenever the day-ahead NYC load forecast is above the 90th percentile of the previous 28 days. It cut cost by $93,027 (0.27%), against $52,452 for the fixed peak buffer and $32,391 for the calibrated one. Its 95% interval runs from −$254,529 to +$10,917, and 5% of resamples show no saving. That is close, but it is not enough. Two heat-wave days, June 24 and July 1, delivered $65,578 of the saving. Without them the rule is still $27,449 ahead, yet it raised the bill on 73 of the 117 days it changed. One summer of weather cannot carry a change to the default. Keep forecast-only, run the high-load buffer as a paper schedule through summer 2026, and compare it with realised cost before moving any volume.

| Schedule | Total cost | Change vs forecast | Most expensive day | Mean of the 28 most expensive days | Cheaper / costlier days |
| --- | ---: | ---: | ---: | ---: | ---: |
| Forecast only | $33,919,946 | — | $554,861 | $337,772 | — |
| Fixed peak buffer | $33,867,494 | −$52,452 | $519,370 | $335,443 | 72 / 125 |
| Calibrated peak buffer | $33,887,556 | −$32,391 | $528,937 | $335,952 | 69 / 128 |
| High-load buffer | $33,826,919 | −$93,027 | $519,204 | $335,078 | 44 / 73 |

Dollar figures are rounded separately. Each rule’s 28 most expensive days are ranked independently. The most expensive day under every rule was June 24, and every buffer lowered that bill. Raising the buffer to 10 MWh doubles the fixed rule’s difference because prices are linear in the model. Intervals use seven-day block resampling (20,000 draws, fixed seed). Fixed: −$212,735 to +$56,078, with 22% of resamples showing no saving. Calibrated: −$140,913 to +$42,041, with 25%. High-load: −$254,529 to +$10,917, with 5%.

## Why real load matters

With linear prices, an extra MWh bought day ahead changes cost by exactly extra MWh × (day-ahead − real-time price). Load does not appear in that term, so the fixed and calibrated buffer results are the same as they were with the fictional load in earlier versions of this study. Real load matters in two places: when the high-load rule fires, and what the forecast misses cost.

Forecast-only cost splits exactly into used MWh × day-ahead price plus (used − forecast) MWh × (real-time − day-ahead price). Call the second term the imbalance cost. Over 6,576 evaluation hours:

- **Imbalance cost: $182,900.** $151,243, or 83%, came from the 3,786 hours when the buyer used more than forecast. NYC load ran 63 MW above forecast on average, so the buyer used 0.95 MWh an hour more than it scheduled.
- **Correlation with the spread.** The hourly miss (used − forecast) and the spread (real time − day ahead) correlate at 0.11, and 0.25 by rank. That looks small, but spreads are fat-tailed and the largest ones are where the misses line up.
- **Worst day: June 24, $46,854.** It was also the most expensive forecast-only day. The three costliest days (June 24, June 25, July 1) make up 60% of the total. Remove them and the remaining $72,508 still sits above every shuffle (shuffled mean −$6,443, 95% range −$33,257 to +$22,096).
- **Independent-error baseline.** The permutation keeps each hour’s misses and the prices exactly as they were and breaks only their pairing across days. Mean $8,917, 95% range −$34,908 to +$53,004, 2,000 draws, fixed seed.

## Follow the money to two days

- **June 24, 18:00 Eastern.** NYC load reached 10,619 MW against a 10,188 MW forecast. The buyer used 159 MWh after scheduling 153. Day ahead was $365.00/MWh and real time was $2,133.53/MWh, so the 6 MWh miss cost $10,611.18 in that hour. The forecast was far above the day’s 7,373 MW threshold, so the high-load rule was buying extra, and it saved $35,657 over the day.
- **July 17, 18:00 Eastern.** Day ahead was $292.09/MWh and real time was $58.39/MWh. The high-load rule fired in 11 hours and cost $6,135.80 more than forecast only, its largest one-day penalty. The buyer used 3 MWh more than forecast, but real time was cheaper, so that miss saved $701.10.

Open [the historical study](study.html) and select **Biggest saving** or **Biggest penalty**. The ledger shows forecast and actual load, the extra MWh for each rule, and the dollar effect hour by hour.

## How the comparison works

- **Prices.** NYISO’s day-ahead and integrated real-time zonal LBMP exports for New York City (PTID 61761), paired by market date and hour.
- **Load.** Integrated real-time actual load for N.Y.C. (PTID 61761) from the NYISO `palIntegrated` reports, and the N.Y.C. column of the NYISO load forecast (`isolf`) files. Both are rounded to whole MW.
- **Forecast timing.** For market day D the model uses the forecast for D taken from the file issued on D−1. Day-ahead bids are due the morning before, so the D−1 forecast approximates what a scheduler would have had. A scheduler might have had a fresher forecast, which this does not capture. January 1 uses the December 31, 2024 file.
- **Buyer.** usage = round(actual NYC MW × 0.015) MWh and forecast = round(forecast NYC MW × 0.015) MWh. The 1.5% share is an assumption that gives a mid-sized buyer, averaging 87 MWh an hour (range 55 to 162). Whole MWh keep every cost in integer cents. The earlier synthetic profile and meter error are gone.
- **Rules.** Forecast only buys the forecast. The fixed rule adds 5 MWh on weekdays from 07:00 up to 23:00 Eastern, with no holiday adjustment. The calibrated rule adds it only in peak weekday hours where the January–March mean real-time minus day-ahead spread was positive, frozen before April. The high-load rule adds 5 MWh in any hour, on any day, whose D−1 NYC forecast exceeds the nearest-rank 90th percentile of the NYC hourly forecasts for the 28 calendar days before D. Early April uses March history. It uses nothing from D or later, and a test checks that. It fired in 976 of the 6,576 evaluation hours.
- **Data checks.** The importer checks headers, zone, timestamps, uniqueness, 24 hours a day, and numeric values in all four sources. March 9 and November 2 are excluded because the clock changes leave a missing or repeated local hour. The study uses 89 calibration days and 274 evaluation days, covering 8,712 hourly observations.

## Assumptions and limits

- This is an hourly, energy-only estimate for a price-taking buyer. The schedule clears at the published day-ahead price. All deviations settle at the integrated hourly real-time price. Transmission, uplift, hedges, and other invoice items are omitted.
- The buyer is a slice of the whole zone, so it inherits zone-level forecast misses. A real buyer’s forecast would differ.
- The forecast ran low by 1.1% on average. How much of that is genuine forecast bias, and how much comes from the forecast and the integrated load not being defined identically, is not tested here.
- One zone and one nine-month period. The result leans on June and July heat. A year with a cold snap, or a summer without a heat wave, could look different.
- The permutation keeps each hour’s miss distribution and the prices fixed. It does not model weather, which drives both load and price.

## Reproduce

Open [study.html](study.html); the derived NYC dataset is bundled in `data/`. To rebuild it on Windows, install Node.js 22+ and run `powershell -ExecutionPolicy Bypass -File download-study.ps1`. The script fetches monthly archives for each feed (12 each for prices and actual load, 13 for the forecast), validates every input, and writes the dataset. Run `node --test` to check parsing, forecast timing, the cost identity, the no-lookahead rule, seeded resampling, and the headline totals.

Source CSV fingerprint for inputs used in this memo (SHA-256)

`1b793b15035d484a22e134360b5f7d5377f5fcce8571fef0dc7273feab15ec8e`

Sources: [NYISO public reports](https://mis.nyiso.com/public/) (day-ahead and real-time LBMP `damlbmp` and `rtlbmp`, integrated real-time actual load `palIntegrated`, load forecast `isolf`) · [NYISO accounting and billing manual](https://www.nyiso.com/documents/20142/2923231/acctbillmnl.pdf)
