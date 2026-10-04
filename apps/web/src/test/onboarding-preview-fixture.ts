import type { OnboardingPreview } from "@/lib/onboarding/preview-contract";

export function onboardingPreviewFixture(): OnboardingPreview {
  return {
    status: "success", current_step: "preview_publish", progress_revision: 6,
    current_handle: "preview-owner",
    identity_working: { display_name: "Preview Owner", bio: "Bio\nSecond line", profile_asset_key: null, revision: 1 },
    layout_working: { starter_key: "clean", revision: 1 }, identity_validation_issues: [],
    connection_working: null, product_draft: null, resource_draft: null, snapshot_hash: "a".repeat(64),
  };
}
