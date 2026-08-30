import assert from "node:assert/strict";
import test from "node:test";

import {
  getIntendedDestinationCookieOptions,
  INTENDED_DESTINATION_COOKIE_NAME,
  INTENDED_DESTINATION_MAX_AGE_SECONDS,
  isValidIntendedDestination,
  sanitizeIntendedDestination,
} from "../src/lib/auth/intended-destination.ts";

test("cookie contract uses the locked name and lifetime", () => {
  assert.equal(
    INTENDED_DESTINATION_COOKIE_NAME,
    "spall_intended_destination",
  );

  assert.equal(
    INTENDED_DESTINATION_MAX_AGE_SECONDS,
    1800,
  );
});

test("cookie options match the locked development contract", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "development";

    const options =
      getIntendedDestinationCookieOptions();

    assert.deepEqual(options, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 1800,
    });

    assert.equal(
      Object.hasOwn(options, "domain"),
      false,
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("cookie options enable Secure in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";

    assert.equal(
      getIntendedDestinationCookieOptions().secure,
      true,
    );
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test("approved dashboard destinations survive sanitization", () => {
  const cases = [
    ["/dashboard", "/dashboard"],
    ["/dashboard/", "/dashboard/"],
    ["/dashboard/spill", "/dashboard/spill"],
    ["/dashboard/identity", "/dashboard/identity"],
    [
      "/dashboard/spill/item-123",
      "/dashboard/spill/item-123",
    ],
  ];

  for (const [input, expected] of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      expected,
      input,
    );

    assert.equal(
      isValidIntendedDestination(input),
      true,
      input,
    );
  }
});

test("safe percent-encoding is canonicalized before storage", () => {
  const cases = [
    ["/%64ashboard", "/dashboard"],
    [
      "/dashboard/%69dentity",
      "/dashboard/identity",
    ],
    [
      "/dashboard/%73pill",
      "/dashboard/spill",
    ],
  ];

  for (const [input, expected] of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      expected,
      input,
    );
  }
});

test("missing and malformed values are rejected", () => {
  const cases = [
    undefined,
    null,
    "",
    "dashboard",
    "/%",
    "/dashboard/%",
    "/dashboard/%ZZ",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      String(input),
    );

    assert.equal(
      isValidIntendedDestination(input),
      false,
      String(input),
    );
  }
});

test("absolute external and protocol-relative destinations are rejected", () => {
  const cases = [
    "https://evil.example",
    "http://evil.example",
    "//evil.example",
    "///evil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "/%2F%2Fevil.example",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("routes outside the Owner dashboard family are rejected", () => {
  const cases = [
    "/",
    "/login",
    "/signup",
    "/recovery",
    "/onboarding",
    "/ops",
    "/ops/users",
    "/dashboardevil",
    "/dashboard-evil",
    "/dashboard_evil",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("query strings and fragments are never persisted", () => {
  const cases = [
    "/dashboard?tab=spill",
    "/dashboard/spill?item=123",
    "/dashboard#spill",
    "/dashboard/spill#edit",
    "/dashboard/%3Fsecret=value",
    "/dashboard/%23fragment",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("literal path traversal is rejected", () => {
  const cases = [
    "/dashboard/../external",
    "/dashboard/./spill",
    "/dashboard/../../external",
    "/dashboard/spill/../identity",
    "/dashboard/.",
    "/dashboard/..",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("encoded and repeatedly encoded traversal is rejected", () => {
  const cases = [
    "/dashboard/%2e%2e/external",
    "/dashboard/%2E%2E/external",
    "/dashboard/%2e/spill",
    "/dashboard/%252e%252e/external",
    "/dashboard/%25252e%25252e/external",
    "/dashboard/%2525252e%2525252e/external",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("backslash based path confusion is rejected", () => {
  const cases = [
    "/dashboard\\evil",
    "/dashboard/\\evil",
    "/dashboard/%5cevil",
    "/dashboard/%5Cevil",
    "/dashboard/%5c%5cevil.example",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("duplicate slash path confusion is rejected", () => {
  const cases = [
    "/dashboard//spill",
    "/dashboard///spill",
    "/dashboard/%2fspill",
    "/dashboard/%2Fspill",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      input,
    );
  }
});

test("control characters are rejected before or after decoding", () => {
  const cases = [
    "/dashboard/\u0000spill",
    "/dashboard/\u000aspill",
    "/dashboard/\u001fspill",
    "/dashboard/\u007fspill",
    "/dashboard/%00spill",
    "/dashboard/%0Aspill",
    "/dashboard/%1Fspill",
    "/dashboard/%7Fspill",
  ];

  for (const input of cases) {
    assert.equal(
      sanitizeIntendedDestination(input),
      null,
      JSON.stringify(input),
    );
  }
});