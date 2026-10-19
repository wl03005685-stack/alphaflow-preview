// Official TWSE pages checked on 2026-10-02T02:40:07.793Z; only exact matching records are verified.
export const paymentEvidence={
  "0050": {
    "sourceUrl": "https://www.twse.com.tw/zh/ETFortune/dividendList?startDate=2025&endDate=2026&stkNo=0050",
    "sha256": "32be3c1b8d20aafb3f66c40984a420c2f98868eef0501230aed488656ca62908",
    "checkedAt": "2026-10-02T02:40:07.793Z",
    "records": [
      {
        "exDate": "2026-07-21",
        "paymentDate": "2026-08-10",
        "amount": 0.6
      },
      {
        "exDate": "2026-01-22",
        "paymentDate": "2026-02-11",
        "amount": 1
      },
      {
        "exDate": "2025-07-21",
        "paymentDate": "2025-08-08",
        "amount": 0.36
      },
      {
        "exDate": "2025-01-17",
        "paymentDate": "2025-02-20",
        "amount": 2.7
      }
    ]
  },
  "00981A": {
    "sourceUrl": "https://www.twse.com.tw/zh/ETFortune/dividendList?startDate=2025&endDate=2026&stkNo=00981A",
    "sha256": "a6efbc379c6fef0292f14e8741867c0f7ab320d0dea915199a3bad71ae6ef3bd",
    "checkedAt": "2026-10-02T02:40:07.793Z",
    "records": [
      {
        "exDate": "2026-09-16",
        "paymentDate": "2026-10-13",
        "amount": 0.63
      },
      {
        "exDate": "2026-06-16",
        "paymentDate": "2026-07-09",
        "amount": 0.63
      },
      {
        "exDate": "2026-03-17",
        "paymentDate": "2026-04-10",
        "amount": 0.41
      }
    ]
  },
  "00982A": {
    "sourceUrl": "https://www.twse.com.tw/zh/ETFortune/dividendList?startDate=2025&endDate=2026&stkNo=00982A",
    "sha256": "dc69bd8e0e165bfc13faf3ebd0ca2f7f9bb2f90777c04bb44e71d43c9eaff3d1",
    "checkedAt": "2026-10-02T02:40:07.793Z",
    "records": [
      {
        "exDate": "2026-08-18",
        "paymentDate": "2026-09-11",
        "amount": 0.64
      },
      {
        "exDate": "2026-05-19",
        "paymentDate": "2026-06-12",
        "amount": 0.64
      },
      {
        "exDate": "2026-02-26",
        "paymentDate": "2026-03-25",
        "amount": 0.377
      },
      {
        "exDate": "2025-11-18",
        "paymentDate": "2025-12-12",
        "amount": 0.334
      },
      {
        "exDate": "2025-08-18",
        "paymentDate": "2025-09-11",
        "amount": 0.236
      }
    ]
  }
};
export function verifyPayments(symbol,records){return records.map(r=>({...r,paymentDateVerified:!!paymentEvidence[symbol]?.records.some(e=>e.exDate===r.exDate&&e.paymentDate===r.paymentDate&&e.amount===r.amount)}));}
