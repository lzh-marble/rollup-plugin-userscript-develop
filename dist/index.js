"use strict";var e=require("node:path"),r=require("magic-string"),t=require("acorn-walk");function n(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=n(e),i=n(r);module.exports=function(e={}){let r=[];return{name:"rollup-plugin-userscript-responsive-develop",transform(e){let n=new i.default(e),a=!1;const o=this.parse(e,{onComment:(e,t,i,o)=>{if(!e){if(t.includes("==UserScript=="))return a=!0,void n.remove(i,o);if(t.includes("==/UserScript=="))return a=!1,void n.remove(i,o);a&&(r.push(t.trim()),n.remove(i,o))}}});return t.full(o,(e=>{n.addSourcemapLocation(e.start),n.addSourcemapLocation(e.end)})),{code:n.toString(),map:n.generateMap({includeContent:!0})}},generateBundle(t,n){Object.values(n).forEach((n=>{if("chunk"===n.type){if(e?.extractToExternal){const e=r.reduce(((e,r)=>{const t=r.match(/@\w+\s+/),n=(t?t.length:0)-8;return Math.max(n,e)}),1);r=[...r,`@require${" ".repeat(e)}file://${a.default.resolve(process.cwd(),t.file)}`]}if(!r.length)return;r=["==UserScript==",...r,"==/UserScript=="];const i=r.map((e=>`// ${e}\n`)).join("");e?.extractToExternal?this.emitFile({type:"asset",fileName:e?.name??`debug.${t.file}$`,source:i}):(n.code=`${i}\n${n.code}`,n.map.mappings=`${";".repeat(r.length)}${n.map.mappings}`)}}))}}};
