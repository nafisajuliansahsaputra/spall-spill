import Link from "next/link";
import type { ReactNode } from "react";

export function ArrowIcon() {
  return <svg className="arrow-icon" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 19 19 5M5 5h14v14" /></svg>;
}
export function SparkIcon() {
  return <svg className="spark-icon" aria-hidden="true" viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M20 3v34M3 20h34M8 8l24 24M8 32 32 8" /></svg>;
}

export function Wordmark() {
  return <Link href="/" className="wordmark" aria-label="Spall Spill home">spall<SparkIcon />spill</Link>;
}

export function AuthShell({ title, description, children, footer }: {
  title: string; description: string; children: ReactNode; footer: ReactNode;
}) {
  return <main className="entry-page auth-page" id="main-content">
    <header className="entry-header"><Wordmark /><Link href="/" className="quiet-link">Back to home <ArrowIcon /></Link></header>
    <div className="auth-grid">
      <aside className="auth-story" aria-label="About Spall Spill">
        <span className="eyebrow">A little more you.</span>
        <p className="display-type">Your world.<br />All in<br /><em>one place.</em></p>
        <p>A home for who you are. A place for the things you want to share.</p>
        <div className="story-stamp" aria-hidden="true">Made to<br />be found +</div>
      </aside>
      <section className="auth-panel" aria-labelledby="auth-title">
        <span className="eyebrow">Welcome to Spall Spill</span>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </div>
    <footer className="entry-footer"><span>Your Identity. Your Spill.</span><span>Share with intention.</span></footer>
  </main>;
}
