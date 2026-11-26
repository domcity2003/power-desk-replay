# Power Desk Replay

An analyst reviewing yesterday’s electricity cost needs to explain the expensive hours and know when to hold the report. This browser demo walks through that review for a fictional power buyer at PJM Western Hub.

## Try the review

Open [index.html](index.html) from the project folder in a current browser. The demo runs locally with no install.

1. Choose **Cold snap**. At 18:00 Eastern, the buyer used 130 MWh after scheduling 108 MWh. The extra 22 MWh at $480/MWh cost $10,560. Add $7,776 for the day-ahead purchase and the hour comes to **$18,336**.
2. Choose **Broken inputs**. The daily total is withheld. In **Input review & sign-off**, apply the confirmed 17:00 schedule and then restore the 18:00 demo price. With only one correction, the report stays on hold.
3. Sign off with a name and download the hourly CSV. The two corrections and the sign-off appear in the review history. Reloading the page starts a fresh review.

## How the estimate works

Each hour includes the scheduled purchase at the day-ahead price and the difference between usage and schedule at the real-time price. A price spike can pass review if its input record is present and valid. The change versus the normal day is split into price and volume effects for each purchase component. The calculation applies the price change first, so the volume effect includes the interaction between the two.

All bundled prices, volumes, and correction records are fictional. Winter Storm Fern provided the context for the cold-weather case. The model estimates hourly energy costs. PJM settles real time in five-minute intervals and its bills include additional charges. [PJM winter operations review](https://insidelines.pjm.com/pjm-reviews-january-cold-weather-operations/) · [PJM settlement manual](https://www.pjm.com/-/media/DotCom/documents/manuals/m28.ashx)

## Check the math

From the project folder, run `node --test model.test.js` with Node.js 22 or newer. The tests cover shortfalls, surplus energy, negative prices, the price and volume breakdown, and the path from a blocked review to a CSV whose rows add up to the signed total.

[Build plan and sources](BUILD_PLAN.md)
