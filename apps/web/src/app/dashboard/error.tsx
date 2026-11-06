"use client";
import { DocumentLink } from "@/components/document-link";
import Link from "next/link";
import { Wordmark } from "@/components/auth-shell";
export default function OnboardingError() {
  return <main id="main-content" className="entry-page">
    <header className="entry-header"><Wordmark /></header>
    <section className="onboarding-message" aria-labelledby="setup-error-title">
      <span className="eyebrow">Let’s try that again</span>
      <h1 id="setup-error-title">We couldn’t load your saved work.</h1>
      <p role="alert">Check your connection and try again. This loading failure does not change saved work.</p>
      {/* A full same-origin GET reloads authoritative state without replaying actions. */}
      <DocumentLink href="/dashboard" className="button">Try again</DocumentLink>
      <p><Link prefetch={false} href="/auth/resolve" className="quiet-link">Check your account access</Link></p>
    </section>
  </main>;
}
