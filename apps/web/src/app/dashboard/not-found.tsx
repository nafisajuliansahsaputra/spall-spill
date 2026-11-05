import Link from "next/link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
export default function SavedItemUnavailable(){return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="item"/><section className="onboarding-message"><span className="eyebrow">Your saved work</span><h1>That saved Item isn’t available.</h1><p>Return to your workspace to choose an available Item.</p><Link prefetch={false} className="button" href="/dashboard">Back to your saved work</Link></section></main>;}
