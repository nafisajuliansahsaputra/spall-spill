import "server-only";
import Mustache from "mustache";
// Fixed template only. Double-brace attribute bindings use the engine's default
// HTML escaping. The executable script contains no interpolated destination.
const template = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opening connection</title></head><body><main><h1>Opening connection…</h1><a id="destination" href="{{destination}}" rel="noreferrer nofollow">Continue to destination</a><noscript><p>JavaScript is off. Use the link to continue.</p></noscript></main><script nonce="{{nonce}}">window.location.replace(document.getElementById("destination").href);</script></body></html>`;
export function renderIdentityNavigationDocument(destination: string, nonce: string) {
  return Mustache.render(template, { destination, nonce });
}
