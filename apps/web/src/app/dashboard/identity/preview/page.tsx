import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { DocumentLink } from "@/components/document-link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { createProfileEditorClient } from "@/lib/workspace/profile-editor-server";
import { readSavedIdentityPreview } from "@/lib/workspace/saved-identity-preview";

export const metadata: Metadata = { title: "Saved Identity preview", robots: { index: false, follow: false } };
export default async function SavedIdentityPreviewPage() {
  const state = await resolveCurrentOwnerState();
  if (state.status === "unauthenticated") redirect("/login");
  if (state.status === "onboarding_incomplete") redirect("/onboarding");
  if (state.status === "restricted" || state.status === "suspended") redirect("/dashboard/account-status");
  if (state.status !== "active") throw new Error("Identity preview could not be loaded.");
  const page = await readSavedIdentityPreview(await createProfileEditorClient());
  if (page.status === "unauthenticated") redirect("/login");
  if (page.status === "onboarding_incomplete") redirect("/onboarding");
  if (page.status === "restricted" || page.status === "suspended") redirect("/dashboard/account-status");
  if (page.status !== "success") throw new Error("Identity preview could not be loaded.");
  const blocks = page.collection?.blocks ?? [];
  const photo = page.profile_working.profile_asset_key;
  return <main id="main-content" className="entry-page">
    <OwnerWorkspaceHeader active="identity" />
    <header className="mx-auto max-w-3xl space-y-4 py-8">
      <p className="eyebrow">Private · Saved Working</p>
      <h1 className="font-serif text-4xl">See your saved Identity.</h1>
      <p className="text-sm leading-6">This preview shows saved Working. Save edits before previewing. It does not change your published page or confirm readiness to publish. Links and contact actions are inactive here.</p>
      <DocumentLink href="/dashboard/identity" className="inline-flex min-h-11 items-center text-sm underline">Back to editing</DocumentLink>
      {page.profile_text_state === "source_changed" && <p role="status">Your source profile changed. Your saved text is retained for review.</p>}
      {blocks.some(block => !block.is_visible) && <p className="text-sm">Hidden blocks are excluded from this preview.</p>}
    </header>
    <div className={`public-identity public-identity-${page.layout_working.starter_key}`}>
      <div className="public-identity-canvas">
        <header className="public-identity-profile">
          {photo && (page.preview_media[photo] ? <Image src={page.preview_media[photo]} alt="Saved profile photo" width={160} height={160} unoptimized referrerPolicy="no-referrer" className="mx-auto rounded-full" /> : <p>Selected profile photo is temporarily unavailable.</p>)}
          <p className="eyebrow">@{page.current_handle}</p>
          <h2 className="break-words font-serif text-4xl">{page.editable_profile.display_name || "Name not set"}</h2>
          {page.editable_profile.bio !== null && <p className="public-identity-bio whitespace-pre-wrap">{page.editable_profile.bio}</p>}
          {page.profile_text_issues.length > 0 && <p className="text-sm">Profile text needs review before publishing.</p>}
        </header>
        <div className="space-y-4">
          {page.connection_source_working && <section className="public-identity-link break-all"><p>Saved connection</p><p>{page.connection_source_working.destination_url}</p></section>}
          {blocks.filter(block => block.is_visible).map(block => {
            const mediaUrl = block.kind === "media" && block.media_asset_state === "registered" && block.working?.asset_key ? page.preview_media[block.working.asset_key] : null;
            return <section key={block.block_id} data-preview-kind={block.kind} className="rounded-2xl border border-current/20 p-5 whitespace-pre-wrap break-words">
            {block.working === null ? <p>Content has not been saved yet.</p>
              : block.working.kind === "text" ? <p>{block.working.text || "Text not set"}</p>
                : block.working.kind === "social" || block.working.kind === "generic_link" ? <><h3>{block.working.title || block.working.social_platform || "Link"}</h3><p className="break-all">{block.working.destination_url || "Destination not set"}</p></>
                  : block.working.kind === "contact" ? <><h3>{block.working.label || block.working.contact_type || "Contact"}</h3><p>{block.working.value || "Contact not set"}</p></>
                    : block.working.kind === "media" ? <>{mediaUrl ? <Image src={mediaUrl} alt={block.working.alt_text ?? ""} width={800} height={600} unoptimized referrerPolicy="no-referrer" className="h-auto max-w-full rounded-xl" /> : <p>{block.working.asset_key ? "Selected media is temporarily unavailable." : "Media not selected"}</p>}</>
                      : <p>Explore my Spill · Saved integration</p>}
            {block.issues.length > 0 && <p className="mt-3 text-sm">This saved block needs review before publishing.</p>}
          </section>;
          })}
          {blocks.length === 0 && !page.connection_source_working && <p>No blocks saved yet. Your profile is the starting point.</p>}
        </div>
      </div>
    </div>
  </main>;
}
