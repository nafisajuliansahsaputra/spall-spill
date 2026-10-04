import {
  BlockList,
  isIP,
} from "node:net";

import {
  lookup,
} from "node:dns/promises";

const blockedIpv4 =
  new BlockList();

[
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].forEach(
  ([address, prefix]) => {
    blockedIpv4.addSubnet(
      address as string,
      prefix as number,
      "ipv4",
    );
  },
);

const globallyRoutableIpv6 =
  new BlockList();

globallyRoutableIpv6.addSubnet(
  "2000::",
  3,
  "ipv6",
);

const blockedGlobalIpv6 =
  new BlockList();

[
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
].forEach(
  ([address, prefix]) => {
    blockedGlobalIpv6.addSubnet(
      address as string,
      prefix as number,
      "ipv6",
    );
  },
);

const MAX_VALIDATED_PUBLIC_ADDRESSES =
  4;

const DNS_LOOKUP_TIMEOUT_MS =
  5_000;

export type ResolvedPublicAddress =
  Readonly<{
    address: string;
    family: 4 | 6;
  }>;

export class UnsafeNetworkTargetError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "UnsafeNetworkTargetError";
  }
}

export function isPublicIpAddress(
  address: string,
): boolean {
  const family =
    isIP(address);

  if (family === 4) {
    return !blockedIpv4.check(
      address,
      "ipv4",
    );
  }

  if (family === 6) {
    if (
      !globallyRoutableIpv6.check(
        address,
        "ipv6",
      )
    ) {
      return false;
    }

    if (
      blockedGlobalIpv6.check(
        address,
        "ipv6",
      )
    ) {
      return false;
    }

    return true;
  }

  return false;
}

function resolveDnsTimeout(
  timeoutMs:
    number | undefined,
): number {
  if (
    timeoutMs ===
    undefined
  ) {
    return DNS_LOOKUP_TIMEOUT_MS;
  }

  if (
    !Number.isFinite(
      timeoutMs,
    ) ||
    timeoutMs <= 0
  ) {
    throw new UnsafeNetworkTargetError(
      "Destination hostname resolution received an invalid timeout.",
    );
  }

  return Math.max(
    1,
    Math.min(
      DNS_LOOKUP_TIMEOUT_MS,
      Math.floor(
        timeoutMs,
      ),
    ),
  );
}

export async function resolvePublicHost(
  hostname: string,
  timeoutMs?: number,
): Promise<
  readonly ResolvedPublicAddress[]
> {
  if (
    hostname.length === 0 ||
    isIP(hostname) !== 0
  ) {
    throw new UnsafeNetworkTargetError(
      "Destination hostname must be a DNS hostname.",
    );
  }

  const resolvedTimeoutMs =
    resolveDnsTimeout(
      timeoutMs,
    );

  let timeout:
    ReturnType<
      typeof setTimeout
    > | undefined;

  let answers:
    readonly Readonly<{
      address: string;
      family: number;
    }>[];

  try {
    const lookupPromise =
      lookup(
        hostname,
        {
          all: true,
          verbatim: true,
        },
      );

    const timeoutPromise =
      new Promise<never>(
        (
          _resolve,
          reject,
        ) => {
          timeout =
            setTimeout(
              () => {
                reject(
                  new UnsafeNetworkTargetError(
                    "Destination hostname resolution exceeded the allowed time.",
                  ),
                );
              },
              resolvedTimeoutMs,
            );
        },
      );

    /*
     * dns.lookup() is OS-backed and does not
     * expose an AbortSignal.
     *
     * We therefore bound the security request
     * path itself: once the timeout wins this
     * race, the scanner stops awaiting DNS and
     * fails closed immediately.
     *
     * A late OS resolver result is ignored and
     * can never re-enter this scan.
     */
    answers =
      await Promise.race([
        lookupPromise,
        timeoutPromise,
      ]);
  } catch (error) {
    if (
      error instanceof
      UnsafeNetworkTargetError
    ) {
      throw error;
    }

    throw new UnsafeNetworkTargetError(
      "Destination hostname could not be resolved.",
    );
  } finally {
    if (
      timeout !==
      undefined
    ) {
      clearTimeout(
        timeout,
      );
    }
  }

  if (answers.length === 0) {
    throw new UnsafeNetworkTargetError(
      "Destination hostname has no network addresses.",
    );
  }

  const unique =
    new Map<
      string,
      ResolvedPublicAddress
    >();

  for (const answer of answers) {
    if (
      (
        answer.family !== 4 &&
        answer.family !== 6
      ) ||
      !isPublicIpAddress(
        answer.address,
      )
    ) {
      throw new UnsafeNetworkTargetError(
        "Destination hostname resolved to a non-public network address.",
      );
    }

    unique.set(
      `${answer.family}:${answer.address}`,
      {
        address:
          answer.address,

        family:
          answer.family,
      },
    );
  }

  if (unique.size === 0) {
    throw new UnsafeNetworkTargetError(
      "Destination hostname has no usable public network addresses.",
    );
  }

  /*
   * Every DNS answer above is validated before
   * this cap is applied. A malicious private
   * answer therefore cannot be hidden after the
   * first few public answers.
   *
   * Limiting the usable set prevents one hostname
   * from multiplying outbound retry work.
   */
  return [
    ...unique.values(),
  ].slice(
    0,
    MAX_VALIDATED_PUBLIC_ADDRESSES,
  );
}