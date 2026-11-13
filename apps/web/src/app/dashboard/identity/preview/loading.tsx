import { Wordmark } from "@/components/auth-shell";

export default function LoadingSavedPreview() {
  return <main id="main-content" className="entry-page">
    <header className="entry-header"><Wordmark /></header>
    <section className="onboarding-message" role="status" aria-live="polite">
      <p className="eyebrow">Saved Working preview</p>
      <h1>Loading your saved Identity…</h1>
      <p>We’re getting your latest saved work for this private preview.</p>
    </section>
  </main>;
}
