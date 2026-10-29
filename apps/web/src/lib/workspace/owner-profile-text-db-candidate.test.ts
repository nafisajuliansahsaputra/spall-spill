import { describe, expect, it } from "vitest";
import { ownerProfileTextDbCandidateIntentSchema as intent, ownerProfileTextDbCandidateResultSchema as result } from "./owner-profile-text-db-candidate";
const receipt_id = "25400000-0000-4000-8000-000000000001";
const snapshot_hash = "a".repeat(64);
const request = { action: "prepare_identity_profile_text_candidate", receipt_id, snapshot_hash };
const candidate = { current_handle: "owner254", display_name: "Name", bio: null, starter_key: "clean", blocks: [{ kind: "text", text: " <script>\n " }] };
const success = { status: "success", receipt_id, snapshot_hash, expires_at: "2026-10-29T16:00:00+00:00", review_format: "identity_working_review_v1", publication_validation: "profile_text_subset", assessment: "candidate_validated", candidate, issues: [] };
describe("dormant Profile/Text DB candidate wire contract", () => {
  it("accepts exact receipt intent and complete literal candidate", () => {
    expect(intent.parse(request)).toEqual(request);
    expect(result.parse(success)).toEqual(success);
  });
  it.each([undefined, null, {}, { ...request, owner_id: receipt_id }, { ...request, candidate }, { ...request, receipt_id: "bad" }, { ...request, snapshot_hash: snapshot_hash + "\n" }, { ...request, action: "publish" }])("denies caller authority/malformed intent %#", value => {
    expect(intent.safeParse(value).success).toBe(false);
  });
  it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_candidate_request", "stale_review", "review_expired"])("keeps %s status-only", status => {
    expect(result.parse({ status })).toEqual({ status });
    expect(result.safeParse({ status, candidate }).success).toBe(false);
  });
  it("accepts explicit blockers and rejects partial candidates/ready claims", () => {
    const blocked = { ...success, assessment: "blocked", candidate: null, issues: [{ scope: "profile", code: "source_review_required" }] };
    expect(result.parse(blocked)).toEqual(blocked);
    for (const value of [{ ...blocked, candidate }, { ...blocked, issues: [] }, { ...success, issues: blocked.issues },
      { ...success, publication_validation: "ready" }, { ...success, assessment: "published" },
      { ...success, candidate: { ...candidate, owner_id: receipt_id } }, { ...success, expires_at: "bad" },
      { ...blocked, issues: [{ scope: "block", block_id: receipt_id, code: "text_invalid", raw: "private" }] }]) {
      expect(result.safeParse(value).success).toBe(false);
    }
  });
});
