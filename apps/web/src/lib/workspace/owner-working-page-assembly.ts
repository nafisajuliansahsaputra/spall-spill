import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerHomeContext } from "./owner-home-context";
import type { IdentityBlockPageRequest } from "./identity-block-page-request";
import { createOwnerGuardedRead, type OwnerReadDenial } from "./owner-guarded-read";

type RowBase = { block_id: string; position: number };
type Page<R, C extends OwnerHomeContext> = C & { collection: null | { revision: number; blocks: R[]; has_more: boolean; next_after_position: number | null } };
type PageResult<R, C extends OwnerHomeContext> = Page<R, C> | { status: "unavailable" | "invalid_page_request" | "stale_read" };
type Snapshot<R, C extends OwnerHomeContext> = C & { collection: null | { revision: number; blocks: R[] } };
export type OwnerWorkingPageAssemblyResult<R, C extends OwnerHomeContext = OwnerHomeContext> = OwnerReadDenial | Snapshot<R, C>;
const matches = (a: OwnerHomeContext, b: OwnerHomeContext) =>
  a.current_handle === b.current_handle && a.primary_use_case === b.primary_use_case;

/** Two bounded complete observations; no atomic/global freshness, write, route or publication authority. */
export function createOwnerWorkingPageAssembly<R extends RowBase, C extends OwnerHomeContext = OwnerHomeContext>(client: Pick<SupabaseClient, "auth" | "schema">,
  pageReader: { read(value: unknown): Promise<PageResult<R, C>> }, maximumRowBytes?: number) {
  return createOwnerGuardedRead<Snapshot<R, C>>(client,
    async (signal): Promise<Snapshot<R, C> | null> => {
      let request: IdentityBlockPageRequest = { expected_collection_revision: null, after_position: null };
      let first: Page<R, C> | null = null;
      const rows: R[] = [];
      const ids = new Set<string>();
      let rowBytes = 2;
      for (let index = 0; index < 10; index++) {
        if (signal.aborted) return null;
        const page = await pageReader.read(request);
        if (signal.aborted || page.status !== "success") return null;
        if (first === null) first = page;
        if (JSON.stringify({ ...first, collection: null }) !== JSON.stringify({ ...page, collection: null })) return null;
        if (page.collection === null) {
          return index === 0 ? { ...page, collection: null } : null;
        }
        if (first.collection === null || page.collection.revision !== first.collection.revision) return null;
        for (const row of page.collection.blocks) {
          if (ids.has(row.block_id) || (rows.length > 0 && rows.at(-1)!.position >= row.position)) return null;
          if (maximumRowBytes !== undefined) {
            rowBytes += Buffer.byteLength(JSON.stringify(row), "utf8") + (rows.length ? 1 : 0);
            if (rowBytes > maximumRowBytes) return null;
          }
          ids.add(row.block_id); rows.push(row);
        }
        if (!page.collection.has_more) return { ...first, collection: { revision: first.collection.revision, blocks: rows } };
        request = { expected_collection_revision: first.collection.revision, after_position: page.collection.next_after_position };
      }
      return null;
    }, matches);
}
