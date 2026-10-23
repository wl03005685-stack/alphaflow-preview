import {publicFetch as fetch} from './preview-client.js';
import {auditHoldingsMarketEvents} from './return-engine.js';
import {loadMarketData} from './overseas-market.js?v=69';
const domestic=new Set(['00981A','00982A','00403A','00405A','00400A','00980A','00985A','00999A','00415A','00992A','00993A','00984A','00995A','00987A','00410A','00408A','00994A','00407A','00996A','00991A','00406A']);
export function fundDataHealth(timeline,market,symbol,{from='0000-01-01',to='9999-12-31'}={}){
 const f=timeline.funds.find(x=>x.fundSymbol===symbol)??{fundSymbol:symbol,dates:[],pairs:[]};
 const dates=f.dates.filter(d=>d.asOf>=from&&d.asOf<=to),pairs=f.pairs.filter(p=>p.to>=from&&p.to<=to);
 const first=dates[0]?.asOf??null,last=dates.at(-1)?.asOf??null;
 const own=new Set(dates.map(d=>d.asOf));
 const peerGaps=domestic.has(symbol)&&first?[...new Set(timeline.funds.filter(x=>domestic.has(x.fundSymbol)).flatMap(x=>x.dates.map(d=>d.asOf)))].filter(d=>d>first&&d<last&&!own.has(d)).sort():[];
 const rows=market.fundPrices[symbol]?.rows.filter(r=>r.date>=from&&r.date<=to)??[];
 const calendar=market.fundPrices[market.benchmark]?.rows.map(r=>r.date)??[];
 const expected=rows.length?calendar.filter(d=>d>=rows[0].date&&d<=rows.at(-1).date):[];
 const priceDates=new Set(rows.map(r=>r.date)),priceGaps=expected.filter(d=>!priceDates.has(d));
 const coverageExpected=first?calendar.filter(d=>d>=first&&d<=last):[];
 const coverageGaps=coverageExpected.filter(d=>!priceDates.has(d));
 const calendarCoversHoldings=!!first&&calendar.length>0&&calendar[0]<=first&&calendar.at(-1)>=last;
 const coverageStatus=!first||!calendarCoversHoldings?'unverified':coverageGaps.length?'incomplete':'covered';
 const symbols=[...new Set(pairs.flatMap(p=>p.rows.filter(r=>r.delta).map(r=>r.symbol)))].sort();
 const missingSymbols=symbols.filter(s=>!market.constituents[s]?.rows.some(r=>r.date<=to));
 const overseasSeries=symbols.map(s=>market.constituents[s]).filter(s=>s?.researchOnly);
 const {events,excluded}=auditHoldingsMarketEvents({...f,pairs},market.constituents,{cutoff:to,calendar});
 const reasons={};for(const x of excluded)reasons[x.reason]=(reasons[x.reason]??0)+1;
 const horizons=[1,5,10].map(days=>({days,complete:events.filter(e=>e.returns[days]!=null).length,pending:events.filter(e=>e.returns[days]==null).length}));
 const tasks=[];
 if(dates.length<2)tasks.push('補齊至少兩期完整持股，才能比較異動。');
 if(peerGaps.length)tasks.push(`核對 ${peerGaps.length} 個同市場持股日期缺口；不可直接當作官方漏報。`);
 if(!rows.length)tasks.push('補上這檔ETF的官方成交行情。');
 if(priceGaps.length)tasks.push(`核對 ${priceGaps.length} 個ETF行情缺口；可能停牌或尚未取得。`);
 if(coverageGaps.length)tasks.push(`持股期間有 ${coverageGaps.length} 個對照交易日未取得ETF行情，包含行情起迄範圍之外的日期。`);
 if(!calendarCoversHoldings)tasks.push('交易日參考未涵蓋完整持股期間，尚無法確認行情完整性。');
 if(missingSymbols.length)tasks.push(`補上 ${missingSymbols.length} 檔異動股票的行情；海外股票須另接當地市場。`);
 if(overseasSeries.length)tasks.push(`已取得 ${overseasSeries.length} 個海外股票代碼的第三方價格；美股、日本、香港與深圳可在報酬頁查看公告日延遲情境；其他市場交易日、首次公告時間及匯率仍待驗收，暫不納入台幣跟單模擬。`);
 if(market.overseas?.unavailable)tasks.push('海外行情資料載入失敗；目前僅顯示原有台灣行情，請重新載入。');
 if(reasons.missing_announcement)tasks.push(`補核 ${reasons.missing_announcement} 筆異動的公告日期。`);
 if(reasons.missing_entry_price)tasks.push(`核對 ${reasons.missing_entry_price} 筆次日開盤缺價；不延後進場冒充原規則。`);
 tasks.push('個股股利、分割及下市行情尚未齊全，不能把價格模擬當成完整含息回測。');
 return {fundSymbol:symbol,from,to,holdings:{count:dates.length,first,last,peerGaps},prices:{count:rows.length,first:rows[0]?.date??null,last:rows.at(-1)?.date??null,gaps:priceGaps,coverage:{status:coverageStatus,expected:coverageExpected.length,gaps:coverageGaps,calendarCoversHoldings}},signals:{total:pairs.reduce((n,p)=>n+p.rows.filter(r=>r.delta).length,0),symbols:symbols.length,missingSymbols,eligible:events.length,excluded:excluded.length,reasons,horizons},overseas:{...market.overseas,series:overseasSeries},excluded,tasks,status:dates.length<2||!events.length?'insufficient_for_event_study':'partial_price_research',marketGeneratedAt:market.generatedAt};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasonNames={overseas_research_only:'海外價格已取得，交易日與公告時間尚待驗收',missing_announcement:'公告日期缺少或早於持股日',announcement_after_cutoff:'公告晚於截止日',missing_market:'沒有個股行情',waiting_entry:'尚無次一交易日',missing_entry_price:'次一交易日缺少可用開盤價'};
export async function mountDataHealth(root,symbol){
 root.textContent='正在核對已保存資料…';
 try{
  const [timeline,market]=await Promise.all([fetch('/timeline-data.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('load');return r.json();}),loadMarketData()]),r=fundDataHealth(timeline,market,symbol);
  root.innerHTML=`<h2>${esc(symbol)} 回測資料體檢</h2><p>先確認樣本涵蓋哪些日期與股票，再解讀報酬。這份體檢依網站已保存資料計算，不代表來源端已公布的全部資料。</p><div class="score"><div><strong>${r.holdings.count} 期</strong><span>完整持股快照</span></div><div><strong>${r.prices.count} 日</strong><span>ETF成交行情</span></div><div><strong>${r.signals.eligible}／${r.signals.total}</strong><span>具進場價格的異動事件</span></div><div><strong>${r.signals.missingSymbols.length}／${r.signals.symbols}</strong><span>缺行情的異動股票</span></div></div><p>持股：${r.holdings.first??'待補'} → ${r.holdings.last??'待補'}；ETF行情：${r.prices.first??'待補'} → ${r.prices.last??'待補'}。</p><p class="note">${r.status==='insufficient_for_event_study'?'目前不足以進行持股事件研究。':'目前僅能做部分價格研究，尚未通過完整回測資料驗收。'}</p><details><summary>全部ETF資料盤點</summary><div class="table-wrap"><table><thead><tr><th>ETF</th><th>持股期數</th><th>持股起迄</th><th>可建立／全部事件</th><th>缺行情股票</th><th>缺公告日期事件</th></tr></thead><tbody>${timeline.funds.map(f=>fundDataHealth(timeline,market,f.fundSymbol)).map(a=>`<tr><td>${esc(a.fundSymbol)}</td><td>${a.holdings.count}</td><td>${esc(a.holdings.first)} → ${esc(a.holdings.last)}</td><td>${a.signals.eligible}／${a.signals.total}</td><td>${a.signals.missingSymbols.length}</td><td>${a.signals.reasons.missing_announcement??0}</td></tr>`).join('')}</tbody></table></div><p>可建立事件僅代表具備進場資料；仍須逐一核對1、5、10日價格與公司行動。</p></details><h3>優先補齊</h3><ul>${r.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="table-wrap"><table><thead><tr><th>觀察期間</th><th>價格齊全</th><th>缺價或尚未到期</th></tr></thead><tbody>${r.signals.horizons.map(h=>`<tr><td>${h.days} 個交易日</td><td>${h.complete}</td><td>${h.pending}</td></tr>`).join('')}</tbody></table></div><p class="small subtle">以0050已取得交易日作台股日曆參考；跨ETF同日、同股票與重疊區間不是獨立樣本。持股缺口只和同市場ETF在自身起迄日內比較，不推定假日或缺口中的交易。</p><details><summary>日期缺口與缺行情股票</summary><p>持股待核日期：${r.holdings.peerGaps.join('、')||'未發現同市場對照缺口'}。</p><p>ETF行情待核日期：${r.prices.gaps.join('、')||'已取得起迄範圍內未發現對照缺口'}。</p><p>持股期間ETF行情待補：${r.prices.coverage.gaps.join('、')|| (r.prices.coverage.status==='covered'?'對照交易日均已取得':'交易日參考不足，無法確認')}。</p><p>缺個股行情：${r.signals.missingSymbols.map(esc).join('、')||'無；仍需逐日核對'}。</p></details><details><summary>未能建立事件（${r.excluded.length} 筆）</summary><div class="table-wrap"><table><thead><tr><th>持股日</th><th>股票</th><th>原因</th><th>來源快照</th></tr></thead><tbody>${r.excluded.map(x=>`<tr><td>${esc(x.to)}</td><td>${esc(x.symbol)} ${esc(x.name)}</td><td>${esc(reasonNames[x.reason]??x.reason)}</td><td><a href="${esc(x.afterPath)}" target="_blank" rel="noopener">持股證據</a></td></tr>`).join('')}</tbody></table></div></details><button class="outline" data-health-export>下載資料缺口清單</button>`;
  if(r.overseas.series.length){
   const section=document.createElement('section');
   section.innerHTML=`<h3>海外歷史行情已取得</h3><p>Yahoo Finance 第三方資料 · 核對時間 ${esc(r.overseas.generatedAt)}。海外資料已接入專用主機排程補抓；實際成功時間與缺價日如下。</p><p class="note">價格依當地幣別與交易日期列示。已取得資料不代表逐日完整，空值不補零；美股、日本、香港與深圳已另提供官方日曆下的公告日延遲情境研究；首次公告時間、其他市場與匯率仍待驗收，海外不加入台幣跟單資金模擬。</p><div class="table-wrap"><table><thead><tr><th>持股代碼／來源代碼</th><th>來源名稱</th><th>市場／幣別</th><th>價格起迄／筆數</th><th>来源空值日期</th><th>來源</th></tr></thead><tbody>${r.overseas.series.map(s=>`<tr><td>${esc(s.symbol)}<br>${esc(s.providerSymbol)}</td><td>${esc(s.providerName)}${s.mappingNote?'<br><small>'+esc(s.mappingNote)+'</small>':''}</td><td>${esc(s.exchange)}／${esc(s.currency)}<br><small>${esc(s.timeZone)}</small></td><td>${s.rows[0].date} → ${s.rows.at(-1).date}<br>${s.rows.length} 筆</td><td>${s.missingRows.map(x=>esc(x.date)).join('、')||'來源未回傳空值；不等於無缺日'}</td><td><a href="${esc(s.historyUrl)}" target="_blank" rel="noopener">歷史行情</a></td></tr>`).join('')}</tbody></table></div><p><a href="/overseas-market-data.json" download>下載海外價格與來源紀錄</a></p>`;
   root.querySelector('[data-health-export]').before(section);
  }
  root.querySelector('[data-health-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(r,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=symbol+'-data-health.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 }catch{root.textContent='資料體檢載入失敗，請重新開啟分頁。';}
}
