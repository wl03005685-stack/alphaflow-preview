import {publicFetch as fetch} from './preview-client.js';
import {mountMorningReadiness} from './morning-readiness.js';
import {domesticDateTarget} from './trading-calendar.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function freshness(row,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const checkDay=row.lastCheckedAt?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.lastCheckedAt)):null;
 if(checkDay!==today)return '今日尚未核對';
 const target=domesticDateTarget(now);
 if(['00981A','00403A','00405A','00982A','00400A','00980A','00985A','00999A','00415A','00992A','00993A','00984A','00995A','00987A','00410A','00408A','00994A','00407A','00996A','00991A','00406A'].includes(row.fundSymbol)&&target.closedToday&&target.targetAsOf&&row.latestSavedAsOf===target.targetAsOf&&['acquired','no_new_data'].includes(row.acquisition))return '休市日已核對最近交易日';
 if(row.latestSavedAsOf&&row.latestSavedAsOf<today&&['acquired','no_new_data'].includes(row.acquisition))return '已檢查，但持股日較早';
 return {failed:'取得失敗',not_available:'尚未取得',acquired:'今日已核對',no_new_data:'來源暫無新資料'}[row.acquisition]??'今日尚未核對';
}
const time=v=>v?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short',hour12:false}).format(new Date(v)):'未記錄';
export function statusMarkup(data,now=new Date()){
 const target=domesticDateTarget(now);
 return `<div class="section-head"><h2>資料更新狀態</h2><span class="badge neutral">本頁已載入 ${data.funds.filter(f=>f.latestSavedAsOf).length} / ${data.funds.length} 檔</span></div><p class="note">最近一次成功發布所含的來源檢查，不代表 Windows 排程已成功觸發。晚間仍顯示下午檢查時間時，需查主機執行結果。海外持股日可能較晚取得，不能改標為當日。</p><p class="subtle">${esc(data.schedule)} · 最近排程模式：${esc(time(data.lastScheduledRunAt))}</p>${data.lastRunAt?`<p class="small subtle">最近執行：${esc(time(data.lastRunAt))}（${data.lastRunMode==='scheduled'?'排程模式':'手動模式'}）</p>`:''}${data.marketRefresh?`<p class="small subtle">行情刷新：${data.marketRefresh.failed===true?'未完成；保留既有行情':`新增 ${Number(data.marketRefresh.appendedRows??0)} 筆；失敗 ${data.marketRefresh.failed?.length??0} 檔；本次待處理 ${data.marketRefresh.deferred?.length??0} 檔；較早月份待回補 ${data.marketRefresh.historicalGaps?.length??0} 檔`}。</p>`:''}<p class="small subtle">台股日期核對：${esc(target.today)} ${esc(target.reason)}；預定最近交易日 ${esc(target.targetAsOf??'待核對')}。<a href="${target.sourceUrl}" target="_blank" rel="noopener">證交所開休市日曆</a>（${target.reviewedOn} 核對；臨時停市及海外市場另核）。</p><div class="update-grid">${data.funds.map(f=>`<article class="update-card"><div class="section-head"><strong>${esc(f.fundSymbol)}</strong><span class="badge pending">${esc(freshness(f,now))}</span></div><p>本版持股日 <strong>${esc(f.latestSavedAsOf??'尚無')}</strong></p><p>${f.holdingsState==='unchanged'?'完整持股 · 股數無異動':f.holdingsState==='changed'?`完整持股 · ${f.changes} 筆增減`:f.holdingsState==='not_comparable'?'缺前期，尚無法比較':'尚未取得完整持股'}</p><p class="subtle">${f.comparisonFrom?'比較 '+esc(f.comparisonFrom)+' → '+esc(f.latestSavedAsOf):'等待可比較資料'}</p><details><summary>檢查紀錄與原因</summary><p>最後來源檢查：${esc(time(f.lastCheckedAt))}</p><p>既有採集紀錄：${esc(f.lastObservedOn??'未記錄')}（日期，不是精確檢查時間）</p><p>${esc(f.reason)}</p>${f.latestOfficialAsOf&&f.latestOfficialAsOf>f.latestSavedAsOf?'<p>來源已有較新日期，本版尚未收齊。</p>':''}${f.latestPath?`<a href="${esc(f.latestPath)}" target="_blank" rel="noopener">查看本版持股</a>`:''}</details></article>`).join('')}</div><p class="subtle update-footnote">無異動只表示上述兩期股數相同，不表示今日沒有交易。今日尚未核對不等於官方尚未公布；發布時間不會取代持股日或来源檢查時間。</p>`;
}
export async function mountUpdateStatus(root){
 const load=async()=>{try{const r=await fetch('/update-status.json',{cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();root.innerHTML='<section id="morning-readiness"></section>'+statusMarkup(data);await mountMorningReadiness(root.querySelector('#morning-readiness'),data);}catch{root.innerHTML='<h2>資料更新狀態</h2><p role="status">無法載入更新紀錄，不能確認目前資料狀態。</p><button class="outline">重新檢查</button>';root.querySelector('button').onclick=load;}};
 await load();const timer=setInterval(()=>{if(root.isConnected)load();else clearInterval(timer);},60000);
}
