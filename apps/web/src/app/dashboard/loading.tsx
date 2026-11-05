import { Wordmark } from "@/components/auth-shell";
export default function LoadingOnboarding() {
  return <main id="main-content" className="entry-page">
    <header className="entry-header"><Wordmark /></header>
    <section className="onboarding-message" role="status" aria-live="polite">
      <span className="eyebrow">One moment</span><h1>Loading your saved work…</h1>
      <p>We’re getting your latest acknowledged work.</p>
    </section>
  </main>;
}
