// TWSE ex-dividend results checked 2026-10-20; payment dates remain unverified.
export const reviewedDividends=[
  {
    "symbol": "00406A",
    "exDate": "2026-10-05",
    "amount": 0.138,
    "sourceUrl": "https://www.twse.com.tw/exchangeReport/TWT49U?response=json&startDate=20261001&endDate=20261019"
  },
  {
    "symbol": "00984A",
    "exDate": "2026-10-19",
    "amount": 0.473,
    "sourceUrl": "https://www.twse.com.tw/exchangeReport/TWT49U?response=json&startDate=20261001&endDate=20261019"
  },
  {
    "symbol": "00992A",
    "exDate": "2026-10-19",
    "amount": 0.85,
    "sourceUrl": "https://www.twse.com.tw/exchangeReport/TWT49U?response=json&startDate=20261001&endDate=20261019"
  },
  {
    "symbol": "00995A",
    "exDate": "2026-10-19",
    "amount": 0.5,
    "sourceUrl": "https://www.twse.com.tw/exchangeReport/TWT49U?response=json&startDate=20261001&endDate=20261019"
  },
  {
    "symbol": "00996A",
    "exDate": "2026-10-19",
    "amount": 0.73,
    "sourceUrl": "https://www.twse.com.tw/exchangeReport/TWT49U?response=json&startDate=20261001&endDate=20261019"
  }
];
export function applyReviewedDividends(market){
 const dividends=structuredClone(market.dividends??{});
 for(const d of reviewedDividends){
  const fund=dividends[d.symbol]??={sourceUrl:d.sourceUrl,records:[]};
  const existing=fund.records.find(r=>r.exDate===d.exDate);
  if(existing){if(existing.amount!==d.amount)throw Error('配息金額與已核對資料不符，請先核對來源。');continue;}
  fund.records.push({exDate:d.exDate,amount:d.amount,paymentDate:null,sourceUrl:d.sourceUrl});fund.records.sort((a,b)=>a.exDate.localeCompare(b.exDate));
 }
 return {...market,dividends};
}
