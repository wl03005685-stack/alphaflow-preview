import {activeSubjects} from './active.js';
export const source={id:'YUANTA-0050-20260910',title:'元大投信｜0050 基本資訊',url:'https://www.yuantaetfs.com/product/detail/0050/Basic_information',checkedAt:'2026-09-10',publishedAt:null,scope:'基金身分、追蹤指數、指數調整規則，以及頁面列示的 2026-06-22 調整摘要。',limits:'頁面初次公開時間未確認。未取得指數異動名單、完整歷史持股、實際成交或資金流資料。公開可閱不等於已取得自動採集、保存或再散布授權。'};
export const subjects=[
 ...activeSubjects,
 {id:'0050',kind:'real',code:'0050 · 真實參考',name:'元大台灣50',type:'被動式 ETF',description:'以官方披露建立指數追蹤研究，不推測經理人的個人動機。',tags:['官方資料已核對','持股歷史未接入']},
 {id:'demo-growth',kind:'demo',code:'DEMO A · 完全虛構',name:'成長策略研究組合',type:'主動策略流程示範',description:'練習分辨營運改善、追價與部位配置的不同解釋。',tags:['合成資料','不是實際基金']},
 {id:'demo-risk',kind:'demo',code:'DEMO B · 完全虛構',name:'風險控制研究組合',type:'退出策略流程示範',description:'觀察減碼究竟更接近風險控制，還是基本面轉弱。',tags:['合成資料','不是實際基金']}
];
// All cases below are fabricated teaching fixtures. They do not name real stocks.
export const cases=[
 {name:'情境甲',growth:true,pullback:true,risk:true,cut:true,bought:true},
 {name:'情境乙',growth:true,pullback:false,risk:true,cut:true,bought:true},
 {name:'情境丙',growth:true,pullback:true,risk:true,cut:false,bought:false},
 {name:'情境丁',growth:true,pullback:false,risk:false,cut:true,bought:false},
 {name:'情境戊',growth:false,pullback:true,risk:false,cut:false,bought:true},
 {name:'情境己',growth:false,pullback:false,risk:false,cut:false,bought:false}
];
export function evaluateCases(mode='growth'){
 if(!['growth','growth-pullback','risk'].includes(mode))throw new Error('Unknown hypothesis');
 const rows=cases.map(c=>({...c,predicted:mode==='risk'?c.risk:c.growth&&(mode!=='growth-pullback'||c.pullback),actual:mode==='risk'?c.cut:c.bought}));
 const hits=rows.filter(r=>r.predicted===r.actual).length;
 const positive=rows.filter(r=>r.predicted),supported=positive.filter(r=>r.actual).length;
 return {rows,hits,total:rows.length,positive:positive.length,supported,contradicted:positive.length-supported,missed:rows.filter(r=>!r.predicted&&r.actual).length,baseline:rows.filter(r=>!r.actual).length};
}
export function assessChange({beforeShares,afterShares,beforeUnits,afterUnits,splitFactor=1}){
 const values=[beforeShares,afterShares,beforeUnits,afterUnits,splitFactor];
 if(values.some(v=>typeof v!=='number'||!Number.isFinite(v))||beforeShares<0||afterShares<0||beforeUnits<=0||afterUnits<=0||splitFactor<=0)return {status:'unknown',reason:'缺少可比較的股數、基金單位數或公司行動資訊'};
 const before=beforeShares*splitFactor/beforeUnits,after=afterShares/afterUnits;
 const delta=after-before;
 return {status:Math.abs(delta)<1e-10?'unchanged':'composition_changed',before,after,delta,reason:Math.abs(delta)<1e-10?'每基金單位持股未變，不應只憑總股數增加認定主動加碼':'每基金單位持股變化；仍不能單憑此資料認定成交動機'};
}
export function visibleEvents(events,cutoff){return events.filter(e=>e.availableAt!==null&&e.availableAt<=cutoff);}
