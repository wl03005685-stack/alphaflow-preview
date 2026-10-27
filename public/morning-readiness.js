import {publicFetch as fetch} from './preview-client.js';
import {twseSession,TWSE_REVIEWED_CLOSURES} from './trading-calendar.mjs?v=78';
import {loadFundScope,MIN_FUND_ASSETS_TWD} from './fund-scope.js?v=68';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const taipeiDay=v=>{const n=Date.parse(v);return Number.isFinite(n)?new Date(n+8*3600000).toISOString().slice(0,10):null;};
const successful=new Set(['acquired','no_new_data']);
// These global ETF disclosure dates require their own issuer/market review.
const globalFunds=new Set(['00988A','00990A']);
const stateLabels={global_date_pending:'全球型持股日期待核對',ready:'已達日期目標',missing:'尚無保存資料',source_older:'來源本次仍回傳較早日期',source_restricted:'來源限制自動存取',source_failed:'來源取得或驗證失敗',not_checked:'今日尚未完成核對',missing_latest:'來源已有新版，尚未保存',calendar_unknown:'交易日曆待核對',date_pending:'日期仍待來源核對',market_failed:'行情重查失敗',market_deferred:'行情重查尚未完成'};

export function buildReadinessContext(scope,snapshots=[]){
 const rows=scope?.rows??[],eligible=scope?.eligible??new Set();
 const unknownCount=rows.filter(r=>!Number.isFinite(r.assets)).length;
 const selected=rows.filter(r=>eligible.has(r.symbol)&&r.assets>=MIN_FUND_ASSETS_TWD).sort((a,b)=>b.assets-a.assets||a.symbol.localeCompare(b.symbol));
 const latest=new Map();for(const s of snapshots)if(!latest.has(s.fundSymbol)||latest.get(s.fundSymbol).asOf<s.asOf)latest.set(s.fundSymbol,s);
 let snapshotsComplete=true;const constituents=new Set();
 for(const r of selected){
  const snapshot=latest.get(r.symbol);
  if(!snapshot||snapshot.asOf!==r.asOf||!Array.isArray(snapshot.holdings)||!snapshot.holdings.length){snapshotsComplete=false;continue;}
  for(const h of snapshot.holdings){const m=String(h.symbol??'').match(/^(\d{4,6})(?: (?:TW|TT))?$/);if(m)constituents.add(m[1]);}
 }
 const funds=selected.map(r=>r.symbol);
 const disclosures=Object.fromEntries(selected.filter(r=>globalFunds.has(r.symbol)&&latest.get(r.symbol)?.asOf===r.asOf).map(r=>{const s=latest.get(r.symbol);return [r.symbol,{asOf:s.asOf,announcementDate:validDate(s.observation?.announcementDate)?s.observation.announcementDate:null,uploadTimeDisplayed:s.observation?.uploadTimeDisplayed??null}];}));
 return {disclosures,scopeKnown:!!scope&&rows.length>0&&funds.length>0&&unknownCount===0&&snapshotsComplete,funds,unknownCount,excludedCount:rows.filter(r=>Number.isFinite(r.assets)&&r.assets<MIN_FUND_ASSETS_TWD).length,expectedPrices:[...new Set([...funds,'0050'])].map(symbol=>({symbol,group:'fundPrices'})).concat([...constituents].sort().map(symbol=>({symbol,group:'constituents'})))};
}

export async function loadReadinessContext(fetcher=fetch){
 const response=await fetcher('/tracking-data.json',{cache:'no-store'});if(!response.ok)throw Error('Tracking unavailable');
 const tracking=await response.json(),cache=new Map();
 const cachedFetch=path=>{if(!cache.has(path))cache.set(path,(async()=>{const r=await fetcher(path,{cache:'no-store'});if(!r.ok)return {ok:false};const value=await r.json();return {ok:true,json:async()=>value};})());return cache.get(path);};
 const scope=await loadFundScope(tracking,cachedFetch);
 const snapshots=[];
 for(const row of scope.rows.filter(r=>r.eligible)){const r=await cachedFetch(row.path);if(r.ok)snapshots.push(await r.json());}
 return buildReadinessContext(scope,snapshots);
}

function holdingState(row,target,today,symbol){
 const saved=validDate(row?.latestSavedAsOf)?row.latestSavedAsOf:null,official=validDate(row?.latestOfficialAsOf)?row.latestOfficialAsOf:null;
 if(official&&(!saved||official>saved))return 'missing_latest';
 if(!row||taipeiDay(row.lastCheckedAt)!==today)return saved?'not_checked':'missing';
 if(row.acquisition==='failed')return row.reason==='來源限制自動存取，未繞過限制。'?'source_restricted':'source_failed';
 if(!saved)return 'missing';
 if(!successful.has(row.acquisition))return 'not_checked';
 if(!target)return 'calendar_unknown';
 if(globalFunds.has(symbol))return 'global_date_pending';
 if(saved>=target)return 'ready';
 return official&&official<target?'source_older':'date_pending';
}

export function morningReadiness(status,market,overseas,now=new Date(),context){
 const local=new Date(now.getTime()+8*3600000),today=local.toISOString().slice(0,10);
 let target=null;for(let i=1;i<=32;i++){const date=new Date(local.getTime()-i*86400000).toISOString().slice(0,10),s=twseSession(date);if(!s.known)break;if(s.open){target=date;break;}}
 const checkedToday=t=>taipeiDay(t)===today;
 const sourceFresh=checkedToday(status.lastRunAt),marketCheckFresh=checkedToday(status.marketRefresh?.finishedAt);
 const holdings=(context?.funds??[]).map(symbol=>{const f=status.funds?.find(r=>r.fundSymbol===symbol),state=holdingState(f,target,today,symbol);return {symbol,marketScope:globalFunds.has(symbol)?'global':'domestic',disclosure:context?.disclosures?.[symbol]&&context.disclosures[symbol].asOf===f?.latestSavedAsOf?context.disclosures[symbol]:null,date:f?.latestSavedAsOf??null,officialDate:f?.latestOfficialAsOf??null,checkedAt:f?.lastCheckedAt??null,reason:f?.reason??'',state,ready:state==='ready'};});
 const failed=new Set(Array.isArray(status.marketRefresh?.failed)?status.marketRefresh.failed.map(r=>typeof r==='string'?r:r.symbol):[]),deferred=new Set(status.marketRefresh?.deferred??[]);
 const prices=(context?.expectedPrices??[]).map(({symbol,group})=>{
  const series=market?.[group]?.[symbol],date=series?.rows?.at(-1)?.date??null;
  const state=!validDate(date)?'missing':status.marketRefresh?.failed===true&&sourceFresh?'market_failed':!marketCheckFresh?'not_checked':failed.has(symbol)?'market_failed':deferred.has(symbol)?'market_deferred':!target?'calendar_unknown':date>=target?'ready':'date_pending';
  return {symbol,group,date,state,ready:state==='ready'};
 });
 // No reviewed overseas holiday calendar is available; display observations
 // without treating yesterday's calendar date as a required trading session.
 const foreign=Object.values(overseas?.constituents??{}).map(s=>({symbol:s.symbol,date:s.rows?.at(-1)?.date??null,state:'calendar_pending',missingRows:s.missingRows??[]}));
 const scopeKnown=context?.scopeKnown===true,complete=scopeKnown&&sourceFresh&&marketCheckFresh&&holdings.length>0&&prices.length>0&&holdings.every(r=>r.ready)&&prices.every(r=>r.ready);
 const calendarClosures=target?TWSE_REVIEWED_CLOSURES.filter(row=>row.date>target&&row.date<today):[];
 return {today,target,calendarClosures,scopeKnown,excludedCount:context?.excludedCount??0,unknownCount:context?.unknownCount??0,sourceFresh,marketCheckFresh,holdings,prices,foreign,overseasDateTarget:null,overseasCheckedToday:checkedToday(overseas?.generatedAt),overseasGeneratedAt:overseas?.generatedAt??null,complete};
}

export function readinessMarkup(r){
 const unresolved=r.holdings.filter(x=>!x.ready),priceIssues=r.prices.filter(x=>!x.ready);
 const domestic=r.holdings.filter(x=>x.marketScope!=='global'),global=r.holdings.filter(x=>x.marketScope==='global');
 const closureNote=(r.calendarClosures??[]).map(c=>`<p class="small calendar-closure-note">已納入 ${esc(c.date)} ${esc(c.reason)}。<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">官方休市公告 ↗</a>（${esc(c.reviewedOn)} 核對）。</p>`).join('');
 const grouped=Object.entries(stateLabels).map(([state,label])=>({label,count:unresolved.filter(x=>x.state===state).length})).filter(x=>x.count);
 const time=v=>Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'未記錄';
 const foreignDates=[...new Set(r.foreign.map(x=>x.date).filter(Boolean))].sort();
 return `<h3>早晨資料驗收 · 百億主清單</h3><p><strong>${r.complete?'主要清單持股與台股行情已達日期目標':'主要清單尚有待核對項目'}</strong> · ${esc(r.today)} 核對；依已核對日曆，台股前一交易日 ${esc(r.target??'日曆待核對')}。</p>${closureNote}<p>日期與來源檢查通過：台股型 ETF ${domestic.filter(x=>x.ready).length} / ${domestic.length} 檔${global.length?' · 全球型持股日期待核對 '+global.length+' 檔':''} · 相關台股行情 ${r.prices.filter(x=>x.ready).length} / ${r.prices.length} 檔。低於 100 億的 ${r.excludedCount} 檔不計入；規模待確認 ${r.unknownCount} 檔。</p>${!r.scopeKnown?'<p class="note">主要清單或最新持股未能完整核對，不能宣稱資料齊全。</p>':''}${grouped.length?`<p>${grouped.map(x=>`${x.label} ${x.count} 檔`).join(' · ')}</p>`:''}<details${unresolved.length?' open':''}><summary>逐檔查看持股日期與原因（${r.holdings.length} 檔）</summary><div class="table-wrap"><table><thead><tr><th>ETF</th><th>已保存持股日</th><th>本次來源日期</th><th>核對結果</th></tr></thead><tbody>${r.holdings.map(x=>`<tr><td>${esc(x.symbol)}</td><td>${esc(x.date??'尚無')}${x.disclosure?.announcementDate?`<br><small>清單公告／適用日 ${esc(x.disclosure.announcementDate)}</small>`:''}${x.disclosure?.uploadTimeDisplayed?`<br><small>頁面上傳 ${esc(x.disclosure.uploadTimeDisplayed)}</small>`:''}</td><td>${esc(x.officialDate??'無法確認')}</td><td>${esc(stateLabels[x.state])}</td></tr>`).join('')}</tbody></table></div><p class="small subtle">來源回傳較早日期，不等於系統漏抓或官方所有管道尚未公布。全球型 ETF 的公告／適用日與持股基準日分開判讀；尚未核實各基金的跨市場揭露時程，不能套用台股日期判定齊全或漏抓。受限來源保留已保存持股，不能當作今日採集成功。</p></details><details><summary>相關台股行情待核對（${priceIssues.length} 檔）</summary><p>範圍為主清單 ETF、0050 基準及主清單最新持股中的台股。行情日期與重查結果分別核對。</p><ul>${priceIssues.map(x=>`<li>${esc(x.symbol)}：${esc(x.date??'尚無')} · ${esc(stateLabels[x.state])}</li>`).join('')||'<li>目前沒有行情日期缺口。</li>'}</ul></details><details><summary>海外研究行情 · 交易日曆待核對</summary><p>已保存 ${r.foreign.length} 組海外股票行情；資料日期 ${foreignDates.length?esc(foreignDates.join('、')):'尚無'}；最後採集 ${esc(time(r.overseasGeneratedAt))}。</p><p>海外交易日與假日尚未逐市場核對，不把昨日曆日直接當作應有行情日，也不計入上方台股驗收數量。此處不代表海外資料已完整。</p></details><p class="small subtle">本區檢查目前資料日期；08:00 是否準時仍須核對正式發布與朋友版完成紀錄。稍後人工補檔不會成為準時完成的證明。日曆含已列出的官方臨時休市；其他臨時變動及個股停牌仍須另行核對。</p>`;
}

export async function mountMorningReadiness(root,status,context){
 try{
  const [market,overseas,scope]=await Promise.all([fetch('/market-data.json',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json();}),fetch('/overseas-market-data.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),context??loadReadinessContext()]);
  root.innerHTML=readinessMarkup(morningReadiness(status,market,overseas,new Date(),scope));
 }catch{root.textContent='早晨完整性驗收暫時無法讀取，不能確認主要清單資料已齊。';}
}
