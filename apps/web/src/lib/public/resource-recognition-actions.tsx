import "server-only";
import { z } from "zod";
import { publicResourceSchema } from "./resource-contract";
import { PublishedResourceRecognition } from "./resource-recognition";

const payloadSchema = z.object({ recognition: publicResourceSchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
    .refine(token => Buffer.from(token, "base64url").toString("base64url") === token).nullable(),
}).strict();
const labels = { menu: "View Menu", price_list: "View Price List", catalog: "Open Catalog", portfolio: "View Portfolio",
  media_kit: "View Media Kit / Rate Card", document: "Open Document", website: "Visit Website", other: "Open Resource" } as const;

/** Trusted issued server props only. Does not issue authority or mount transport. */
export function PublishedResourceRecognitionActions({ payload }: { payload: unknown }) {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return <PublishedResourceRecognition payload={{ status: "unavailable" }} />;
  const { recognition, token } = parsed.data;
  return <div>
    <PublishedResourceRecognition payload={recognition} />
    {recognition.available && token !== null ? <section aria-label="Resource action" className="mx-auto max-w-3xl px-5 pb-5">
      <form action="/actions/resource-open" method="post" encType="application/x-www-form-urlencoded" acceptCharset="UTF-8" target="_self">
        <input type="hidden" name="handle" value={recognition.current_handle} />
        <input type="hidden" name="spill_reference" value={String(recognition.spill_reference)} />
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="min-h-11 w-full rounded-xl border px-4 py-3 text-left font-semibold">
          {labels[recognition.resource_type]}
        </button>
      </form>
    </section> : recognition.available ? <p role="status" className="mx-auto max-w-3xl px-5 pb-5">
      Resource source is temporarily unavailable.
    </p> : null}
  </div>;
}
