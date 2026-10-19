import {publicFetch as fetch} from './preview-client.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'無法計算':n.toLocaleString('zh-TW',{maximumFractionDigits:2});
export function decomposePair(pair){
 const valid=Number.isFinite(pair.beforeUnits)&&pair.beforeUnits>0&&Number.isFinite(pair.afterUnits)&&pair.afterUnits>0;
 const ratio=valid?pair.afterUnits/pair.beforeUnits:null;
 return {from:pair.from,to:pair.to,beforeUnits:pair.beforeUnits,afterUnits:pair.afterUnits,unitChangePercent:valid?(ratio-1)*100:null,companyActions:'未核對；未調整個股及基金分割、配股等公司行動',rows:pair.rows.map(r=>{
  const raw=r.afterShares-r.beforeShares;
  const proportional=valid?r.beforeShares*(ratio-1):null;
  const residual=valid?raw-proportional:null;
  return {symbol:r.symbol,name:r.name,beforeShares:r.beforeShares,afterShares:r.afterShares,raw,proportional,residual,opposite:valid&&Math.abs(raw)>1e-8&&Math.abs(residual)>1e-8&&Math.sign(raw)!==Math.sign(residual)};
 })};
}
// Peer dates are only review candidates, never a substitute for an issuer calendar.
export function peerDateGaps(data,fund){
 const own=new Set(fund.dates.map(d=>d.asOf));if(!own.size)return [];
 const domestic=new Set(['00981A','00982A','00403A','00405A','00992A','00993A','00984A','00995A','00987A','00410A','00408A','00994A','00407A','00996A','00991A','00406A']);
 if(!domestic.has(fund.fundSymbol))return [];
 const first=fund.dates[0].asOf,last=fund.dates.at(-1).asOf;
 return [...new Set(data.funds.filter(f=>domestic.has(f.fundSymbol)).flatMap(f=>f.dates.map(d=>d.asOf)))].filter(d=>d>first&&d<last&&!own.has(d)).sort();
}
export async function mountDecomposition(root,symbol){
 root.textContent='正在整理增減拆解…';
 try{
  const response=await fetch('/timeline-data.json');if(!response.ok)throw Error();
  const data=await response.json(),fund=data.funds.find(f=>f.fundSymbol===symbol);
  if(!fund?.pairs.length){root.textContent='需要同來源的兩期完整持股才能拆解。';return;}
  const gaps=peerDateGaps(data,fund);
  root.innerHTML=`<h2>持股增減拆解</h2><p>先區分觀察到的股數變化與基金單位數變化下的等比例試算，再查尚未解釋的差額。</p><p class="note">等比例試算假設每基金單位持股不變；它不是實際申贖帶來的股數。剩餘差額可能包含調整持股、個股或基金分割、配股與資料修正，不能直接當成經理人主動買賣。</p><div class="toolbar"><label>比較區間<select id="decomp-period">${fund.pairs.map((p,i)=>({p,i})).reverse().map(({p,i})=>`<option value="${i}">${esc(p.from)} → ${esc(p.to)}</option>`).join('')}</select></label><label class="search"><input id="decomp-query" type="search" placeholder="搜尋股票代碼或名稱" aria-label="搜尋拆解股票"></label><label>顯示<select id="decomp-filter"><option value="all">全部股票</option><option value="opposite">股數與剩餘差額方向相反</option><option value="changed">原始股數有變化</option></select></label><button class="outline" id="decomp-export">下載拆解 JSON</button></div><div id="decomp-summary"></div><p id="decomp-count" role="status"></p><div class="table-wrap"><table><thead><tr><th>股票</th><th>原始增減（股）</th><th>等比例試算（股）</th><th>剩餘差額（股）</th><th>方向對照</th></tr></thead><tbody id="decomp-rows"></tbody></table></div><details class="note"><summary>歷史日期待核對</summary><p>${gaps.length?`同為台股的其他追蹤 ETF 在以下日期有快照，但本檔尚未保存：${gaps.map(esc).join('、')}。`:'目前沒有以台股同組快照辨識出的日期缺口；這不代表歷史完整。'}</p><p>只檢查本檔最早到最新已保存日期之間。海外 ETF 不套用台股日期；各發行商公告規則與休市日仍需核對。較早的歷史尚待擴充。</p></details><details class="note"><summary>公式與證據限制</summary><p>等比例試算＝前期個股股數 ×（後期基金單位數 ÷ 前期基金單位數 − 1）；剩餘差額＝原始增減 − 等比例試算。缺少有效基金單位數時不計算。畫面四捨五入到小數兩位，下載保留計算值。</p><p>公司行動未核對，所有區間均未據此調整。基金單位數變動也不能直接當成申贖金額。</p></details>`;
  const selected=()=>fund.pairs[Number(root.querySelector('#decomp-period').value)];
  const draw=()=>{
   const p=selected(),report=decomposePair(p),q=root.querySelector('#decomp-query').value.trim().toLowerCase(),filter=root.querySelector('#decomp-filter').value;
   const rows=report.rows.filter(r=>(r.symbol+' '+r.name).toLowerCase().includes(q)&&(filter==='all'||filter==='opposite'&&r.opposite||filter==='changed'&&r.raw!==0));
   const span=Math.round((Date.parse(p.to)-Date.parse(p.from))/86400000);
   root.querySelector('#decomp-summary').innerHTML=`<p><strong>${esc(p.from)} → ${esc(p.to)}</strong> · 相隔 ${span} 個日曆日${span>1?'；本區間淨變化不等於單日買賣':''}</p><p>基金單位數：${fmt(p.beforeUnits)} → ${fmt(p.afterUnits)}；變化 ${report.unitChangePercent==null?'無法計算':fmt(report.unitChangePercent)+'%'}</p><p><a href="${esc(p.beforePath)}" target="_blank" rel="noopener">前期完整快照</a> · <a href="${esc(p.afterPath)}" target="_blank" rel="noopener">後期完整快照</a> · 公司行動：未核對</p>`;
   root.querySelector('#decomp-count').textContent=`顯示 ${rows.length} / ${report.rows.length} 檔；全區間 ${report.rows.filter(r=>r.opposite).length} 檔方向相反`;
   root.querySelector('#decomp-rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.name)}<br><small>${esc(r.symbol)}</small></td><td>${fmt(r.raw)}</td><td>${fmt(r.proportional)}</td><td>${fmt(r.residual)}</td><td>${r.residual==null?'缺基金單位數':r.opposite?'方向相反':'—'}</td></tr>`).join(''):'<tr><td colspan="5">沒有符合條件的股票。</td></tr>';
  };
  root.querySelector('#decomp-period').onchange=draw;root.querySelector('#decomp-filter').onchange=draw;root.querySelector('#decomp-query').oninput=draw;
  root.querySelector('#decomp-export').onclick=()=>{const p=selected();const report={fundSymbol:symbol,sourceId:fund.sourceId,...decomposePair(p),beforePath:p.beforePath,afterPath:p.afterPath,method:'proportional_fund_units_counterfactual',warning:'試算與剩餘差額不是已驗證申贖效果或主動買賣；公司行動未核對。'};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${symbol}-${p.from}-${p.to}-decomposition.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};draw();
 }catch{root.textContent='增減拆解載入失敗，請重新開啟分頁。';}
}
