import { cookies } from "next/headers";

import {
  getIntendedDestinationCookieOptions,
  INTENDED_DESTINATION_COOKIE_NAME,
  sanitizeIntendedDestination,
} from "@/lib/auth/intended-destination";

function getClearedCookieOptions() {
  return {
    ...getIntendedDestinationCookieOptions(),
    maxAge: 0,
  };
}

export async function readIntendedDestinationCookie(): Promise<
  string | null
> {
  const cookieStore = await cookies();

  const rawValue = cookieStore.get(
    INTENDED_DESTINATION_COOKIE_NAME,
  )?.value;

  return sanitizeIntendedDestination(rawValue);
}

export async function writeIntendedDestinationCookie(
  pathname: string,
): Promise<string | null> {
  const cookieStore = await cookies();

  const destination =
    sanitizeIntendedDestination(pathname);

  if (destination === null) {
    cookieStore.set(
      INTENDED_DESTINATION_COOKIE_NAME,
      "",
      getClearedCookieOptions(),
    );

    return null;
  }

  cookieStore.set(
    INTENDED_DESTINATION_COOKIE_NAME,
    destination,
    getIntendedDestinationCookieOptions(),
  );

  return destination;
}

export async function clearIntendedDestinationCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(
    INTENDED_DESTINATION_COOKIE_NAME,
    "",
    getClearedCookieOptions(),
  );
}

export async function consumeIntendedDestinationCookie(): Promise<
  string | null
> {
  const cookieStore = await cookies();

  const rawValue = cookieStore.get(
    INTENDED_DESTINATION_COOKIE_NAME,
  )?.value;

  const destination =
    sanitizeIntendedDestination(rawValue);

  if (rawValue !== undefined) {
    cookieStore.set(
      INTENDED_DESTINATION_COOKIE_NAME,
      "",
      getClearedCookieOptions(),
    );
  }

  return destination;
}