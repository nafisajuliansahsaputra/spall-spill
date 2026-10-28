import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerBlocksWorkingPageReader, type OwnerBlocksWorkingPageResult } from "./owner-blocks-working-page";
import { createOwnerWorkingPageAssembly, type OwnerWorkingPageAssemblyResult } from "./owner-working-page-assembly";

type Page = Extract<OwnerBlocksWorkingPageResult, { status: "success" }>;
type Row = NonNullable<Page["collection"]>["blocks"][number];
export type OwnerBlocksWorkingPagedAssemblyResult = OwnerWorkingPageAssemblyResult<Row>;
/** Established fixed reader and shared proof engine; no caller-selected strategy. */
export function createOwnerBlocksWorkingPagedAssembly(client: Pick<SupabaseClient, "auth" | "schema">) {
  return createOwnerWorkingPageAssembly(client, createOwnerBlocksWorkingPageReader(client));
}
