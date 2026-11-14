import { createServer,type Server } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFileSync,spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp,readFile,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { expect,it } from "vitest";
import sharp from "../../media-sanitizer/node_modules/sharp";
import { chromiumFixture,until } from "./chromium-fixture";
async function listen(server:Server){server.listen(0,"127.0.0.1");await once(server,"listening");const a=server.address();if(!a||typeof a==="string")throw Error("No fixture address");return a.port;}
it("connects anonymous Published browse, search, exact detail and image routes without private URLs or viewer auth",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"spall-public-spill-"));const cert=join(directory,"cert.pem"),key=join(directory,"key.pem");execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-keyout",key,"-out",cert,"-subj","/CN=127.0.0.1","-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
 const webp=await sharp({create:{width:8,height:8,channels:3,background:{r:190,g:110,b:50}}}).webp().toBuffer();const descriptor={status:"success",current_handle:"public-one",object_key:"working/profile/28100000-0000-4000-8000-000000000001.webp",content_type:"image/webp",byte_size:webp.length,width:8,height:8,publication_token:"a".repeat(64),spill_reference:27};
 const rows=Array.from({length:25},(_,i)=>({reference:i+1,kind:"resource",title:i===9?"Only this one":`Notebook ${i+1}`,resource_type:"document" as string|null,primary_image_path:null as string|null,available:i!==2,published_at:`2026-11-14T03:${String(59-i).padStart(2,'0')}:00.000000Z`}));
 rows.push({reference:27,kind:"product",title:"Copper Kettle",resource_type:null,primary_image_path:"/media/product/public-one/27",available:true,published_at:"2026-11-14T02:00:00.000000Z"},{reference:28,kind:"resource",title:"Studio Menu",resource_type:"menu",primary_image_path:null,available:false,published_at:"2026-11-14T01:00:00.000000Z"});
 let quota=true,hidden=false;const paths:string[]=[],operations:{operation:string;query:unknown}[]=[];
 const provider=createSecureServer({cert:await readFile(cert),key:await readFile(key)},async(req,res)=>{
  let body="";for await(const part of req)body+=String(part);const path=new URL(req.url!,"http://fixture").pathname;paths.push(path);
  if(path===`/fixture-media/${descriptor.object_key}`){res.setHeader("Content-Type","image/webp");res.setHeader("Content-Length",webp.length);res.end(webp);return;}
  res.setHeader("Content-Type","application/json");
  if(path==="/redis"){const command=JSON.parse(body);expect(command[0]).toBe("eval");const spill=command[3].includes(":public-spill-read-");res.end(JSON.stringify({result:spill&&!quota?0:1}));return;}
  expect(req.headers.authorization).toBe("Bearer isolated-service-role");expect(req.headers["content-profile"]).toBe("api");const input=JSON.parse(body);
  if(path.endsWith("/resolve_published_product_media_server")){expect(input).toEqual({input_handle:"public-one",input_spill_reference:27});res.end(JSON.stringify(descriptor));return;}
  if(path.endsWith("/execute_public_identity_server")){res.end(JSON.stringify({status:"success",current_handle:"public-one",display_name:"Published Curator",bio:null,starter_key:"clean",connection:null,has_spill:true}));return;}
  expect(path).toBe("/rest/v1/rpc/execute_public_spill_server");expect(["public-one","public-alias"]).toContain(input.input_handle);expect(Object.keys(input).sort()).toEqual(["input_handle","input_operation","input_query"]);operations.push({operation:input.input_operation,query:input.input_query});
  if(hidden){res.end('{"status":"unavailable"}');return;}
  if(input.input_operation==="detail"){
   expect(Object.keys(input.input_query)).toEqual(["reference"]);const row=rows.find(v=>v.reference===input.input_query.reference);if(!row){res.end('{"status":"unavailable"}');return;}
   const context={status:"success",current_handle:"public-one",display_name:"Published Curator",spill_reference:row.reference,title:row.title};res.end(JSON.stringify({status:"success",item_type:row.kind,detail:row.kind==="product"?{...context,primary_image_path:row.primary_image_path,destinations:[{provider_key:"shopee",available:true}]}:{...context,resource_type:row.resource_type,available:row.available}}));return;
  }
  expect(input.input_operation).toBe("browse");const q=input.input_query.q as string,kind=input.input_query.kind as string,cursor=input.input_query.cursor;
  const items=rows.filter(v=>(kind==="all"||v.kind===kind)&&(!q||q.toLowerCase().split(' ').every(token=>v.title.toLowerCase().includes(token)))).map(v=>({...v,rank:!q?0:v.title.toLowerCase()===q.toLowerCase()?3:v.title.toLowerCase().includes(q.toLowerCase())?2:1})).sort((a,b)=>b.rank-a.rank||b.published_at.localeCompare(a.published_at)||b.reference-a.reference).filter(v=>!cursor||(v.rank<cursor.rank||v.rank===cursor.rank&&(v.published_at<cursor.published_at||v.published_at===cursor.published_at&&v.reference<cursor.reference)));
  const page=items.slice(0,20),last=page.at(-1);res.end(JSON.stringify({status:"success",current_handle:"public-one",display_name:"Published Curator",q,kind,has_products:true,has_resources:true,items:page,has_more:items.length>20,next_cursor:items.length>20?{q,kind,rank:last!.rank,published_at:last!.published_at,reference:last!.reference}:null}));
 });
 const providerPort=await listen(provider),allocation=createServer(),port=await listen(allocation);await new Promise<void>(r=>allocation.close(()=>r()));const origin=`http://127.0.0.1:${port}`;
 const relay=join(directory,"relay.cjs");await writeFile(relay,`const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(String(url)!=="https://fixture.upstash.io/")return original(url,init);const r=await original("https://127.0.0.1:${providerPort}/redis",init);return new Response(r.body,{status:r.status,headers:r.headers});};`);
 const app=spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),process.env.SPALL_ENTRY_COMPILED==="1"?"start":"dev","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS??""} --require=${relay}`,NODE_EXTRA_CA_CERTS:cert,NEXT_TELEMETRY_DISABLED:"1",SUPABASE_SERVICE_ROLE_KEY:"isolated-service-role",NEXT_PUBLIC_SUPABASE_URL:`https://127.0.0.1:${providerPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"publishable-fixture",UPSTASH_REDIS_REST_URL:"https://fixture.upstash.io",UPSTASH_REDIS_REST_TOKEN:"fixture-budget-token",SPALL_PUBLIC_IDENTITY_ENABLED:"true",SPALL_PUBLIC_MEDIA_ENABLED:"true",SPALL_PUBLIC_SPILL_ENABLED:"true",SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE:"browser",SPALL_PUBLIC_MEDIA_BUDGET_NAMESPACE:"browser",SPALL_PUBLIC_SPILL_BUDGET_NAMESPACE:"browser",SPALL_PUBLIC_ORIGIN:origin,R2_S3_ENDPOINT:`https://127.0.0.1:${providerPort}`,R2_ACCESS_KEY_ID:"fixture-r2-access",R2_SECRET_ACCESS_KEY:"fixture-r2-secret",R2_PROFILE_BUCKET:"fixture-media"},stdio:["ignore","pipe","pipe"],detached:true});
 let logs="";app.stdout.on("data",p=>logs+=String(p));app.stderr.on("data",p=>logs+=String(p));let browser:Awaited<ReturnType<typeof chromiumFixture>>|undefined;
 try{
  await until(async()=>{if(app.exitCode!==null)throw Error(logs.slice(-1500));try{return(await fetch(origin+"/public-one/spill",{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},40000);
  const response=await fetch(origin+"/public-alias/spill",{headers:{Cookie:"sb-fake-auth-token=untrusted"}});const html=await response.text();expect(response.status).toBe(200);expect(response.headers.get("set-cookie")).toBeNull();expect(response.headers.get("cache-control")).toContain("no-store");expect(html).not.toMatch(/source_url|destination_url|working\/profile|PRIVATE WORKING|DRAFT ONLY/);
  browser=await chromiumFixture();const b=browser;await b.command("Page.enable");await b.command("Log.enable");const errors:string[]=[];b.on("Log.entryAdded",v=>{const text=(v as {entry:{text:string}}).entry.text;if(/Content Security Policy|Refused to.*(script|style)/i.test(text))errors.push(text);});
  const visit=async(path:string,text:string)=>{await b.command("Page.navigate",{url:origin+path});await until(()=>b.evaluate<boolean>(`document.readyState==='complete'&&document.body.innerText.includes(${JSON.stringify(text)})`),20000);};
  await visit("/public-alias/spill","Find the good stuff.");expect(await b.evaluate("document.querySelectorAll('[data-public-spill-item]').length")).toBe(20);expect(await b.evaluate("document.querySelector('[data-public-spill-item]').getAttribute('data-public-spill-item')")).toBe("1");
  await b.evaluate("Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='More Items').click()");await until(()=>b.evaluate<boolean>("document.readyState==='complete'&&document.querySelectorAll('[data-public-spill-item]').length===7"),15000);expect(await b.evaluate("location.search.includes('cursor=')")).toBe(true);await until(()=>b.evaluate<boolean>("document.querySelector('img')?.complete===true&&document.querySelector('img').naturalWidth===8"),10000);
  await visit("/public-one/spill?kind=product","Copper Kettle");expect(await b.evaluate("document.querySelectorAll('[data-public-spill-item]').length")).toBe(1);
  expect(await b.evaluate("document.querySelector('nav[aria-label=\"Spill types\"] [aria-current=page]')?.textContent")).toBe("Products");
  const search=async(q:string)=>{await b.evaluate(`document.querySelector('input[name=q]').value=${JSON.stringify(q)};document.querySelector('form[aria-label="Search Spill"]').requestSubmit()`);};
  await search("Only");await until(()=>b.evaluate<boolean>("document.readyState==='complete'&&document.body.innerText.includes('Search: “Only”.')"),15000);expect(await b.evaluate("location.pathname")).toBe("/public-one/spill");expect(await b.evaluate("document.querySelectorAll('[data-public-spill-item]').length")).toBe(1);expect(await b.evaluate("location.search.includes('kind=product')")).toBe(false);
  await search("#27");await until(()=>b.evaluate<boolean>("document.readyState==='complete'&&location.pathname==='/public-one/spill/27'&&document.body.innerText.includes('Copper Kettle')"),15000);await until(()=>b.evaluate<boolean>("document.querySelector('img')?.complete===true&&document.querySelector('img').naturalWidth===8"),10000);expect(await b.evaluate("document.querySelector('a[href^=\"https://\"]')===null")).toBe(true);await b.evaluate("history.back()");await until(()=>b.evaluate<boolean>("document.body.innerText.includes('Search: “Only”.')"),15000);
  await visit("/public-one/spill?q=28","Studio Menu");await until(()=>b.evaluate<boolean>("location.pathname==='/public-one/spill/28'"));expect(await b.evaluate("document.body.innerText.includes('Menu')&&document.body.innerText.includes('Links are temporarily unavailable')")).toBe(true);
  await visit("/public-one/spill/999","This Spill or Item is unavailable.");
  expect(await b.evaluate("Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Browse this Spill')?.getAttribute('href')")).toBe("/public-one/spill");
  await b.evaluate("Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Browse this Spill').click()");
  await until(()=>b.evaluate<boolean>("document.readyState==='complete'&&document.body.innerText.includes('Find the good stuff.')"),15000);
  await visit("/public-one/spill?q=%2301","No published Item with that reference.");await visit("/public-one/spill?q=absent","Nothing matched this search.");
  for(const width of [360,768,1440]){
   await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});
   for(const [path,title] of [["/public-one/spill?kind=product","Copper Kettle"],["/public-one/spill/27","Copper Kettle"],["/public-one/spill/28","Studio Menu"]]){
    await visit(path!,title!);expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);
   }
  }
  await visit("/public-one/spill","Find the good stuff.");
  await b.evaluate("document.querySelector('input[name=q]').focus()");
  expect(await b.evaluate("document.activeElement?.getAttribute('name')")).toBe("q");
  await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
  await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"Tab",code:"Tab",windowsVirtualKeyCode:9});
  expect(await b.evaluate("document.activeElement?.textContent")).toBe("Find it");
  await visit("/public-one/spill?kind=product","Copper Kettle");const shot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-281-public-spill.png",Buffer.from(shot.data,"base64"));
  const before=operations.length;quota=false;await visit("/public-one/spill","Try again in a moment.");expect(operations).toHaveLength(before);quota=true;hidden=true;await visit("/public-one/spill","This Spill or Item is unavailable.");expect(paths.some(p=>p.startsWith('/auth/'))).toBe(false);expect(errors).toEqual([]);
 }finally{await browser?.close();if(app.pid){try{process.kill(-app.pid,"SIGTERM");}catch{}}provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));await writeFile("/tmp/spall-281-public-server.log",logs);await rm(directory,{recursive:true,force:true});}
});
