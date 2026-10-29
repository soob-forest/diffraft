// Run from repository root. Uses an isolated Chrome profile and local files.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const profile = await mkdtemp(join(tmpdir(),'docreview-browser-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--no-first-run','--disable-default-apps',`--user-data-dir=${profile}`,'--remote-debugging-port=0','--window-size=1600,1000','about:blank'], {stdio:'ignore'});
let ws;
try {
  let port;
  for(let i=0;i<100;i++){try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(r=>setTimeout(r,100));}}
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map();
  ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(data.error):p.resolve(data.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const seq=++id;pending.set(seq,{resolve,reject});ws.send(JSON.stringify({id:seq,method,params}));});
  const evaluate=async(expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error(`timeout: ${expression}`);};
  await call('Page.enable');
  await call('Page.navigate',{url:pathToFileURL(resolve('docs/design/tobe-implementation.html')).href});
  await wait('document.querySelectorAll("#scenes button").length===6');
  assert.equal(await evaluate('document.querySelectorAll("#captures figure").length'),3);
  for(let index=0;index<6;index++) {
    await evaluate(`document.querySelectorAll('#scenes button')[${index}].click()`);
    await wait(`document.querySelectorAll('#scenes button')[${index}].getAttribute('aria-current')==='page'`);

    await wait('document.querySelectorAll("#captures img").length===3 && [...document.querySelectorAll("#captures img")].every(img=>img.complete&&img.naturalWidth>0)');
  }
  await evaluate('document.querySelectorAll("#scenes button")[2].click()');
  await wait('document.querySelector("#scene-title").textContent.includes("코멘트")');
  await evaluate('document.querySelector("#view").value="after"; document.querySelector("#view").dispatchEvent(new Event("change"));');
  assert.equal(await evaluate('document.querySelectorAll("#captures figure").length'),1);
  await evaluate('document.querySelector("#view").value="target"; document.querySelector("#view").dispatchEvent(new Event("change")); document.querySelector("button.capture").click();');
  assert.equal(await evaluate('document.querySelector("#zoom").open'),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait('!document.querySelector("#zoom").open');
  await wait('document.activeElement.matches("button.capture")');
  await evaluate('document.querySelector("#view").value="all"; document.querySelector("#view").dispatchEvent(new Event("change"));');
  await evaluate('window.scrollTo(0,0)');
  await writeFile('apps/desktop/.artifacts/tobe-comparison-browser.png',Buffer.from((await call('Page.captureScreenshot')).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:680,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  console.log(JSON.stringify({comparisonScreens:6,select:true,single:true,enlarge:true,escape:true,focusReturn:true,narrowOverflow:false}));
} finally { ws?.close(); chrome.kill(); await new Promise(r=>chrome.once('exit',r)); await rm(profile,{recursive:true,force:true}); }
