import Link from "next/link";
import { Wordmark, ArrowIcon, SparkIcon } from "@/components/auth-shell";

export default function Home() {
  return <main className="entry-page" id="main-content">
    <header className="entry-header"><Wordmark />
      <nav aria-label="Main navigation"><a href="#how-it-works" className="desktop-link">How it works</a><Link href="/login">Log in</Link><Link href="/signup" className="button button-small">Make your space <ArrowIcon /></Link></nav>
    </header>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><span className="eyebrow">For all the things you’re into</span>
        <h1 id="hero-title" className="display-type">A little you.<br />A lot to <em>discover.</em></h1>
        <p>Your links, recommendations, and useful finds deserve a place of their own. Introduce yourself with an Identity. Give what you share a home in Spill.</p>
        <Link href="/signup" className="button">Create your account <ArrowIcon /></Link>
        <p className="hero-note">Start with you. Add more when it feels right.</p>
      </div>
      <figure className="example-composition" aria-label="Illustrative Identity and Spill example">
        <div className="example-note">A space with your personality <ArrowIcon /></div>
        <div className="identity-example"><span className="sample-avatar" aria-hidden="true">a.</span><span className="eyebrow">Identity</span>
          <p className="sample-name">Alex, lately.</p><p>Collecting good ideas.<br />Sharing the little things.</p>
          <div className="sample-link">My portfolio <ArrowIcon /></div><div className="sample-link">A few favorite finds <ArrowIcon /></div>
        </div>
        <div className="spill-example"><span className="eyebrow">Spill / Resource</span><span className="sample-reference">#27</span>
          <div className="sample-art" aria-hidden="true"><span>GOOD<br />FINDS.</span><SparkIcon /></div><p>A guide worth keeping</p><span>One reference. Easy to find again.</span>
        </div>
        <figcaption>Illustrative example · not a live public profile</figcaption>
      </figure>
    </section>
    <section className="product-story" id="how-it-works" aria-labelledby="story-title">
      <div><span className="eyebrow">Less “where’s that link?”</span><h2 id="story-title" className="display-type">More finding<br /><em>the good stuff.</em></h2></div>
      <div className="story-steps"><article><span>01 / Identity</span><h3>First, introduce yourself.</h3><p>A page for your profile, connections, and links. Start simple; make it your own.</p></article>
        <article><span>02 / Spill</span><h3>Give your finds some structure.</h3><p>Add Products or Resources when useful. Your audience can browse, search, or find an exact reference.</p></article>
        <article><span>03 / Publish</span><h3>Share when you’re ready.</h3><p>Save your work privately, review it, then explicitly publish. Saving and going public stay separate.</p></article>
      </div>
    </section>
    <section className="closing-note" aria-labelledby="closing-title"><span className="closing-spark"><SparkIcon /></span><h2 id="closing-title">One space.<br /><em>Your kind of everything.</em></h2><Link href="/signup" className="button">Start with an account <ArrowIcon /></Link><p>Returning? <Link href="/auth/resolve">Continue to your workspace</Link></p></section>
    <footer className="entry-footer"><Wordmark /><span>Your Identity. Your Spill.</span><Link href="/login">Owner login <ArrowIcon /></Link></footer>
  </main>;
}
