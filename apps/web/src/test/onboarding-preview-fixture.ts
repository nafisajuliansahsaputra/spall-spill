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

export function preparedProductPreviewFixture(): OnboardingPreview {
  const preview = onboardingPreviewFixture();
  preview.product_draft = {
    title: "Saved Product", source_url: "https://shopee.co.id/item?affiliate=creator", revision: 1, spill_reference: 1,
    safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" },
    validation_issues: ["product_publication_preparation_pending"],
    preparation: { primary_asset_key: "83000000-0000-4000-8000-000000000001", revision: 2,
      destinations: [
        { provider_key: "shopee", destination_url: "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB",
          safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" } },
        { provider_key: "external:shop.example.test", destination_url: "https://shop.example.test/item",
          safety: { status: "pending", revision: null, expires_at: null } },
      ] },
  };
  return preview;
}
