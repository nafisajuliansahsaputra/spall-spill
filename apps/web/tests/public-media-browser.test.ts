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
it("serves admitted anonymous Published images and denies quota, revocation and stalled bodies in actual Next/Chromium",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"spall-public-media-"));const cert=join(directory,"cert.pem"),key=join(directory,"key.pem");
 execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-keyout",key,"-out",cert,"-subj","/CN=127.0.0.1","-addext","subjectAltName=IP:127.0.0.1"],{stdio:"ignore"});
 const webp=await sharp({create:{width:8,height:8,channels:3,background:{r:190,g:110,b:50}}}).webp().toBuffer();
 const descriptor={status:"success",current_handle:"public-one",object_key:"working/profile/28000000-0000-4000-8000-000000000001.webp",content_type:"image/webp",byte_size:webp.length,width:8,height:8,publication_token:"a".repeat(64)};
 let quota=true,revoked=false,revokeAfterDownload=false,pauseObject=false,streamClosed=false;let mediaReads=0,objects=0;const paths:string[]=[],mediaKeys:string[]=[];
 const provider=createSecureServer({cert:await readFile(cert),key:await readFile(key)},async(req,res)=>{
  let body="";for await(const part of req)body+=String(part);const path=new URL(req.url!,"http://fixture").pathname;paths.push(path);
  if(path===`/fixture-media/${descriptor.object_key}`){objects++;expect(req.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);res.setHeader("Content-Type","image/webp");res.setHeader("Content-Length",webp.length);
   if(pauseObject){res.on("close",()=>{streamClosed=true;});res.write(webp.subarray(0,12));return;}if(revokeAfterDownload)revoked=true;res.end(webp);return;
  }
  res.setHeader("Content-Type","application/json");
  if(path==="/redis"){const command=JSON.parse(body);expect(command[0]).toBe("eval");const media=command[3].includes(":public-media-read-");if(media){mediaKeys.push(command[3]);expect(command.slice(-4)).toEqual(["60000","60","780","13"]);}res.end(JSON.stringify({result:media&&!quota?0:1}));return;}
  expect(req.headers.authorization).toBe("Bearer isolated-service-role");expect(req.headers["content-profile"]).toBe("api");const input=JSON.parse(body);
  if(path.endsWith("/execute_public_identity_server")){res.end(JSON.stringify(input.input_handle==="public-one"?{status:"success",current_handle:"public-one",display_name:"Published Media Owner",bio:null,starter_key:"clean",connection:null,has_spill:false}:{status:"unavailable"}));return;}
  if(path.endsWith("/resolve_published_identity_media_server")){expect(input).toEqual({input_handle:"public-one"});mediaReads++;res.end(JSON.stringify(revoked?{status:"unavailable"}:descriptor));return;}
  if(path.endsWith("/resolve_published_product_media_server")){expect(input).toEqual({input_handle:"public-one",input_spill_reference:27});mediaReads++;res.end(JSON.stringify(revoked?{status:"unavailable"}:{...descriptor,spill_reference:27}));return;}
  res.statusCode=500;res.end('{"message":"fixture unexpected provider call"}');
 });
 const providerPort=await listen(provider),allocation=createServer(),port=await listen(allocation);await new Promise<void>(r=>allocation.close(()=>r()));const origin=`http://127.0.0.1:${port}`;
 const relay=join(directory,"relay.cjs");await writeFile(relay,`const original=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(String(url)!=="https://fixture.upstash.io/")return original(url,init);const r=await original("https://127.0.0.1:${providerPort}/redis",init);return new Response(r.body,{status:r.status,headers:r.headers});};`);
 const app=spawn(process.execPath,[resolve("node_modules/next/dist/bin/next"),process.env.SPALL_ENTRY_COMPILED==="1"?"start":"dev","--hostname","127.0.0.1","--port",String(port)],{env:{...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS??""} --require=${relay}`,NODE_EXTRA_CA_CERTS:cert,NEXT_TELEMETRY_DISABLED:"1",SUPABASE_SERVICE_ROLE_KEY:"isolated-service-role",NEXT_PUBLIC_SUPABASE_URL:`https://127.0.0.1:${providerPort}`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"publishable-fixture",UPSTASH_REDIS_REST_URL:"https://fixture.upstash.io",UPSTASH_REDIS_REST_TOKEN:"fixture-budget-token",SPALL_PUBLIC_IDENTITY_ENABLED:"true",SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE:"browser",SPALL_PUBLIC_MEDIA_ENABLED:"true",SPALL_PUBLIC_MEDIA_BUDGET_NAMESPACE:"browser",SPALL_PUBLIC_ORIGIN:origin,R2_S3_ENDPOINT:`https://127.0.0.1:${providerPort}`,R2_ACCESS_KEY_ID:"fixture-r2-access",R2_SECRET_ACCESS_KEY:"fixture-r2-secret",R2_PROFILE_BUCKET:"fixture-media"},stdio:["ignore","pipe","pipe"],detached:true});
 let logs="";app.stdout.on("data",p=>logs+=String(p));app.stderr.on("data",p=>logs+=String(p));let browser:Awaited<ReturnType<typeof chromiumFixture>>|undefined;
 try{
  await until(async()=>{if(app.exitCode!==null)throw Error(logs.slice(-1500));try{return(await fetch(origin+"/public-one",{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},40000);
  browser=await chromiumFixture();const b=browser;await b.command("Page.enable");await b.command("Network.enable");await b.command("Page.navigate",{url:origin+"/public-one"});await until(()=>b.evaluate<boolean>("document.readyState==='complete'&&document.body.innerText.includes('Published Media Owner')"),15000);
  await b.evaluate(`for(const path of ['/media/identity/public-one','/media/product/public-one/27']){const img=document.createElement('img');img.src=path;document.body.append(img);}`);
  await until(()=>b.evaluate<boolean>("document.querySelectorAll('img').length===2&&Array.from(document.querySelectorAll('img')).every(img=>img.complete&&img.naturalWidth===8&&img.naturalHeight===8)"),15000);
  expect(mediaReads).toBe(4);expect(objects).toBe(2);expect(new Set(mediaKeys).size).toBe(1);
  const direct=await fetch(origin+"/media/product/public-one/27",{headers:{Cookie:"sb-fake-auth-token=untrusted",Range:"bytes=0-5","If-None-Match":"forged"}});
  expect(direct.status).toBe(200);expect(Buffer.from(await direct.arrayBuffer())).toEqual(webp);expect(direct.headers.get("content-type")).toBe("image/webp");expect(direct.headers.get("content-length")).toBe(String(webp.length));expect(direct.headers.get("set-cookie")).toBeNull();expect(direct.headers.get("accept-ranges")).toBe("none");expect(direct.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(mediaReads).toBe(6);const objectsBefore=objects;expect(objectsBefore).toBe(3);
  const request=async()=>{
   await b.evaluate(`window.mediaResult=null;window.mediaError=false;void fetch('/media/product/public-one/27',{headers:{Range:'bytes=0-5','If-None-Match':'forged'}}).then(async r=>({status:r.status,mime:r.headers.get('content-type'),cache:r.headers.get('cache-control'),csp:r.headers.get('content-security-policy'),body:await r.text()})).then(value=>{window.mediaResult=value;}).catch(()=>{window.mediaError=true;});`);
   await until(()=>b.evaluate<boolean>("window.mediaResult!==null||window.mediaError===true"),10000);expect(await b.evaluate("window.mediaError")).toBe(false);
   return b.evaluate<{status:number;mime:string;cache:string;csp:string;body:string}>("window.mediaResult");
  };
  quota=false;const before=mediaReads;let result=await request();expect(result.status).toBe(404);expect(result.body).toBe("Unavailable");expect(mediaReads).toBe(before);expect(objects).toBe(objectsBefore);expect(result.cache).toContain("no-store");expect(result.csp).toBe("default-src 'none'; sandbox");
  quota=true;revokeAfterDownload=true;result=await request();expect(result.status).toBe(404);expect(result.body).toBe("Unavailable");expect(mediaReads).toBe(before+2);expect(objects).toBe(objectsBefore+1);
  revoked=false;revokeAfterDownload=false;pauseObject=true;const readsBeforeStall=mediaReads;result=await request();expect(result.status).toBe(404);expect(mediaReads).toBe(readsBeforeStall+1);await until(()=>streamClosed);expect(paths.some(p=>p.startsWith("/auth/"))).toBe(false);
 }finally{await browser?.close();if(app.pid){try{process.kill(-app.pid,"SIGTERM");}catch{}}provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));await writeFile("/tmp/spall-280-public-media-server.log",logs);await rm(directory,{recursive:true,force:true});}
});
