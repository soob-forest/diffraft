import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve("docs/design/tobe-captures");
const read = path => JSON.parse(readFileSync(resolve(root,path),"utf8"));
const metrics = [];
function compare(scene,label,target,actual,keys=["x","y","width","height"]) {
  assert.ok(target && actual,`${scene}/${label} evidence missing`);
  const delta = Object.fromEntries(keys.map(key=>[key,Math.abs(actual[key]-target[key])]));
  const maximumError = Math.max(...Object.values(delta));
  metrics.push({scene,label,target,actual,delta,maximumError,passed:maximumError<=2});
}
for (const scene of ["request","review","comment","resume","narrow","connection"]) {
  const target=read(`target/${scene}.json`), native=read(`after/${scene}.json`);
  const t = (predicate) => target.find(predicate)?.rect;
  const a = selector => native.elements.find(element=>element.selector===selector)?.rect;
  compare(scene,"right panel",t(e=>e.tag==="ASIDE"&&e.class==="task"),a(".workspace-panel"));
  compare(scene,"footer",t(e=>e.class==="app-foot"),a("footer"));
  const toolbar=a(".document-toolbar"), modes=a(".document-modebar");
  const header={...toolbar,height:toolbar.height+modes.height-(scene==="narrow"?65:0)};
  compare(scene,"document header",t(e=>e.class==="doc-head"),header);
  if (["request","narrow","connection"].includes(scene)) compare(scene,"request field",t(e=>e.class==="field request-field"),a(".request-form textarea"));
  if (scene==="comment") compare(scene,"comment field",t(e=>e.class==="field request-field"),a(".comment-form textarea"));
  if (["review","comment"].includes(scene)) compare(scene,"comparison reading area",t(e=>e.class==="diff"),a(".diff-panes"));
  if (scene==="connection") compare(scene,"connection dialog",t(e=>e.class==="settings"),a(".connection-dialog"));
  if (["request","narrow"].includes(scene)) compare(scene,"source text start",{x:scene==="narrow"?60:260},native.reading[".source-editor .cm-line"],["x"]);
  if (["review","comment"].includes(scene)) {
    compare(scene,"change text start",{x:280},native.reading[".diff-delete"],["x"]);
    compare(scene,"context text start",{x:256},native.reading[".diff-equal"],["x"]);
    compare(scene,"group title start",{x:220},{x:native.reading[".change-group-start"].headerX},["x"]);
  }
}
const report={schemaVersion:1,method:"Frozen computed target vs native CSS px; screenshots reviewed separately",maximumError:Math.max(...metrics.map(m=>m.maximumError)),metrics};
writeFileSync(resolve(root,"measurement.json"),JSON.stringify(report,null,2)+"\n");
assert.ok(metrics.every(metric=>metric.passed),JSON.stringify(metrics.filter(metric=>!metric.passed)));
console.log(JSON.stringify({metrics:metrics.length,maximumError:report.maximumError,passed:true}));
