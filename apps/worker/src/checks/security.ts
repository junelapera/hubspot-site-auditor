import { connect, type PeerCertificate, type SecureVersion } from "node:tls";
import { politeFetch } from "../http.js";

export type SecurityCheckId =
  | "https-redirect"
  | "hsts"
  | "tls-legacy"
  | "tls-cert-expiry"
  | "header-csp"
  | "header-x-frame-options"
  | "header-x-content-type-options"
  | "header-referrer-policy"
  | "header-permissions-policy"
  | "version-leak"
  // From the scanned pages (checks/page-security.ts):
  | "mixed-content"
  | "cookies";

export interface SecurityResult {
  id: SecurityCheckId;
  name: string;
  pass: boolean;
  current: string;
  recommended: string;
  fixLocation: string;
}

const ONE_YEAR = 31_536_000;
const CERT_WARN_DAYS = 30;
const TIMEOUT_MS = 15_000;

/** Passive checks only: reads what any browser sees, never sends attack traffic. */
export async function checkSecurity(siteHost: string): Promise<SecurityResult[]> {
  const res = await politeFetch(`https://${siteHost}/`, { redirect: "follow" });
  await res.body?.cancel();
  const h = res.headers;

  return [
    await checkHttpsRedirect(siteHost),
    checkHsts(h.get("strict-transport-security")),
    await checkLegacyTls(siteHost),
    await checkCertExpiry(siteHost),
    ...checkHeaders(h),
    checkVersionLeak(h),
  ];
}

async function checkHttpsRedirect(host: string): Promise<SecurityResult> {
  const base = {
    id: "https-redirect" as const,
    name: "HTTPS redirect",
    recommended: "HTTP redirects to HTTPS in a single 301 hop",
    fixLocation: "HubSpot domain settings",
  };
  try {
    const res = await politeFetch(`http://${host}/`, { redirect: "manual" });
    await res.body?.cancel();
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) {
      return { ...base, pass: false, current: `HTTP ${res.status}, no redirect` };
    }
    const target = new URL(location, `http://${host}/`);
    if (target.protocol !== "https:") {
      return { ...base, pass: false, current: `First hop goes to ${target.href} (not HTTPS)` };
    }
    // One hop must land on the canonical HTTPS URL, not on another redirect.
    const next = await politeFetch(target, { redirect: "manual" });
    await next.body?.cancel();
    const oneHop = next.status < 300 || next.status >= 400;
    return {
      ...base,
      pass: oneHop,
      current: oneHop
        ? `${res.status} → ${target.href}`
        : `${res.status} → ${target.href} → ${next.headers.get("location")} (${next.status}), more than one hop`,
    };
  } catch (err) {
    return { ...base, pass: false, current: `HTTP not reachable: ${(err as Error).message}` };
  }
}

function checkHsts(value: string | null): SecurityResult {
  const base = {
    id: "hsts" as const,
    name: "HSTS",
    recommended: `Strict-Transport-Security: max-age=${ONE_YEAR}; includeSubDomains`,
    fixLocation: "HubSpot domain settings or Cloudflare",
  };
  if (!value) return { ...base, pass: false, current: "Missing" };
  const maxAge = Number(/max-age=(\d+)/i.exec(value)?.[1] ?? 0);
  return { ...base, pass: maxAge >= ONE_YEAR, current: value };
}

async function checkLegacyTls(host: string): Promise<SecurityResult> {
  const legacy: [SecureVersion, string][] = [["TLSv1", "TLS 1.0"], ["TLSv1.1", "TLS 1.1"]];
  const accepted: string[] = [];
  for (const [version, label] of legacy) {
    if (await handshakes(host, version)) accepted.push(label);
  }
  return {
    id: "tls-legacy",
    name: "TLS versions",
    pass: accepted.length === 0,
    current: accepted.length ? `Accepts ${accepted.join(", ")}` : "TLS 1.0 and 1.1 rejected",
    recommended: "Only TLS 1.2 and 1.3 accepted",
    fixLocation: "HubSpot domain settings",
  };
}

function handshakes(host: string, version: SecureVersion): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({
      host,
      port: 443,
      servername: host,
      minVersion: version,
      maxVersion: version,
      // Let local OpenSSL offer legacy protocols so we test the server, not ourselves.
      ciphers: "DEFAULT@SECLEVEL=0",
      rejectUnauthorized: false,
      timeout: TIMEOUT_MS,
    });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("secureConnect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

async function checkCertExpiry(host: string): Promise<SecurityResult> {
  const base = {
    id: "tls-cert-expiry" as const,
    name: "Certificate expiry",
    recommended: `Expires more than ${CERT_WARN_DAYS} days from now`,
    fixLocation: "HubSpot domain settings",
  };
  try {
    const cert = await peerCertificate(host);
    const expires = new Date(cert.valid_to);
    const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000);
    return { ...base, pass: days > CERT_WARN_DAYS, current: `Expires ${expires.toISOString().slice(0, 10)} (${days} days)` };
  } catch (err) {
    return { ...base, pass: false, current: `Could not read certificate: ${(err as Error).message}` };
  }
}

function peerCertificate(host: string): Promise<PeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, timeout: TIMEOUT_MS });
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      resolve(cert);
    });
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Timed out"));
    });
  });
}

const HEADER_CHECKS: {
  id: SecurityCheckId;
  header: string;
  recommended: string;
  valid?: (v: string) => boolean;
}[] = [
  {
    id: "header-csp",
    header: "Content-Security-Policy",
    recommended: "A Content-Security-Policy with default-src / script-src suited to the site (start with Report-Only)",
    // A CSP with only upgrade-insecure-requests restricts nothing.
    valid: (v) => /(default|script)-src/i.test(v),
  },
  {
    id: "header-x-frame-options",
    header: "X-Frame-Options",
    recommended: "X-Frame-Options: SAMEORIGIN (or CSP frame-ancestors 'self')",
    valid: (v) => /^(deny|sameorigin)$/i.test(v.trim()),
  },
  {
    id: "header-x-content-type-options",
    header: "X-Content-Type-Options",
    recommended: "X-Content-Type-Options: nosniff",
    valid: (v) => v.trim().toLowerCase() === "nosniff",
  },
  {
    id: "header-referrer-policy",
    header: "Referrer-Policy",
    recommended: "Referrer-Policy: strict-origin-when-cross-origin",
    valid: (v) => !/unsafe-url/i.test(v),
  },
  {
    id: "header-permissions-policy",
    header: "Permissions-Policy",
    recommended: "Permissions-Policy: camera=(), microphone=(), geolocation=()",
  },
];

function checkHeaders(h: Headers): SecurityResult[] {
  return HEADER_CHECKS.map(({ id, header, recommended, valid }) => {
    const base = { id, name: header, recommended, fixLocation: "HubSpot domain settings or Cloudflare" };
    const value = h.get(header);
    // CSP frame-ancestors is the modern replacement for X-Frame-Options.
    if (id === "header-x-frame-options" && !value && /frame-ancestors/i.test(h.get("content-security-policy") ?? "")) {
      return { ...base, pass: true, current: "Set via CSP frame-ancestors" };
    }
    return { ...base, pass: value !== null && (valid?.(value) ?? true), current: value ?? "Missing" };
  });
}

function checkVersionLeak(h: Headers): SecurityResult {
  const leaks = ["server", "x-powered-by"]
    .map((name) => [name, h.get(name)] as const)
    .filter(([, v]) => v && /\d+\.\d+/.test(v));
  return {
    id: "version-leak",
    name: "Version leaks",
    pass: leaks.length === 0,
    current: leaks.length ? leaks.map(([n, v]) => `${n}: ${v}`).join("; ") : "No versions in Server / X-Powered-By",
    recommended: "Server and X-Powered-By without software versions",
    fixLocation: "Cloudflare or origin",
  };
}
