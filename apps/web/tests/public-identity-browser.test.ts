import { createServer, type Server } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { chromiumFixture, until } from "./chromium-fixture";
async function listen(server: Server) {
 server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();if(!address||typeof address==="string")throw Error("No fixture address");return address.port;
}
it("renders anonymous Published Identity and fresh Connection navigation in actual Next/Chromium",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"spall-public-identity-"));const cert=join(directory,"cert.pem"),key=join(directory,"key.pem");
 execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-keyout",key,"-out",cert,"-subj","/CN=127.0.0.1","-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
 const calls:string[]=[];let available=true,hidden=false,quota=true;const binding="a".repeat(64);
 const destination="https://destination.example.test/published";
 const provider=createSecureServer({cert:await readFile(cert),key:await readFile(key)},async(req,res)=>{
  let body="";for await(const part of req)body+=String(part);const path=new URL(req.url!,"http://fixture").pathname;calls.push(path);res.setHeader("content-type","application/json");
  if(path==="/redis"){const command=JSON.parse(body);expect(command[0]).toBe("eval");expect(command[3]).toMatch(/^spall-identity-text-editor:public-identity-(read|open)-/);res.end(JSON.stringify({result:quota?1:0}));return;}
  if(path!=="/rest/v1/rpc/execute_public_identity_server"){res.statusCode=500;res.end('{}');return;}
  expect(req.headers.authorization).toBe("Bearer isolated-service-role");expect(req.headers["content-profile"]).toBe("api");const input=JSON.parse(body);calls.push(input.input_operation+":"+input.input_handle+":"+String(input.input_binding));
  expect(Object.keys(input).sort()).toEqual(["input_binding","input_handle","input_operation"]);
  if(hidden||!["public-one","public-alias"].includes(input.input_handle)){res.end('{"status":"unavailable"}');return;}
  if(input.input_operation==="open"){res.end(JSON.stringify(available&&input.input_binding===binding?{status:"success",destination_url:destination}:{status:"unavailable"}));return;}
  expect(input.input_operation).toBe("read");expect(input.input_binding).toBeNull();
  res.end(JSON.stringify({status:"success",current_handle:"public-one",display_name:"Published <script>not executed</script>",bio:"Public context\nA second line",starter_key:"featured",has_spill:false,connection:{connection_kind:"generic_link",social_platform:null,available,binding}}));
 });
 const providerPort=await listen(provider);const allocation=createServer();const port=await listen(allocation);await new Promise<void>(r=>allocation.close(()=>r()));const origin=`http://127.0.0.1:${port}`;
 const relay=join(directory,"relay.cjs");await writeFile(relay,`const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(String(url)!=="https://fixture.upstash.io/")return original(url,init);const r=await original("https://127.0.0.1:${providerPort}/redis",init);return new Response(r.body,{status:r.status,headers:r.headers});};`);
 const app=spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),process.env.SPALL_ENTRY_COMPILED==="1"?"start":"dev","--hostname","127.0.0.1","--port",String(port)],{
  env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS??""} --require=${relay}`,NODE_EXTRA_CA_CERTS:cert,NEXT_TELEMETRY_DISABLED:"1",SUPABASE_SERVICE_ROLE_KEY:"isolated-service-role",NEXT_PUBLIC_SUPABASE_URL:`https://127.0.0.1:${providerPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"publishable-fixture",UPSTASH_REDIS_REST_URL:"https://fixture.upstash.io",UPSTASH_REDIS_REST_TOKEN:"fixture-budget-token",SPALL_PUBLIC_IDENTITY_ENABLED:"true",SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE:"browser",SPALL_PUBLIC_ORIGIN:origin},stdio:["ignore","pipe","pipe"],detached:true});
 let logs="";app.stdout.on("data",p=>logs+=String(p));app.stderr.on("data",p=>logs+=String(p));let browser:Awaited<ReturnType<typeof chromiumFixture>>|undefined;
 try{
  await until(async()=>{if(app.exitCode!==null)throw Error(logs.slice(-1000));try{return(await fetch(origin,{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},40000);
  const initialOpen=await fetch(origin+"/api/public/identity/public-one/open",{method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded","x-nonce":"AAAAAAAAAAAAAAAAAAAAAAAA"},body:`binding=${binding}`,redirect:"manual"});expect(initialOpen.status).toBe(200);expect(initialOpen.headers.get("content-security-policy")).toContain("default-src 'none'");
  const navigationDocument=await initialOpen.text();const nonce=navigationDocument.match(/script nonce="([A-Za-z0-9+/=]+)"/)![1];expect(nonce).not.toBe("AAAAAAAAAAAAAAAAAAAAAAAA");expect(initialOpen.headers.get("content-security-policy")).toContain(`script-src 'nonce-${nonce}'`);
  const response=await fetch(origin+"/public-alias",{headers:{cookie:"sb-fake-auth-token=untrusted; spall-intended-destination=/dashboard"}});const html=await response.text();
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("set-cookie")).toBeNull();expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
  expect(html).toContain("Published &lt;script&gt;");expect(html).not.toContain(destination);expect(html).not.toContain("isolated-service-role");expect(html).not.toContain("Private Working");
  expect((await fetch(origin+"/unknown-owner")).status).toBe(404);
  browser=await chromiumFixture();const b=browser;await b.command("Page.enable");await b.command("Runtime.enable");await b.command("Log.enable");
  const errors:string[]=[];b.on("Runtime.exceptionThrown",v=>errors.push(JSON.stringify(v)));b.on("Log.entryAdded",v=>{const text=(v as {entry:{text:string}}).entry.text;if(/Content Security Policy|Refused to.*(style|script|form)/i.test(text))errors.push(text);});
  await b.command("Fetch.enable",{patterns:[{urlPattern:"https://destination.example.test/*",requestStage:"Request"}]});
  b.on("Fetch.requestPaused",v=>{const e=v as {requestId:string;request:{url:string;method:string;headers:Record<string,string>}};if(e.request.url==="https://destination.example.test/favicon.ico"){void b.command("Fetch.fulfillRequest",{requestId:e.requestId,responseCode:204});return;}expect(e.request.url).toBe(destination);expect(e.request.method).toBe("GET");expect(e.request.headers.Referer).toBeUndefined();void b.command("Fetch.fulfillRequest",{requestId:e.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"text/html"}],body:Buffer.from("<h1>Fixture destination</h1>").toString("base64")});});
  const visit=async(path:string,text:string)=>{await b.command("Page.navigate",{url:origin+path});await until(()=>b.evaluate<boolean>(`document.readyState==='complete'&&document.body?.innerText.includes(${JSON.stringify(text)})`),20000);};
  await visit("/public-alias","Published <script>not executed</script>");expect(await b.evaluate("document.querySelectorAll('header script').length")).toBe(0);
  for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
  await b.command("Page.captureScreenshot",{format:"png"}).then(async data=>writeFile("/tmp/spall-265-public-identity.png",Buffer.from((data as {data:string}).data,"base64")));
  await b.evaluate("document.querySelector('button').focus()");expect(await b.evaluate("document.activeElement?.tagName")).toBe("BUTTON");await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"});await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
  await until(()=>b.evaluate<boolean>("document.body?.innerText.includes('Fixture destination')"),15000).catch(async e=>{throw Error(String(e)+"; "+JSON.stringify({errors,calls,body:await b.evaluate("document.body.innerText")}));});
  await b.command("Emulation.setScriptExecutionDisabled",{value:true});
  await visit("/public-one","Visit my link");await b.evaluate("document.querySelector('button').click()");
  await until(()=>b.evaluate<boolean>("document.body?.innerText.includes('Continue to destination')"),15000);
  expect(await b.evaluate("document.querySelector('noscript a').getAttribute('href')")).toBe(destination);
  await b.evaluate("document.querySelector('noscript a').click()");await until(()=>b.evaluate<boolean>("document.body?.innerText.includes('Fixture destination')"),15000);
  await b.command("Emulation.setScriptExecutionDisabled",{value:false});
  available=false;await visit("/public-one","Unavailable");expect(await b.evaluate("document.querySelector('form')===null")).toBe(true);
  const stale=await fetch(origin+"/api/public/identity/public-one/open",{method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded"},body:`binding=${binding}`,redirect:"manual"});expect(stale.status).toBe(403);expect(stale.headers.has("location")).toBe(false);
  hidden=true;await visit("/public-one","This page is unavailable.");quota=false;await visit("/public-one","Try again in a moment.");
  expect(calls.some(p=>p.startsWith("/auth/"))).toBe(false);expect(errors).toEqual([]);
 }finally{
  await browser?.close();if(app.pid){try{process.kill(-app.pid,"SIGTERM");}catch{}}
  provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));await rm(directory,{recursive:true,force:true});await writeFile("/tmp/spall-265-public-server.log",logs);
 }
});
