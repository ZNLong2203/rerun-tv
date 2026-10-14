import { createPrivateKey, X509Certificate } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDevCert, subjectAltName } from "../src/devcert.js";

describe("dev certificate", () => {
  it("lists IPs and names once, localhost always", () => {
    expect(subjectAltName(["192.168.1.6", "rerun.local", "localhost"])).toBe("DNS:localhost,IP:192.168.1.6,DNS:rerun.local");
  });

  it("makes a certificate for the LAN address and reuses it", () => {
    const dir = mkdtempSync(join(tmpdir(), "rerun-cert-"));
    const first = ensureDevCert(dir, ["192.168.1.6"]);
    const x509 = new X509Certificate(first.cert);
    expect(x509.subjectAltName).toContain("IP Address:192.168.1.6");
    expect(x509.checkPrivateKey(createPrivateKey(first.key))).toBe(true);
    expect(ensureDevCert(dir, ["192.168.1.6"]).cert).toBe(first.cert);
    expect(ensureDevCert(dir, ["10.0.0.2"]).cert).not.toBe(first.cert);
  });
});
