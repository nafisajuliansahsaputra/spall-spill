import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { createProfileEditorClient } from "@/lib/workspace/profile-editor-server";
import { createOwnerEditableIdentityWorking } from "@/lib/workspace/owner-editable-identity-working";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { BlockControls } from "./block-controls";
import { SavedLinksEditor } from "./links-editor";
import { ContactBlocksEditor } from "./contact-editor";
import { TextBlocksEditor } from "./text-editor";
import { LayoutWorkingForm } from "./layout-form";
import { ProfileWorkingForm } from "./profile-form";
export const metadata: Metadata = { title: "Identity Working", robots: { index: false, follow: false } };
export default async function IdentityEditorPage() {
  const state = await resolveCurrentOwnerState();
  if (state.status === "unauthenticated") redirect("/login");
  if (state.status === "onboarding_incomplete") redirect("/onboarding");
  if (state.status === "restricted" || state.status === "suspended") redirect("/dashboard/account-status");
  if (state.status !== "active") throw new Error("Identity Working could not be loaded.");
  let page;
  try { page = await createOwnerEditableIdentityWorking(await createProfileEditorClient()).read(); }
  catch { throw new Error("Identity Working could not be loaded."); }
  if (page.status === "unauthenticated") redirect("/login");
  if (page.status === "onboarding_incomplete") redirect("/onboarding");
  if (page.status === "restricted" || page.status === "suspended") redirect("/dashboard/account-status");
  if (page.status !== "success") throw new Error("Identity Working could not be loaded.");
  return <main id="main-content" className="entry-page">
    <OwnerWorkspaceHeader active="identity" />
    <div className="mx-auto max-w-3xl space-y-8 py-10">
      <div><span className="eyebrow">@{page.current_handle} · Private workspace</span><h1 className="my-4 font-serif text-5xl">Your Identity, in progress.</h1>
        <p className="text-sm leading-6">Edit your Profile, starting style and links here. Saved changes stay separate from your published Identity.</p></div>
      <section aria-labelledby="profile-heading" className="rounded-3xl border border-neutral-300 bg-white/60 p-6">
        <h2 id="profile-heading" className="mb-5 text-2xl font-semibold">Profile</h2>
        {page.profile_text_state === "source_changed" ? <p role="status" className="mb-5 text-sm">Your source profile changed. Your saved text is retained; review it before saving against the latest profile.</p> : null}
        <ProfileWorkingForm name={page.editable_profile.display_name} bio={page.editable_profile.bio} profileRevision={page.profile_working.revision} textRevision={page.profile_text_working?.revision ?? null} />
      </section>
      <section aria-labelledby="layout-heading" className="rounded-3xl border border-neutral-300 bg-white/60 p-6">
        <h2 id="layout-heading" className="mb-5 text-2xl font-semibold">Starting style</h2>
        <LayoutWorkingForm starterKey={page.layout_working.starter_key} revision={page.layout_working.revision} />
      </section>
      <BlockControls revision={page.collection?.revision ?? null} blocks={(page.collection?.blocks ?? []).map(block => {
        const content = block.working === null ? null : "text" in block.working ? block.working.text : "label" in block.working ? block.working.label : "title" in block.working ? block.working.title : null;
        return { id: block.block_id, kind: block.kind, visible: block.is_visible, label: content ? Array.from(content).slice(0, 100).join("") : "Content not saved or label not set" };
      })} />
      {
        <section aria-labelledby="links-heading" className="space-y-4">
          <h2 id="links-heading" className="text-2xl font-semibold">Saved links</h2>
          <SavedLinksEditor revision={page.collection?.revision ?? null} blocks={(page.collection?.blocks ?? []).flatMap(block =>
            block.kind === "social" || block.kind === "generic_link" ? [{ blockId: block.block_id, kind: block.kind, isVisible: block.is_visible,
              title: block.working?.title ?? null, platform: block.working?.social_platform ?? null, destination: block.working?.destination_url ?? null }] : [])} />
        </section>}
      <section aria-labelledby="text-heading" className="space-y-4">
        <h2 id="text-heading" className="text-2xl font-semibold">Text blocks</h2>
        <TextBlocksEditor revision={page.collection?.revision ?? null} blocks={(page.collection?.blocks ?? []).flatMap(block =>
          block.kind === "text" ? [{ blockId: block.block_id, isVisible: block.is_visible, text: block.working?.text ?? null, missing: block.working === null }] : [])} />
      </section>
      <section aria-labelledby="contact-heading" className="space-y-4">
        <h2 id="contact-heading" className="text-2xl font-semibold">Contact blocks</h2>
        <ContactBlocksEditor revision={page.collection?.revision ?? null} blocks={(page.collection?.blocks ?? []).flatMap(block =>
          block.kind === "contact" ? [{ blockId: block.block_id, isVisible: block.is_visible, contactType: block.working?.contact_type ?? null,
            label: block.working?.label ?? null, value: block.working?.value ?? null, missing: block.working === null }] : [])} />
      </section>
      <section aria-labelledby="other-heading" className="space-y-4">
        <h2 id="other-heading" className="text-2xl font-semibold">Other saved parts</h2>
        <p className="text-sm leading-6">These parts are preserved. Editing them and publishing updates are still being connected.</p>
        <p className="text-sm">Photo: {page.profile_working.profile_asset_key ? "Selected" : "Not selected"}</p>
        {page.connection_source_working ? <p className="break-all text-sm">Saved connection: {page.connection_source_working.destination_url}</p> : null}
        {page.collection?.blocks.length ? <ul className="space-y-3">{page.collection.blocks.filter(block => block.kind !== "social" && block.kind !== "generic_link" && block.kind !== "text" && block.kind !== "contact").map(block => <li key={block.block_id} className="rounded-xl border border-neutral-300 p-4 text-sm">
          <p className="font-semibold">{block.kind.replaceAll("_", " ")} · {block.is_visible ? "Visible in Working" : "Hidden in Working"}</p>
          {block.working ? <dl className="mt-2 space-y-2">{Object.entries(block.working).filter(([key]) => !["kind", "asset_key"].includes(key)).map(([key,value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd className="whitespace-pre-wrap break-all">{typeof value === "string" ? value : "Not set"}</dd></div>)}</dl> : <p>Content has not been saved yet.</p>}
        </li>)}</ul> : <p className="text-sm">No modular blocks saved yet.</p>}
      </section>
    </div>
  </main>;
}
