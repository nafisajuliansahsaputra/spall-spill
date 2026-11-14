import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.session }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }));
import { createProfileEditorClient, createStarterRecoveryClient, admitProfileEditor, createResourceCatalogClient, createProductCreationClient, createProductDestinationsClient, createProductImageClient, admitProductMedia, createTextEditorClient, createContactEditorClient, createBlockControlsClient, createSpillCtaEditorClient, createOnboardingPublishClient } from "./profile-editor-server";
const subject = "26000000-0000-4000-8000-000000000001";
let denied = false;
let calls: { url: string; body: Record<string, unknown>; headers: Headers }[];
beforeEach(() => {
  calls = []; denied = false;
  vi.stubEnv("SPALL_OWNER_PROFILE_BUDGET_NAMESPACE", "test");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fixture.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fixture-budget-token");
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url); const body = JSON.parse(String(init?.body));
    calls.push({ url: target, body, headers: new Headers(init?.headers) });
    if (target === "https://fixture.upstash.io/") return Response.json({ result: denied ? 0 : 1 });
    return Response.json({ status: "success" });
  }));
  const session = createClient("https://fixture.supabase.co", "session-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch } });
  vi.spyOn(session.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  mocks.session.mockResolvedValue(session);
  mocks.service.mockImplementation((fetcher: typeof fetch) => createClient("https://fixture.supabase.co", "service-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it.each(["resolve_current_owner_home_context", "resolve_current_owner_editable_identity_working_page", "save_current_owner_profile_text_working", "save_current_owner_layout_working", "save_current_owner_block_link_working", "initialize_current_owner_blocks_from_link", "add_current_owner_link_block_working"])("uses real abortable SDK admission for %s", async operation => {
  const client = await createProfileEditorClient();
  const controller = new AbortController();
  expect((await client.schema("api").rpc(operation, { input_working: { raw: "private" } }).abortSignal(controller.signal)).error).toBeNull();
  expect(calls).toHaveLength(2);
  expect(calls[0]!.url).toBe("https://fixture.upstash.io/");
  expect(JSON.stringify(calls[0]!.body)).not.toContain(subject);
  expect(calls[1]!.url).toContain("/rpc/execute_owner_profile_editor_server");
  expect(calls[1]!.body).toEqual({ input_subject: subject, input_operation: operation, input_payload: { input_working: { raw: "private" } } });
  expect(calls[1]!.headers.get("authorization")).toBe("Bearer service-key");
});
it("keeps Owner state on the ordinary client without elevated dispatch", async () => {
  const client = await createProfileEditorClient(); await client.schema("api").rpc("resolve_current_owner_state");
  expect(calls).toHaveLength(1); expect(calls[0]!.url).toContain("resolve_current_owner_state");
  expect(calls[0]!.headers.get("authorization")).toBe("Bearer session-key");
});
it.each(["resolve_current_owner_identity_working_page", "publish_current_onboarding", "execute_owner_profile_editor_server", "arbitrary"])("denies unselected %s before I/O", async operation => {
  const client = await createProfileEditorClient(); expect(() => client.schema("api").rpc(operation)).toThrow(); expect(calls).toEqual([]);
});
it("denies table and other-schema operations", async () => {
  const client = await createProfileEditorClient(); expect(() => client.schema("api").from("owners")).toThrow();
  expect(() => client.schema("core").rpc("resolve_current_owner_home_context")).toThrow(); expect(calls).toEqual([]);
});
it("denies quota without service dispatch", async () => {
  denied = true; const client = await createProfileEditorClient(); const reply = await client.schema("api").rpc("resolve_current_owner_home_context");
  expect(reply.error).not.toBeNull(); expect(calls).toHaveLength(1);
});
it.each(["", "UPPER", "../other"])("denies invalid deployment namespace %j", async namespace => {
  vi.stubEnv("SPALL_OWNER_PROFILE_BUDGET_NAMESPACE", namespace); expect(await admitProfileEditor(subject, true)).toBe(false); expect(calls).toEqual([]);
});
it("does not elevate unverified/malformed identity", async () => {
  mocks.session.mockResolvedValue({ auth: { getClaims: async () => ({ data: { claims: { sub: subject } }, error: { message: "invalid" } }) } });
  await expect(createProfileEditorClient()).rejects.toThrow(); expect(calls).toEqual([]);
});
it("binds later proofs to the initial actor", async () => {
  const session = await mocks.session(); const client = await createProfileEditorClient();
  session.auth.getClaims.mockResolvedValue({ data: { claims: { sub: "26000000-0000-4000-8000-000000000002" } }, error: null });
  expect((await client.auth.getClaims()).data).toBeNull(); expect(calls).toEqual([]);
});
it.each(["http://fixture.upstash.io", "https://evil.test", "https://fixture.upstash.io/path"])("denies unsafe Redis origin %s", async origin => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", origin); expect(await admitProfileEditor(subject, true)).toBe(false); expect(calls).toEqual([]);
});

it.each(["resolve_current_owner_starter_recovery", "save_current_owner_starter_item_working"])("admits selected starter operation %s through its distinct gateway/quota", async operation => {
 const client=await createStarterRecoveryClient();await client.schema("api").rpc(operation,{});
 expect(calls).toHaveLength(2);expect(JSON.stringify(calls[0]!.body)).toContain("starter-");
 expect(calls[1]!.url).toContain("/rpc/execute_owner_starter_recovery_server");expect(calls[1]!.body.input_subject).toBe(subject);
});
it("keeps Profile operations out of Starter admission and Starter operations out of Profile",async()=>{
 const starter=await createStarterRecoveryClient(),profile=await createProfileEditorClient();
 expect(()=>starter.schema("api").rpc("save_current_owner_profile_text_working")).toThrow();
 expect(()=>profile.schema("api").rpc("save_current_owner_starter_item_working")).toThrow();expect(calls).toEqual([]);
});

it("layout save consumes the profile save quota and stays out of Starter admission", async () => {
 const client=await createProfileEditorClient(); await client.schema("api").rpc("save_current_owner_layout_working", {input_working:{}});
 expect(JSON.stringify(calls[0]!.body)).toContain("profile-save-");
 const starter=await createStarterRecoveryClient();expect(()=>starter.schema("api").rpc("save_current_owner_layout_working")).toThrow();
});

it("saved link save uses the shared bounded profile save quota and no Starter authority", async()=>{
 const client=await createProfileEditorClient();await client.schema("api").rpc("save_current_owner_block_link_working",{input_working:{}});
 expect(JSON.stringify(calls[0]!.body)).toContain("profile-save-");
 const starter=await createStarterRecoveryClient();expect(()=>starter.schema("api").rpc("save_current_owner_block_link_working")).toThrow();
});

it.each(["initialize_current_owner_blocks_from_link", "add_current_owner_link_block_working"])("classifies %s as a mutation, never a read",async operation=>{
 const client=await createProfileEditorClient();await client.schema("api").rpc(operation,{input_intent:{}});
 expect(JSON.stringify(calls[0]!.body)).toContain("profile-save-");expect(calls[0]!.body).toEqual(expect.arrayContaining(["30","390"]));
 const starter=await createStarterRecoveryClient();expect(()=>starter.schema("api").rpc(operation)).toThrow();
});

it.each(["resolve_current_owner_spill_manager","resolve_current_owner_item_recovery","create_current_owner_resource_draft"])("fixed Resource factory admits %s with its own quota",async operation=>{
 const client=await createResourceCatalogClient();await client.schema("api").rpc(operation,{});expect(calls[1]!.url).toContain("execute_owner_resource_catalog_server");expect(calls[1]!.body.input_subject).toBe(subject);
 expect(JSON.stringify(calls[0]!.body)).toContain(operation==="create_current_owner_resource_draft"?"resource-save-":"resource-read-");
 if(operation==="create_current_owner_resource_draft")expect(calls[0]!.body).toEqual(expect.arrayContaining(["30","390"]));
 const profile=await createProfileEditorClient();expect(()=>profile.schema("api").rpc(operation,{})).toThrow();
 const starter=await createStarterRecoveryClient();expect(()=>starter.schema("api").rpc(operation,{})).toThrow();
});
it("Resource factory cannot select private editor or publication operations",async()=>{
 const client=await createResourceCatalogClient();expect(()=>client.schema("api").rpc("publish_current_onboarding",{})).toThrow();expect(()=>client.schema("api").rpc("save_current_owner_starter_item_working",{})).toThrow();expect(calls).toEqual([]);
});

it("Product creation has its fixed gateway and mutation quota, isolated from other factories",async()=>{
 const client=await createProductCreationClient();await client.schema("api").rpc("create_current_owner_product_draft",{input_draft:{}});
 expect(JSON.stringify(calls[0]!.body)).toContain("product-save-");expect(JSON.stringify(calls[0]!.body)).toContain('"30"');
 expect(calls[1]!.url).toContain("/rpc/execute_owner_product_creation_server");expect(calls[1]!.body.input_subject).toBe(subject);
 expect(()=>client.schema("api").rpc("create_current_owner_resource_draft")).toThrow();
 const resource=await createResourceCatalogClient();expect(()=>resource.schema("api").rpc("create_current_owner_product_draft")).toThrow();
});

it.each(["resolve_current_owner_product_destinations","save_current_owner_product_destinations"])("destination factory admits only its fixed %s gateway",async operation=>{const client=await createProductDestinationsClient();await client.schema("api").rpc(operation,{input_working:{}});expect(calls[1]!.url).toContain("/rpc/execute_owner_product_destinations_server");expect(JSON.stringify(calls[0]!.body)).toContain(operation.startsWith("save")?"product-dest-save-":"product-dest-read-");expect(()=>client.schema("api").rpc("create_current_owner_product_draft")).toThrow();});

it.each(["resolve_current_owner_product_image","save_current_owner_product_image"])("image gateway scopes %s",async operation=>{const client=await createProductImageClient();await client.schema("api").rpc(operation,{input_working:{}});expect(calls[1]!.url).toContain("/rpc/execute_owner_product_image_server");expect(JSON.stringify(calls[0]!.body)).toContain(operation.startsWith("save")?"product-image-save-":"product-image-read-");expect(()=>client.schema("api").rpc("save_current_owner_product_destinations")).toThrow();});
it("media metadata consumes a shared mutation ceiling before service work",async()=>{await admitProductMedia(subject);expect(calls).toHaveLength(1);expect(JSON.stringify(calls[0]!.body)).toContain("product-media-save-");expect(JSON.stringify(calls[0]!.body)).toContain('"30"');expect(JSON.stringify(calls[0]!.body)).not.toContain(subject);});

it.each(["initialize_current_owner_blocks_from_text","add_current_owner_text_block_working","save_current_owner_block_text_working"])("Text factory scopes and budgets %s", async operation => {
 const client=await createTextEditorClient();await client.schema("api").rpc(operation,{input_working:{}});
 expect(calls[1]!.url).toContain("/rpc/execute_owner_text_editor_server");expect(calls[1]!.body.input_subject).toBe(subject);
 expect(JSON.stringify(calls[0]!.body)).toContain("text-save-");expect(calls[0]!.body).toEqual(expect.arrayContaining(["30","390"]));
 expect(JSON.stringify(calls[0]!.body)).not.toContain(subject);
 expect(()=>client.schema("api").rpc("save_current_owner_block_link_working")).toThrow();
 const profile=await createProfileEditorClient();expect(()=>profile.schema("api").rpc(operation)).toThrow();
});
it("Text denies exhausted quota before elevated dispatch",async()=>{denied=true;const client=await createTextEditorClient();expect((await client.schema("api").rpc("add_current_owner_text_block_working",{})).error).not.toBeNull();expect(calls).toHaveLength(1);});

it.each(["initialize_current_owner_blocks_from_contact","add_current_owner_contact_block_working","save_current_owner_block_contact_working"])("Contact factory isolates %s and consumes mutation budget",async operation=>{const client=await createContactEditorClient();await client.schema("api").rpc(operation,{input_intent:{}});expect(calls[1]!.url).toContain("/rpc/execute_owner_contact_editor_server");expect(JSON.stringify(calls[0]!.body)).toContain("contact-save-");expect(calls[0]!.body).toEqual(expect.arrayContaining(["30","390"]));expect(()=>client.schema("api").rpc("save_current_owner_block_text_working")).toThrow();});
it("Contact budget denial never reaches service gateway",async()=>{denied=true;const client=await createContactEditorClient();expect((await client.schema("api").rpc("add_current_owner_contact_block_working",{})).error).not.toBeNull();expect(calls).toHaveLength(1);});

it.each(["save_current_owner_block_visibility_working","move_current_owner_block_working","remove_current_owner_block_working"])("block controls scope %s with mutation quota",async operation=>{const client=await createBlockControlsClient();await client.schema("api").rpc(operation,{input_working:{}});expect(calls[1]!.url).toContain("/rpc/execute_owner_block_controls_server");expect(JSON.stringify(calls[0]!.body)).toContain("blocks-save-");expect(calls[0]!.body).toEqual(expect.arrayContaining(["30","390"]));expect(()=>client.schema("api").rpc("save_current_owner_block_text_working")).toThrow();});
it("block controls budget denies before elevated dispatch",async()=>{denied=true;const client=await createBlockControlsClient();expect((await client.schema("api").rpc("remove_current_owner_block_working",{})).error).not.toBeNull();expect(calls).toHaveLength(1);});

it.each(["initialize_current_owner_blocks_from_spill_cta","add_current_owner_spill_cta_block_working"])("Spill integration factory confines %s",async operation=>{
 const client=await createSpillCtaEditorClient();await client.schema("api").rpc(operation,{input_intent:{}});
 expect(calls[1]!.url).toContain("/rpc/execute_owner_spill_cta_editor_server");expect(calls[1]!.body.input_subject).toBe(subject);
 expect(JSON.stringify(calls[0]!.body)).toContain("spill-cta-save-");expect(JSON.stringify(calls[0]!.body)).toContain('"30"');
 expect(()=>client.schema("api").rpc("publish_current_onboarding")).toThrow();
 const profile=await createProfileEditorClient();expect(()=>profile.schema("api").rpc(operation)).toThrow();
 denied=true;const before=calls.length;expect((await client.schema("api").rpc(operation,{input_intent:{}})).error).not.toBeNull();expect(calls).toHaveLength(before+1);
});

it("requires both staged flags and a valid public origin before any first Publish client I/O",async()=>{
 for(const [flag,pub,origin] of [["false","true","https://spall.test"],["true","false","https://spall.test"],["true","true","https://spall.test/path"]]){
 vi.stubEnv("SPALL_FIRST_IDENTITY_PUBLISH_ENABLED",flag);vi.stubEnv("SPALL_PUBLIC_IDENTITY_ENABLED",pub);vi.stubEnv("SPALL_PUBLIC_ORIGIN",origin);await expect(createOnboardingPublishClient()).rejects.toThrow();
 }expect(calls).toEqual([]);
});
it("confines first Publish to one fixed operation and separate save quota",async()=>{
 vi.stubEnv("SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE","test");vi.stubEnv("SPALL_FIRST_IDENTITY_PUBLISH_ENABLED","true");vi.stubEnv("SPALL_PUBLIC_IDENTITY_ENABLED","true");vi.stubEnv("SPALL_PUBLIC_ORIGIN","https://spall.test");
 const client=await createOnboardingPublishClient();await client.schema("api").rpc("publish_current_onboarding_identity",{});
 expect(JSON.stringify(calls[0]!.body)).toContain("first-publish-save-test");expect(calls[1]!.url).toContain("/rpc/execute_onboarding_publish_server");expect(calls[1]!.body.input_subject).toBe(subject);
 expect(()=>client.schema("api").rpc("publish_current_onboarding")).toThrow();expect(()=>client.schema("api").rpc("save_current_owner_profile_text_working")).toThrow();
});
