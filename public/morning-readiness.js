import {publicFetch as fetch} from './preview-client.js';
import {twseSession} from './trading-calendar.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function morningReadiness(status,market,overseas,now=new Date()){
 const local=new Date(now.getTime()+8*3600000),today=local.toISOString().slice(0,10),previous=new Date(local.getTime()-86400000).toISOString().slice(0,10);
 let target=null;for(let i=1;i<=32;i++){const date=new Date(local.getTime()-i*86400000).toISOString().slice(0,10),s=twseSession(date);if(!s.known)break;if(s.open){target=date;break;}}
 const checkedToday=t=>t&&new Date(Date.parse(t)+8*3600000).toISOString().slice(0,10)===today;
 const holdings=status.funds.map(f=>({symbol:f.fundSymbol,date:f.latestSavedAsOf,ready:!!target&&f.latestSavedAsOf>=target&&checkedToday(f.lastCheckedAt)&&['acquired','no_new_data'].includes(f.acquisition)}));
 const prices=Object.entries({...market.fundPrices,...market.constituents}).map(([symbol,s])=>({symbol,date:s.rows.at(-1)?.date,ready:!!target&&s.rows.at(-1)?.date>=target}));
 const foreign=Object.values(overseas.constituents).map(s=>({symbol:s.symbol,date:s.rows.at(-1)?.date,ready:s.rows.at(-1)?.date>=previous,reason:s.missingRows.find(r=>r.date===previous)?.reason??'較早日期或市場休市待核對'}));
 const sourceFresh=checkedToday(status.lastRunAt)&&checkedToday(overseas.generatedAt);
 return {today,target,overseasDateTarget:previous,sourceFresh,holdings,prices,foreign,complete:sourceFresh&&holdings.every(r=>r.ready)&&prices.every(r=>r.ready)&&foreign.every(r=>r.ready)};
}
export async function mountMorningReadiness(root,status){
 try{
  const [market,overseas]=await Promise.all(['/market-data.json','/overseas-market-data.json'].map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error();return r.json();}));
  const r=morningReadiness(status,market,overseas),missing=[...r.holdings.filter(x=>!x.ready).map(x=>`${x.symbol} 持股：${x.date??'尚無'}／尚未達目標或今日未核對`),...r.prices.filter(x=>!x.ready).map(x=>`${x.symbol} 台股行情：${x.date??'尚無'}`),...r.foreign.filter(x=>!x.ready).map(x=>`${x.symbol} 海外行情：${x.date??'尚無'}（${x.reason==='inconsistent_provider_ohlc'?'來源價格矛盾':x.reason==='incomplete_provider_bar'?'來源缺完整日行情':x.reason}）`)];
  root.innerHTML=`<h3>隔日 08:00 前更新目標</h3><p><strong>${r.complete?'本次目標資料已齊全':'尚有缺口，不能宣稱完整'}</strong> · ${r.today} 早晨核對：台股最近前一交易日 ${r.target??'日曆待核對'}；海外先檢查 ${r.overseasDateTarget}，休市與較晚公告另列。</p><p>持股 ${r.holdings.filter(x=>x.ready).length}/${r.holdings.length} · 台股行情 ${r.prices.filter(x=>x.ready).length}/${r.prices.length} · 海外行情 ${r.foreign.filter(x=>x.ready).length}/${r.foreign.length}（持股代碼數，含同股票別名）</p><p>今日持股及海外來源檢查：${r.sourceFresh?'已收到更新':'尚未全部收到'}。最後海外採集：${esc(new Date(overseas.generatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))}。</p><details><summary>查看未齊項目（${missing.length}）</summary><ul>${missing.map(s=>`<li>${esc(s)}</li>`).join('')||'<li>日期目標無缺口；日期完整不代表公司行動、匯率或策略驗證已完成。</li>'}</ul></details><p class="small subtle">排程補抓：21:30、23:30、05:30、06:30、07:20、07:40。主機需開機、連網並保持登入；官方尚未公布或來源異常會保留真實日期。</p>`;
 }catch{root.textContent='早晨完整性驗收暫時無法讀取，不能確認所有資料已齊。';}
}
