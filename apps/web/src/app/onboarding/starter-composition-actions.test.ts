import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  schema: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock(
  "@/lib/supabase/server",
  () => ({
    createClient:
      mocks.createClient,
  }),
);

vi.mock(
  "next/navigation",
  () => ({
    redirect:
      mocks.redirect,
  }),
);

import {
  saveStarterCompositionAction,
} from "./actions";
import type {
  StarterCompositionActionState,
} from "./state";

const previousState:
  StarterCompositionActionState = {
    status: "idle",
    message: null,
    starterKey: "",
    fieldErrors: {},
  };

function createStarterFormData(
  starterKey: string,
  baseLayoutRevision:
    string | null = "2",
  baseProgressRevision = "5",
): FormData {
  const formData = new FormData();

  formData.set(
    "starterKey",
    starterKey,
  );

  formData.set(
    "baseLayoutRevision",
    baseLayoutRevision ?? "",
  );

  formData.set(
    "baseProgressRevision",
    baseProgressRevision,
  );

  return formData;
}

describe(
  "saveStarterCompositionAction",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.schema.mockReturnValue({
        rpc: mocks.rpc,
      });

      mocks.createClient.mockResolvedValue({
        schema: mocks.schema,
      });

      mocks.rpc.mockResolvedValue({
        data: {
          status: "stale_write",
        },
        error: null,
      });
    });

    it(
      "rejects an unsupported Starter before database access",
      async () => {
        const result =
          await saveStarterCompositionAction(
            previousState,
            createStarterFormData(
              "../../../foreign-layout",
            ),
          );

        expect(result.status).toBe(
          "error",
        );

        expect(
          result.fieldErrors.starterKey,
        ).toBeDefined();

        expect(
          mocks.createClient,
        ).not.toHaveBeenCalled();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses the current-Owner Starter RPC without a target Owner argument",
      async () => {
        await saveStarterCompositionAction(
          previousState,
          createStarterFormData(
            "featured",
            "2",
            "5",
          ),
        );

        expect(
          mocks.schema,
        ).toHaveBeenCalledWith(
          "api",
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "save_current_owner_starter_composition",
          {
            input_starter_key:
              "featured",
            base_layout_revision:
              2,
            base_progress_revision:
              5,
          },
        );
      },
    );

    it(
      "uses null as the explicit not-yet-created Layout revision",
      async () => {
        await saveStarterCompositionAction(
          previousState,
          createStarterFormData(
            "clean",
            null,
            "4",
          ),
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "save_current_owner_starter_composition",
          expect.objectContaining({
            base_layout_revision:
              null,
          }),
        );
      },
    );

    it(
      "maps authoritative stale Layout rejection without pretending the save succeeded",
      async () => {
        const result =
          await saveStarterCompositionAction(
            previousState,
            createStarterFormData(
              "business",
            ),
          );

        expect(result).toEqual({
          status: "error",
          message:
            "Your Starter Composition changed in another tab or session. Reload the page before making another change.",
          starterKey: "business",
          fieldErrors: {},
        });
      },
    );
  },
);
