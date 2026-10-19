// Read-only evidence extracted from hash-identified captures.
export const PENDING_EVIDENCE={
  "reviewedOn": "2026-09-29",
  "priceSnapshotAt": "2026-09-29T02:23:15.258Z",
  "periods": [
    {
      "symbol": "000660.KS",
      "captureSha256": "286d9cf3aaa2d804071a3da4211ccdc397714d5956f0b9152d44c30aa915dc32",
      "timeZone": "Asia/Seoul",
      "regularStart": "29/09/2026, 09:00",
      "regularEnd": "29/09/2026, 15:00",
      "scope": "currentTradingPeriod at original capture; not proof of historical bar coverage"
    },
    {
      "symbol": "009150.KS",
      "captureSha256": "a9ed573c125bda703b0bf640f25c6808603859a7d77619c3eb016570fa2078b3",
      "timeZone": "Asia/Seoul",
      "regularStart": "29/09/2026, 09:00",
      "regularEnd": "29/09/2026, 15:00",
      "scope": "currentTradingPeriod at original capture; not proof of historical bar coverage"
    },
    {
      "symbol": "095340.KQ",
      "captureSha256": "c2e1cad42229e3c36b7e337f39b4b354f12a2ab9c9f95fa1d36c7da585dc729f",
      "timeZone": "Asia/Seoul",
      "regularStart": "29/09/2026, 09:00",
      "regularEnd": "29/09/2026, 15:00",
      "scope": "currentTradingPeriod at original capture; not proof of historical bar coverage"
    },
    {
      "symbol": "IFX.DE",
      "captureSha256": "ddea513144012d6ea2c39a79c4dfca0b8d2beb7284d302a6af07be1a268a4ffc",
      "timeZone": "Europe/Berlin",
      "regularStart": "29/09/2026, 09:00",
      "regularEnd": "29/09/2026, 17:30",
      "scope": "currentTradingPeriod at original capture; not proof of historical bar coverage"
    },
    {
      "symbol": "AIXA.DE",
      "captureSha256": "47c3b59975240b813cc9f381778d85404a4457c0190fe4d2c6f865fd01cc8e7d",
      "timeZone": "Europe/Berlin",
      "regularStart": "29/09/2026, 09:00",
      "regularEnd": "29/09/2026, 17:30",
      "scope": "currentTradingPeriod at original capture; not proof of historical bar coverage"
    }
  ],
  "spotChecks": [
    {
      "symbol": "000660.KS",
      "officialPageDate": "2026-09-29",
      "comparedPriceDate": "2026-09-28",
      "officialPreviousClose": 1768000,
      "providerClose": 1768000,
      "matches": true,
      "sourceUrl": "https://kind.krx.co.kr/common/stockprices.do?isurCd=00066&method=searchStockPricesMain",
      "captureSha256": "25846aa7434c2b12dfe0191b5b5f86110d1dcfbd8261a1e83fb2e41da1a44299",
      "scope": "one previous close only; no OHLC/volume/history certification"
    },
    {
      "symbol": "009150.KS",
      "officialPageDate": "2026-09-29",
      "comparedPriceDate": "2026-09-28",
      "officialPreviousClose": 1499000,
      "providerClose": 1499000,
      "matches": true,
      "sourceUrl": "https://kind.krx.co.kr/common/stockprices.do?isurCd=00915&method=searchStockPricesMain",
      "captureSha256": "b0ee1324ecb15d6a03305b25bb4f38bb8dd0bdca4ec38cf0aedaad7d33471c82",
      "scope": "one previous close only; no OHLC/volume/history certification"
    },
    {
      "symbol": "095340.KQ",
      "officialPageDate": "2026-09-29",
      "comparedPriceDate": "2026-09-28",
      "officialPreviousClose": 203500,
      "providerClose": 203500,
      "matches": true,
      "sourceUrl": "https://kind.krx.co.kr/common/stockprices.do?isurCd=09534&method=searchStockPricesMain",
      "captureSha256": "40b321b4642f70a37cb92552a1b6a9522a734a10842d2dc3bb32f7caf336652f",
      "scope": "one previous close only; no OHLC/volume/history certification"
    }
  ]
};
