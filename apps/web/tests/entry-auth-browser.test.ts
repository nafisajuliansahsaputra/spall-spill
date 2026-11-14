import { createHmac,createHash,X509Certificate,randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { sanitizeMedia } from "../../media-sanitizer/src/lib/processor";
import { verifySanitizerSignature } from "../../media-sanitizer/src/lib/request-auth";
import sharp from "../../media-sanitizer/node_modules/sharp";
import { chromiumFixture, until } from "./chromium-fixture";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing fixture address");
  return address.port;
}
it.each(["existing", "spill", "publish", "publish-lost", "search"])("connects real Owner workflows (%s)", async scenario => {
  const spillOnly = scenario === "spill", publishOnly = scenario.startsWith("publish"), publicationLost = scenario === "publish-lost";
  let published: null | { name: string; bio: string | null; starter: string; handle: string } = null;
  let confirmed = false;
  const calls: string[] = []; let used = false; let unavailable = false; let failIdentityRead = false;
  let accountState: "onboarding_incomplete" | "restricted" | "suspended" | "active" = "onboarding_incomplete";
  let failLogout = false; let budgetDenied = false; let loseAcknowledgment = false;
  const gatewayOperations: string[] = [];
  let overlay: null | { display_name: string | null; bio: string | null; revision: number; source_profile_revision: number } = null;
  function currentOverlay(): typeof overlay { return overlay; }
  type FixtureLink = {block_id:string;kind:"social"|"generic_link"|"text"|"contact"|"spill_cta";position:number;is_visible:boolean;payload_state:"present";media_asset_state:null;working:{kind:"social"|"generic_link"|"text"|"contact"|"spill_cta";title?:string|null;social_platform?:string|null;destination_url?:string|null;text?:string|null;contact_type?:"email"|"whatsapp"|"phone"|null;label?:string|null;value?:string|null;target?:"owner_spill"}};
  let linkCollection:null|{revision:number;blocks:FixtureLink[];has_more:false;next_after_position:null}=null;
  const linksNow=()=>linkCollection;let nextLink=100;

  let pauseStateRead = false; const releaseStateReads: (() => void)[] = [];
  const user = { id: "25600000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated",
    email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const steps = ["claim_handle", "primary_use_case", "basic_identity", "starter_composition", "relevant_first_job", "preview_publish"];
  const setup = { step: 0, revision: 1, handle: null as string | null, useCase: null as string | null,
    identity: null as null | { display_name: string; bio: string | null; profile_asset_key: null; revision: number },
    layout: null as null | { starter_key: string; revision: number } };
  const starterItems = [
    {reference:1,kind:"product",source_revision:2,working_revision:null as number|null,source_changed:false,title:"Setup Product",source_url:"https://shop.example.test/product" as string|null,resource_type:null as string|null,published_lifecycle:null as string|null,has_primary_image:true,destinations:[{provider_key:"external:shop.example.test",destination_url:"https://shop.example.test/product"}]},
    {reference:2,kind:"resource",source_revision:2,working_revision:null as number|null,source_changed:false,title:"Setup Resource",source_url:"https://resource.example.test/source" as string|null,resource_type:"document" as string|null,published_lifecycle:"hidden" as string|null,has_primary_image:false,destinations:[]},
  ];
  const extraResources:typeof starterItems=[];
  const preparationRevisions=new Map<number,number>([[1,4]]);
  const selectedImages=new Map<number,string>([[1,"27000000-0000-4000-8000-000000000001"]]);
  const mediaIntents=new Map<string,{reference:number;key:string;type:string;size:number;status:string;asset?:{asset_key:string;object_key:string;stored_content_type:"image/webp";byte_size:number;width:number;height:number}}>();
  const objects=new Map<string,{bytes:Buffer;type:string}>();let appOrigin="";let sanitizerCalls=0;
  const mediaSecret="fixture-product-media-secret-270-only";

  const creationIntents=new Map<string,{input:Record<string,unknown>;ack:Record<string,unknown>}>();
  const jwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwtHeader = jwtPart({ alg: "HS256", typ: "JWT" });
  const jwtPayload = jwtPart({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: "isolated-provider" });
  const access = `${jwtHeader}.${jwtPayload}.${createHmac("sha256", "isolated-test-signing-key").update(`${jwtHeader}.${jwtPayload}`).digest("base64url")}`;
  const tlsDirectory = await mkdtemp(join(tmpdir(), "spall-entry-tls-"));
  const cert = join(tlsDirectory, "cert.pem"); const key = join(tlsDirectory, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key,
    "-out", cert, "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const provider = createSecureServer({ cert: await readFile(cert), key: await readFile(key) }, async (request, response) => {
    const chunks:Buffer[]=[];for await(const part of request)chunks.push(Buffer.from(part));const bytes=Buffer.concat(chunks);const body=bytes.toString("utf8");
    const path = new URL(request.url!, "http://fixture").pathname; calls.push(path);
    response.setHeader("content-type", "application/json");
    if(path.startsWith("/fixture-media/")){
      response.setHeader("Access-Control-Allow-Origin",appOrigin);response.setHeader("Access-Control-Allow-Methods","GET, PUT, DELETE, OPTIONS");response.setHeader("Access-Control-Allow-Headers","Content-Type");
      if(request.method==="OPTIONS"){response.statusCode=204;response.end();return;}
      const key=decodeURIComponent(path.slice("/fixture-media/".length));
      if(request.method==="PUT"){
        if(key.startsWith("staging/"))expect(new URL(request.url!,"https://fixture").searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
        if(key.startsWith("working/")){expect(request.headers["if-none-match"]).toBe("*");expect(bytes.subarray(0,4).toString()).toBe("RIFF");}
        if(request.headers["if-none-match"]==="*"&&objects.has(key)){response.statusCode=412;response.end();return;}
        objects.set(key,{bytes,type:String(request.headers["content-type"])});response.setHeader("ETag",'"fixture-media"');response.end();return;
      }
      if(request.method==="DELETE"){objects.delete(key);response.statusCode=204;response.end();return;}
      const object=objects.get(key);if(!object){response.statusCode=404;response.end();return;}
      response.setHeader("Content-Type",object.type);response.setHeader("Content-Length",object.bytes.length);response.end(object.bytes);return;
    }
    if(path==="/api/sanitize"){
      expect(verifySanitizerSignature({secret:mediaSecret,timestamp:String(request.headers["x-spall-timestamp"]),signature:String(request.headers["x-spall-signature"]),body})).toBe(true);
      const input=JSON.parse(body);const key=new URL(input.sourceUrl).pathname.slice("/fixture-media/".length);const object=objects.get(key)!;expect(object.bytes.length).toBe(input.expectedByteSize);expect(object.type).toBe(input.expectedContentType);
      const sanitized=await sanitizeMedia({bytes:object.bytes,expectedContentType:input.expectedContentType});sanitizerCalls++;
      response.setHeader("Content-Type",sanitized.contentType);response.setHeader("Content-Length",sanitized.byteSize);response.setHeader("X-Spall-Media-Width",sanitized.width);response.setHeader("X-Spall-Media-Height",sanitized.height);response.end(sanitized.bytes);return;
    }
    if (path === "/redis") {
      const command = JSON.parse(body); expect(command[0]).toBe("eval");
      expect(command[2]).toBe(2); expect(command[3]).toMatch(/^spall-identity-text-editor:(profile|starter|resource|product|text|contact|blocks|spill-cta|first-publish|public-identity)-/);
      expect(command[3]).not.toContain(user.id);
      response.end(JSON.stringify({ result: budgetDenied ? 0 : 1 })); return;
    }
    if (path.endsWith("/recover") || path.endsWith("/signup")) { response.end("{}"); return; }
    if (path.endsWith("/verify")) {
      const data = JSON.parse(body);
      if (used || data.type !== "recovery" || data.token_hash !== "a".repeat(64)) {
        response.statusCode = 403; response.end('{"msg":"Invalid token"}'); return;
      }
      used = true; response.end(JSON.stringify({ access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user })); return;
    }
    if (path.endsWith("/token") && JSON.parse(body).password === "new-password") {
      response.end(JSON.stringify({ access_token: access, refresh_token: "isolated-refresh", token_type: "bearer", expires_in: 3600, user })); return;
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.split("/").at(-1)!; const data = JSON.parse(body);
      expect(request.headers["content-profile"]).toBe("api"); expect(request.headers.authorization).toBe((name === "execute_owner_catalog_search_server" || name === "execute_onboarding_publish_server" || name === "execute_public_identity_server" || name === "execute_owner_spill_cta_editor_server" || name === "execute_owner_block_controls_server" || name === "execute_owner_contact_editor_server" || name === "execute_owner_text_editor_server" || name === "execute_owner_profile_editor_server" || name === "execute_owner_starter_recovery_server" || name === "execute_owner_resource_catalog_server" || name === "execute_owner_product_creation_server" || name === "execute_owner_product_destinations_server" || name === "execute_owner_product_image_server" || name === "create_product_media_upload_intent_server" || name === "resolve_product_media_upload_intent_server" || name === "complete_product_media_upload_server") ? "Bearer isolated-service-role" : `Bearer ${access}`);
      if(name === "execute_owner_catalog_search_server"){
        expect(data.input_subject).toBe(user.id);expect(data.input_operation).toBe("resolve_current_owner_spill_manager_filtered");expect(Object.keys(data.input_payload)).toEqual(["input_filter"]);
        const f=data.input_payload.input_filter;expect(Object.keys(f).sort()).toEqual(["before","kind","lifecycle","q"]);
        const referenceLike=f.q.startsWith("#")||/^[0-9]+$/.test(f.q);const exact=/^#?[1-9][0-9]{0,15}$/.test(f.q)?Number(f.q.replace(/^#/,"")):null;
        const all=[...starterItems,...extraResources].filter(item=>(f.before===null||item.reference<f.before)&&(f.kind==="all"||item.kind===f.kind)&&(f.lifecycle==="all"||(f.lifecycle==="draft"?item.published_lifecycle===null:item.published_lifecycle===f.lifecycle))&&(!f.q||(referenceLike?item.reference===exact:item.title.toLowerCase().includes(f.q.toLowerCase())))).sort((a,b)=>b.reference-a.reference);
        const items=all.slice(0,20).map(item=>({reference:item.reference,kind:item.kind,title_preview:item.title?.slice(0,160)??null,resource_type:item.resource_type,working_revision:item.working_revision,source_changed:item.source_changed,published_lifecycle:item.published_lifecycle}));
        response.end(JSON.stringify({status:"success",current_handle:setup.handle,primary_use_case:setup.useCase,filter:f,items,has_more:all.length>20,next_before_reference:all.length>20?items.at(-1)!.reference:null}));return;
      }
      if(name === "execute_public_identity_server") {
        expect(Object.keys(data).sort()).toEqual(["input_binding","input_handle","input_operation"]);expect(data.input_operation).toBe("read");expect(data.input_binding).toBeNull();
        if(data.input_handle!==setup.handle){response.end('{"status":"unavailable"}');return;}
        response.end(JSON.stringify(published ? {status:"success",current_handle:published.handle,display_name:published.name,bio:published.bio,starter_key:published.starter,connection:null,has_spill:false} : {status:"unavailable"}));return;
      }
      if(name === "execute_owner_catalog_search_server" || name === "execute_onboarding_publish_server") {
        expect(data.input_subject).toBe(user.id);expect(data.input_operation).toBe("publish_current_onboarding_identity");
        expect(data.input_payload).toEqual({input_receipt_id:"25800000-0000-4000-8000-000000000002",input_snapshot_hash:"b".repeat(64)});
        expect(confirmed).toBe(true);expect(published).toBeNull();expect(linkCollection).toBeNull();
        gatewayOperations.push(data.input_operation);
        published={name:setup.identity!.display_name,bio:setup.identity!.bio,starter:setup.layout!.starter_key,handle:setup.handle!};
        accountState="active";setup.revision++;
        if(publicationLost){response.statusCode=503;response.end('{"message":"fixture publication acknowledgment lost"}');return;}
        response.end(JSON.stringify({status:"success",identity_status:"published",item_status:null,bundle:"identity_only",publication_id:"27800000-0000-4000-8000-000000000004",published_at:new Date().toISOString(),current_handle:setup.handle,spill_reference:null}));return;
      }
      if(["create_product_media_upload_intent_server","resolve_product_media_upload_intent_server","complete_product_media_upload_server"].includes(name)){
        expect(data.input_auth_user_id).toBe(user.id);const item=[...starterItems,...extraResources].find(row=>row.reference===data.input_reference&&row.kind==="product");expect(item).toBeDefined();let result:unknown;
        if(name==="create_product_media_upload_intent_server"){
          const id=randomUUID(),key=`staging/profile/${id}/${randomUUID()}`;mediaIntents.set(id,{reference:data.input_reference,key,type:data.input_expected_content_type,size:data.input_declared_byte_size,status:"pending"});
          result={status:"success",upload_intent_id:id,staging_object_key:key,expected_content_type:data.input_expected_content_type,declared_byte_size:data.input_declared_byte_size,expires_at:new Date(Date.now()+300000).toISOString()};
        }else{
          const intent=mediaIntents.get(data.input_upload_intent_id)!;expect(intent.reference).toBe(data.input_reference);
          if(name==="resolve_product_media_upload_intent_server"){
            if(intent.status==="consumed")result={status:"consumed",...intent.asset};
            else{expect(intent.status).toBe("pending");intent.status="processing";result={status:"success",intent_status:"processing",expected_content_type:intent.type,declared_byte_size:intent.size,staging_object_key:intent.key,expires_at:new Date(Date.now()+300000).toISOString()};}
          }else{expect(intent.status).toBe("processing");expect(objects.has(data.input_object_key)).toBe(true);intent.status="consumed";intent.asset={asset_key:data.input_asset_key,object_key:data.input_object_key,stored_content_type:"image/webp",byte_size:data.input_byte_size,width:data.input_width,height:data.input_height};result={status:"success",idempotent:false,...intent.asset};}
        }
        response.end(JSON.stringify(result));return;
      }
      if(name==="execute_owner_product_image_server"){
        expect(data.input_subject).toBe(user.id);const working=data.input_payload.input_working;const reference=data.input_operation==="resolve_current_owner_product_image"?data.input_payload.input_reference:working.reference;const item=[...starterItems,...extraResources].find(row=>row.reference===reference&&row.kind==="product")!;expect(item).toBeDefined();let result:unknown;
        if(data.input_operation==="resolve_current_owner_product_image")result={status:"success",current_handle:setup.handle,primary_use_case:setup.useCase,reference,source_revision:item.source_revision,preparation_revision:preparationRevisions.get(reference)??null,primary_asset_key:selectedImages.get(reference)??null};
        else{expect(data.input_operation).toBe("save_current_owner_product_image");expect(Object.keys(working).sort()).toEqual(["base_preparation_revision","base_source_revision","primary_asset_key","reference"]);
          if(working.base_source_revision!==item.source_revision||working.base_preparation_revision!==(preparationRevisions.get(reference)??null))result={status:"stale_write"};
          else{const next=(preparationRevisions.get(reference)??0)+1;preparationRevisions.set(reference,next);if(working.primary_asset_key)selectedImages.set(reference,working.primary_asset_key);else selectedImages.delete(reference);item.has_primary_image=working.primary_asset_key!==null;result={status:"success",reference,source_revision:item.source_revision,preparation_revision:next,primary_asset_key:working.primary_asset_key};if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture image save reply lost"}');return;}}
        }response.end(JSON.stringify(result));return;
      }
      if(name === "execute_owner_product_destinations_server"){
        expect(data.input_subject).toBe(user.id);gatewayOperations.push(data.input_operation);const value=data.input_payload.input_working;
        const reference=data.input_operation==="resolve_current_owner_product_destinations"?data.input_payload.input_reference:value.reference;
        const item=[...starterItems,...extraResources].find(row=>row.reference===reference&&row.kind==="product");let result:unknown;
        if(!item)result={status:"unavailable"};
        else if(data.input_operation==="resolve_current_owner_product_destinations")result={status:"success",current_handle:setup.handle,primary_use_case:setup.useCase,reference,source_revision:item.source_revision,preparation_revision:preparationRevisions.get(reference)??null,destinations:item.destinations,has_primary_image:item.has_primary_image};
        else if(data.input_operation==="save_current_owner_product_destinations"){
          expect(Object.keys(value).sort()).toEqual(["base_preparation_revision","base_source_revision","destinations","reference"]);
          if(value.base_source_revision!==item.source_revision)result={status:"stale_source"};
          else if(value.base_preparation_revision!==(preparationRevisions.get(reference)??null))result={status:"stale_write"};
          else{const revision=(preparationRevisions.get(reference)??0)+1;preparationRevisions.set(reference,revision);item.destinations=value.destinations;
            result={status:"success",reference,source_revision:item.source_revision,preparation_revision:revision,destinations:item.destinations};
            if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture destination reply lost"}');return;}
          }
        }else throw Error("Unexpected destination operation");response.end(JSON.stringify(result));return;
      }
      if(name === "execute_owner_product_creation_server"){
        expect(data.input_subject).toBe(user.id);expect(data.input_operation).toBe("create_current_owner_product_draft");gatewayOperations.push(data.input_operation);
        const value=data.input_payload.input_draft;expect(Object.keys(value).sort()).toEqual(["creation_id","source_url","title"]);
        const previous=creationIntents.get(value.creation_id);let result:unknown;
        if(previous)result=JSON.stringify(previous.input)===JSON.stringify(value)?previous.ack:{status:"conflicting_intent"};
        else{const reference=Math.max(0,...starterItems.map(item=>item.reference),...extraResources.map(item=>item.reference))+1;
          extraResources.push({reference,kind:"product",source_revision:1,working_revision:null,source_changed:false,title:value.title,source_url:value.source_url,resource_type:null,published_lifecycle:null,has_primary_image:false,destinations:[]});
          const ack={status:"success",reference,...value};creationIntents.set(value.creation_id,{input:value,ack});result=ack;
          if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture Product creation reply lost"}');return;}
        }
        response.end(JSON.stringify(result));return;
      }
      if(name === "execute_owner_resource_catalog_server"){
        expect(data.input_subject).toBe(user.id);gatewayOperations.push(data.input_operation);let result:unknown;
        const context={status:"success",current_handle:setup.handle,primary_use_case:setup.useCase};
        const all=[...starterItems,...extraResources];
        if(data.input_operation==="resolve_current_owner_item_recovery"){
          result={...context,item:all.find(item=>item.reference===data.input_payload.input_reference)??null};
        }else if(data.input_operation==="resolve_current_owner_spill_manager"){
          const cursor=data.input_payload.input_reference;
          const rows=all.filter(item=>cursor===null||item.reference<cursor).sort((a,b)=>b.reference-a.reference);
          const items=rows.slice(0,20).map(item=>({reference:item.reference,kind:item.kind,title_preview:item.title?.slice(0,160)??null,resource_type:item.resource_type,working_revision:item.working_revision,source_changed:item.source_changed,published_lifecycle:item.published_lifecycle}));
          result={...context,items,has_more:rows.length>20,next_before_reference:rows.length>20?items.at(-1)!.reference:null};
        }else if(data.input_operation==="create_current_owner_resource_draft"){
          const value=data.input_payload.input_draft;expect(Object.keys(value).sort()).toEqual(["creation_id","resource_type","source_url","title"]);
          const previous=creationIntents.get(value.creation_id);
          if(previous)result=JSON.stringify(previous.input)===JSON.stringify(value)?previous.ack:{status:"conflicting_intent"};
          else{
            const reference=Math.max(0,...all.map(item=>item.reference))+1;
            extraResources.push({reference,kind:"resource",source_revision:1,working_revision:null,source_changed:false,title:value.title,source_url:value.source_url,resource_type:value.resource_type,published_lifecycle:null,has_primary_image:false,destinations:[]});
            const ack={status:"success",reference,...value};creationIntents.set(value.creation_id,{input:value,ack});result=ack;
            if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture creation reply lost"}');return;}
          }
        }else throw Error("Unexpected Resource operation");
        response.end(JSON.stringify(result));return;
      }
      if (name === "execute_owner_starter_recovery_server") {
        expect(data.input_subject).toBe(user.id);gatewayOperations.push(data.input_operation);
        let result: unknown;
        if(data.input_operation === "resolve_current_owner_starter_recovery") result={status:"success",current_handle:setup.handle,primary_use_case:setup.useCase,items:starterItems};
        else if(data.input_operation === "save_current_owner_starter_item_working") {
          const value=data.input_payload.input_working;const item=[...starterItems,...extraResources].find(item=>item.reference===value.reference);
          if(!item)result={status:"unavailable"};
          else if(item.source_revision!==value.base_source_revision || item.working_revision!==value.base_working_revision)result={status:"stale_write"};
          else if(item.published_lifecycle==="archived")result={status:"owner_not_eligible"};
          else {item.title=value.working.title;item.source_url=value.working.source_url;item.resource_type=value.working.resource_type;item.working_revision=(item.working_revision??0)+1;item.source_changed=false;
            result={status:"success",reference:item.reference,source_revision:item.source_revision,working_revision:item.working_revision};
            if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}
          }
        }else throw new Error("Unexpected starter gateway operation");
        response.end(JSON.stringify(result));return;
      }
      if(name==="execute_owner_spill_cta_editor_server"){
        expect(data.input_subject).toBe(user.id);expect(Object.keys(data.input_payload)).toEqual(["input_intent"]);gatewayOperations.push(data.input_operation);
        const value=data.input_payload.input_intent;expect(value.spill_cta_working).toEqual({kind:"spill_cta",target:"owner_spill"});let result:unknown;
        const first=data.input_operation==="initialize_current_owner_blocks_from_spill_cta";
        expect(["initialize_current_owner_blocks_from_spill_cta","add_current_owner_spill_cta_block_working"]).toContain(data.input_operation);
        if(first&&linkCollection!==null)result={status:"already_initialized"};
        else if(!first&&(!linkCollection||value.base_collection_revision!==linkCollection.revision))result={status:"stale_write"};
        else{
          const blocks=linkCollection?.blocks??[],block_id=`27700000-0000-4000-8000-${String(nextLink++).padStart(12,"0")}`;
          blocks.push({block_id,kind:"spill_cta",position:blocks.reduce((max,row)=>Math.max(max,row.position),0)+1,is_visible:value.is_visible,payload_state:"present",media_asset_state:null,working:{kind:"spill_cta",target:"owner_spill"}});
          linkCollection={revision:(linkCollection?.revision??0)+1,blocks,has_more:false,next_after_position:null};result={status:"success",block_id,collection_revision:linkCollection.revision};
          if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture CTA acknowledgment lost"}');return;}
        }response.end(JSON.stringify(result));return;
      }
      if(name==="execute_owner_block_controls_server"){
        expect(data.input_subject).toBe(user.id);gatewayOperations.push(data.input_operation);const value=data.input_payload.input_working;
        const block=linkCollection?.blocks.find(row=>row.block_id===value.block_id);let result:unknown;
        if(!linkCollection||value.base_collection_revision!==linkCollection.revision)result={status:"stale_write"};
        else if(!block)result={status:"block_not_found"};
        else if(data.input_operation==="save_current_owner_block_visibility_working"){block.is_visible=value.is_visible;linkCollection.revision+=1;result={status:"success",block_id:block.block_id,is_visible:block.is_visible,collection_revision:linkCollection.revision};}
        else if(data.input_operation==="move_current_owner_block_working"){
          const ordered=[...linkCollection.blocks].sort((a,b)=>a.position-b.position);const index=ordered.findIndex(row=>row.block_id===block.block_id);const neighbor=ordered[index+(value.direction==="up"?-1:1)];
          if(!neighbor)result={status:"move_not_available"};else{[block.position,neighbor.position]=[neighbor.position,block.position];linkCollection.blocks.sort((a,b)=>a.position-b.position);linkCollection.revision+=1;result={status:"success",block_id:block.block_id,direction:value.direction,collection_revision:linkCollection.revision};}
        }else if(data.input_operation==="remove_current_owner_block_working"){
          expect(value.confirm_removal).toBe(true);linkCollection.blocks=linkCollection.blocks.filter(row=>row.block_id!==block.block_id);linkCollection.revision+=1;result={status:"success",block_id:block.block_id,collection_revision:linkCollection.revision};
        }else throw Error("Unexpected block operation");
        if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}response.end(JSON.stringify(result));return;
      }
      if (name === "execute_owner_contact_editor_server") {
        expect(data.input_subject).toBe(user.id);gatewayOperations.push(data.input_operation);
        const first=data.input_operation==="initialize_current_owner_blocks_from_contact";
        const saving=data.input_operation==="save_current_owner_block_contact_working";
        const value=saving?data.input_payload.input_working:data.input_payload.input_intent;
        let result:unknown;
        if(first&&linkCollection!==null)result={status:"already_initialized"};
        else if(!first&&(!linkCollection||value.base_collection_revision!==linkCollection.revision))result={status:"stale_write"};
        else if(saving){const block=linkCollection!.blocks.find(row=>row.block_id===value.block_id&&row.kind==="contact");
          if(!block)result={status:"block_not_found"};else{block.working=value.contact_working;block.payload_state="present";linkCollection!.revision+=1;result={status:"success",block_id:block.block_id,collection_revision:linkCollection!.revision};}
        }else{const block_id=`27200000-0000-4000-8000-${String(nextLink++).padStart(12,"0")}`;const blocks=linkCollection?.blocks??[];
          blocks.push({block_id,kind:"contact",position:blocks.reduce((maximum,row)=>Math.max(maximum,row.position),0)+1,is_visible:value.is_visible,payload_state:"present",media_asset_state:null,working:value.contact_working});
          linkCollection={revision:first?1:linkCollection!.revision+1,blocks,has_more:false,next_after_position:null};result={status:"success",block_id,collection_revision:linkCollection.revision};
        }
        if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}
        response.end(JSON.stringify(result));return;
      }
      if (name === "execute_owner_text_editor_server") {
        expect(data.input_subject).toBe(user.id);gatewayOperations.push(data.input_operation);
        const first=data.input_operation==="initialize_current_owner_blocks_from_text";
        const saving=data.input_operation==="save_current_owner_block_text_working";
        const value=saving?data.input_payload.input_working:data.input_payload.input_intent;
        let result:unknown;
        if(first&&linkCollection!==null)result={status:"already_initialized"};
        else if(!first&&(!linkCollection||value.base_collection_revision!==linkCollection.revision))result={status:"stale_write"};
        else if(saving){const block=linkCollection!.blocks.find(row=>row.block_id===value.block_id&&row.kind==="text");
          if(!block)result={status:"block_not_found"};else{block.working=value.text_working;block.payload_state="present";linkCollection!.revision+=1;result={status:"success",block_id:block.block_id,collection_revision:linkCollection!.revision};}
        }else{const block_id=`27100000-0000-4000-8000-${String(nextLink++).padStart(12,"0")}`;const blocks=linkCollection?.blocks??[];
          blocks.push({block_id,kind:"text",position:blocks.reduce((maximum,row)=>Math.max(maximum,row.position),0)+1,is_visible:value.is_visible,payload_state:"present",media_asset_state:null,working:value.text_working});
          linkCollection={revision:first?1:linkCollection!.revision+1,blocks,has_more:false,next_after_position:null};result={status:"success",block_id,collection_revision:linkCollection.revision};
        }
        if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}
        response.end(JSON.stringify(result));return;
      }
      if (name === "execute_owner_profile_editor_server") {
        expect(data.input_subject).toBe(user.id); gatewayOperations.push(data.input_operation);
        let result: unknown;
        const context = { status: "success", current_handle: setup.handle, primary_use_case: setup.useCase };
        if (data.input_operation === "resolve_current_owner_home_context") result = context;
        else if (data.input_operation === "resolve_current_owner_editable_identity_working_page") {
          if (failIdentityRead) { response.statusCode=503; response.end('{"message":"private preview provider detail"}'); return; }
          expect(data.input_payload).toEqual({ input_request: { expected_collection_revision: null, after_position: null } });
          result = { ...context, profile_working: setup.identity, layout_working: setup.layout,
            connection_source_working: null, legacy_identity_work: "unchanged", publication_comparison: "not_assessed",
            profile_text_working: overlay, profile_text_state: overlay ? "saved" : "source",
            revision_vector: { profile: setup.identity!.revision, layout: setup.layout!.revision, connection: null, blocks: linkCollection?.revision ?? null, profile_text: overlay?.revision ?? null }, collection: linkCollection };
        } else if (data.input_operation === "save_current_owner_profile_text_working") {
          const value = data.input_payload.input_working;
          if (value.base_profile_revision !== setup.identity!.revision || value.base_text_revision !== (overlay?.revision ?? null)) result = { status: "stale_write" };
          else { overlay = { ...value.profile_text_working, revision: (overlay?.revision ?? 0) + 1, source_profile_revision: setup.identity!.revision };
            result = { status: "success", text_revision: overlay!.revision, source_profile_revision: setup.identity!.revision };
            if (loseAcknowledgment) { response.statusCode = 503; response.end('{"message":"fixture acknowledgment lost"}'); return; } }
        } else if (data.input_operation === "save_current_owner_layout_working") {
          const value=data.input_payload.input_working;
          if(value.base_layout_revision!==setup.layout!.revision) result={status:"stale_write"};
          else {
            const changed=value.starter_key!==setup.layout!.starter_key;
            setup.layout={starter_key:value.starter_key,revision:setup.layout!.revision+(changed?1:0)};
            result={status:"success",layout_working:setup.layout,changed};
            if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}
          }
        } else if(data.input_operation==="save_current_owner_block_link_working"){
          const value=data.input_payload.input_working;
          const block=linkCollection?.blocks.find(row=>row.block_id===value.block_id);
          if(!block||block.kind!==value.link_working.kind)result={status:"block_not_found"};
          else if(value.base_collection_revision!==linkCollection!.revision)result={status:"stale_write"};
          else{
            block.working=value.link_working;linkCollection!.revision+=1;
            result={status:"success",block_id:block.block_id,collection_revision:linkCollection!.revision};
            if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}
          }
        } else if(data.input_operation==="initialize_current_owner_blocks_from_link"||data.input_operation==="add_current_owner_link_block_working"){
          const value=data.input_payload.input_intent;const first=data.input_operation==="initialize_current_owner_blocks_from_link";
          if(first&&linkCollection!==null)result={status:"already_initialized"};
          else if(!first&&(!linkCollection||value.base_collection_revision!==linkCollection.revision))result={status:"stale_write"};
          else{
            const block_id="26400000-0000-4000-8000-"+String(++nextLink).padStart(12,"0");
            const blocks=linkCollection?.blocks??[];
            blocks.push({block_id,kind:value.link_working.kind,position:blocks.reduce((maximum,row)=>Math.max(maximum,row.position),0)+1,is_visible:value.is_visible,payload_state:"present",media_asset_state:null,working:value.link_working});
            linkCollection={revision:first?1:linkCollection!.revision+1,blocks,has_more:false,next_after_position:null};
            result={status:"success",block_id,collection_revision:linkCollection.revision};
            if(loseAcknowledgment){response.statusCode=503;response.end('{"message":"fixture acknowledgment lost"}');return;}
          }
        } else throw new Error("Unexpected gateway operation");
        response.end(JSON.stringify(result)); return;
      }
      if (name === "resolve_current_onboarding_state") {
        if (pauseStateRead) await new Promise<void>(resolve => { releaseStateReads.push(resolve); });
        if (unavailable) { response.statusCode = 503; response.end('{"message":"fixture provider detail"}'); return; }
      }
      let result: unknown;
      if (name === "resolve_current_owner_state") result = { status: accountState, owner_id: "25800000-0000-4000-8000-000000000001", account_state: accountState === "onboarding_incomplete" ? "active" : accountState, onboarding_completed: accountState === "active" };
      else if (name === "resolve_current_onboarding_state") result = { status: "success", current_step: steps[setup.step], current_handle: setup.handle, primary_use_case: setup.useCase, revision: setup.revision };
      else if (name === "resolve_current_basic_identity_state") result = { status: "success", identity_working: setup.identity };
      else if (name === "resolve_current_starter_composition_state") result = { status: "success", layout_working: setup.layout };
      else if (name === "resolve_current_relevant_first_job_state") result = { status: "success", current_step: steps[setup.step], primary_use_case: setup.useCase, recommended_first_job: "identity_connection", progress_revision: setup.revision };
      else if (name === "resolve_current_identity_connection_state") result = { status: "success", current_step: steps[setup.step], connection_working: null };
      else if (name === "resolve_current_product_draft_state") result = { status: "success", current_step: steps[setup.step], product_draft: null };
      else if (name === "resolve_current_resource_draft_state") result = { status: "success", current_step: steps[setup.step], resource_draft: null };
      else if (name === "resolve_current_onboarding_preview") result = {
        status: "success", current_step: "preview_publish", progress_revision: setup.revision, current_handle: setup.handle,
        identity_working: setup.identity, layout_working: setup.layout, identity_validation_issues: [],
        connection_working: null, product_draft: null, resource_draft: null, snapshot_hash: "b".repeat(64),
      };
      else if (name === "confirm_current_onboarding_preview") {
        expect(data.input_snapshot_hash).toBe("b".repeat(64));confirmed=true;
        result = { status: "success", receipt_id: "25800000-0000-4000-8000-000000000002", snapshot_hash: "b".repeat(64), expires_at: new Date(Date.now() + 600000).toISOString() };
      }
      else if (["claim_current_owner_handle", "set_current_owner_primary_use_case", "save_current_owner_basic_identity", "save_current_owner_starter_composition", "advance_current_owner_relevant_first_job"].includes(name)) {
        if ((data.base_revision ?? data.base_progress_revision) !== setup.revision) result = { status: "progress_stale" };
        else {
          if (name === "claim_current_owner_handle") { setup.handle = data.input_handle; setup.step = Math.max(setup.step, 1); }
          if (name === "set_current_owner_primary_use_case") { setup.useCase = data.input_primary_use_case; setup.step = Math.max(setup.step, 2); }
          if (name === "save_current_owner_basic_identity") { setup.identity = { display_name: data.input_display_name, bio: data.input_bio, profile_asset_key: null, revision: (setup.identity?.revision ?? 0) + 1 }; setup.step = Math.max(setup.step, 3); }
          if (name === "save_current_owner_starter_composition") { setup.layout = { starter_key: data.input_starter_key, revision: 1 }; setup.step = Math.max(setup.step, 4); }
          if (name === "advance_current_owner_relevant_first_job") setup.step = 5;
          setup.revision++; result = { status: "success" };
        }
      } else throw new Error(`Unexpected onboarding RPC ${name}`);
      response.end(JSON.stringify(result)); return;
    }
    if (path.endsWith("/user")) {
      if (request.method === "GET") { response.end(JSON.stringify(user)); return; }
      expect(request.method).toBe("PUT"); expect(request.headers.authorization).toBe("Bearer fixture-access");
      expect(JSON.parse(body).password).toBe("new-password"); response.end(JSON.stringify(user)); return;
    }
    if (path.endsWith("/logout")) {
      expect(new URL(request.url!, "https://fixture").searchParams.get("scope")).toBe("local");
      if (failLogout) { response.statusCode = 503; response.end('{"msg":"fixture private logout failure"}'); return; }
      response.statusCode = 204; response.end(); return; }
    response.statusCode = 400; response.end('{"msg":"Invalid credentials"}');
  });
  const providerPort = await listen(provider);
  const pixels=await sharp({create:{width:16,height:12,channels:3,background:{r:220,g:160,b:120}}}).png().toBuffer();const pngFile=join(tlsDirectory,"product.png");await writeFile(pngFile,pixels);
  const selected=await sanitizeMedia({bytes:pixels,expectedContentType:"image/png"});objects.set("working/profile/27000000-0000-4000-8000-000000000001.webp",{bytes:selected.bytes,type:selected.contentType});
  const certificateSpki=createHash("sha256").update(new X509Certificate(await readFile(cert)).publicKey.export({type:"spki",format:"der"})).digest("base64");
  const allocation = createServer(); const port = await listen(allocation); await new Promise<void>(r => allocation.close(() => r()));
  // Controlled provider relay for the actual strict Upstash transport. No production
  // bypass/configuration is added; only this child process loads the test relay.
  appOrigin=`http://127.0.0.1:${port}`;
  const relay = join(tlsDirectory, "redis-relay.cjs");
  await writeFile(relay, `const original = globalThis.fetch; globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://fixture.upstash.io/") return original(url, init);
    const response = await original("https://127.0.0.1:${providerPort}/redis", init);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };`);
  const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), process.env.SPALL_ENTRY_COMPILED === "1" ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${relay}`, SUPABASE_SERVICE_ROLE_KEY: "isolated-service-role", SPALL_FIRST_IDENTITY_PUBLISH_ENABLED:publishOnly?"true":"false",SPALL_PUBLIC_IDENTITY_ENABLED:publishOnly?"true":"false",SPALL_PUBLIC_ORIGIN:appOrigin,SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE:"browser", UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io", UPSTASH_REDIS_REST_TOKEN: "fixture-budget-token", SPALL_OWNER_PROFILE_BUDGET_NAMESPACE: "browser",R2_S3_ENDPOINT:`https://127.0.0.1:${providerPort}`,R2_ACCESS_KEY_ID:"fixture-r2-access",R2_SECRET_ACCESS_KEY:"fixture-r2-secret",R2_PROFILE_BUCKET:"fixture-media",MEDIA_SANITIZER_URL:`https://127.0.0.1:${providerPort}`,MEDIA_SANITIZER_SHARED_SECRET:mediaSecret, NEXT_TELEMETRY_DISABLED: "1", NODE_EXTRA_CA_CERTS: cert, NEXT_PUBLIC_SUPABASE_URL: `https://127.0.0.1:${providerPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-local-fixture" },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let logs = ""; app.stdout.on("data", x => { logs += String(x); }); app.stderr.on("data", x => { logs += String(x); });
  const origin = `http://127.0.0.1:${port}`;
  let browser: Awaited<ReturnType<typeof chromiumFixture>> | undefined;
  try {
    await until(async () => { if (app.exitCode !== null) throw new Error("Next exited: " + logs.slice(-1000)); try { return (await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }, 40000);
    browser = await chromiumFixture({certificateSpki});
    const b = browser;
    const errors: string[] = []; b.on("Runtime.exceptionThrown", x => errors.push(JSON.stringify(x)));
    await b.command("Runtime.enable"); await b.command("Page.enable"); await b.command("Log.enable");
    const cspErrors: string[] = [];
    b.on("Log.entryAdded", value => { const entry = (value as { entry: { text: string } }).entry;
      if (/Content Security Policy|Refused to.*(style|script)/i.test(entry.text)) cspErrors.push(entry.text);
    });
    const documentReady = async (expected: string, loader: string | undefined, previous = false) => {
      await until(async () => {
        const tree = await b.command<{frameTree:{frame:{loaderId:string}}}>("Page.getFrameTree");
        if (loader && (previous ? tree.frameTree.frame.loaderId === loader : tree.frameTree.frame.loaderId !== loader)) return false;
        return b.evaluate<boolean>(`document.readyState === 'complete' && document.body?.innerText.includes(${JSON.stringify(expected)}) === true`);
      },20000);
    };
    const visit = async (path: string, expected: string) => {
      const tree=await b.command<{frameTree:{frame:{loaderId:string}}}>("Page.getFrameTree");
      await b.command("Page.navigate", { url: origin + path });
      try { await documentReady(expected,tree.frameTree.frame.loaderId,true); } catch(error) { throw new Error(`Navigation ${path}: ${await b.evaluate("document.body?.innerText")}`,{cause:error}); }
    };
    const reloadFromLink = async (selector: string, expected: string) => {
      const tree=await b.command<{frameTree:{frame:{loaderId:string}}}>("Page.getFrameTree");
      await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
      await documentReady(expected,tree.frameTree.frame.loaderId,true);
    };
    const input = async (name: string, value: string) => {
      await b.evaluate(`(() => { const el=document.querySelector('[name="${name}"]'); el.focus(); })()`);
      await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
      await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
      if (value) await b.command("Input.insertText", { text: value });
      else {
        await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
    };
    const submit = async () => { await b.evaluate(`document.querySelector('form:not([aria-label="Sign out"])').requestSubmit()`); };
    const text = async (value: string) => until(() => b.evaluate<boolean>(`document.body?.innerText.includes(${JSON.stringify(value)}) === true`), 20000);
    const scopedInput=async(selector:string,name:string,value:string)=>{
      await b.evaluate(`document.querySelector(${JSON.stringify(selector+' [name="'+name+'"]')}).focus()`);
      await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65});
      await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65});
      await b.command("Input.insertText",{text:value});
    };
    if(scenario==="search"){
      accountState="active";setup.step=5;setup.handle="fixture-creator";setup.useCase="personal";setup.identity={display_name:"Catalog Owner",bio:null,profile_asset_key:null,revision:1};setup.layout={starter_key:"clean",revision:1};
      for(let n=0;n<27;n++)extraResources.push({reference:n+10,kind:"resource",source_revision:1,working_revision:null,source_changed:false,title:`Needle Resource ${n}`,source_url:null,resource_type:"document",published_lifecycle:null,has_primary_image:false,destinations:[]});
      const original=JSON.stringify({setup,starterItems,extraResources});
      await visit("/login","Good to have you back.");await input("email","owner@example.test");await input("password","new-password");await submit();await text("Pick up where you left off.");await visit("/dashboard/spill","Good things, kept here.");
      const form='form[aria-label="Search saved Items"]';
      const search=async(q:string,kind="all",lifecycle="all")=>{
        await scopedInput(form,"q",q);await b.evaluate(`document.querySelector('${form} [name=kind]').value=${JSON.stringify(kind)};document.querySelector('${form} [name=lifecycle]').value=${JSON.stringify(lifecycle)};document.querySelector('${form}').requestSubmit()`);
      };
      await search("  NeEdLe  ","resource","draft");await text("20 matching saved Items on this page.");expect(await b.evaluate("location.search")).toContain("kind=resource");
      for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
      const shot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-279-manager.png",Buffer.from(shot.data,"base64"));
      await b.evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Spill pages\"] a')).find(a=>a.textContent==='Older Items').click()");await text("7 matching saved Items on this page.");expect(await b.evaluate("location.search")).toContain("q=NeEdLe");expect(await b.evaluate("document.querySelectorAll('li a[href*=\"/edit\"]').length")).toBe(7);
      await b.evaluate("Array.from(document.querySelectorAll('nav[aria-label=\"Spill pages\"] a')).find(a=>a.textContent==='Newest Items').click()");await text("20 matching saved Items on this page.");
      await search("Setup Resource","resource","hidden");await text("1 matching saved Items on this page.");await text("Hidden · Working stays separate.");
      await search("#1");await text("Search: “#1”.");expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill");expect(await b.evaluate("document.querySelectorAll('li a[href*=\"/edit\"]').length")).toBe(1);
      await b.evaluate("document.querySelector('li a[href=\"/dashboard/spill/1/edit\"]').click()");await text("Keep shaping this product.");await b.evaluate("history.back()");await text("Search: “#1”.");expect(await b.evaluate("document.querySelector('form[aria-label=\"Search saved Items\"] [name=q]').value")).toBe("#1");
      await search("no matching title");await text("No Items match this scope.");await reloadFromLink('p[role=status] a[href="/dashboard/spill"]',"Good things, kept here.");expect(await b.evaluate(`document.querySelector('${form} [name=q]').value`)).toBe("");
      const searches=calls.filter(path=>path.endsWith("/execute_owner_catalog_search_server")).length;
      await visit("/dashboard/spill?kind=all&kind=resource","Check your search and filters.");expect(calls.filter(path=>path.endsWith("/execute_owner_catalog_search_server"))).toHaveLength(searches);
      expect(JSON.stringify({setup,starterItems,extraResources})).toBe(original);expect(cspErrors).toEqual([]);return;
    }
    if(publishOnly){
      setup.step=5;setup.handle="fixture-creator";setup.useCase="personal";
      setup.identity={display_name:"Published first Identity",bio:"Saved private review",profile_asset_key:null,revision:1};setup.layout={starter_key:"clean",revision:1};
      starterItems[1]!.published_lifecycle=null;
      const items=JSON.stringify(starterItems),identity=JSON.stringify(setup.identity),layout=JSON.stringify(setup.layout),revision=setup.revision;
      await visit("/fixture-creator","This page is unavailable.");
      await visit("/login","Good to have you back.");await input("email","owner@example.test");await input("password","new-password");await submit();await text("Private preview.");
      expect(gatewayOperations).not.toContain("publish_current_onboarding_identity");
      await b.evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Confirm this preview').click()");await text("Ready to share your Identity?");
      await b.evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Publish Identity').click()");
      expect(gatewayOperations).not.toContain("publish_current_onboarding_identity");
      await b.evaluate("document.querySelector('[name=confirmIdentityOnly]').click()");
      await b.evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Publish Identity').click()");await text(publicationLost ? "We couldn’t confirm publication." : "Your Identity is published. Product and Resource Drafts remain private.");
      expect(gatewayOperations.filter(op=>op==="publish_current_onboarding_identity")).toHaveLength(1);expect(setup.revision).toBe(revision+1);expect(JSON.stringify(starterItems)).toBe(items);expect(JSON.stringify(setup.identity)).toBe(identity);expect(JSON.stringify(setup.layout)).toBe(layout);
      expect(await b.evaluate("Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Preview reviewed').disabled")).toBe(true);
      expect(await b.evaluate("document.body.innerText.includes('Nothing on this screen is public yet')||document.body.innerText.includes('Nothing has been published')")).toBe(false);
      const publicationShot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile(publicationLost?"/tmp/spall-278-publication-lost.png":"/tmp/spall-278-publication.png",Buffer.from(publicationShot.data,"base64"));
      if(publicationLost){
        expect(await b.evaluate("Array.from(document.querySelectorAll('button')).some(el=>el.textContent==='Publish Identity')")).toBe(false);
        await reloadFromLink('a[href="/onboarding"]',"Pick up where you left off.");
        expect(gatewayOperations.filter(op=>op==="publish_current_onboarding_identity")).toHaveLength(1);
        await visit("/fixture-creator","Published first Identity");
      }else await reloadFromLink('a[href="/fixture-creator"]',"Published first Identity");
      expect(await b.evaluate("document.body.innerText.includes('Setup Product')||document.body.innerText.includes('Setup Resource')")).toBe(false);
      for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
      await visit("/dashboard","Pick up where you left off.");await text("Setup Product");await text("Setup Resource");
      expect(await b.evaluate("document.querySelector('a[href=\"/dashboard/spill/1/edit\"]')!==null && document.querySelector('a[href=\"/dashboard/spill/2/edit\"]')!==null")).toBe(true);
      await visit("/dashboard/spill/2/edit","Keep shaping this resource.");expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Setup Resource");
      setup.identity={...setup.identity!,display_name:"New private Working name",revision:2};
      await visit("/fixture-creator","Published first Identity");expect(await b.evaluate("document.body.innerText.includes('New private Working name')")).toBe(false);
      expect(cspErrors).toEqual([]);return;
    }
    if(spillOnly){
      accountState="active";setup.step=5;setup.handle="fixture-creator";setup.useCase="personal";
      setup.identity={display_name:"Spill Owner",bio:null,profile_asset_key:null,revision:1};setup.layout={starter_key:"clean",revision:1};
      const original=JSON.stringify(setup),items=JSON.stringify(starterItems);
      await visit("/login","Good to have you back.");await input("email","owner@example.test");await input("password","new-password");await submit();await text("Pick up where you left off.");
      await visit("/dashboard/identity","Spill integration");
      const form='form[aria-label="New Spill integration"]';
      const add=()=>b.evaluate(`document.querySelector('${form} button[type=submit]').click()`);
      await b.evaluate(`document.querySelector('${form} [name=visibility]').value='false';document.querySelector('${form} [name=visibility]').dispatchEvent(new Event('change',{bubbles:true}))`);
      await add();await text("Spill integration added to Working.");expect(linksNow()!.revision).toBe(1);expect(linksNow()!.blocks).toHaveLength(1);expect(linksNow()!.blocks[0]!.is_visible).toBe(false);
      expect(await b.evaluate(`document.querySelector('${form} button[type=submit]').disabled`)).toBe(true);
      await b.evaluate(`Array.from(document.querySelectorAll('${form} button')).find(button=>button.textContent==='Add another integration').click()`);
      await add();await until(()=>linksNow()?.revision===2);await text("Spill integration added to Working.");expect(linksNow()!.blocks).toHaveLength(2);expect(linksNow()!.blocks[1]!.is_visible).toBe(true);
      const reload=()=>reloadFromLink('[data-spill-cta-reload] a',"Spill integration");await reload();
      expect(await b.evaluate("document.querySelectorAll('[data-composition-block]').length")).toBe(2);
      expect(await b.evaluate("document.body.innerText.includes('owner_spill')")).toBe(false);await text("Your own Spill");
      await reloadFromLink('a[href="/dashboard/identity/preview"]',"See your saved Identity.");expect(await b.evaluate("document.querySelectorAll('[data-preview-kind=spill_cta]').length")).toBe(1);expect(await b.evaluate("document.querySelector('a[href=\"/fixture-creator/spill\"]')===null")).toBe(true);
      await reloadFromLink('header a.underline[href="/dashboard/identity"]',"Spill integration");
      await b.evaluate(`document.querySelector('${form} [name=visibility]').value='false';document.querySelector('${form} [name=visibility]').dispatchEvent(new Event('change',{bubbles:true}))`);
      await scopedInput('form[aria-label="New Text Working"]',"text","Text alongside integration");await b.evaluate("document.querySelector('form[aria-label=\"New Text Working\"] button[type=submit]').click()");await text("Text block added to Working.");await text("Reload saved work to reconcile this integration");expect(await b.evaluate(`document.querySelector('${form} [name=visibility]').value`)).toBe("false");
      await reload();linksNow()!.revision+=1;await add();await text("We couldn’t confirm this Spill integration.");expect(linksNow()!.blocks.filter(row=>row.kind==="spill_cta")).toHaveLength(2);
      await reload();loseAcknowledgment=true;const before=gatewayOperations.filter(op=>op==="add_current_owner_spill_cta_block_working").length;await add();await text("We couldn’t confirm this Spill integration.");loseAcknowledgment=false;
      expect(gatewayOperations.filter(op=>op==="add_current_owner_spill_cta_block_working")).toHaveLength(before+1);expect(linksNow()!.blocks.filter(row=>row.kind==="spill_cta")).toHaveLength(3);expect(await b.evaluate(`document.querySelector('${form} button[type=submit]').disabled`)).toBe(true);
      await reload();expect(linksNow()!.blocks.filter(row=>row.kind==="spill_cta")).toHaveLength(3);expect(JSON.stringify(setup)).toBe(original);expect(JSON.stringify(starterItems)).toBe(items);
      for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
      const shot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-277-integration.png",Buffer.from(shot.data,"base64"));
      expect(calls.some(call=>call.includes("publish_current"))).toBe(false);expect(cspErrors).toEqual([]);return;
    }
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      await visit("/", "A little you.");
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      expect(await b.evaluate("document.querySelectorAll('h1').length")).toBe(1);
    }
    await b.command("Page.navigate", { url: origin + "/" }); await text("A little you.");
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    expect(await b.evaluate("document.activeElement.textContent")).toBe("Skip to content");
    const capture = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/spall-256-home.png", Buffer.from(capture.data, "base64"));
    await b.evaluate("document.querySelector('a[href=\"/signup\"]').click()"); await text("Make a little space for you.");
    await input("email", "owner@example.test"); await input("password", "new-password"); await submit(); await text("Check your email to continue.");
    expect(calls).toContain("/auth/v1/signup");
    await visit("/login", "Good to have you back.");
    expect(await b.evaluate("document.title")).toBe("Log in | Spall Spill");
    await input("email", "owner@example.test"); await input("password", "wrong-password"); await submit(); await text("We couldn't sign you in");
    await b.evaluate("document.querySelector('a[href=\"/recovery\"]').click()"); await text("Let’s get you back in.");
    expect(await b.evaluate("location.pathname")).toBe("/recovery");
    await input("email", "owner@example.test"); await submit(); await text("If recovery is available");
    expect(calls).toContain("/auth/v1/recover"); expect(await b.evaluate("document.querySelector('button[type=submit]').disabled")).toBe(true);
    await visit("/recovery?token_hash=bad", "This recovery link isn’t valid");
    const tokenPath = "/recovery?token_hash=" + "a".repeat(64);
    const headers = await fetch(origin + tokenPath);
    expect(headers.headers.get("cache-control")).toContain("no-store"); expect(headers.headers.get("referrer-policy")).toBe("no-referrer");
    await visit(tokenPath, "A fresh start."); expect(calls.filter(x => x.endsWith("/verify"))).toHaveLength(0);
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    await input("password", "new-password"); await input("confirmation", "different-password"); await submit(); await text("Your passwords don’t match");
    expect(calls.filter(x => x.endsWith("/verify"))).toHaveLength(0);
    await input("password", "new-password"); await input("confirmation", "new-password"); await submit(); await text("Your password has been updated.");
    expect(await b.evaluate("location.pathname")).toBe("/login"); expect(calls).toContain("/auth/v1/user"); expect(calls).toContain("/auth/v1/logout");
    await visit(tokenPath, "A fresh start."); await input("password", "new-password"); await input("confirmation", "new-password"); await submit(); await text("It may be expired or already used");
    expect(calls.filter(x => x.endsWith("/user"))).toHaveLength(1);
    await visit("/login", "Good to have you back."); await input("email", "owner@example.test"); await input("password", "new-password"); await submit(); await text("Claim your Handle");
    expect(await b.evaluate("location.pathname")).toBe("/onboarding");
    await visit("/onboarding?step=preview_publish", "Claim your Handle");
    expect(setup.step).toBe(0); expect(await b.evaluate("document.querySelectorAll('.setup-steps a').length")).toBe(1);
    await input("handle", "fixture-creator"); await submit(); await text("What are you starting");
    await b.evaluate("document.querySelector('input[name=primaryUseCase][value=personal]').click()"); await submit(); await text("Build your Basic Identity");
    await input("displayName", "Saved Creator"); await input("bio", "Private working biography"); await submit(); await text("Choose your starting");
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      expect(await b.evaluate("document.querySelectorAll('.setup-steps a[aria-current=step]').length")).toBe(1);
    }
    const setupScreenshot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/spall-258-onboarding.png", Buffer.from(setupScreenshot.data, "base64"));
    await b.evaluate("document.querySelector('input[name=starterKey][value=clean]').click()"); await submit(); await text("Add something useful");
    expect(setup.step).toBe(4); expect(setup.layout?.starter_key).toBe("clean");
    await visit("/onboarding?step=basic_identity", "Build your Basic Identity");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Saved Creator");
    expect(await b.evaluate("document.querySelector('[name=bio]').value")).toBe("Private working biography");
    expect(await b.evaluate("document.body.innerText.includes('Your saved progress remains at Step 5')")).toBe(true);
    setup.revision++; // Another tab acknowledged a change after this form was loaded.
    await submit(); await text("Your onboarding progress changed");
    expect(setup.identity?.display_name).toBe("Saved Creator"); expect(setup.step).toBe(4);
    await visit("/onboarding", "Add something useful");
    await b.evaluate("[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip for now').click()");
    await text("Private preview."); expect(setup.step).toBe(5);
    expect(await b.evaluate("document.querySelector('[aria-label=\"Private Identity preview\"]').textContent.includes('Saved Creator')")).toBe(true);
    await submit(); await text("Preview confirmed privately. Nothing has been published.");
    expect(calls).toContain("/rest/v1/rpc/confirm_current_onboarding_preview");
    expect(calls.some(x => x.includes("publish_current"))).toBe(false); expect(errors).toEqual([]); expect(cspErrors).toEqual([]);
    pauseStateRead = true;
    await b.command("Page.navigate", { url: origin + "/onboarding" }); await text("Loading your saved setup");
    await until(() => releaseStateReads.length > 0); pauseStateRead = false;
    for (const release of releaseStateReads.splice(0)) release(); await text("Private preview.");
    unavailable = true; await visit("/onboarding", "We couldn’t load your setup.");
    expect(await b.evaluate("document.body.innerText.includes('fixture provider detail')")).toBe(false);
    unavailable = false; await b.evaluate("document.querySelector('a[href=\"/onboarding\"]').click()");
    await text("Private preview."); expect(setup.identity?.display_name).toBe("Saved Creator"); expect(setup.step).toBe(5);
    // Native Account disclosure works with the keyboard and never submits Working.
    const savedRevision = setup.revision;
    await b.evaluate("document.querySelector('.private-session-menu summary').focus()");
    expect(await b.evaluate("document.activeElement?.tagName")).toBe("SUMMARY");
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await until(() => b.evaluate<boolean>("document.querySelector('.private-session-menu')?.open === true"));
    expect(setup.revision).toBe(savedRevision);
    expect(await b.evaluate("document.querySelectorAll('form form').length")).toBe(0);
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    const logout = async () => { await b.evaluate(`document.querySelector('form[aria-label="Sign out"]').requestSubmit()`); };
    failLogout = true;
    await logout(); await text("We couldn't confirm Sign Out. Please try again.");
    expect(await b.evaluate("location.pathname")).toBe("/onboarding");
    const failedLogoutCookies = await b.command<{ cookies: { name: string }[] }>("Network.getCookies", { urls: [origin] });
    expect(failedLogoutCookies.cookies.some(cookie => cookie.name.includes("auth-token"))).toBe(true);
    expect(await b.evaluate("document.body.innerText.includes('fixture private logout failure')")).toBe(false);
    await visit("/auth/resolve", "Private preview."); // Failed logout retains usable authentication.
    for (const status of ["restricted", "suspended"] as const) {
      accountState = status;
      await visit("/onboarding", status === "restricted" ? "Your account access is restricted" : "Your account is suspended");
      expect(await b.evaluate("location.pathname")).toBe("/dashboard/account-status");
      expect(await b.evaluate("document.title")).toBe("Account status | Spall Spill");
      expect(await b.evaluate("document.body.innerText.includes('25800000-0000')")).toBe(false);
      expect(await b.evaluate("document.querySelectorAll('form').length")).toBe(1);
    }
    failLogout = false;
    await logout(); await text("Good to have you back.");
    expect(await b.evaluate("location.pathname")).toBe("/login");
    const cookies = await b.command<{ cookies: { name: string }[] }>("Network.getCookies", { urls: [origin] });
    expect(cookies.cookies.some(cookie => cookie.name.includes("auth-token"))).toBe(false);
    const readsAfterLogout = calls.filter(call => call.startsWith("/rest/v1/rpc/")).length;
    await visit("/onboarding", "Good to have you back.");
    expect(await b.evaluate("location.pathname")).toBe("/login");
    expect(calls.filter(call => call.startsWith("/rest/v1/rpc/")).length).toBe(readsAfterLogout);
    accountState = "onboarding_incomplete";
    await input("email", "owner@example.test"); await input("password", "new-password"); await submit(); await text("Private preview.");
    expect(setup.identity?.display_name).toBe("Saved Creator"); expect(setup.step).toBe(5);
    expect(setup.revision).toBe(savedRevision);
    const errorsBeforeEditor = errors.length;
    accountState = "active";
    await visit("/dashboard/identity", "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Saved Creator");
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    const editorScreenshot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/spall-260-editor.png", Buffer.from(editorScreenshot.data, "base64"));
    await input("displayName", ""); await input("bio", " Raw\n Bio "); await submit();
    await text("Working saved. Your published Identity has not changed.");
    expect(currentOverlay()?.display_name).toBe(""); expect(currentOverlay()?.bio).toBe(" Raw\r\n Bio ");
    expect(setup.identity?.display_name).toBe("Saved Creator");
    await reloadFromLink('form[aria-label="Profile Working"] a[href="/dashboard/identity"]', "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("");
    expect(await b.evaluate("document.querySelector('[name=bio]').value")).toBe(" Raw\n Bio ");
    const savesBeforeUnknown = gatewayOperations.filter(operation => operation === "save_current_owner_profile_text_working").length;
    loseAcknowledgment = true;
    await input("displayName", "Saved despite lost acknowledgment"); await submit(); await text("We couldn’t confirm this save.");
    expect(currentOverlay()?.display_name).toBe("Saved despite lost acknowledgment");
    expect(gatewayOperations.filter(operation => operation === "save_current_owner_profile_text_working")).toHaveLength(savesBeforeUnknown + 1);
    expect(await b.evaluate("document.querySelector('form[aria-label=\"Profile Working\"] button').disabled")).toBe(true);
    loseAcknowledgment = false;
    await visit("/dashboard/identity", "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Saved despite lost acknowledgment");
    overlay = { display_name: "Another tab", bio: "Saved elsewhere", revision: 3, source_profile_revision: setup.identity!.revision };
    await input("displayName", "Keep my conflicting input"); await submit(); await text("We couldn’t confirm this save.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Keep my conflicting input");
    expect(await b.evaluate("document.querySelector('form[aria-label=\"Profile Working\"] button').disabled")).toBe(true);
    await visit("/dashboard/identity", "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Another tab");
    expect(errors.length).toBe(errorsBeforeEditor);
    const originalProfile=JSON.stringify(setup.identity),originalOverlay=JSON.stringify(currentOverlay()),originalProgress=setup.revision;
    const styleForm='form[aria-label="Starting style Working"]';
    const saveStyle=async()=>{await b.evaluate(`document.querySelector('${styleForm}').requestSubmit()`);};
    for(const key of ["clean","social_focus","featured","business"]){
      await b.evaluate(`document.querySelector('${styleForm} input[value="${key}"]').click()`);
      const changed=setup.layout!.starter_key!==key,revision=setup.layout!.revision;
      await saveStyle();
      try { await text(changed?"Starting style saved in Working.":"This starting style is already saved in Working."); }
      catch { throw new Error(`Style ${key} acknowledgment missing: ${JSON.stringify(setup.layout)}; ${await b.evaluate(`document.querySelector('${styleForm}').innerText`)}`); }
      expect(setup.layout!.revision).toBe(revision+(changed?1:0));
      await reloadFromLink(`${styleForm} a[href="/dashboard/identity"]`,"Your Identity, in progress.");
      expect(await b.evaluate(`document.querySelector('${styleForm} input[value="${key}"]').checked`)).toBe(true);
    }
    // Native radio keyboard interaction, preserving the pre-existing Profile save.
    await b.evaluate(`document.querySelector('${styleForm} input[value="business"]').focus()`);
    await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowLeft",code:"ArrowLeft",windowsVirtualKeyCode:37});
    await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowLeft",code:"ArrowLeft",windowsVirtualKeyCode:37});
    expect(await b.evaluate(`document.querySelector('${styleForm} input[value="featured"]').checked`)).toBe(true);
    setup.layout!.revision+=1;
    await saveStyle();await text("We couldn’t confirm the style save.");
    expect(await b.evaluate(`document.querySelector('${styleForm} input[value="featured"]').checked`)).toBe(true);
    expect(await b.evaluate(`document.querySelector('${styleForm} button').disabled`)).toBe(true);
    await visit("/dashboard/identity","Your Identity, in progress.");
    loseAcknowledgment=true;
    await b.evaluate(`document.querySelector('${styleForm} input[value="clean"]').click()`);
    const styleSaves=gatewayOperations.filter(x=>x==="save_current_owner_layout_working").length;
    await saveStyle();await text("We couldn’t confirm the style save.");loseAcknowledgment=false;
    expect(gatewayOperations.filter(x=>x==="save_current_owner_layout_working")).toHaveLength(styleSaves+1);
    expect(await b.evaluate(`document.querySelector('${styleForm} button').disabled`)).toBe(true);
    await reloadFromLink(`${styleForm} a[href="/dashboard/identity"]`,"Your Identity, in progress.");
    expect(await b.evaluate(`document.querySelector('${styleForm} input[value="clean"]').checked`)).toBe(true);
    expect(JSON.stringify(setup.identity)).toBe(originalProfile);expect(JSON.stringify(currentOverlay())).toBe(originalOverlay);expect(setup.revision).toBe(originalProgress);
    for(const width of [360,768,1440]){
      await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width<600});
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    expect(errors.length).toBe(errorsBeforeEditor);
    const creationForm='form[aria-label="New link Working"]';
    const createLink=async()=>{await b.evaluate(`document.querySelector('${creationForm}').requestSubmit()`);};
    const anotherLink=async()=>{await b.evaluate(`document.querySelector('${creationForm} button[type="button"]').click()`);};
    const chooseSecond=async(name:string)=>{
      await b.evaluate(`document.querySelector('${creationForm} [name="${name}"]').focus()`);
      await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
      await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
    };
    expect(linksNow()).toBeNull();await visit("/dashboard/identity","Add a link");expect(linksNow()).toBeNull();
    const initialCreations=gatewayOperations.filter(x=>x==="initialize_current_owner_blocks_from_link").length;
    await scopedInput(creationForm,"title","First own Generic Link");await scopedInput(creationForm,"destination","unfinished first destination");
    await createLink();await text("Link block added to Working.");expect(linksNow()!.revision).toBe(1);expect(linksNow()!.blocks).toHaveLength(1);
    const firstLinkId=linksNow()!.blocks[0]!.block_id;
    await until(()=>b.evaluate<boolean>(`document.querySelector('form[data-block="${firstLinkId}"] [name=title]')?.value==='First own Generic Link'`));
    expect(await b.evaluate(`document.querySelector('${creationForm} button[type="submit"]').disabled`)).toBe(true);
    await b.evaluate(`document.querySelector('${creationForm} button[type="submit"]').click()`);
    expect(gatewayOperations.filter(x=>x==="initialize_current_owner_blocks_from_link")).toHaveLength(initialCreations+1);
    await scopedInput(`form[data-block="${firstLinkId}"]`,"title","Keep sibling draft during add");
    await anotherLink();await chooseSecond("kind");await chooseSecond("visibility");
    await scopedInput(creationForm,"title","Second Social");await scopedInput(creationForm,"platform","instagram");await scopedInput(creationForm,"destination","https://social.example.test/second");
    await createLink();await text("Link block added to Working.");expect(linksNow()!.revision).toBe(2);expect(linksNow()!.blocks[1]!.kind).toBe("social");expect(linksNow()!.blocks[1]!.is_visible).toBe(false);
    expect(await b.evaluate(`document.querySelector('form[data-block="${firstLinkId}"] [name=title]').value`)).toBe("Keep sibling draft during add");
    await anotherLink();await scopedInput(creationForm,"title","Created despite lost reply");await scopedInput(creationForm,"destination","raw partial");
    loseAcknowledgment=true;const beforeUnknownAdd=gatewayOperations.filter(x=>x==="add_current_owner_link_block_working").length;
    await createLink();await text("We couldn’t confirm the new link.");loseAcknowledgment=false;
    expect(linksNow()!.blocks).toHaveLength(3);expect(gatewayOperations.filter(x=>x==="add_current_owner_link_block_working")).toHaveLength(beforeUnknownAdd+1);
    expect(await b.evaluate("Array.from(document.querySelectorAll('form[data-block] button,form[aria-label=\"New link Working\"] button[type=submit]')).every(button=>button.disabled)")).toBe(true);
    await reloadFromLink('a[href="/dashboard/identity"][class="text-sm underline"]',"Add a link");
    const recoveredId=linksNow()!.blocks[2]!.block_id;
    expect(await b.evaluate(`document.querySelector('form[data-block="${recoveredId}"] [name=title]').value`)).toBe("Created despite lost reply");
    linksNow()!.revision+=1;await scopedInput(creationForm,"title","Keep stale new link");await scopedInput(creationForm,"destination","stale text");await createLink();await text("We couldn’t confirm the new link.");
    expect(linksNow()!.blocks).toHaveLength(3);expect(await b.evaluate(`document.querySelector('${creationForm} [name=title]').value`)).toBe("Keep stale new link");
    linkCollection={revision:7,blocks:[],has_more:false,next_after_position:null};await visit("/dashboard/identity","Add a link");
    await scopedInput(creationForm,"title","Append to saved empty collection");await scopedInput(creationForm,"destination","https://empty.example.test/link");await createLink();await text("Link block added to Working.");
    expect(linksNow()!.revision).toBe(8);expect(linksNow()!.blocks).toHaveLength(1);expect(gatewayOperations.filter(x=>x==="initialize_current_owner_blocks_from_link")).toHaveLength(initialCreations+1);
    const emptyCreatedId=linksNow()!.blocks[0]!.block_id;
    await scopedInput(`form[data-block="${emptyCreatedId}"]`,"title","Keep draft across unrelated refresh");
    linksNow()!.revision+=1;
    await b.evaluate(`document.querySelector('form[aria-label="Starting style Working"]').requestSubmit()`);await text("This starting style is already saved in Working.");
    await text("Reload saved work to reconcile all links before saving again.");
    expect(await b.evaluate(`document.querySelector('form[data-block="${emptyCreatedId}"] [name=title]').value`)).toBe("Keep draft across unrelated refresh");
    expect(await b.evaluate("Array.from(document.querySelectorAll('form[data-block] button')).every(button=>button.disabled)")).toBe(true);
    const genericId="26300000-0000-4000-8000-000000000011",socialId="26300000-0000-4000-8000-000000000012";
    linkCollection={revision:1,has_more:false,next_after_position:null,blocks:[
      {block_id:genericId,kind:"generic_link",position:1,is_visible:true,payload_state:"present",media_asset_state:null,working:{kind:"generic_link",title:"Saved Link",social_platform:null,destination_url:"https://saved.example.test"}},
      {block_id:socialId,kind:"social",position:2,is_visible:false,payload_state:"present",media_asset_state:null,working:{kind:"social",title:"Saved Social",social_platform:"instagram",destination_url:"https://social.example.test"}},
    ]};
    await visit("/dashboard/identity","Saved links");
    const linkInput=async(id:string,name:string,value:string)=>{
      await b.evaluate(`(()=>{const el=document.querySelector('form[data-block="${id}"] [name="${name}"]');el.focus();})()`);
      // A native select-all key event hydrates the focused control before typing;
      // DOM select() alone can lose its range during the first hydration event.
      await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65});
      await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"a",code:"KeyA",windowsVirtualKeyCode:65});
      await b.command("Input.insertText",{text:value});
    };
    const saveLink=async(id:string)=>{await b.evaluate(`document.querySelector('form[data-block="${id}"]').requestSubmit()`);};
    await linkInput(socialId,"title","Unsaved sibling social");await linkInput(socialId,"platform"," Insta\n raw ");
    await linkInput(genericId,"title"," Raw <em>private</em> ");await linkInput(genericId,"destination","javascript:unfinished");
    await saveLink(genericId);await text("Link saved in Working.");expect(linkCollection.revision).toBe(2);
    expect(await b.evaluate(`document.querySelector('form[data-block="${socialId}"] [name=title]').value`)).toBe("Unsaved sibling social");
    await saveLink(socialId);await until(()=>linkCollection!.revision===3);
    await until(()=>b.evaluate<boolean>(`document.querySelector('form[data-block="${socialId}"]').innerText.includes('Link saved in Working.')`));
    expect(linkCollection.blocks[1]!.working.title).toBe("Unsaved sibling social");expect(linkCollection.blocks[1]!.working.social_platform).toBe(" Insta\r\n raw ");expect(linkCollection.blocks[1]!.is_visible).toBe(false);
    await reloadFromLink('a[href="/dashboard/identity"][class="text-sm underline"]',"Saved links");
    expect(await b.evaluate(`document.querySelector('form[data-block="${genericId}"] [name=destination]').value`)).toBe("javascript:unfinished");
    expect(await b.evaluate("document.querySelectorAll('a[href^=javascript]').length")).toBe(0);
    expect(await b.evaluate("document.querySelectorAll('form[data-block] em').length")).toBe(0);
    linkCollection.revision+=1;await linkInput(genericId,"title","Retain conflicting link");await saveLink(genericId);await text("We couldn’t confirm the link save.");
    expect(await b.evaluate(`document.querySelector('form[data-block="${genericId}"] [name=title]').value`)).toBe("Retain conflicting link");
    expect(await b.evaluate("Array.from(document.querySelectorAll('form[data-block] button')).every(button=>button.disabled)")).toBe(true);
    await visit("/dashboard/identity","Saved links");loseAcknowledgment=true;
    await linkInput(socialId,"title","Social saved despite unknown response");const linkSaves=gatewayOperations.filter(x=>x==="save_current_owner_block_link_working").length;
    await saveLink(socialId);await text("We couldn’t confirm the link save.");loseAcknowledgment=false;
    expect(gatewayOperations.filter(x=>x==="save_current_owner_block_link_working")).toHaveLength(linkSaves+1);
    expect(await b.evaluate("Array.from(document.querySelectorAll('form[data-block] button')).every(button=>button.disabled)")).toBe(true);
    await visit("/dashboard/identity","Saved links");
    expect(await b.evaluate(`document.querySelector('form[data-block="${socialId}"] [name=title]').value`)).toBe("Social saved despite unknown response");
    expect(JSON.stringify(setup.identity)).toBe(originalProfile);expect(JSON.stringify(currentOverlay())).toBe(originalOverlay);expect(setup.revision).toBe(originalProgress);
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width<600});expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);}
    expect(errors.length).toBe(errorsBeforeEditor);
    const linksScreenshot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
    await writeFile("/tmp/spall-263-links.png",Buffer.from(linksScreenshot.data,"base64"));
    // Text initialization, append and save use the actual protected page/action transport.
    linkCollection=null;await visit("/dashboard/identity","Add Text");expect(linksNow()).toBeNull();
    const newText='form[aria-label="New Text Working"]';
    const addText=async()=>{await b.evaluate(`document.querySelector('${newText}').requestSubmit()`);};
    await scopedInput(newText,"text"," <script>window.textExecuted=true</script>\n Plain <b>text</b> ");
    await addText();await text("Text block added to Working.");
    expect(linksNow()!.revision).toBe(1);expect(linksNow()!.blocks).toHaveLength(1);const textId=linksNow()!.blocks[0]!.block_id;
    expect(linksNow()!.blocks[0]!.working.text).toContain("<script>");expect(await b.evaluate("window.textExecuted===undefined")).toBe(true);
    expect(await b.evaluate(`document.querySelector('${newText} button[type=submit]').disabled`)).toBe(true);
    await b.evaluate(`document.querySelector('${newText} button[type=button]').click()`);
    await scopedInput(newText,"text","  Hidden note  ");await b.evaluate(`document.querySelector('${newText} [name=visibility]').focus()`);
    await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
    await addText();await text("Text block added to Working.");expect(linksNow()!.revision).toBe(2);expect(linksNow()!.blocks[1]!.is_visible).toBe(false);
    const textForm=`form[data-text-block="${textId}"]`;
    const saveText=async()=>{await b.evaluate(`document.querySelector('${textForm}').requestSubmit()`);};
    await scopedInput(textForm,"text","  Edited literal <em>private</em>  ");await saveText();await text("Text saved in Working.");expect(linksNow()!.revision).toBe(3);
    await reloadFromLink('[data-text-reload] a',"Text blocks");expect(await b.evaluate(`document.querySelector('${textForm} [name=text]').value`)).toBe("  Edited literal <em>private</em>  ");
    // A Link change bumps the same collection and freezes unsaved Text without rebasing it.
    await scopedInput(textForm,"text","Keep unsaved Text across Link save");await scopedInput(creationForm,"title","Shared collection link");await createLink();await text("Link block added to Working.");
    await text("Reload saved work to reconcile all Text blocks");expect(await b.evaluate(`document.querySelector('${textForm} [name=text]').value`)).toBe("Keep unsaved Text across Link save");
    await reloadFromLink('[data-text-reload] a',"Text blocks");
    loseAcknowledgment=true;const textSaves=gatewayOperations.filter(x=>x==="save_current_owner_block_text_working").length;
    await scopedInput(textForm,"text","Saved Text despite unknown response");await saveText();await text("We couldn’t confirm this Text change.");loseAcknowledgment=false;
    expect(gatewayOperations.filter(x=>x==="save_current_owner_block_text_working")).toHaveLength(textSaves+1);
    expect(await b.evaluate(`document.querySelector('${textForm} button[type=submit]').disabled`)).toBe(true);
    await reloadFromLink('[data-text-reload] a',"Text blocks");expect(await b.evaluate(`document.querySelector('${textForm} [name=text]').value`)).toBe("Saved Text despite unknown response");
    linksNow()!.revision+=1;await scopedInput(textForm,"text","Retain stale Text");await saveText();await text("We couldn’t confirm this Text change.");
    expect(await b.evaluate(`document.querySelector('${textForm} [name=text]').value`)).toBe("Retain stale Text");
    await reloadFromLink('[data-text-reload] a',"Text blocks");
    await b.evaluate(`document.querySelector('${newText} button[type=submit]').click()`);await text("Text block added to Working.");expect(linksNow()!.blocks.at(-1)!.working.text).toBe("");
    await b.evaluate(`document.querySelector('${newText} button[type=button]').click()`);await scopedInput(newText,"text","Recover allocation without duplication");
    loseAcknowledgment=true;const beforeTextCount=linksNow()!.blocks.length;const textAdds=gatewayOperations.filter(x=>x==="add_current_owner_text_block_working").length;
    await addText();await text("We couldn’t confirm this Text change.");loseAcknowledgment=false;
    expect(linksNow()!.blocks).toHaveLength(beforeTextCount+1);expect(gatewayOperations.filter(x=>x==="add_current_owner_text_block_working")).toHaveLength(textAdds+1);
    expect(await b.evaluate(`document.querySelector('${newText} button[type=submit]').disabled`)).toBe(true);
    await reloadFromLink('[data-text-reload] a',"Text blocks");expect(linksNow()!.blocks).toHaveLength(beforeTextCount+1);
    const missingBlock=linksNow()!.blocks.find(row=>row.block_id===textId)!;
    Object.assign(missingBlock,{payload_state:"missing",working:null});await visit("/dashboard/identity","This saved block has no content yet.");
    await scopedInput(textForm,"text","Recovered missing Text content");await saveText();await text("Text saved in Working.");
    expect(JSON.stringify(setup.identity)).toBe(originalProfile);expect(JSON.stringify(currentOverlay())).toBe(originalOverlay);expect(setup.revision).toBe(originalProgress);
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width<600});expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);}
    const textScreenshot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-271-text.png",Buffer.from(textScreenshot.data,"base64"));
    linkCollection=null;await visit("/dashboard/identity","Add Contact");expect(linksNow()).toBeNull();
    const newContact='form[aria-label="New Contact Working"]';
    const addContact=async()=>{await b.evaluate(`document.querySelector('${newContact}').requestSubmit()`);};
    const contactType=async(selector:string,index:number)=>{await b.evaluate(`document.querySelector('${selector} [name=contactType]').focus()`);
      for(const key of ["Home",...Array.from({length:index},()=>"ArrowDown")]){await b.command("Input.dispatchKeyEvent",{type:"keyDown",key,code:key,windowsVirtualKeyCode:key==="Home"?36:40});await b.command("Input.dispatchKeyEvent",{type:"keyUp",key,code:key,windowsVirtualKeyCode:key==="Home"?36:40});}
    };
    await contactType(newContact,1);await scopedInput(newContact,"label"," Raw <script>label</script> ");await scopedInput(newContact,"value","javascript:unfinished <em>email</em>");
    await addContact();await text("Contact block added to Working.");expect(linksNow()!.revision).toBe(1);expect(linksNow()!.blocks[0]!.working.contact_type).toBe("email");
    const contactId=linksNow()!.blocks[0]!.block_id;const contactForm=`form[data-contact-block="${contactId}"]`;
    expect(await b.evaluate(`document.querySelector('${newContact} button[type=submit]').disabled`)).toBe(true);
    await b.evaluate(`document.querySelector('${newContact} button[type=button]').click()`);await contactType(newContact,2);await scopedInput(newContact,"value"," +62 incomplete ");
    await b.evaluate(`document.querySelector('${newContact} [name=visibility]').focus()`);await b.command("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});await b.command("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
    await addContact();await text("Contact block added to Working.");expect(linksNow()!.blocks[1]!.working.contact_type).toBe("whatsapp");expect(linksNow()!.blocks[1]!.is_visible).toBe(false);
    await b.evaluate(`document.querySelector('${newContact} button[type=button]').click()`);await contactType(newContact,3);await scopedInput(newContact,"value"," 0123 unfinished ");await addContact();await text("Contact block added to Working.");expect(linksNow()!.blocks[2]!.working.contact_type).toBe("phone");
    await reloadFromLink('[data-contact-reload] a',"Contact blocks");expect(await b.evaluate(`document.querySelector('${contactForm} [name=value]').value`)).toBe("javascript:unfinished <em>email</em>");
    expect(await b.evaluate("Array.from(document.querySelectorAll('a')).some(a=>['mailto:','tel:','https://wa.me'].some(prefix=>(a.getAttribute('href')||'').startsWith(prefix)))")).toBe(false);
    await scopedInput(contactForm,"value","Keep unsaved Contact across Text save");await scopedInput(newText,"text","Text beside Contact");await addText();await text("Text block added to Working.");await text("Reload saved work to reconcile all Contact blocks");
    expect(await b.evaluate(`document.querySelector('${contactForm} [name=value]').value`)).toBe("Keep unsaved Contact across Text save");
    await reloadFromLink('[data-contact-reload] a',"Contact blocks");const textBeforeContact=JSON.stringify(linksNow()!.blocks.filter(row=>row.kind==="text"));
    const saveContact=async()=>{await b.evaluate(`document.querySelector('${contactForm}').requestSubmit()`);};
    await scopedInput(contactForm,"label","  Edited raw label  ");await scopedInput(contactForm,"value","  raw not-an-email  ");await saveContact();await text("Contact saved in Working.");expect(JSON.stringify(linksNow()!.blocks.filter(row=>row.kind==="text"))).toBe(textBeforeContact);
    await reloadFromLink('[data-contact-reload] a',"Contact blocks");expect(await b.evaluate(`document.querySelector('${contactForm} [name=label]').value`)).toBe("  Edited raw label  ");
    loseAcknowledgment=true;const contactSaves=gatewayOperations.filter(x=>x==="save_current_owner_block_contact_working").length;await scopedInput(contactForm,"value","Contact saved despite missing reply");await saveContact();await text("We couldn’t confirm this Contact change.");loseAcknowledgment=false;
    expect(gatewayOperations.filter(x=>x==="save_current_owner_block_contact_working")).toHaveLength(contactSaves+1);expect(await b.evaluate(`document.querySelector('${contactForm} button[type=submit]').disabled`)).toBe(true);
    await reloadFromLink('[data-contact-reload] a',"Contact blocks");expect(await b.evaluate(`document.querySelector('${contactForm} [name=value]').value`)).toBe("Contact saved despite missing reply");
    linksNow()!.revision+=1;await scopedInput(contactForm,"label","Retain stale Contact");await saveContact();await text("We couldn’t confirm this Contact change.");expect(await b.evaluate(`document.querySelector('${contactForm} [name=label]').value`)).toBe("Retain stale Contact");
    await reloadFromLink('[data-contact-reload] a',"Contact blocks");loseAcknowledgment=true;const beforeContactCount=linksNow()!.blocks.length;
    await addContact();await text("We couldn’t confirm this Contact change.");loseAcknowledgment=false;expect(linksNow()!.blocks).toHaveLength(beforeContactCount+1);expect(linksNow()!.blocks.at(-1)!.working.contact_type).toBeNull();expect(linksNow()!.blocks.at(-1)!.working.value).toBe("");
    await reloadFromLink('[data-contact-reload] a',"Contact blocks");expect(linksNow()!.blocks).toHaveLength(beforeContactCount+1);
    Object.assign(linksNow()!.blocks.find(row=>row.block_id===contactId)!,{payload_state:"missing",working:null});await visit("/dashboard/identity","This saved Contact block has no content yet.");
    await scopedInput(contactForm,"value","Missing contact recovered");await saveContact();await text("Contact saved in Working.");
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width<600});expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);}
    const contactScreenshot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-272-contact.png",Buffer.from(contactScreenshot.data,"base64"));
    const beforePreview=JSON.stringify(linksNow());
    await reloadFromLink('a[href="/dashboard/identity/preview"]',"See your saved Identity.");
    await text("Text beside Contact");
    expect(await b.evaluate("document.querySelectorAll('[data-preview-kind=contact]').length")).toBe(3);
    expect(await b.evaluate("document.querySelectorAll('a[href^=\"mailto:\"],a[href^=\"tel:\"],a[href^=\"javascript:\"]').length")).toBe(0);
    expect(JSON.stringify(linksNow())).toBe(beforePreview);
    failIdentityRead=true;
    await visit("/dashboard/identity/preview","We couldn’t load this preview.");
    expect(await b.evaluate("document.querySelector('[data-preview-kind]')===null")).toBe(true);
    expect(await b.evaluate("document.body.innerText.includes('private preview provider detail')")).toBe(false);
    expect(JSON.stringify(linksNow())).toBe(beforePreview);
    failIdentityRead=false;
    await reloadFromLink('a[href="/dashboard/identity/preview"]',"See your saved Identity.");
    await text("Text beside Contact");
    expect(JSON.stringify(linksNow())).toBe(beforePreview);
    await reloadFromLink('header a.underline[href="/dashboard/identity"]',"Your Identity, in progress.");
    const kinds=["social","generic_link","text","contact","media","spill_cta"];
    const compositionIds=kinds.map((_,i)=>`27300000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
    linkCollection={revision:1,has_more:false,next_after_position:null,blocks:kinds.map((kind,i)=>({block_id:compositionIds[i],kind,position:i+1,is_visible:true,payload_state:"missing",media_asset_state:kind==="media"?"not_selected":null,working:null}))} as unknown as NonNullable<ReturnType<typeof linksNow>>;
    await visit("/dashboard/identity","Block composition");expect(await b.evaluate("document.querySelectorAll('[data-composition-block]').length")).toBe(6);
    const card=(id:string)=>`[data-composition-block="${id}"]`;
    const control=async(id:string,op:string)=>{await b.evaluate(`document.querySelector('${card(id)} button[value="${op}"]').click()`);};
    const compositionReload=async()=>{await reloadFromLink('[data-composition-reload] a',"Block composition");};
    expect(await b.evaluate(`document.querySelector('${card(compositionIds[0]!)} button[value=up]').disabled`)).toBe(true);
    expect(await b.evaluate(`document.querySelector('${card(compositionIds[5]!)} button[value=down]').disabled`)).toBe(true);
    const controlledId=compositionIds[2]!;
    await control(controlledId,"hide");await text("Block composition saved in Working.");expect(linksNow()!.revision).toBe(2);expect(linksNow()!.blocks.find(row=>row.block_id===controlledId)!.is_visible).toBe(false);
    await compositionReload();await control(controlledId,"up");await text("Block composition saved in Working.");expect(linksNow()!.blocks[1]!.block_id).toBe(controlledId);expect(linksNow()!.blocks[1]!.is_visible).toBe(false);
    await compositionReload();await control(controlledId,"down");await text("Block composition saved in Working.");expect(linksNow()!.blocks[2]!.block_id).toBe(controlledId);
    await compositionReload();await control(controlledId,"show");await text("Block composition saved in Working.");expect(linksNow()!.blocks[2]!.is_visible).toBe(true);
    await compositionReload();await b.evaluate(`document.querySelector('${card(controlledId)} details summary').click()`);
    const removeForm=card(controlledId)+' form[aria-label="Remove block from Working"]';
    const removesBefore=gatewayOperations.filter(x=>x==="remove_current_owner_block_working").length;
    await b.evaluate(`document.querySelector('${removeForm} button').click()`);expect(gatewayOperations.filter(x=>x==="remove_current_owner_block_working")).toHaveLength(removesBefore);
    await b.evaluate(`document.querySelector('${removeForm} input[type=checkbox]').click()`);await b.evaluate(`document.querySelector('${removeForm} button').click()`);await text("Block composition saved in Working.");
    expect(linksNow()!.blocks).toHaveLength(5);expect(linksNow()!.blocks.some(row=>row.block_id===controlledId)).toBe(false);expect(await b.evaluate(`document.querySelector('${card(controlledId)}')===null`)).toBe(true);
    await compositionReload();loseAcknowledgment=true;const visibilityBefore=gatewayOperations.filter(x=>x==="save_current_owner_block_visibility_working").length;
    await control(compositionIds[0]!,"hide");await text("We couldn’t confirm this block change.");loseAcknowledgment=false;
    expect(gatewayOperations.filter(x=>x==="save_current_owner_block_visibility_working")).toHaveLength(visibilityBefore+1);
    expect(await b.evaluate("Array.from(document.querySelectorAll('[data-composition-block] button')).every(button=>button.disabled)")).toBe(true);
    await compositionReload();expect(linksNow()!.blocks[0]!.is_visible).toBe(false);
    linksNow()!.revision+=1;await control(compositionIds[0]!,"down");await text("We couldn’t confirm this block change.");await compositionReload();
    await scopedInput(newText,"text","New Text freezes old composition base");await addText();await text("Text block added to Working.");await text("Reload saved work to reconcile the block composition");
    expect(linksNow()!.blocks.at(-1)!.position).toBe(7);expect(new Set(linksNow()!.blocks.map(row=>row.position)).size).toBe(linksNow()!.blocks.length);
    await compositionReload();for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width<600});expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);}
    const compositionClip=await b.evaluate<{x:number;y:number;width:number;height:number;scale:number}>("(()=>{const r=document.querySelector('[aria-labelledby=composition-heading]').getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()");
    expect(await b.evaluate("Array.from(document.querySelectorAll('[data-composition-block] button')).every(button=>button.getBoundingClientRect().height>=44)")).toBe(true);
    const compositionShot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true,clip:compositionClip});await writeFile("/tmp/spall-273-composition.png",Buffer.from(compositionShot.data,"base64"));
    linkCollection={revision:12,has_more:false,next_after_position:null,blocks:[]};await visit("/dashboard/identity","No blocks in Working yet.");expect(linksNow()!.blocks).toHaveLength(0);
    const gatewayCalls = calls.filter(call => call.endsWith("execute_owner_profile_editor_server")).length;
    budgetDenied = true; await visit("/dashboard/identity", "We couldn’t load your Identity Working.");
    expect(calls.filter(call => call.endsWith("execute_owner_profile_editor_server"))).toHaveLength(gatewayCalls);
    budgetDenied = false;
    await reloadFromLink('.onboarding-message a[href="/dashboard/identity"]', "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Another tab");
    await b.evaluate("document.querySelector('.private-session-menu summary').click()");
    await logout(); await text("Good to have you back.");
    await visit("/dashboard/identity", "Good to have you back.");
    await input("email", "owner@example.test"); await input("password", "new-password"); await submit();
    await text("Your Identity, in progress.");
    expect(await b.evaluate("location.pathname")).toBe("/dashboard/identity");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Another tab");
    const beforeRecoveryErrors=errors.length;
    await b.evaluate(`document.querySelector('nav[aria-label="Owner workspace"] a[href="/dashboard"]').click()`);await text("Pick up where you left off.");
    expect(await b.evaluate("location.pathname")).toBe("/dashboard");
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width<600});expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);}
    const homeScreenshot=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-261-home.png",Buffer.from(homeScreenshot.data,"base64"));
    await b.evaluate(`document.querySelector('a[href="/dashboard/spill/1/edit"]').click()`);await text("Keep shaping this product.");
    expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Setup Product");await text("Selected and retained");
    expect(await b.evaluate("document.querySelectorAll('a[href=\"https://shop.example.test/product\"]').length")).toBe(0);
    await input("title","");await input("sourceUrl","javascript:working-only()");await submit();await text("Working saved privately. Reference and published version stay unchanged.");
    expect(starterItems[0]!.source_revision).toBe(2);expect(starterItems[0]!.reference).toBe(1);expect(starterItems[0]!.destinations[0]!.destination_url).toBe("https://shop.example.test/product");
    await b.evaluate(`document.querySelector('nav[aria-label="Owner workspace"] a[href="/dashboard"]').click()`);await text("Pick up where you left off.");
    expect(await b.evaluate("document.querySelector('article h3').textContent")).toBe("Untitled product");
    await b.evaluate(`document.querySelector('a[href="/dashboard/spill/1/edit"]').click()`);await text("Keep shaping this product.");
    expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("");expect(await b.evaluate("document.querySelector('[name=sourceUrl]').value")).toBe("javascript:working-only()");
    expect(await b.evaluate("document.querySelectorAll('a[href^=\"javascript:\"]').length")).toBe(0);
    starterItems[0]!.working_revision=2;starterItems[0]!.title="Other tab saved Product";
    await input("title","Keep my Product conflict");await submit();await text("We couldn’t confirm this save.");
    expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Keep my Product conflict");expect(await b.evaluate("document.querySelector('form[aria-label=\"Item Working\"] button').disabled")).toBe(true);
    await visit("/dashboard","Pick up where you left off.");await b.evaluate(`document.querySelector('a[href="/dashboard/spill/2/edit"]').click()`);await text("Keep shaping this resource.");
    await input("title","Resource Working");await input("sourceUrl"," unfinished Resource source ");await b.evaluate(`(() => { const el=document.querySelector('[name="resourceType"]');el.value="media_kit";el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await submit();await text("Working saved privately. Reference and published version stay unchanged.");expect(starterItems[1]!.resource_type).toBe("media_kit");expect(starterItems[1]!.published_lifecycle).toBe("hidden");
    await visit("/dashboard/spill/2/edit","Keep shaping this resource.");expect(await b.evaluate("document.querySelector('[name=resourceType]').value")).toBe("media_kit");
    starterItems[1]!.source_revision=3;starterItems[1]!.source_changed=true;await visit("/dashboard/spill/2/edit","Your saved source changed.");
    await input("title","Resource reviewed against new source");await submit();await text("Working saved privately.");expect(starterItems[1]!.source_changed).toBe(false);
    await visit("/dashboard/spill/2/edit","Keep shaping this resource.");
    loseAcknowledgment=true;await input("title","Resource saved despite unknown response");await submit();await text("We couldn’t confirm this save.");loseAcknowledgment=false;
    await visit("/dashboard/spill/2/edit","Keep shaping this resource.");expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Resource saved despite unknown response");
    starterItems[1]!.published_lifecycle="archived";await visit("/dashboard/spill/2/edit","This Item is archived.");expect(await b.evaluate("document.querySelectorAll('form[aria-label=\"Item Working\"]').length")).toBe(0);await text("Resource saved despite unknown response");
    expect(errors.length).toBe(beforeRecoveryErrors);
    await visit("/dashboard/spill/999/edit","That saved Item isn’t available.");
    await visit("/dashboard","Pick up where you left off.");await b.evaluate("document.querySelector('.private-session-menu summary').click()");await logout();await text("Good to have you back.");
    await b.evaluate("fetch('/dashboard/identity',{headers:{purpose:'prefetch'},redirect:'manual'}).then(()=>true)");
    const speculativeCookies=await b.command<{cookies:{name:string;value:string}[]}>("Network.getCookies",{urls:[origin]});
    expect(speculativeCookies.cookies.some(cookie=>cookie.name==='spall_intended_destination'&&cookie.value!=='')).toBe(false);
    await input("email","owner@example.test");await input("password","new-password");await submit();
    try { await text("Pick up where you left off."); }
    catch { throw new Error(`Default login return missing: ${await b.evaluate("JSON.stringify({path:location.pathname,heading:document.querySelector('h1')?.innerText,alert:document.querySelector('[role=alert]')?.innerText})")}`); }
    expect(await b.evaluate("location.pathname")).toBe("/dashboard");
    const beforeHomeDenial=calls.filter(call=>call.endsWith("execute_owner_starter_recovery_server")).length;
    budgetDenied=true;await visit("/dashboard","We couldn’t load your saved work.");expect(calls.filter(call=>call.endsWith("execute_owner_starter_recovery_server"))).toHaveLength(beforeHomeDenial);budgetDenied=false;
    await b.evaluate(`document.querySelector('a[href="/dashboard"]').click()`);await text("Pick up where you left off.");
    await b.evaluate("document.querySelector('.private-session-menu summary').click()");await logout();await text("Good to have you back.");
    await visit("/dashboard/spill/1/edit","Good to have you back.");await input("email","owner@example.test");await input("password","new-password");await submit();await text("Keep shaping this product.");
    expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/1/edit");expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Other tab saved Product");
    const retainedItems=starterItems.splice(0);
    await visit("/dashboard","Pick up where you left off.");
    expect(await b.evaluate("document.querySelector('a[href=\"/dashboard/identity\"]') !== null")).toBe(true);
    expect(await b.evaluate("document.querySelectorAll('a[href^=\"/dashboard/spill/\"][href$=\"/edit\"]').length")).toBe(0);
    starterItems.push(...retainedItems);
    // General returning Resource creation is available to Personal without re-onboarding.
    const priorCreations=creationIntents.size;const setupBeforeResources=JSON.stringify(setup);
    await visit("/dashboard/spill/new/resource","Give your Resource a purpose.");
    expect(creationIntents.size).toBe(priorCreations);expect(extraResources).toHaveLength(0);
    const initialIntent=await b.evaluate("document.querySelector('[name=creationId]').value");
    const chooseType=async(type:string)=>{await b.evaluate(`(()=>{const e=document.querySelector('select[name=resourceType]');e.value=${JSON.stringify(type)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
    await chooseType("portfolio");await submit();await text("Choose a Resource type and add a title");expect(extraResources).toHaveLength(0);
    expect(await b.evaluate("document.querySelector('[name=resourceType]').value")).toBe("portfolio");
    await input("title","First returning Resource");await input("sourceUrl","javascript:bad()");await submit();await text("Use an ordinary public HTTP or HTTPS URL");
    expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("First returning Resource");expect(await b.evaluate("document.querySelector('[name=creationId]').value")).toBe(initialIntent);expect(extraResources).toHaveLength(0);
    await until(()=>b.evaluate<boolean>("document.querySelector('form[aria-label=\"New Resource Draft\"] button').disabled===false"));
    await input("sourceUrl","");expect(await b.evaluate("document.querySelector('[name=sourceUrl]').value")).toBe("");expect(await b.evaluate("document.querySelector('[name=resourceType]').value")).toBe("portfolio");
    await submit();await text("Keep shaping this resource.").catch(async e=>{throw Error(String(e)+" "+await b.evaluate("JSON.stringify({fields:Array.from(new FormData(document.querySelector('form[aria-label=\"New Resource Draft\"]')).entries()),body:document.body.innerText})"));});
    expect(extraResources).toHaveLength(1);expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/3/edit");
    await input("title"," <unfinished Resource> ");await chooseType("media_kit");await input("sourceUrl","javascript:unfinished()");await submit();await text("Working saved privately");
    await reloadFromLink('a[href="/dashboard/spill/3/edit"]',"Keep shaping this resource.");
    expect(await b.evaluate("document.querySelector('[name=sourceUrl]').value")).toBe("javascript:unfinished()");
    expect(await b.evaluate("document.querySelector('a[href^=\"javascript:\"]')===null")).toBe(true);
    await visit("/dashboard/spill","Good things, kept here.");expect(await b.evaluate("document.body.innerText.includes('<unfinished Resource>')")).toBe(true);
    await reloadFromLink('a[href="/dashboard/spill/new/resource"]',"Give your Resource a purpose.");
    await chooseType("menu");await input("sourceUrl","https://example.test/menu");await submit();await text("Keep shaping this resource.");
    expect(extraResources).toHaveLength(2);expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/4/edit");
    await reloadFromLink('a[href="/dashboard/spill/new/resource"]',"Give your Resource a purpose.");
    await chooseType("document");await input("title","Lost acknowledgment Resource");loseAcknowledgment=true;await submit();await text("We couldn’t confirm creation.");loseAcknowledgment=false;
    expect(extraResources).toHaveLength(3);expect(await b.evaluate("document.querySelector('form[aria-label=\"New Resource Draft\"] button').disabled")).toBe(true);
    expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Lost acknowledgment Resource");
    await reloadFromLink('form a[href="/dashboard/spill"]',"Good things, kept here.");await text("Lost acknowledgment Resource");
    expect(extraResources).toHaveLength(3);expect(extraResources.every(item=>item.published_lifecycle===null)).toBe(true);
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
    expect(JSON.stringify(setup)).toBe(setupBeforeResources);
    const seeded=Array.from({length:21},(_,i)=>({reference:100+i,kind:"resource",source_revision:1,working_revision:null,source_changed:false,title:`Pagination Resource ${100+i}`,source_url:null,resource_type:"document",published_lifecycle:null,has_primary_image:false,destinations:[]}));extraResources.push(...seeded as typeof extraResources);
    await visit("/dashboard/spill","Pagination Resource 120");expect(await b.evaluate("document.querySelector('a[href=\"/dashboard/spill?before=101\"]')!==null")).toBe(true);
    await b.evaluate("document.querySelector('a[href=\"/dashboard/spill?before=101\"]').click()");await text("Lost acknowledgment Resource");
    expect(await b.evaluate("location.search")).toBe("?before=101");expect(await b.evaluate("document.body.innerText.includes('Pagination Resource 120')")).toBe(false);
    extraResources.splice(3);await visit("/dashboard/spill","Lost acknowledgment Resource");
    const managerCapture=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-267-manager.png",Buffer.from(managerCapture.data,"base64"));
    // General Product creation is independent of setup and Resource meaning.
    await reloadFromLink('a[href="/dashboard/spill/new/product"]',"Start with a Product.");expect(extraResources).toHaveLength(3);
    const productIntent=await b.evaluate("document.querySelector('[name=creationId]').value");
    await submit();await text("Add a title or an ordinary public HTTP/HTTPS source.");expect(extraResources).toHaveLength(3);
    await input("sourceUrl","javascript:alert(1)");await input("title","Manual useful Product");await submit();await text("Use an ordinary public HTTP or HTTPS URL");
    expect(await b.evaluate("document.querySelector('[name=creationId]').value")).toBe(productIntent);expect(await b.evaluate("document.querySelector('[name=title]').value")).toBe("Manual useful Product");
    await input("sourceUrl","");await submit();await text("Keep shaping this product.");expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/6/edit");expect(extraResources).toHaveLength(4);
    await input("title","<img src=x onerror=alert(1)> private Product");await input("sourceUrl","javascript:unfinished-product");await submit();await text("Working saved privately.");
    await visit("/dashboard/spill/6/edit","Keep shaping this product.");expect(await b.evaluate("document.querySelector('[name=sourceUrl]').value")).toBe("javascript:unfinished-product");expect(await b.evaluate("document.querySelector('a[href^=\"javascript:\"]')===null")).toBe(true);
    await reloadFromLink('a[href="/dashboard/spill/new/product"]',"Start with a Product.");
    expect(await b.evaluate("document.querySelector('[name=creationId]').value")).not.toBe(productIntent);
    await input("sourceUrl","https://shop.example.test/affiliate?tag=owner");await submit();await text("Keep shaping this product.");expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/7/edit");expect(extraResources[4]!.source_url).toBe("https://shop.example.test/affiliate?tag=owner");expect(extraResources[4]!.destinations).toEqual([]);
    await reloadFromLink('a[href="/dashboard/spill/new/product"]',"Start with a Product.");await input("title","Product saved despite lost creation reply");loseAcknowledgment=true;await submit();await text("We couldn’t confirm creation.");loseAcknowledgment=false;
    expect(extraResources).toHaveLength(6);expect(await b.evaluate("document.querySelector('form[aria-label=\"New Product Draft\"] button').disabled")).toBe(true);
    await reloadFromLink('form a[href="/dashboard/spill"]',"Good things, kept here.");await text("Product saved despite lost creation reply");expect(extraResources).toHaveLength(6);expect(JSON.stringify(setup)).toBe(setupBeforeResources);
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
    await visit("/dashboard/spill","Good things, kept here.");
    await scopedInput('form[aria-label="Find saved Item"]',"reference","#1");await b.evaluate("document.querySelector('form[aria-label=\"Find saved Item\"]').requestSubmit()");await text("Keep shaping this product.");expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/1/edit");
    await visit("/dashboard/spill?reference=%2F%2Fevil.test","Enter a positive reference");expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill");
    await visit("/dashboard/spill?reference=1&reference=2","Enter a positive reference");
    const countBeforeLookup=extraResources.length;
    await visit("/dashboard/spill?reference=3","Keep shaping this resource.");expect(await b.evaluate("location.pathname")).toBe("/dashboard/spill/3/edit");
    await visit("/dashboard/spill?reference=%23999999","No saved Item with that reference.");expect(extraResources).toHaveLength(countBeforeLookup);
    expect(await b.evaluate("document.querySelector('[name=reference]').value")).toBe("#999999");
    await scopedInput('form[aria-label="Find saved Item"]',"reference","1");await b.evaluate("document.querySelector('form[aria-label=\"Find saved Item\"]').requestSubmit()");await text("Keep shaping this product.");

    await visit("/dashboard/spill/1/edit","Keep shaping this product.");
    const saveDestinations=()=>b.evaluate("document.querySelector('form[aria-label=\"Product destinations\"] button').click()");
    await input("destinations","javascript:alert(1)");await saveDestinations();await text("Use up to ten ordinary HTTP or HTTPS links");expect(await b.evaluate("document.querySelector('[name=destinations]').value")).toBe("javascript:alert(1)");
    await input("destinations","https://shopee.co.id/item?affiliate=owner\nhttps://tokopedia.com/item");await saveDestinations();await text("Destinations saved privately.");expect(starterItems[0]!.has_primary_image).toBe(true);expect(starterItems[0]!.destinations[0]!.destination_url).toBe("https://shopee.co.id/item?affiliate=owner");
    await visit("/dashboard/spill/1/edit","Keep shaping this product.");expect(await b.evaluate("document.querySelector('[name=destinations]').value")).toContain("affiliate=owner");
    await input("destinations","https://shopee.co.id/other");await saveDestinations();await text("Destinations saved privately.");expect(starterItems[0]!.destinations).toHaveLength(1);
    await input("destinations","");await saveDestinations();await text("Destinations saved privately.");expect(starterItems[0]!.destinations).toEqual([]);expect(starterItems[0]!.has_primary_image).toBe(true);
    await visit("/dashboard/spill/6/edit","Keep shaping this product.");
    await input("destinations","https://shop.example.test/first?tag=owner");await saveDestinations();await text("Destinations saved privately.");
    await input("destinations","https://shop.example.test/duplicate\nhttps://shop.example.test/other");await saveDestinations();await text("Use up to ten ordinary HTTP or HTTPS links");expect(await b.evaluate("document.querySelector('[name=destinations]').value")).toContain("duplicate");
    await input("destinations","https://shop.example.test/after-validation");await saveDestinations();await text("Destinations saved privately.");expect(preparationRevisions.get(6)).toBe(2);
    await input("destinations","https://shop.example.test/stale");preparationRevisions.set(6,3);await saveDestinations();await text("We couldn’t confirm this save. Keep your links");expect(await b.evaluate("document.querySelector('form[aria-label=\"Product destinations\"] button').disabled")).toBe(true);
    await reloadFromLink('a[href="/dashboard/spill/6/edit"]',"Keep shaping this product.");await input("destinations","https://shop.example.test/saved-after-lost-reply");loseAcknowledgment=true;await saveDestinations();await text("We couldn’t confirm this save. Keep your links");loseAcknowledgment=false;
    await reloadFromLink('a[href="/dashboard/spill/6/edit"]',"Keep shaping this product.");expect(await b.evaluate("document.querySelector('[name=destinations]').value")).toBe("https://shop.example.test/saved-after-lost-reply");expect(await b.evaluate("document.querySelector('[name=sourceUrl]').value")).toBe("javascript:unfinished-product");
    expect(await b.evaluate("document.querySelector('a[href^=\"https://shop.example.test/\"]')===null")).toBe(true);expect(JSON.stringify(setup)).toBe(setupBeforeResources);
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
    await visit("/dashboard/spill/6/edit","Keep shaping this product.");const destinationsBeforeImage=JSON.stringify(extraResources[3]!.destinations);
    const document=await b.command<{root:{nodeId:number}}>("DOM.getDocument");const fileInput=await b.command<{nodeId:number}>("DOM.querySelector",{nodeId:document.root.nodeId,selector:'input[name="productImageFile"]'});
    await b.command("DOM.setFileInputFiles",{files:[pngFile],nodeId:fileInput.nodeId});await text("Image processed. Save selection to attach it to this Product.");
    expect(sanitizerCalls).toBe(1);expect(extraResources[3]!.has_primary_image).toBe(false);expect(mediaIntents.size).toBe(1);
    const saveImage=()=>b.evaluate("document.querySelector('form[aria-label=\"Product image selection\"] button[type=submit]').click()");await saveImage();await text("Image selection saved privately.");expect(extraResources[3]!.has_primary_image).toBe(true);expect(JSON.stringify(extraResources[3]!.destinations)).toBe(destinationsBeforeImage);
    await reloadFromLink('a[href="/dashboard/spill/6/edit"]',"Keep shaping this product.");await until(()=>b.evaluate<boolean>("document.querySelector('img[alt=\"Saved Product primary image\"]')?.naturalWidth===16"));
    const removeImage=()=>b.evaluate("Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Remove image selection').click()");await removeImage();expect(extraResources[3]!.has_primary_image).toBe(true);await saveImage();await text("Image selection saved privately.");expect(extraResources[3]!.has_primary_image).toBe(false);expect(JSON.stringify(extraResources[3]!.destinations)).toBe(destinationsBeforeImage);
    await reloadFromLink('a[href="/dashboard/spill/6/edit"]',"Keep shaping this product.");const uploadAgain=await b.command<{root:{nodeId:number}}>("DOM.getDocument");const secondFile=await b.command<{nodeId:number}>("DOM.querySelector",{nodeId:uploadAgain.root.nodeId,selector:'input[name="productImageFile"]'});await b.command("DOM.setFileInputFiles",{files:[pngFile],nodeId:secondFile.nodeId});await text("Image processed. Save selection to attach it to this Product.");
    loseAcknowledgment=true;await saveImage();await text("We couldn’t confirm this image save.");loseAcknowledgment=false;expect(await b.evaluate("document.querySelector('form[aria-label=\"Product image selection\"] button').disabled")).toBe(true);
    await reloadFromLink('a[href="/dashboard/spill/6/edit"]',"Keep shaping this product.");await until(()=>b.evaluate<boolean>("document.querySelector('img[alt=\"Saved Product primary image\"]')?.naturalWidth===16"));expect(JSON.stringify(extraResources[3]!.destinations)).toBe(destinationsBeforeImage);expect(await b.evaluate("document.querySelector('[name=sourceUrl]').value")).toBe("javascript:unfinished-product");
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
    const beforeMediaPreview=linksNow();
    linkCollection={revision:1,has_more:false,next_after_position:null,blocks:[{block_id:"27600000-0000-4000-8000-000000000001",kind:"media",position:1,is_visible:true,payload_state:"present",media_asset_state:"registered",working:{kind:"media",asset_key:selectedImages.get(6),alt_text:"Preview media"}}]} as unknown as NonNullable<ReturnType<typeof linksNow>>;
    const mediaRow=linksNow()!.blocks[0]!;
    linkCollection!.blocks.push({...mediaRow,block_id:"27600000-0000-4000-8000-000000000002",position:2,is_visible:false},
      {...mediaRow,block_id:"27600000-0000-4000-8000-000000000003",position:3,media_asset_state:"unavailable"} as unknown as typeof mediaRow);
    await visit("/dashboard/identity/preview","See your saved Identity.");
    expect(await b.evaluate("document.querySelectorAll('[data-preview-kind=media]').length")).toBe(2);
    expect(await b.evaluate("document.querySelectorAll('[data-preview-kind=media] img').length")).toBe(1);
    await text("Selected media is temporarily unavailable.");
    await until(()=>b.evaluate<boolean>("document.querySelector('img[alt=\"Preview media\"]')?.naturalWidth===16"));
    expect(await b.evaluate("document.querySelector('img[alt=\"Preview media\"]').referrerPolicy")).toBe("no-referrer");
    for(const width of [360,768,1440]){await b.command("Emulation.setDeviceMetricsOverride",{width,height:950,deviceScaleFactor:1,mobile:width===360});expect(await b.evaluate("document.documentElement.scrollWidth<=innerWidth")).toBe(true);}
    const previewCapture=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-276-preview.png",Buffer.from(previewCapture.data,"base64"));
    accountState="restricted";
    await visit("/dashboard/identity/preview","Your account access is restricted");
    expect(await b.evaluate("location.pathname")).toBe("/dashboard/account-status");
    expect(await b.evaluate("document.querySelector('[data-preview-kind]')===null")).toBe(true);
    accountState="active";
    linkCollection=beforeMediaPreview;
    await visit("/dashboard/spill/6/edit","Keep shaping this product.");
    const destinationCapture=await b.command<{data:string}>("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile("/tmp/spall-269-product-destinations.png",Buffer.from(destinationCapture.data,"base64"));
    expect(calls.some(call => call.includes("publish_current"))).toBe(false);
    expect(cspErrors).toEqual([]);
  } finally {
    await browser?.close();
    if (app.pid) { try { process.kill(-app.pid, "SIGTERM"); } catch {} }
    provider.closeAllConnections(); await new Promise<void>(r => provider.close(() => r()));
    await rm(tlsDirectory, { recursive: true, force: true });
    await writeFile("/tmp/spall-256-browser-server.log", logs.replace(/token_hash=[^\s]+/g, "token_hash=[redacted]"));
  }
});
