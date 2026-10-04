import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createContentSecurityPolicy,
  createRequestNonce,
} from "./content-security-policy";

describe(
  "Content Security Policy",
  () => {
    it(
      "creates unpredictable Base64 nonces",
      () => {
        const first =
          createRequestNonce();

        const second =
          createRequestNonce();

        expect(first)
          .not.toBe(second);

        expect(first)
          .toMatch(
            /^[A-Za-z0-9+/]+={0,2}$/,
          );
      },
    );

    it(
      "builds a strict production policy with exact service and bucket origins",
      () => {
        const policy =
          createContentSecurityPolicy({
            nonce:
              "YWJjZGVmZ2hpamtsbW5vcA==",
            isDevelopment: false,
            supabaseUrl:
              "https://project.supabase.co",
            r2Endpoint:
              "https://account.r2.cloudflarestorage.com",
            r2Bucket:
              "spall-spill-profile-media-dev",
          });

        expect(policy)
          .toContain(
            "script-src 'nonce-YWJjZGVmZ2hpamtsbW5vcA==' 'strict-dynamic' 'self'",
          );

        expect(policy)
          .toContain(
            "script-src-attr 'none'",
          );

        expect(policy)
          .toContain(
            "object-src 'none'",
          );

        expect(policy)
          .toContain(
            "frame-ancestors 'none'",
          );

        /*
         * OAuth must not require widening form
         * submission authority to third parties.
         */
        expect(policy)
          .toContain(
            "form-action 'self'",
          );

        expect(policy)
          .toContain(
            "https://project.supabase.co",
          );

        expect(policy)
          .toContain(
            "https://account.r2.cloudflarestorage.com",
          );

        expect(policy)
          .toContain(
            "https://spall-spill-profile-media-dev.account.r2.cloudflarestorage.com",
          );

        expect(policy)
          .not.toContain(
            "*.r2.cloudflarestorage.com",
          );

        expect(policy)
          .not.toContain(
            "'unsafe-eval'",
          );
      },
    );

    it(
      "allows development-only eval and websocket support without weakening production",
      () => {
        const policy =
          createContentSecurityPolicy({
            nonce:
              "YWJjZGVmZ2hpamtsbW5vcA==",
            isDevelopment: true,
            supabaseUrl:
              "http://127.0.0.1:54321",
          });

        expect(policy)
          .toContain(
            "'unsafe-eval'",
          );

        expect(policy)
          .toContain(
            "ws:",
          );

        expect(policy)
          .not.toContain(
            "upgrade-insecure-requests",
          );
      },
    );

    it(
      "rejects insecure R2 origins",
      () => {
        expect(() =>
          createContentSecurityPolicy({
            nonce:
              "YWJjZGVmZ2hpamtsbW5vcA==",
            isDevelopment: true,
            r2Endpoint:
              "http://evil.example",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects unsafe bucket names instead of broadening the browser allowlist",
      () => {
        expect(() =>
          createContentSecurityPolicy({
            nonce:
              "YWJjZGVmZ2hpamtsbW5vcA==",
            isDevelopment: false,
            r2Endpoint:
              "https://account.r2.cloudflarestorage.com",
            r2Bucket:
              "safe.example.com/evil",
          }),
        ).toThrow();
      },
    );
  },
);