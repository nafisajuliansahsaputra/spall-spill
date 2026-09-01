import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const authUserIdSchema =
  z.string().uuid();

export type ProfileMediaAuthPrincipal =
  | {
      status: "authenticated";
      authUserId: string;
    }
  | {
      status: "unauthenticated";
    };

export async function resolveProfileMediaAuthPrincipal(): Promise<ProfileMediaAuthPrincipal> {
  const supabase =
    await createClient();

  const {
    data,
    error,
  } = await supabase.auth.getClaims();

  if (error) {
    return {
      status: "unauthenticated",
    };
  }

  const parsedAuthUserId =
    authUserIdSchema.safeParse(
      data?.claims?.sub,
    );

  if (!parsedAuthUserId.success) {
    return {
      status: "unauthenticated",
    };
  }

  return {
    status: "authenticated",
    authUserId:
      parsedAuthUserId.data,
  };
}