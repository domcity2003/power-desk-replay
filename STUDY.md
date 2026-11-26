# A lower bill can hide a riskier schedule

**Decision memo · November 26, 2026**

## Keep the forecast-only schedule for now

Buying 5 extra MWh in every weekday peak hour cut the simulated buyer’s April–December energy cost by $52,452, or 0.15%. It raised the bill on 125 days and lowered it on 72. The two best days saved $65,778 between them. Remove both as a sensitivity check and the same rule costs $13,326 more than forecast only. Resampling the evaluation period in seven-day blocks gives a 95% interval of −$212,735 to +$56,078 for the total change, and 22% of resamples show no saving at all. The saving cannot be distinguished from zero. The forecast-only schedule is a better default on this evidence. Before changing it, test whether the result survives another year and compare the worst-day exposure the desk is willing to accept.

| Schedule | Total cost | Change vs forecast | Most expensive day | Mean of the 28 most expensive days | Cheaper / costlier days |
| --- | ---: | ---: | ---: | ---: | ---: |
| Forecast only | $34,841,716 | — | $385,147 | $299,851 | — |
| Fixed peak buffer | $34,789,264 | −$52,452 | $386,909 | $297,789 | 72 / 125 |
| Calibrated peak buffer | $34,809,326 | −$32,391 | $385,776 | $298,315 | 69 / 128 |

Dollar figures are rounded separately. Each rule’s 28 most expensive days are ranked independently. The fixed buffer lowered average cost on those expensive days but raised the single worst bill by $1,761. Raising the buffer to 10 MWh doubles the total cost difference and the worst penalty versus forecast only because the model assumes linear prices and identical demand across schedules.

## Follow the money to two hours

- **June 24, 18:00 Eastern.** Day ahead was $365.00/MWh and real time was $2,133.53/MWh. Buying five extra MWh day ahead shifted five MWh of exposure away from the higher real-time price, saving $8,842.65 in that hour. The rule saved $35,491.05 that day even though forecast usage at 18:00 already exceeded modeled consumption. The gain came from the price spread. It says nothing about improving the load forecast.
- **July 17, 18:00 Eastern.** Day ahead was $292.09/MWh and real time was $58.39/MWh. The same five MWh cost an extra $1,168.50 in that hour. Across the day, the fixed buffer cost $6,489.95 more than forecast only, its largest one-day penalty.

Open [the historical study](study.html) and select **Biggest saving** or **Biggest penalty** to see both days. The ledger shows exactly how the extra MWh and the price spread translate into dollars.

## How the comparison works

- Both prices come from NYISO’s official zonal exports for New York City (PTID 61761). Day-ahead and time-weighted real-time prices are paired by market date and hour. The importer checks the source headers, zone, timestamps, uniqueness, completeness, and cents precision. March 9 and November 2 are excluded because the clock changes leave a missing or repeated local hour. The study uses 89 calibration days and 274 evaluation days, covering 8,712 paired hourly observations.
- All three rules face the same fictional buyer with a 66–120 MWh weekday forecast, 10 MWh lower on weekends, and a deterministic meter error of –8 to +8 MWh. The forecast and error are independent of NYISO prices. Each hour costs scheduled MWh times the day-ahead price, plus the difference between usage and schedule times the real-time price. Under these assumptions, the cost effect of buying extra is exactly extra MWh times day-ahead minus real-time price, regardless of meter error.
- The fixed rule uses a 5 MWh buffer on weekdays from 07:00 up to 23:00 Eastern, with no holiday adjustment. The calibrated rule applies the same buffer only to hours where the mean January–March weekday real-time minus day-ahead spread was positive. Those hours are frozen before the April–December evaluation. The outlier check leaves the test set and rules intact and reports what two days contributed.
- This is an hourly, energy-only estimate for a price-taking buyer. It assumes the schedule clears at the published day-ahead price, balances all deviations at the integrated hourly price, and omits transmission, uplift, and other invoice items. The result comes from one location and one nine-month evaluation period. The fictional loads affect absolute cost and daily cost rankings. The comparison cannot establish real procurement savings.

## Reproduce

Open [study.html](study.html); the derived NYC price file is bundled in `data/`. To rebuild it, run `pwsh -File download-study.ps1`. The script fetches 12 monthly archives per feed and validates each input before it writes the dataset. Run `node --test` to check source handling, calibration, and the settlement math.

Source CSV fingerprint for inputs used in this memo (SHA-256)

`ae7b6ce7f20fa64a3c3e3f68d575b9aa86fe1d13de5f638338125116a1a06447`

[NYISO OASIS pricing exports](https://oasis.nyiso.com/) · [NYISO integrated real-time pricing](https://oasis.nyiso.com/RT_TW_LBMP_ZONE) · [NYISO accounting and billing manual](https://www.nyiso.com/documents/20142/2923231/acctbillmnl.pdf)
