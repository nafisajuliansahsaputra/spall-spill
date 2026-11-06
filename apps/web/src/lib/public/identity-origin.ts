export function publicIdentityOrigin(input: string | undefined): string | null {
  try {
    if (!input) return null;
    const u = new URL(input);
    return u.origin === input && (u.protocol === "https:" || (u.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) ? input : null;
  } catch { return null; }
}
