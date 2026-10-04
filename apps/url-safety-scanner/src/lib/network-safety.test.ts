import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    lookup:
      vi.fn(),
  }));

vi.mock(
  "node:dns/promises",
  () => ({
    lookup:
      mocks.lookup,
  }),
);

import {
  isPublicIpAddress,
  resolvePublicHost,
} from "./network-safety";

describe(
  "URL Safety Scanner network policy",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it.each([
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
    ])(
      "rejects non-public IPv4 address %s",
      (address) => {
        expect(
          isPublicIpAddress(
            address,
          ),
        ).toBe(false);
      },
    );

    it.each([
      "1.1.1.1",
      "8.8.8.8",
      "93.184.216.34",
    ])(
      "accepts public IPv4 address %s",
      (address) => {
        expect(
          isPublicIpAddress(
            address,
          ),
        ).toBe(true);
      },
    );

    it.each([
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "64:ff9b::7f00:1",
      "100::1",
      "fc00::1",
      "fd00::1",
      "fe80::1",
      "ff02::1",
      "2001::1",
      "2001:2::1",
      "2001:10::1",
      "2001:20::1",
      "2001:db8::1",
      "2002:7f00:1::",
    ])(
      "rejects non-public or tunnel IPv6 address %s",
      (address) => {
        expect(
          isPublicIpAddress(
            address,
          ),
        ).toBe(false);
      },
    );

    it.each([
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
    ])(
      "accepts global unicast IPv6 address %s",
      (address) => {
        expect(
          isPublicIpAddress(
            address,
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects direct IP input instead of treating it as a DNS hostname",
      async () => {
        await expect(
          resolvePublicHost(
            "127.0.0.1",
          ),
        ).rejects.toThrow();

        expect(
          mocks.lookup,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns deduplicated public DNS answers",
      async () => {
        mocks.lookup
          .mockResolvedValue([
            {
              address:
                "93.184.216.34",
              family: 4,
            },
            {
              address:
                "93.184.216.34",
              family: 4,
            },
            {
              address:
                "2606:2800:220:1:248:1893:25c8:1946",
              family: 6,
            },
          ]);

        await expect(
          resolvePublicHost(
            "example.com",
          ),
        ).resolves.toEqual([
          {
            address:
              "93.184.216.34",
            family: 4,
          },
          {
            address:
              "2606:2800:220:1:248:1893:25c8:1946",
            family: 6,
          },
        ]);

        expect(
          mocks.lookup,
        ).toHaveBeenCalledWith(
          "example.com",
          {
            all: true,
            verbatim: true,
          },
        );
      },
    );

    it(
      "fails the whole hostname when any DNS answer is private",
      async () => {
        mocks.lookup
          .mockResolvedValue([
            {
              address:
                "93.184.216.34",
              family: 4,
            },
            {
              address:
                "10.0.0.5",
              family: 4,
            },
          ]);

        await expect(
          resolvePublicHost(
            "attacker.example",
          ),
        ).rejects.toThrow(
          "non-public network address",
        );
      },
    );

    it(
      "fails the whole hostname when DNS includes cloud metadata link-local",
      async () => {
        mocks.lookup
          .mockResolvedValue([
            {
              address:
                "169.254.169.254",
              family: 4,
            },
          ]);

        await expect(
          resolvePublicHost(
            "metadata.attacker.example",
          ),
        ).rejects.toThrow(
          "non-public network address",
        );
      },
    );

    it(
      "fails closed when OS-backed DNS resolution exceeds its bounded timeout",
      async () => {
        vi.useFakeTimers();

        try {
          mocks.lookup
            .mockReturnValue(
              new Promise(
                () => {
                  /*
                   * Simulates an OS resolver that
                   * never completes.
                   */
                },
              ),
            );

          const pending =
            resolvePublicHost(
              "slow.example",
              250,
            );

          /*
           * Attach the rejection handler before
           * advancing fake time so Vitest never
           * observes the intentional timeout as
           * an unhandled rejection.
           */
          const rejection =
            expect(
              pending,
            ).rejects.toThrow(
              "exceeded the allowed time",
            );

          await vi.advanceTimersByTimeAsync(
            250,
          );

          await rejection;
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it(
      "uses the caller deadline when it is smaller than the DNS maximum",
      async () => {
        vi.useFakeTimers();

        try {
          mocks.lookup
            .mockReturnValue(
              new Promise(
                () => {
                  /*
                   * Intentionally unresolved.
                   */
                },
              ),
            );

          const pending =
            resolvePublicHost(
              "budget.example",
              25,
            );

          const rejection =
            expect(
              pending,
            ).rejects.toThrow(
              "exceeded the allowed time",
            );

          await vi.advanceTimersByTimeAsync(
            24,
          );

          expect(
            vi.getTimerCount(),
          ).toBe(
            1,
          );

          await vi.advanceTimersByTimeAsync(
            1,
          );

          await rejection;
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it(
      "fails closed on invalid DNS timeout input before starting resolution",
      async () => {
        await expect(
          resolvePublicHost(
            "example.com",
            0,
          ),
        ).rejects.toThrow(
          "invalid timeout",
        );

        expect(
          mocks.lookup,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed on DNS resolution errors",
      async () => {
        mocks.lookup
          .mockRejectedValue(
            new Error(
              "DNS unavailable",
            ),
          );

        await expect(
          resolvePublicHost(
            "example.com",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "fails closed when DNS returns no addresses",
      async () => {
        mocks.lookup
          .mockResolvedValue([]);

        await expect(
          resolvePublicHost(
            "example.com",
          ),
        ).rejects.toThrow(
          "no network addresses",
        );
      },
    );
  },
);