import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerTypedBlocksWorkingPageReader, type OwnerTypedBlocksWorkingPageResult } from "./owner-typed-blocks-working-page";
import { createOwnerWorkingPageAssembly, type OwnerWorkingPageAssemblyResult } from "./owner-working-page-assembly";

type Page = Extract<OwnerTypedBlocksWorkingPageResult, { status: "success" }>;
type Row = NonNullable<Page["collection"]>["blocks"][number];
export type OwnerTypedBlocksWorkingAssemblyResult = OwnerWorkingPageAssemblyResult<Row>;
/** Fixed six-kind reader; same bounded proof engine as established reconstruction. */
export function createOwnerTypedBlocksWorkingAssembly(client: Pick<SupabaseClient, "auth" | "schema">) {
  return createOwnerWorkingPageAssembly<Row>(client, createOwnerTypedBlocksWorkingPageReader(client), 67108864);
}
