"use client";
import Link from "next/link";
import type { ReactNode } from "react";
/** Authoritative GET/readback and auth endpoints need document navigation.
 * No speculative fetch; native anchor behavior still works before hydration. */
export function DocumentLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return <Link href={href} className={className} prefetch={false} onNavigate={event => {
    event.preventDefault(); window.location.assign(href);
  }}>{children}</Link>;
}
