"use client";
import { DocumentLink } from "@/components/document-link";
import { Wordmark } from "@/components/auth-shell";

export default function SavedPreviewError() {
  return <main id="main-content" className="entry-page">
    <header className="entry-header"><Wordmark /></header>
    <section className="onboarding-message" aria-labelledby="preview-error-title">
      <p className="eyebrow">Saved Working preview</p>
      <h1 id="preview-error-title">We couldn’t load this preview.</h1>
      <p role="alert">Your saved work is unchanged. Try again to load the latest saved version.</p>
      <DocumentLink href="/dashboard/identity/preview" className="button">Try saved preview again</DocumentLink>
      <DocumentLink href="/dashboard/identity" className="quiet-link">Back to editing</DocumentLink>
    </section>
  </main>;
}
