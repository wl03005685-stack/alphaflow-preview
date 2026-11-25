const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3}).format(n);
const sourceLabel=s=>s?.thirdParty?'第三方 ZDS（日期暫定）':'官方';

function pairSnapshot(pair,side){
 const before=side==='before';
 return {fundUnits:before?pair.beforeUnits:pair.afterUnits,holdings:pair.rows.filter(r=>(before?r.beforeShares:r.afterShares)>0).map(r=>({symbol:r.symbol,name:r.name,shares:before?r.beforeShares:r.afterShares,weightPercent:before?r.beforeWeight:r.afterWeight}))};
}
function compareNodes(a,b){
 const prior=new Map(a.holdings.map(h=>[h.symbol,h])),next=new Map(b.holdings.map(h=>[h.symbol,h]));
 const rows=[...new Set([...prior.keys(),...next.keys()])].sort().map(symbol=>{
  const x=prior.get(symbol),y=next.get(symbol),before=x?.shares??0,after=y?.shares??0,delta=after-before;
  return {symbol,name:y?.name??x?.name??symbol,beforeShares:before,afterShares:after,delta,kind:before===0&&after>0?'added':before>0&&after===0?'removed':delta>0?'increased':delta<0?'decreased':'unchanged',beforeWeight:x?.weightPercent??null,afterWeight:y?.weightPercent??null,perMillionUnitsChange:a.fundUnits&&b.fundUnits?(after/b.fundUnits-before/a.fundUnits)*1e6:null};
 });
 const sourceNote=`${sourceLabel(a)} → ${sourceLabel(b)}${a.thirdParty!==b.thirdParty?'；跨來源比較':''}；原始股數差異，非單日成交`;
 return {from:a.asOf,to:b.asOf,beforePath:a.path,afterPath:b.path,beforeUnits:a.fundUnits,afterUnits:b.fundUnits,spanDays:Math.round((Date.parse(b.asOf)-Date.parse(a.asOf))/86400000),counts:Object.fromEntries(['added','removed','increased','decreased','unchanged'].map(k=>[k,rows.filter(r=>r.kind===k).length])),rows,thirdParty:true,crossSource:!!a.thirdParty!==!!b.thirdParty,sourceNote,beforeSourceUrl:a.sourceUrl,afterSourceUrl:b.sourceUrl,sourceDisplayedDate:b.sourceDisplayedDate??null};
}

// This display model is separate from official snapshots used by cost/backtests.
export function mergeThirdPartyTimeline(data,feeds={},officialSnapshots=[]){
 const funds=data.funds.map(f=>({...f,dates:[...f.dates],pairs:[...f.pairs]}));
 for(const [symbol,feed] of Object.entries(feeds)){
  if(!feed?.series?.length)continue;
  let f=funds.find(f=>f.fundSymbol===symbol);
  if(!f){f={fundSymbol:symbol,sourceId:feed.sourceId,dates:[],pairs:[]};funds.push(f);}
  const nodes=new Map();
  for(const d of f.dates)nodes.set(d.asOf,{...d,sourceId:f.sourceId,thirdParty:false});
  for(const p of f.pairs){for(const [side,date] of [['before',p.from],['after',p.to]]){const d=nodes.get(date);if(d)Object.assign(d,pairSnapshot(p,side));}}
  for(const s of officialSnapshots.filter(s=>s.fundSymbol===symbol)){
   const d=nodes.get(s.asOf);if(d)Object.assign(d,{holdings:s.holdings,fundUnits:s.fundUnits});
  }
  const thirdPartySeries=feed.series.filter(s=>!nodes.has(s.asOf));
  for(const s of thirdPartySeries)nodes.set(s.asOf,{...s,rows:s.rowCount,path:feed.sourceUrl,sourceUrl:feed.sourceUrl,sourceId:feed.sourceId,thirdParty:true,scope:'第三方完整股票清單；日期依使用者指定暫定',fundUnits:null});
  const ordered=[...nodes.values()].sort((a,b)=>a.asOf.localeCompare(b.asOf)),originalPairs=new Map(f.pairs.map(p=>[p.from+'|'+p.to,p])),pairs=[];
  for(let i=1;i<ordered.length;i++){
   const a=ordered[i-1],b=ordered[i],original=originalPairs.get(a.asOf+'|'+b.asOf);
   if(original&&!a.thirdParty&&!b.thirdParty)pairs.push(original);
   else if(a.holdings&&b.holdings)pairs.push(compareNodes(a,b));
  }
  f.dates=ordered.map(({holdings,fundUnits,...d})=>d);f.pairs=pairs;f.thirdPartySeries=thirdPartySeries;f.thirdPartySource=feed;
 }
 return {...data,funds};
}

export function backupHoldingsHTML(feed,record,{query='',open=false}={}){
 if(!feed||!record)return '';
 const q=query.trim().toLowerCase(),holdings=[...record.holdings].sort((a,b)=>a.symbol.localeCompare(b.symbol)).filter(h=>(h.symbol+' '+h.name+' '+feed.fundSymbol).toLowerCase().includes(q));
 return `<section class="note backup-holdings" aria-label="${esc(feed.fundSymbol)} 第三方備援持股"><p><strong>第三方備援 · ${esc(record.asOf)}（暫定持股日） · ${record.rowCount} 檔</strong><br>來源 <a href="${esc(feed.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(feed.source)} ↗</a>；頁面標示 ${esc(record.sourceDisplayedDate)}，依指定方式減一天。${record.calendarReview==='weekend_requires_review'?' 暫定日期落在週末，仍待確認。':''}${record.dateStatus==='date_conflict'?' 內容曾與其他官方日期相符，日期仍暫定'+(record.contentMatchesOfficialDates?.length?'（相符日期：'+record.contentMatchesOfficialDates.map(esc).join('、')+'）':'')+'。':''}</p><p class="small">基金資產與單位數未提供；規模篩選沿用有日期的官方紀錄。此處呈現完整持股與原始股數差異，未納入持有成本或回測。</p><details${open||q?' open':''}><summary>查看完整 ${record.rowCount} 檔持股（依代號排序）</summary><p class="small">可用上方搜尋欄輸入股票代號或名稱。${q?'目前符合 '+holdings.length+' 檔。':''}</p><div class="table-wrap"><table><thead><tr><th>代號／股票</th><th>持有股數</th><th>張數</th><th>權重</th></tr></thead><tbody>${holdings.length?holdings.map(h=>`<tr><td><strong>${esc(h.symbol)}</strong> ${esc(h.name)}</td><td>${number(h.shares)}</td><td>${number(h.shares/1000)}</td><td>${number(h.weightPercent)}%</td></tr>`).join(''):'<tr><td colspan="4">沒有符合搜尋的持股。</td></tr>'}</tbody></table></div><p class="small">取得時間：${esc(new Date(record.retrievedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}))}（台灣）。暫定日期不代表來源已證實持股基準日。</p></details></section>`;
}
