import Link from "next/link";
import { notFound } from "next/navigation";
import { readPublicIdentity } from "@/lib/public/identity-server";
import { isPublicIdentityPath } from "@/lib/public/identity-path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function PublicIdentityPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!isPublicIdentityPath(`/${handle}`)) notFound();
  const identity = await readPublicIdentity(handle);
  if (identity?.status === "unavailable") notFound();
  if (identity === null) return <main className="public-identity public-identity-notice" id="main-content">
    <p className="eyebrow">Spall Spill</p><h1>Try again in a moment.</h1>
    <p>We couldn’t load this page right now.</p><a className="button" href={`/${handle}`}>Try again</a>
  </main>;
  const connection = identity.connection;
  const label = connection?.connection_kind === "social" ? connection.social_platform : "Visit my link";
  return <div className={`public-identity public-identity-${identity.starter_key}`}>
    <main id="main-content" className="public-identity-canvas">
      <header className="public-identity-profile"><p className="eyebrow">@{identity.current_handle}</p>
        <h1>{identity.display_name}</h1>{identity.bio !== null && <p className="public-identity-bio">{identity.bio}</p>}
      </header>
      {connection !== null && <section aria-label="Connections" className="public-identity-connections">
        {connection.available ? <form method="post" action={`/api/public/identity/${identity.current_handle}/open`}>
          <input type="hidden" name="binding" value={connection.binding} />
          <button type="submit" className="public-identity-link"><span>{label}</span><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 19 19 5M5 5h14v14" /></svg></button>
        </form> : <div className="public-identity-link public-identity-disabled"><span>{label}</span><span>Unavailable</span></div>}
      </section>}
    </main>
    <footer className="public-identity-footer"><Link prefetch={false} href="/">Made with Spall Spill <span aria-hidden="true">✳</span></Link></footer>
  </div>;
}
