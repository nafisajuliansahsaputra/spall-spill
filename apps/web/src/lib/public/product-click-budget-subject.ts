import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";

const namespaceSchema = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const metadataSchema = z.object({ address: z.string().min(2).max(45) }).strict();

function canonicalAddress(address: string): string | null {
  if (/[\s%\[\]]/.test(address)) return null;
  const family = isIP(address);
  if (family === 4) return `4:${address}`;
  if (family !== 6) return null;
  // WHATWG URL canonicalizes valid embedded IPv4 to hexadecimal without I/O.
  const host = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  const halves = host.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const words = halves.length === 2 ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right] : left;
  const hex = words.map(word => word.padStart(4, "0")).join("");
  if (hex.startsWith("00000000000000000000ffff")) {
    const octets = hex.slice(24).match(/.{2}/g)!;
    return `4:${octets.map(byte => Number.parseInt(byte, 16)).join(".")}`;
  }
  return `6:${hex}`;
}

/** Unmounted: the injected reader MUST attest trusted runtime metadata, never arbitrary headers. */
export function createProductClickNetworkSubject({ namespace, key, readTrustedMetadata }: {
  namespace: string; key: Uint8Array; readTrustedMetadata: (request: Request) => Promise<unknown>;
}) {
  const parsed = namespaceSchema.safeParse(namespace);
  const secret = key instanceof Uint8Array && key.length >= 32 && key.length <= 64 ? Buffer.from(key) : null;
  return async (request: Request): Promise<string | null> => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const started = performance.now();
      const timely = () => { const now = performance.now(); return Number.isFinite(now) && now >= started && now < started + 500; };
      if (!parsed.success || !secret || !Number.isFinite(started) || request.signal.aborted) return null;
      const run = async () => {
        const metadata = metadataSchema.safeParse(await readTrustedMetadata(request));
        if (!metadata.success || !active || !timely() || request.signal.aborted) return null;
        const address = canonicalAddress(metadata.data.address);
        if (!address) return null;
        return createHmac("sha256", secret).update(`spall-click-network-subject-v1\0${parsed.data}\0${address}`).digest("base64url");
      };
      return await Promise.race([run(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 500); })]);
    } catch { return null; }
    finally { active = false; clearTimeout(timer); }
  };
}
