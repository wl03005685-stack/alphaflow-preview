import {publicFetch as fetch} from './preview-client.js';
export const MIN_FUND_ASSETS_TWD=10_000_000_000;
export const FUND_SCOPE_NOTE='主要觀察僅納入最新已保存基金淨資產達新臺幣 100 億的 ETF（含 100 億）。低於門檻或規模未確認者不計入合計；歷史資料仍保留。這是目前觀察名單，不代表歷史當時的基金規模。';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function loadFundScope(tracking,fetcher=fetch){
 const latest=new Map();
 for(const s of tracking.snapshots??[])if(!latest.has(s.fundSymbol)||latest.get(s.fundSymbol).asOf<s.asOf)latest.set(s.fundSymbol,s);
 const rows=await Promise.all([...latest.values()].map(async s=>{
  let assets=null;
  try{const response=await fetcher(s.path,{cache:'no-store'});if(!response.ok)throw Error();const snapshot=await response.json(),value=snapshot.observation?.netAssetsTwd;
   if(snapshot.fundSymbol===s.fundSymbol&&snapshot.asOf===s.asOf&&typeof value==='number'&&Number.isFinite(value)&&value>0)assets=value;
  }catch{/* Unavailable size must not silently qualify or fall back to an older date. */}
  return {symbol:s.fundSymbol,asOf:s.asOf,path:s.path,assets,eligible:assets!==null&&assets>=MIN_FUND_ASSETS_TWD};
 }));
 return {rows,eligible:new Set(rows.filter(r=>r.eligible).map(r=>r.symbol))};
}
export function filterFundTimeline(data,scope){return {...data,funds:data.funds.filter(f=>scope.eligible.has(f.fundSymbol))};}
export function fundScopeHTML(scope){
 const below=scope.rows.filter(r=>r.assets!==null&&!r.eligible),unknown=scope.rows.filter(r=>r.assets===null);
 return `<section class="note fund-scope"><strong>主要觀察：基金規模 100 億以上 · ${scope.eligible.size} 檔</strong><p>${FUND_SCOPE_NOTE}</p><details><summary>查看規模依據與排除名單（低於門檻 ${below.length} 檔／待確認 ${unknown.length} 檔）</summary><div class="table-wrap"><table><thead><tr><th>ETF</th><th>基金規模（億元）</th><th>資料日期</th><th>觀察狀態</th></tr></thead><tbody>${scope.rows.map(r=>`<tr><td>${esc(r.symbol)}</td><td>${r.assets===null?'待確認':(r.assets/1e8).toLocaleString('zh-TW',{maximumFractionDigits:2})}</td><td><a href="${esc(r.path)}" target="_blank" rel="noopener">${esc(r.asOf)}</a></td><td>${r.eligible?'納入':r.assets===null?'規模待確認':'低於 100 億，已排除'}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}
