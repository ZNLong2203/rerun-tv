/**
 * A self-signed certificate for serving the phone companion over HTTPS on the
 * local network. Browsers only give the microphone (and speech recognition)
 * to secure origins, and a phone reaches the server by LAN IP, not localhost.
 *
 * The phone shows a certificate warning once; tapping through is enough for a
 * demo. For a trusted certificate, run a tunnel and set PUBLIC_URL instead.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DevCert {
  key: string;
  cert: string;
}

/** subjectAltName entries for the hosts a phone may use to reach us. */
export function subjectAltName(hosts: readonly string[]): string {
  const unique = [...new Set(["localhost", ...hosts])];
  return unique.map((h) => (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) ? `IP:${h}` : `DNS:${h}`)).join(",");
}

/** Reuse the certificate in `dir` if it covers `hosts`, otherwise make one with openssl. */
export function ensureDevCert(dir: string, hosts: readonly string[]): DevCert {
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  const sanPath = join(dir, "san.txt");
  const san = subjectAltName(hosts);
  const current = existsSync(sanPath) ? readFileSync(sanPath, "utf8") : "";
  if (current !== san || !existsSync(keyPath) || !existsSync(certPath)) {
    mkdirSync(dir, { recursive: true });
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", keyPath, "-out", certPath, "-days", "90",
        "-subj", "/CN=Rerun dev",
        "-addext", `subjectAltName=${san}`,
        "-addext", "extendedKeyUsage=serverAuth",
      ],
      { stdio: "pipe" },
    );
    writeFileSync(sanPath, san);
  }
  return { key: readFileSync(keyPath, "utf8"), cert: readFileSync(certPath, "utf8") };
}
