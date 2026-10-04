import "server-only";
import { redirect } from "next/navigation";
import { resolveCurrentOwnerDestination } from "./resolved-destination";

// Server Actions must navigate to the final page, rather than a GET-only handler.
export async function redirectToCurrentOwnerDestination(): Promise<never> {
  const destination = await resolveCurrentOwnerDestination();
  if (destination === null) {
    throw new Error("The current account destination could not be verified. Retry after reloading.");
  }
  redirect(destination);
}
