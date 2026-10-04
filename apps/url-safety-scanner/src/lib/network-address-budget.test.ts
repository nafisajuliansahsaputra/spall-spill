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
  resolvePublicHost,
} from "./network-safety";

describe(
  "network address resource budget",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "caps the usable validated public address set to four",
      async () => {
        mocks.lookup
          .mockResolvedValue([
            {
              address:
                "93.184.216.1",
              family: 4,
            },
            {
              address:
                "93.184.216.2",
              family: 4,
            },
            {
              address:
                "93.184.216.3",
              family: 4,
            },
            {
              address:
                "93.184.216.4",
              family: 4,
            },
            {
              address:
                "93.184.216.5",
              family: 4,
            },
            {
              address:
                "93.184.216.6",
              family: 4,
            },
          ]);

        const addresses =
          await resolvePublicHost(
            "example.com",
          );

        expect(
          addresses,
        ).toHaveLength(
          4,
        );

        expect(
          addresses.map(
            ({ address }) =>
              address,
          ),
        ).toEqual([
          "93.184.216.1",
          "93.184.216.2",
          "93.184.216.3",
          "93.184.216.4",
        ]);
      },
    );

    it(
      "still rejects a non-public answer appearing beyond the four-address budget",
      async () => {
        mocks.lookup
          .mockResolvedValue([
            {
              address:
                "93.184.216.1",
              family: 4,
            },
            {
              address:
                "93.184.216.2",
              family: 4,
            },
            {
              address:
                "93.184.216.3",
              family: 4,
            },
            {
              address:
                "93.184.216.4",
              family: 4,
            },
            {
              address:
                "127.0.0.1",
              family: 4,
            },
          ]);

        await expect(
          resolvePublicHost(
            "example.com",
          ),
        ).rejects.toThrow(
          "non-public",
        );
      },
    );
  },
);