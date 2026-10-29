// Run from repository root with the local HTTP server on 127.0.0.1:8766.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  await call('Page.navigate',{url:'http://127.0.0.1:8766/docs/design/design-reimplementation.html'});
  await wait('document.querySelectorAll("#screens button").length===11');
  assert.equal(await evaluate('document.querySelectorAll("#comparison figure").length'),3);
  for(let index=0;index<11;index++) {
    await evaluate(`document.querySelectorAll('#screens button')[${index}].click()`);
    await wait(`document.querySelector('#screen-title').textContent.startsWith('S${String(index).padStart(2,'0')}')`);
    await wait('document.querySelectorAll("#comparison img").length===3 && [...document.querySelectorAll("#comparison img")].every(img=>img.complete&&img.naturalWidth>0)');
  }
  await evaluate('document.querySelectorAll("#screens button")[2].click()');
  await wait('document.querySelector("#screen-title").textContent.startsWith("S02")');
  await evaluate('document.querySelector("#view").value="after"; document.querySelector("#view").dispatchEvent(new Event("change"));');
  assert.equal(await evaluate('document.querySelectorAll("#comparison figure").length'),1);
  await evaluate('document.querySelector("#view").value="target"; document.querySelector("#view").dispatchEvent(new Event("change")); document.querySelector("figcaption button").click();');
  assert.equal(await evaluate('document.querySelector("#zoom").open'),true);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await wait('!document.querySelector("#zoom").open');
  await wait('document.activeElement.matches("figcaption button")');
  await evaluate('document.querySelector("#view").value="all"; document.querySelector("#view").dispatchEvent(new Event("change"));');
  await writeFile('apps/desktop/.artifacts/comparison-browser.png',Buffer.from((await call('Page.captureScreenshot')).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:680,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  await call('Page.navigate',{url:'http://127.0.0.1:8766/docs/design/reimplementation-states.html'});
  await wait('document.querySelectorAll("#state option").length===19');
  for(let index=0;index<19;index++){await evaluate(`document.querySelector('#state').value=${index};document.querySelector('#state').dispatchEvent(new Event('change'))`);assert.equal(await evaluate('document.querySelectorAll(".state-contract").length'),1);}
  await writeFile('apps/desktop/.artifacts/states-browser.png',Buffer.from((await call('Page.captureScreenshot')).data,'base64'));
  console.log(JSON.stringify({comparisonScreens:11,states:19,select:true,single:true,enlarge:true,escape:true,focusReturn:true,narrowOverflow:false}));
} finally { ws?.close(); chrome.kill(); await new Promise(r=>chrome.once('exit',r)); await rm(profile,{recursive:true,force:true}); }
