import {simulateFollowing} from './strategy-engine.js';
export function signalTimingSensitivity(f,prices,calendar,settings){
 return [1,2,3].map(signalLag=>{const r=simulateFollowing(f,prices,calendar,{...settings,timingMode:'holdings_scenario',signalLag});return {signalLag,blocked:!!r.corporateActionAudit?.blocked,returnRate:r.returnRate,buys:r.ledger.filter(t=>t.side==='buy').length,sells:r.ledger.filter(t=>t.side==='sell').length,openPositions:r.openPositions.length,valuationGaps:r.valuationGaps.length};});
}
export function chronologicalHoldout(f,prices,calendar,settings){
 const days=calendar.filter(d=>d>=settings.from&&d<=settings.to);
 if(days.length<20)return {status:'insufficient_history',sessions:days.length,minimum:20};
 const cut=Math.floor(days.length*.7),trainEnd=days[cut-1],testStart=days[cut];
 const train=simulateFollowing(f,prices,calendar,{...settings,to:trainEnd});
 const test=simulateFollowing(f,prices,calendar,{...settings,from:testStart});
 return {status:'fixed_parameter_retrospective_holdout',trainEnd,testStart,train,test,warning:'相同參數，前70%探索、後30%檢查，各自以初始資金開始；不是獨立前瞻驗證。反覆查看後段再調參仍會過度擬合。'};
}
export function costSensitivity(f,prices,calendar,settings){return [0,10,30].map(slippageBps=>{const r=simulateFollowing(f,prices,calendar,{...settings,slippageBps});return {slippageBps,returnRate:r.corporateActionAudit?.blocked?null:r.returnRate,maxDrawdown:r.maxDrawdown,trades:r.ledger.length};});}

// Retrospective walk-forward: selection sees only the preceding training window.
// Each test account starts in cash; per-window returns are not a continuous portfolio.
export function walkForwardValidation(f,prices,calendar,settings,{trainSessions=20,testSessions=5,minClosedTrades=3,candidates=[1,5,10]}={}){
 if(!Number.isInteger(trainSessions)||trainSessions<10||!Number.isInteger(testSessions)||testSessions<2||!Number.isInteger(minClosedTrades)||minClosedTrades<1||!Array.isArray(candidates)||!candidates.length||candidates.length>10||candidates.some(x=>!Number.isInteger(x)||x<1||x>60))throw Error('Invalid validation settings');
 const firstHolding=f.dates.map(d=>d.asOf).sort()[0];
 const days=calendar.filter(d=>d>=settings.from&&d<=settings.to&&firstHolding&&d>=firstHolding),minimum=trainSessions+testSessions;
 if(days.length<minimum)return {status:'insufficient_history',sessions:days.length,minimum,folds:[],trailingSessions:days.length};
 const folds=[];
 for(let cursor=trainSessions;cursor+testSessions<=days.length;cursor+=testSessions){
  const trainFrom=days[cursor-trainSessions],trainTo=days[cursor-1],testFrom=days[cursor],testTo=days[cursor+testSessions-1];
  const scores=[...new Set(candidates)].sort((a,b)=>a-b).map(holdingDays=>{
   const train=simulateFollowing(f,prices,calendar,{...settings,from:trainFrom,to:trainTo,holdingDays});
   const closedTrades=train.ledger.filter(t=>t.side==='sell').length;
   return {holdingDays,returnRate:train.returnRate,closedTrades,openPositions:train.openPositions.length,valuationGaps:train.valuationGaps.length,eligible:!train.corporateActionAudit?.blocked&&closedTrades>=minClosedTrades&&!train.openPositions.length&&!train.valuationGaps.length};
  });
  const selected=scores.filter(s=>s.eligible).sort((a,b)=>b.returnRate-a.returnRate||a.holdingDays-b.holdingDays)[0];
  const fold={trainFrom,trainTo,testFrom,testTo,scores,selectedHoldingDays:selected?.holdingDays??null};
  if(!selected){fold.status='insufficient_training_trades';fold.test=null;}
  else{
   const result=simulateFollowing(f,prices,calendar,{...settings,from:testFrom,to:testTo,holdingDays:selected.holdingDays});
   fold.status=result.ledger.some(t=>t.side==='buy')?'evaluated':'no_test_entries';
   fold.test={corporateActionBlocked:!!result.corporateActionAudit?.blocked,returnRate:result.returnRate,maxDrawdown:result.maxDrawdown,buys:result.ledger.filter(t=>t.side==='buy').length,sells:result.ledger.filter(t=>t.side==='sell').length,openPositions:result.openPositions.length,valuationGaps:result.valuationGaps.length,ledger:result.ledger,curve:result.curve};
  }
  folds.push(fold);
 }
 return {status:'retrospective_walk_forward',trainSessions,testSessions,minClosedTrades,candidates,folds,trailingSessions:(days.length-trainSessions)%testSessions,
  warning:'每段只用前20交易日挑選1／5／10日持有期，再看後5日；其他參數固定。訓練至少3筆平倉且無未平倉與估值缺口才選參數，這是操作門檻，不代表統計顯著。各測試段重新以初始資金開始，不串成連續績效；仍屬歷史探索，不是前瞻驗證。'};
}
