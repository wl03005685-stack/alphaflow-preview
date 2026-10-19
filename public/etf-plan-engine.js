// Cash distributions are accrued entitlements, never spendable before verified payment.
export function simulateETFPlan(points,{initial=100000,monthly=10000,day=10,buyCost=0.001,sellCost=0.001,dividends=[],splits=[],lotSize=0,minFee=0,sellTax=0,slippage=0,reinvest=false}={}){
 if(![0,1,1000].includes(lotSize)||!Number.isFinite(minFee)||minFee<0||![sellTax,slippage].every(n=>Number.isFinite(n)&&n>=0&&n<=.1))throw Error('交易單位或費稅設定無效。');
 if(points.length<2||![initial,monthly].every(n=>Number.isFinite(n)&&n>=0)||initial<=0||!Number.isInteger(day)||day<1||day>28||![buyCost,sellCost].every(n=>Number.isFinite(n)&&n>=0&&n<=.1))throw Error('請輸入正的起始金額、非負月投入、1～28日及0～10%的成本。');
 if(points.some((p,i)=>!Number.isFinite(p.close)||p.close<=0||(i&&p.date<=points[i-1].date)))throw Error('行情缺漏或日期順序錯誤，暫不計算。');
 if(dividends.some(d=>!Number.isFinite(d.amount)||d.amount<0)||splits.some(s=>!Number.isFinite(s.ratio)||s.ratio<=0))throw Error('公司行動資料無效。');
 const first=points[0].date,last=points.at(-1).date,months=new Set(),ledger=[],curve=[];
 const actions=[...dividends.filter(d=>d.exDate>first&&d.exDate<=last).map(d=>({...d,date:d.exDate,type:'dividend'})),...splits.filter(s=>s.date>first&&s.date<=last).map(s=>({...s,type:'split'}))].sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='split'?-1:1));
 let units=0,rights=0,cash=0,dividendCash=0,paidDistributions=0,taxes=0,slippageCost=0,invested=0,fees=0,portfolioUnits=0,nav=1,peak=1,maxDrawdown=0,cursor=0;
 const receivables=[];
 for(let i=0;i<points.length;i++){
  const p=points[i];
  while(cursor<actions.length&&actions[cursor].date<=p.date){const a=actions[cursor++];if(a.type==='split'){units*=a.ratio;ledger.push({date:a.date,type:'split',ratio:a.ratio,units});}else{const amount=units*a.amount;rights+=amount;receivables.push({amount,paymentDate:a.paymentDateVerified&&a.paymentDate>=a.exDate?a.paymentDate:null,paid:false,reinvested:false});ledger.push({date:a.date,type:'dividend_right',perUnit:a.amount,amount,units});}}
  let reinvestAmount=0;
  for(const r of receivables){if(r.paymentDate&&r.paymentDate<=p.date&&!r.paid){r.paid=true;rights-=r.amount;dividendCash+=r.amount;paidDistributions+=r.amount;ledger.push({date:p.date,paymentDate:r.paymentDate,type:'dividend_payment',amount:r.amount});}if(reinvest&&r.paid&&!r.reinvested&&p.date>r.paymentDate){r.reinvested=true;dividendCash-=r.amount;cash+=r.amount;reinvestAmount+=r.amount;}}
  const month=p.date.slice(0,7),deposit=i===0?initial:month!==first.slice(0,7)&&Number(p.date.slice(8))>=day&&!months.has(month)?monthly:0;
  if(i>0)nav=(units*p.close+rights+cash+dividendCash)/portfolioUnits;
  if(deposit>0){months.add(month);if(nav<=0)throw Error('帳戶資產已歸零，請縮短區間。');portfolioUnits+=deposit/nav;cash+=deposit;invested+=deposit;ledger.push({date:p.date,type:'deposit',amount:deposit});}
  if(deposit>0||reinvestAmount>0){const price=p.close*(1+slippage),affordable=Math.max(0,Math.min(cash/(1+buyCost),cash-minFee))/price,shares=lotSize?Math.floor(affordable/lotSize)*lotSize:affordable;
   if(shares>0){const notional=shares*price,fee=Math.max(minFee,notional*buyCost);cash=Math.max(0,cash-notional-fee);units+=shares;fees+=fee;slippageCost+=shares*(price-p.close);ledger.push({date:p.date,type:'buy',deposit,reinvestAmount,shares,price,close:p.close,fee,cash});}
  }
  let value=units*p.close+rights+cash+dividendCash;
  if(i===points.length-1&&units>0){const price=p.close*(1-slippage),gross=units*price,fee=Math.max(minFee,gross*sellCost),tax=gross*sellTax;if(gross+cash+dividendCash>=fee+tax){fees+=fee;taxes+=tax;slippageCost+=units*(p.close-price);value-=fee+tax+units*(p.close-price);ledger.push({date:p.date,type:'hypothetical_exit',shares:units,price,fee,tax});}else{ledger.push({date:p.date,type:'exit_unaffordable'});}}
  nav=value/portfolioUnits;peak=Math.max(peak,nav);maxDrawdown=Math.min(maxDrawdown,nav/peak-1);curve.push({date:p.date,value,invested,units,rights,cash,dividendCash,nav,deposit});
 }
 const ending=curve.at(-1).value,days=(Date.parse(last)-Date.parse(first))/86400000;
 return {from:first,to:last,initial,monthly,day,buyCost,sellCost,lotSize,minFee,sellTax,slippage,reinvest,invested,ending,profit:ending-invested,profitRatio:ending/invested-1,timeWeightedReturn:nav-1,annualizedTimeWeightedReturn:days>=365?nav**(365/days)-1:null,maxDrawdown,fees,taxes,slippageCost,rights,cash,dividendCash,paidDistributions,ledger,curve,method:'close_prices_verified_payment_next_session_reinvestment'};
}
export function compareETFPlans(rows,benchmarkRows,settings){
 if(rows.length!==benchmarkRows.length||rows.some((p,i)=>p.date!==benchmarkRows[i]?.date))throw Error('ETF 與 0050 的交易日有缺漏，請縮短區間；不以補值產生比較。');
 return {fund:simulateETFPlan(rows,settings.fund),benchmark:simulateETFPlan(benchmarkRows,settings.benchmark)};
}
export function latestAlignedStart(rows,benchmarkRows){
 if(!rows.length||!benchmarkRows.length)return null;
 const first=rows[0].date>benchmarkRows[0].date?rows[0].date:benchmarkRows[0].date,last=rows.at(-1).date<benchmarkRows.at(-1).date?rows.at(-1).date:benchmarkRows.at(-1).date,a=new Set(rows.filter(p=>p.date>=first&&p.date<=last).map(p=>p.date)),b=new Set(benchmarkRows.filter(p=>p.date>=first&&p.date<=last).map(p=>p.date));
 const gaps=[...a].filter(d=>!b.has(d)).concat([...b].filter(d=>!a.has(d))).sort(),after=gaps.at(-1)??'';
 return rows.find(p=>p.date>=first&&p.date>after&&p.date<=last&&b.has(p.date))?.date??null;
}
