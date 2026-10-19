const dialog=document.querySelector('#mobile-help');let installPrompt;
document.querySelector('#mobile-button').onclick=()=>dialog.showModal();
document.querySelector('#mobile-close').onclick=()=>dialog.close();
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.querySelector('#install-app').hidden=false;});
document.querySelector('#install-app').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;document.querySelector('#install-app').hidden=true;};
document.querySelector('#share-app').onclick=async()=>{const url=new URL('./',location.href).href;try{if(navigator.share)await navigator.share({title:'AlphaFlow ETF 研究試用',url});else{await navigator.clipboard.writeText(url);document.querySelector('#share-message').textContent='試用網址已複製。';}}catch(error){if(error.name!=='AbortError')document.querySelector('#share-message').textContent='可直接複製瀏覽器網址分享。';}};
fetch('./sync-status.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(s=>{document.querySelector('#sync-label').textContent='試用站同步：'+new Date(s.syncedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})+'（台灣時間）；各 ETF 資料日期請見頁面。';}).catch(()=>{document.querySelector('#sync-label').textContent='無法確認試用站同步時間，請查看各 ETF 資料日期。';});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
// Personal storage belongs to the authenticated original site, never the public mirror.
document.addEventListener('click',e=>{const target=e.target.closest('[data-view="evidence"],[data-view="journal"],#tracking-save,#save-official,#save-pair,#domestic-save');if(!target)return;e.preventDefault();e.stopImmediatePropagation();document.querySelector('#private-help').showModal();},true);
document.querySelector('#private-close').onclick=()=>document.querySelector('#private-help').close();
