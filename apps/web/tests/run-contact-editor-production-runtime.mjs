import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 2) throw new Error("Unsupported Contact fixture argument");

// Trust only in the isolated child; preserve inherited public CA certificates.
const directory = await mkdtemp(join(tmpdir(), "spall-contact-editor-production-ca-"));
try {
  const keyPath = join(directory, "fixture-key.pem"), certPath = join(directory, "fixture-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", keyPath, "-out", certPath], { stdio: "ignore", timeout: 10000 });
  const bundlePath = join(directory, "fixture-ca-bundle.pem");
  const inherited = process.env.NODE_EXTRA_CA_CERTS ? await readFile(process.env.NODE_EXTRA_CA_CERTS, "utf8") : "";
  await writeFile(bundlePath, `${inherited}\n${await readFile(certPath, "utf8")}`);
  const child = spawn(process.execPath, ["--test", fileURLToPath(new URL("./next-contact-editor-runtime.test.mjs", import.meta.url))], {
    stdio: "inherit", env: { ...process.env, SPALL_TEST_CONTACT_EDITOR_PRODUCTION: "1", SPALL_TEST_CONTACT_EDITOR_CERT_DIRECTORY: directory,
      NODE_EXTRA_CA_CERTS: bundlePath },
  });
  process.exitCode = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
} finally {
  await rm(directory, { recursive: true, force: true });
}
