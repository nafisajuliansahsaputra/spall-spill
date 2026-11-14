import "server-only";
import { publicIdentityOrigin } from "../public/identity-origin";

export function firstIdentityPublishAvailable() {
  return process.env.SPALL_FIRST_IDENTITY_PUBLISH_ENABLED === "true"
    && process.env.SPALL_PUBLIC_IDENTITY_ENABLED === "true"
    && /^[a-z][a-z0-9-]{0,23}$/.test(process.env.SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE ?? "")
    && publicIdentityOrigin(process.env.SPALL_PUBLIC_ORIGIN) !== null;
}
