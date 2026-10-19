// Only the reviewed historical interval is supported; never extrapolate holidays.
const bounds={reviewedOn:'2026-09-30',from:'2026-06-29',through:'2026-09-30',basis:'official_scheduled_sessions'};
export const ASIAN_MARKETS={
 JP:{...bounds,label:'日本',currency:'JPY',timeZone:'Asia/Tokyo',exchange:'JPX',suffix:' JP',offset:'+09:00',open:'09:00',close:'15:30',holidays:['2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23'],sources:['https://www.jpx.co.jp/english/corporate/about-jpx/calendar/','https://www.jpx.co.jp/english/equities/trading/domestic/01.html'],note:'日股正常交易時段；午休不另計交易日。'},
 HK:{...bounds,label:'香港',currency:'HKD',timeZone:'Asia/Hong_Kong',exchange:'HKG',suffix:' HK',offset:'+08:00',open:'09:00',close:'16:10',holidays:['2026-07-01'],sources:['https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf','https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market?sc_lang=en'],note:'09:00 為開市前競價開始邊界，使用當日來源開盤價，不宣稱 09:00 可成交；收盤邊界保守取隨機收市最晚 16:10。'},
 CN:{...bounds,label:'深圳',currency:'CNY',timeZone:'Asia/Shanghai',exchange:'SHZ',suffix:' CH',offset:'+08:00',open:'09:15',close:'15:30',holidays:['2026-09-25'],sources:['https://investor.szse.cn/English/services/trading/calendar/index.html','https://investor.szse.cn/disclosure/notice/general/t20260917_622911.html','https://docs.static.szse.cn/www/enSzhk/introduction/news/W020181124399984974002.pdf','https://www.szse.cn/www/investor/index/update/t20200902_581220.html'],note:'僅深圳上市股票。09:15 為開盤集合競價開始邊界，並非成交時刻；保守等至創業板盤後定價交易結束 15:30 才接受完整日行情。'}
};
export function asianSession(market,date){
 const p=ASIAN_MARKETS[market];if(!p)throw Error('Unreviewed market');
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('Invalid session date');
 if(date<p.from||date>p.through)return {known:false,date};
 const open=![0,6].includes(new Date(date).getUTCDay())&&!p.holidays.includes(date);
 return {known:true,date,open,...(open?{openAt:new Date(`${date}T${p.open}:00${p.offset}`).toISOString(),closeAt:new Date(`${date}T${p.close}:00${p.offset}`).toISOString()}:{})};
}
