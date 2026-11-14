"use client";
import Link from "next/link";
import type { AriaAttributes, ReactNode } from "react";
/** Authoritative GET/readback and auth endpoints need document navigation.
 * No speculative fetch; native anchor behavior still works before hydration. */
export function DocumentLink({ href, className, children, "aria-current": ariaCurrent }: { href: string; className?: string; children: ReactNode; "aria-current"?: AriaAttributes["aria-current"] }) {
  return <Link href={href} className={className} aria-current={ariaCurrent} prefetch={false} onNavigate={event => {
    event.preventDefault(); window.location.assign(href);
  }}>{children}</Link>;
}
