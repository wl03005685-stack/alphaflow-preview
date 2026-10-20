const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function trajectoryPoints(history){
 const points=new Map();
 for(const {p,r} of [...history].sort((a,b)=>a.p.to.localeCompare(b.p.to))){points.set(p.from,r.beforeShares);points.set(p.to,r.afterShares);}
 return [...points].sort(([a],[b])=>a.localeCompare(b)).map(([date,shares])=>({date,shares}));
}
export function newestFirst(history){return [...history].sort((a,b)=>b.p.to.localeCompare(a.p.to)||b.p.from.localeCompare(a.p.from));}
export function trajectoryChart(history,symbol){
 const points=trajectoryPoints(history);if(!points.length)return '<p>尚無可繪圖的持股紀錄。</p>';
 const unit=/^\d{4,6}$/.test(symbol)?'張':'股',divisor=unit==='張'?1000:1;
 const values=points.map(p=>p.shares/divisor),max=Math.max(1,...values)*1.08;
 const start=Date.parse(points[0].date),span=Math.max(86400000,Date.parse(points.at(-1).date)-start);
 const x=p=>70+(Date.parse(p.date)-start)/span*580,y=v=>230-v/max*180;
 const fmt=n=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3}).format(n);
 const ticks=[0,1,2,3,4].map(i=>{const v=max*i/4;return `<line x1="70" y1="${y(v)}" x2="650" y2="${y(v)}" stroke="#dce5ec"/><text x="60" y="${y(v)+4}" text-anchor="end">${fmt(v)}</text>`;}).join('');
 const dateTicks=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])].map(i=>`<text x="${x(points[i])}" y="252" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${points[i].date}</text>`).join('');
 return `<section class="trajectory-chart" aria-label="持股張數走勢"><h3>持股${unit}數走勢</h3><p>橫軸：日期 · 縱軸：持有${unit}數</p><div class="trajectory-scroll"><svg viewBox="0 0 700 285" role="img" aria-label="${esc(symbol)} 持股${unit}數，${points[0].date} 至 ${points.at(-1).date}" style="width:100%;min-width:0;font-size:16px;fill:#435969"><text x="70" y="25">持有${unit}數（${unit}）</text>${ticks}<polyline fill="none" stroke="#147b85" stroke-width="2.5" points="${points.map((p,i)=>`${x(p)},${y(values[i])}`).join(' ')}"/>${points.map((p,i)=>`<circle cx="${x(p)}" cy="${y(values[i])}" r="3" fill="#147b85"><title>${p.date}：${fmt(values[i])} ${unit}</title></circle>`).join('')}<circle id="trajectory-marker" cx="${x(points.at(-1))}" cy="${y(values.at(-1))}" r="6" fill="#edb34f" stroke="#19314b" stroke-width="2"/>${dateTicks}<text x="650" y="278" text-anchor="end">日期 →</text></svg></div><label for="trajectory-date">拖曳查看各期持股</label><input id="trajectory-date" aria-label="選擇圖表資料日期" type="range" min="0" max="${points.length-1}" value="${points.length-1}" step="1" style="width:100%;min-height:44px"><output id="trajectory-value" for="trajectory-date" aria-live="polite">${points.at(-1).date}：${fmt(values.at(-1))} ${unit}</output><p class="small subtle">僅連接已保存的觀察點；缺日未補值。股數變化可能包含基金申贖與公司行動。</p></section>`;
}
export function bindTrajectory(root,history,symbol){
 const points=trajectoryPoints(history),input=root.querySelector('#trajectory-date');if(!input)return;
 const divisor=/^\d{4,6}$/.test(symbol)?1000:1,unit=divisor===1000?'張':'股',max=Math.max(1,...points.map(p=>p.shares/divisor))*1.08,start=Date.parse(points[0].date),span=Math.max(86400000,Date.parse(points.at(-1).date)-start);
 input.oninput=()=>{const p=points[Number(input.value)];root.querySelector('#trajectory-value').textContent=`${p.date}：${new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3}).format(p.shares/divisor)} ${unit}`;const marker=root.querySelector('#trajectory-marker');marker.setAttribute('cx',70+(Date.parse(p.date)-start)/span*580);marker.setAttribute('cy',230-(p.shares/divisor)/max*180);};
}
