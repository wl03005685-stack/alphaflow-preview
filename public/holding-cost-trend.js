import {esc,fundNames} from './interval-report.js?v=71';
const n=x=>Number.isFinite(x)?x.toLocaleString('zh-TW',{maximumFractionDigits:2}):'未知';
const money=x=>Number.isFinite(x)?n(x)+' 元':'無法估算';
export function holdingTrendPoints(row){
 const points=[...(row.openingPoint?[row.openingPoint]:[]),...(row.history??[])];
 if(!points.length)points.push({to:row.asOf,shares:row.shares,coveredShares:row.coveredShares,average:row.average,status:'目前只有一份持股資料'});
 return points.sort((a,b)=>a.to.localeCompare(b.to));
}
export function holdingTrendChart(row,selectedDate,compact=false){
 const width=compact?420:720,right=width-36;
 const points=holdingTrendPoints(row),valid=points.filter(p=>Number.isFinite(p.average)&&p.coveredShares>0);
 const dates=points.map(p=>Date.parse(p.to)),start=Math.min(...dates),span=Math.max(...dates)-start;
 const x=p=>span?64+(Date.parse(p.to)-start)/span*(right-64):(64+right)/2;
 const values=valid.map(p=>p.average),low=values.length?Math.min(...values):0,high=values.length?Math.max(...values):1,pad=Math.max((high-low)*.15,high*.01,1);
 const y=v=>158-(v-low+pad)/(high-low+pad*2)*112;
 const maxShares=Math.max(...points.map(p=>p.shares/1000),1),sy=v=>316-v/maxShares*90;
 const ticks=valid.length?[0,1,2].map(i=>{const v=low-pad+(high-low+pad*2)*i/2;return `<line x1="64" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="trend-grid"/><text x="57" y="${y(v)+4}" text-anchor="end">${n(compact?Math.round(v):v)}</text>`;}).join(''):'';
 let previous=null;
 const costLine=points.map(p=>{if(!Number.isFinite(p.average)||p.coveredShares<=0){previous=null;return '';}
  const line=previous?`<path class="trend-cost-line" d="M ${x(previous)} ${y(previous.average)} L ${x(p)} ${y(p.average)}"/>`:'';previous=p;
  return `${line}<circle class="trend-cost-point" cx="${x(p)}" cy="${y(p.average)}" r="4"><title>${esc(p.to)} · 可估均價 ${money(p.average)} · 涵蓋 ${n(p.shares?p.coveredShares/p.shares*100:0)}%</title></circle>`;
 }).join('');
 const qtyLine=field=>points.map((p,i)=>`${i?'L':'M'} ${x(p)} ${sy(p[field]/1000)}`).join(' ');
 const chosen=points.find(p=>p.to===selectedDate)??points.at(-1);
 const labels=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])].map(i=>`<text x="${x(points[i])}" y="342" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${esc(points[i].to.slice(5))}</text>`).join('');
 return `<svg class="${compact?'trend-mobile':'trend-desktop'}" viewBox="0 0 ${width} 356" role="img" aria-label="${esc(row.fund)} 成本與持股走勢，橫軸日期，上圖均價元，下圖持有張數"><text x="64" y="22">可估部分持有均價（元／股）</text>${ticks}${costLine}${valid.length?'':`<text x="${(64+right)/2}" y="105" text-anchor="middle">尚無可估成本，保留未知</text>`}<text x="64" y="202">持有張數</text>${[0,.5,1].map(v=>`<line class="trend-grid" x1="64" x2="${right}" y1="${sy(v*maxShares)}" y2="${sy(v*maxShares)}"/><text x="57" y="${sy(v*maxShares)+4}" text-anchor="end">${n(compact?Math.round(v*maxShares):v*maxShares)}</text>`).join('')}<path class="trend-total-line" d="${qtyLine('shares')}"/><path class="trend-covered-line" d="${qtyLine('coveredShares')}"/>${points.map(p=>`<circle cx="${x(p)}" cy="${sy(p.shares/1000)}" r="3" class="trend-total-point"><title>${esc(p.to)}：持有 ${n(p.shares/1000)} 張，可估 ${n(p.coveredShares/1000)} 張</title></circle>`).join('')}<line x1="${x(chosen)}" x2="${x(chosen)}" y1="30" y2="320" class="trend-selected"/>${labels}</svg>`;
}
export function renderHoldingTrend(stock,{fund='',date='',download=false}={}){
 const rows=stock?.funds??[],row=rows.find(r=>r.fund===fund)??rows[0];if(!row)return '';
 const points=holdingTrendPoints(row),selected=points.find(p=>p.to===date)??points.at(-1),coverage=selected.shares?selected.coveredShares/selected.shares*100:0;
 return `<section class="holding-trend" aria-label="持有成本與張數走勢"><h4>持有成本與張數走勢</h4>${download?`<p>${esc(row.issuer)} · ${esc(row.fund)} ${esc(fundNames[row.fund]??'')} · 檢視 ${esc(selected.to)}</p>`:`<div class="holding-trend-controls"><label>查看 ETF<select id="holding-trend-fund">${rows.map(r=>`<option value="${esc(r.fund)}"${r.fund===row.fund?' selected':''}>${esc(r.fund)} ${esc(r.issuer)}</option>`).join('')}</select></label><label>查看日期（最新在前）<select id="holding-trend-date">${[...points].reverse().map(p=>`<option value="${esc(p.to)}"${p.to===selected.to?' selected':''}>${esc(p.to)}</option>`).join('')}</select></label></div>`}<div class="holding-trend-reading" aria-live="polite"><strong>${esc(selected.to)} · ${esc(row.fund)}</strong><dl><div><dt>可估部分均價</dt><dd>${money(selected.average)}</dd></div><div><dt>持有張數</dt><dd>${n(selected.shares/1000)} 張</dd></div><div><dt>模型涵蓋</dt><dd>${n(coverage)}%</dd></div><div><dt>未知成本部位</dt><dd>${n(Math.max(0,selected.shares-selected.coveredShares)/1000)} 張</dd></div></dl><p>${esc(selected.status)}${row.seededShares>0?' · 含期初市價假設':''}</p></div>${holdingTrendChart(row,selected.to)}${holdingTrendChart(row,selected.to,true)}<p class="holding-trend-legend"><span>實線：全部持有張數</span><span>虛線：可估成本張數</span></p><p class="small subtle">橫軸由舊至新，日期選單由新至舊。線段僅連接已保存的觀察點，不代表每日成交；未知均價不畫成零元，也不跨越未知點連線。資料期間 ${esc(points[0].to)} → ${esc(points.at(-1).to)}。</p></section>`;
}
