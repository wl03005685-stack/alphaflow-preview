import {publicFetch as fetch} from './preview-client.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function checkContinuation(f,{direction=1,metric='shares'}={}){
 if(![1,-1].includes(direction)||!['shares','units'].includes(metric))throw Error('Invalid rule');
 const value=r=>metric==='shares'?r.delta:r.perMillionUnitsChange;
 const sign=n=>n==null||!Number.isFinite(n)?null:Math.abs(n)<1e-8?0:Math.sign(n);
 const cases=[];
 for(let i=0;i<f.pairs.length;i++){
  const p=f.pairs[i],next=f.pairs[i+1];
  for(const row of p.rows){if(sign(value(row))!==direction)continue;
   // Exits cannot decrease below zero; retain them as explicitly ineligible.
   const ineligible=direction<0&&row.afterShares===0;
   const result=next?.from===p.to?next.rows.find(x=>x.symbol===row.symbol):null;
   const actual=result?sign(value(result)):null;
   cases.push({symbol:row.symbol,name:row.name,from:p.from,signalDate:p.to,outcomeDate:next?.from===p.to?next.to:null,
    signal:value(row),actual:result?value(result):null,status:ineligible?'ineligible':actual===null?'pending':actual===direction?'support':actual===0?'unchanged':'opposite',
    beforePath:p.beforePath,signalPath:p.afterPath,outcomePath:next?.from===p.to?next.afterPath:null});
  }
 }
 const eligible=cases.filter(c=>['support','unchanged','opposite'].includes(c.status));
 return {fundSymbol:f.fundSymbol,sourceId:f.sourceId,direction,metric,cases,total:eligible.length,support:eligible.filter(c=>c.status==='support').length,baseline:eligible.filter(c=>c.status==='unchanged').length,periods:new Set(eligible.map(c=>c.signalDate)).size,pending:cases.filter(c=>c.status==='pending').length,ineligible:cases.filter(c=>c.status==='ineligible').length};
}
export async function mountBehaviorCheck(root,fundSymbol){
 root.textContent='正在核對歷史條件…';try{
 const response=await fetch('/timeline-data.json');if(!response.ok)throw Error();const f=(await response.json()).funds.find(x=>x.fundSymbol===fundSymbol);
 if(!f?.pairs.length){root.textContent='至少需要三期完整持股，才能核對變化後的下一期。';return;}
 root.innerHTML=`<h2>增減會延續嗎？</h2><p>把每次增加或減少當成觀察起點，檢查下一個已保存區間是否同方向變化。</p><div class="toolbar"><label>條件<select id="bc-direction"><option value="1">增加後繼續增加</option><option value="-1">減少後繼續減少</option></select></label><label>衡量方式<select id="bc-metric"><option value="shares">總股數</option><option value="units">每百萬基金單位持股</option></select></label></div><div id="bc-summary"></div><div class="toolbar"><label>案例<select id="bc-filter"><option value="all">全部案例</option><option value="support">支持條件</option><option value="counter">反例：不變或反向</option><option value="pending">等待後續資料</option><option value="ineligible">已移出，無法繼續減少</option></select></label><button class="outline" id="bc-download">下載本次檢驗</button></div><p id="bc-count" role="status"></p><div class="table-wrap"><table><thead><tr><th>股票</th><th>條件成立日</th><th>核對日</th><th>下一期變化</th><th>結果</th><th>證據</th></tr></thead><tbody id="bc-rows"></tbody></table></div><p class="note">這是事後歷史探索，不是事前預測或報酬回測。規則只使用前一區間的方向，不挑最佳參數；所有符合條件的股票均納入。同一股票與同一天的案例可能互相關聯，案例數不是獨立樣本數。下一期指下一份已保存快照，日期缺口不補造。單位化仍未排除公司行動，也不能確認交易動機。</p>`;
 let report;const labels={support:'支持',unchanged:'反例：不變',opposite:'反例：反向',pending:'等待資料',ineligible:'已移出，排除'};
 const draw=()=>{
 report=checkContinuation(f,{direction:Number(root.querySelector('#bc-direction').value),metric:root.querySelector('#bc-metric').value});
 const rate=n=>report.total?(100*n/report.total).toFixed(1)+'%':'—';
 root.querySelector('#bc-summary').innerHTML=`<div class="score"><div><strong>${report.total}</strong><span>可核對案例 · ${report.periods} 個起點日期</span></div><div><strong>${report.support} / ${report.total}</strong><span>同方向延續 · ${rate(report.support)}</span></div><div><strong>${report.baseline} / ${report.total}</strong><span>簡單基準：下一期不變 · ${rate(report.baseline)}</span></div><div><strong>${report.pending}</strong><span>等待資料 · 另排除 ${report.ineligible} 筆已移出</span></div></div><p>${report.total?`此區間延續案例${report.support>report.baseline?'多於':report.support<report.baseline?'少於':'等於'}不變案例；尚不能據此判定長期可預測性。`:'目前沒有可完成核對的案例。'}</p>`;
 const filter=root.querySelector('#bc-filter').value,rows=report.cases.filter(c=>filter==='all'||(filter==='counter'?['unchanged','opposite'].includes(c.status):c.status===filter));
 root.querySelector('#bc-count').textContent=`顯示 ${rows.length} 筆案例`;
 root.querySelector('#bc-rows').innerHTML=rows.length?rows.map(c=>`<tr><td>${esc(c.name)}<br>${esc(c.symbol)}</td><td>${c.from} → ${c.signalDate}</td><td>${c.outcomeDate??'尚無'}</td><td>${c.actual==null?'—':c.actual.toLocaleString('zh-TW',{maximumFractionDigits:2})}${report.metric==='shares'?' 股':' 股／百萬單位'}</td><td>${labels[c.status]}</td><td><a href="${esc(c.beforePath)}" target="_blank" rel="noopener">起始</a> · <a href="${esc(c.signalPath)}" target="_blank" rel="noopener">條件</a>${c.outcomePath?` · <a href="${esc(c.outcomePath)}" target="_blank" rel="noopener">核對</a>`:''}</td></tr>`).join(''):'<tr><td colspan="6">沒有符合條件的案例。</td></tr>';
 };
 for(const id of ['bc-direction','bc-metric','bc-filter'])root.querySelector('#'+id).onchange=draw;
 root.querySelector('#bc-download').onclick=()=>{const blob=new Blob([JSON.stringify({...report,method:'retrospective_next_saved_interval_continuation',limitations:'Not prospective, independent samples, manager motives or return backtesting'},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fundSymbol+'-behavior-check.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};draw();
 }catch{root.textContent='歷史檢驗載入失敗，請重新開啟此分頁。';}
}
