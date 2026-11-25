import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mergeThirdPartyTimeline,backupHoldingsHTML} from '../public/third-party-view.js';
import {validateThirdPartyHoldings} from '../public/third-party-data.js';
import {wallEvents} from '../public/wall.js';
import {buildIntervalReport,intervalReportHTML} from '../public/interval-report.js';

const record={asOf:'2026-11-24',provisionalAsOf:'2026-11-24',sourceDisplayedDate:'2026-11-25',retrievedAt:'2026-11-25T00:00:00Z',dateConfidence:'user_authorized_provisional',dateRule:'user_authorized_display_date_minus_one_calendar_day',dateRuleConfirmedBySource:false,dateStatus:'date_conflict',calendarReview:'holiday_status_not_verified',rowCount:2,holdings:[{symbol:'2345',name:'智邦',shares:1000,weightPercent:0},{symbol:'2330',name:'台積電',shares:15000,weightPercent:90}],fundUnits:null,netAssetsTwd:null,sha256:'a'.repeat(64),contentMatchesOfficialDates:['2026-11-20']};
const feeds={'00406A':{schemaVersion:1,fundSymbol:'00406A',sourceId:'zdsetf.public.holdings',source:'zdsetf.com',sourceUrl:'https://zdsetf.com/etf/00406A',coverage:'full_equity',sharesBasis:'actual_shares',series:[record]}};
const official={fundSymbol:'00406A',sourceId:'ctbc.official.fund_equity',dates:[{asOf:'2026-11-20',path:'/official.json',sourceUrl:'https://www.ctbcinvestments.com.tw/'}],pairs:[]};

test('friend backup modules preserve provisional dates and zero-weight holdings',()=>{
 const valid=validateThirdPartyHoldings(feeds,{now:Date.parse('2026-11-25T02:00:00Z')});
 const merged=mergeThirdPartyTimeline({funds:[official]},valid,[{fundSymbol:'00406A',asOf:'2026-11-20',fundUnits:1000,holdings:[{symbol:'2330',name:'台積電',shares:12000,weightPercent:90},{symbol:'2345',name:'智邦',shares:1000,weightPercent:0}]}]);
 const events=wallEvents(merged);assert.equal(events[0].delta,3000);assert.equal(events[0].thirdParty,true);assert.equal(merged.funds[0].pairs[0].afterUnits,null);assert.equal(official.dates.length,1);
 const html=backupHoldingsHTML(valid['00406A'],valid['00406A'].series[0]);assert.match(html,/日期仍暫定/);assert.match(html,/相符日期：2026-11-20/);assert.match(html,/智邦<\/td><td>1,000<\/td><td>1<\/td><td>0%/);assert.ok(html.indexOf('<strong>2330')<html.indexOf('<strong>2345'));
 const report=buildIntervalReport(merged,null,null,{from:'2026-11-20',to:'2026-11-24'});assert.match(intervalReportHTML(report),/跨來源比較/);
});

test('friend entry points retain repository routing, installation and private-data protection',async()=>{
 const get=name=>readFile(new URL('../public/'+name,import.meta.url),'utf8');
 const wall=await get('wall.js'),index=await get('index.html'),mobile=await get('mobile.js');
 assert.match(wall,/import \{publicFetch as fetch\} from '\.\/preview-client\.js'/);assert.match(wall,/buildCostReport\(officialData,/);
 assert.match(index,/app\.js\?v=83/);assert.match(index,/style\.css\?v=83/);assert.match(index,/朋友試用版/);assert.match(index,/manifest\.webmanifest/);assert.match(index,/mobile\.js/);
 assert.match(mobile,/serviceWorker\.register\('\.\/sw\.js'\)/);assert.match(mobile,/stopImmediatePropagation/);assert.match(mobile,/private-help/);
});
