const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

const DASHBOARD_ROOT = "/dashboard";

const MAX_DECODE_PASSES = 5;

export const INTENDED_DESTINATION_COOKIE_NAME =
  "spall_intended_destination";

export const INTENDED_DESTINATION_MAX_AGE_SECONDS = 1800;

export type IntendedDestinationCookieOptions = Readonly<{
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
}>;

export function getIntendedDestinationCookieOptions(): IntendedDestinationCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INTENDED_DESTINATION_MAX_AGE_SECONDS,
  };
}

function decodePathnameCompletely(
  value: string,
): string | null {
  let current = value;

  for (
    let pass = 0;
    pass < MAX_DECODE_PASSES;
    pass += 1
  ) {
    let decoded: string;

    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }

    if (decoded === current) {
      return decoded;
    }

    current = decoded;
  }

  try {
    if (decodeURIComponent(current) !== current) {
      return null;
    }
  } catch {
    return null;
  }

  return current;
}

function hasUnsafePathSegment(
  pathname: string,
): boolean {
  return pathname
    .split("/")
    .some(
      (segment) =>
        segment === "." ||
        segment === "..",
    );
}

function isApprovedDashboardPathname(
  pathname: string,
): boolean {
  return (
    pathname === DASHBOARD_ROOT ||
    pathname.startsWith(`${DASHBOARD_ROOT}/`)
  );
}

export function sanitizeIntendedDestination(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (
    value.length === 0 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return null;
  }

  const decoded = decodePathnameCompletely(value);

  if (decoded === null) {
    return null;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("//") ||
    decoded.includes("\\") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    CONTROL_CHARACTER_PATTERN.test(decoded) ||
    hasUnsafePathSegment(decoded) ||
    !isApprovedDashboardPathname(decoded)
  ) {
    return null;
  }

  return decoded;
}

export function isValidIntendedDestination(
  value: string | null | undefined,
): boolean {
  return sanitizeIntendedDestination(value) !== null;
}