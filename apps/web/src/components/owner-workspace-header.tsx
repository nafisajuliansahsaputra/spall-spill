import Link from "next/link";
import { Wordmark } from "./auth-shell";
import { PrivateSessionMenu } from "./private-session-menu";
export function OwnerWorkspaceHeader({ active }: { active: "home" | "identity" | "item" }) {
 return <header className="entry-header flex-wrap py-4"><Wordmark /><nav aria-label="Owner workspace">
  <Link prefetch={false} href="/dashboard" aria-current={active==="home"?"page":undefined}>Home</Link>
  <Link prefetch={false} href="/dashboard/identity" aria-current={active==="identity"?"page":undefined}>Identity</Link>
  <PrivateSessionMenu />
 </nav></header>;
}
