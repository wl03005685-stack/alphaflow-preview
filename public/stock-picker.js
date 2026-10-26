import {esc} from './interval-report.js?v=71';
const normalize=value=>String(value??'').normalize('NFKC').replace(/臺/g,'台').replace(/\s+/g,'').toLowerCase();

export function costStockChoices(report){
 const stocks=new Map((report.stocks??[]).map(s=>[s.symbol,{...s,aliases:[s.name,...(s.events??[]).map(e=>e.name)]}]));
 for(const h of report.holdings?.stocks??[]){
  const stock=stocks.get(h.symbol)??{...h,increaseShares:0,decreaseShares:0,netShares:0,events:[],funds:[],latestPrice:h.latestPrice??null,aliases:[]};
  stock.aliases.push(h.name,...(h.funds??[]).map(f=>f.name));stocks.set(h.symbol,stock);
 }
 return [...stocks.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol,'en',{numeric:true}));
}
export function matchingStocks(choices,query){const q=normalize(query);return choices.filter(s=>[s.symbol,s.name,...(s.aliases??[])].some(v=>normalize(v).includes(q)));}
export function exactStockMatch(choices,query){const q=normalize(query);if(!q)return null;return choices.find(s=>normalize(s.symbol)===q)??(choices.filter(s=>[s.name,...(s.aliases??[])].some(v=>normalize(v)===q)).length===1?choices.find(s=>[s.name,...(s.aliases??[])].some(v=>normalize(v)===q)):null);}

export function renderStockPicker(choices,stock,query=''){
 return `<div class="cost-picker stock-picker"><div><label for="cost-stock-query">輸入股票代號或名稱</label><div class="stock-search-row"><input id="cost-stock-query" type="search" autocomplete="off" enterkeyhint="search" placeholder="例如：2330、台積電、金像電" value="${esc(query)}" aria-describedby="cost-stock-status"><button type="button" id="cost-stock-clear">清除</button></div></div><div><label for="cost-stock">選擇個股 · 依代號排序</label><select id="cost-stock" aria-describedby="cost-stock-status">${choices.map(s=>`<option value="${esc(s.symbol)}"${s.symbol===stock.symbol?' selected':''}>${esc(s.symbol)} ${esc(s.name)}</option>`).join('')}</select></div><p id="cost-stock-status" role="status" aria-live="polite">${choices.length} 檔個股，依代號由小到大。輸入後從清單選擇，唯一符合時可按 Enter。</p><p class="small subtle stock-picker-scope">清單依目前 ETF、日期及上方搜尋條件列出。</p></div>`;
}

export function bindStockPicker(root,choices,selected,{onQuery,onSelect}){
 const input=root.querySelector('#cost-stock-query'),select=root.querySelector('#cost-stock'),clear=root.querySelector('#cost-stock-clear'),status=root.querySelector('#cost-stock-status');
 if(!input||!select)return;
 const current=choices.find(s=>s.symbol===selected);let composing=false;
 const paint=()=>{
  const matches=matchingStocks(choices,input.value),hasCurrent=matches.some(s=>s.symbol===selected);
  select.innerHTML=(hasCurrent?'':`<option value="" selected>${matches.length?'請選擇搜尋結果':'沒有符合的個股'}</option>`)+matches.map(s=>`<option value="${esc(s.symbol)}"${s.symbol===selected?' selected':''}>${esc(s.symbol)} ${esc(s.name)}</option>`).join('');
  select.disabled=!matches.length;clear.disabled=!input.value;
  status.textContent=normalize(input.value)?`${matches.length?'找到 '+matches.length+' 檔，請從清單選擇；唯一符合時可按 Enter。':'找不到符合的個股，請更換關鍵字或清除搜尋。'}目前報告：${current?.symbol??''} ${current?.name??''}。`:`${choices.length} 檔個股，依代號由小到大。可輸入代號或名稱快速尋找。`;
 };
 input.oninput=()=>{onQuery(input.value);paint();};
 input.oncompositionstart=()=>{composing=true;};input.oncompositionend=()=>{composing=false;onQuery(input.value);paint();};
 input.onkeydown=e=>{
  if(composing||e.isComposing||e.keyCode===229)return;
  if(e.key==='Enter'){e.preventDefault();const matches=matchingStocks(choices,input.value),target=exactStockMatch(matches,input.value)??(matches.length===1?matches[0]:null);if(target)onSelect(target.symbol,'cost-stock-query');else if(matches.length)select.focus();}
  if(e.key==='Escape'){input.value='';onQuery('');paint();}
 };
 clear.onclick=()=>{input.value='';onQuery('');paint();input.focus();};
 select.onchange=()=>{if(choices.some(s=>s.symbol===select.value))onSelect(select.value,'cost-stock');};
 paint();
}
