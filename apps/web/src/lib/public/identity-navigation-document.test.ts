import { expect, it } from "vitest";
import { renderIdentityNavigationDocument } from "./identity-navigation-document";
it("serializes destination/nonce attributes while keeping executable source fixed", () => {
 const destination = 'https://example.test/?q="/><script>alert(1)</script>&next=\'quoted\'';
 const document = renderIdentityNavigationDocument(destination, 'nonce" onload="alert(2)');
 expect(document).not.toContain('<script>alert(1)</script>');
 expect(document).not.toContain('nonce="nonce" onload=');
 expect(document).toContain('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
 expect(document).toContain('&amp;next&#x3D;'); expect(document).toContain('&quot;');
 expect(document.match(/<script /g)).toHaveLength(1);
 expect(document).toContain('window.location.replace(document.getElementById("destination").href);');
 expect(document).toContain('<noscript>');
});
