/**
 * tool-runner.ts
 *
 * Spawn-based executor for external recon binaries (subfinder, amass, sublist3r).
 * Each runner:
 *   1. Checks whether the binary is on PATH before attempting to spawn.
 *   2. Streams stdout line-by-line, parsing each tool's output format.
 *   3. Returns ToolRunResult — always resolves, never rejects. If the tool is
 *      absent or crashes, `available` is false and `subdomains` is empty.
 *
 * This lets the main route use all tools in parallel via Promise.allSettled and
 * gracefully include whichever ones happen to be installed.
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export interface ToolRunResult {
  tool: "subfinder" | "amass" | "sublist3r";
  available: boolean;
  subdomains: string[];   // bare FQDNs, lowercased, deduped
  elapsedMs: number;
  error?: string;
}

// ── Binary resolution ──────────────────────────────────────────────────────
// Looks for the binary in (priority order):
//   1. The project's own bin/ directory (repo root/bin/<name>[.exe])
//   2. System PATH (via `where` / `which`)

const REPO_BIN_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../bin",   // dist/ → api-server/ → artifacts/ → repo root → bin/
);

function localBinPath(name: string): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  return path.join(REPO_BIN_DIR, exe);
}

const resolvedBinCache = new Map<string, string | null>();

async function resolveBinary(name: string): Promise<string | null> {
  if (resolvedBinCache.has(name)) return resolvedBinCache.get(name)!;

  // 1. Check project bin/ directory first
  const local = localBinPath(name);
  if (existsSync(local)) {
    logger.info({ name, path: local }, "tool-runner: found binary in project bin/");
    resolvedBinCache.set(name, local);
    return local;
  }

  // 2. Fall back to system PATH
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(cmd, [name], { timeout: 3000 });
    const found = stdout.trim().split("\n")[0].trim();
    logger.info({ name, path: found }, "tool-runner: found binary on PATH");
    resolvedBinCache.set(name, found);
    return found;
  } catch {
    logger.warn({ name }, "tool-runner: binary not found in bin/ or PATH");
    resolvedBinCache.set(name, null);
    return null;
  }
}

async function isBinaryAvailable(name: string): Promise<boolean> {
  return (await resolveBinary(name)) !== null;
}

// ── Generic line-reader helper ─────────────────────────────────────────────

function runAndCollectLines(
  bin: string,
  args: string[],
  timeoutMs: number,
  filterFn: (line: string) => string | null,
): Promise<string[]> {
  return new Promise((resolve) => {
    const found = new Set<string>();
    let timedOut = false;

    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      // Don't inherit the parent env — pass only what's needed
      env: { PATH: process.env.PATH ?? "" },
    });

    const rl = createInterface({ input: child.stdout! });
    rl.on("line", (line) => {
      const sub = filterFn(line.trim());
      if (sub) found.add(sub.toLowerCase());
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      if (timedOut) {
        logger.warn({ bin }, "tool-runner: binary timed out and was killed");
      }
      resolve([...found]);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      logger.warn({ bin, err: err.message }, "tool-runner: spawn error");
      resolve([]);
    });
  });
}

// ── Subfinder ──────────────────────────────────────────────────────────────
// Install: go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
// Output format (default -silent): one FQDN per line, e.g. "api.example.com"
//
// Flags used:
//   -d <domain>    target domain
//   -silent        suppress banner, only print subdomains
//   -timeout 30    per-source timeout in seconds
//   -max-time 90   hard cap for the entire run

export async function runSubfinder(domain: string): Promise<ToolRunResult> {
  const start = Date.now();
  const tool = "subfinder" as const;

  const binPath = await resolveBinary("subfinder");
  if (!binPath) {
    return { tool, available: false, subdomains: [], elapsedMs: Date.now() - start };
  }

  try {
    const subdomains = await runAndCollectLines(
      binPath,
      ["-d", domain, "-silent", "-timeout", "30", "-max-time", "90"],
      100_000,
      (line) => {
        if (!line || line.startsWith("[") || line.startsWith(" ")) return null;
        const fqdn = line.toLowerCase().trim();
        if (fqdn.endsWith(`.${domain}`) || fqdn === domain) return fqdn;
        return null;
      },
    );

    logger.info({ tool, domain, count: subdomains.length }, "tool-runner: subfinder complete");
    return { tool, available: true, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { tool, available: true, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── Amass ──────────────────────────────────────────────────────────────────
// Install: go install -v github.com/owasp-amass/amass/v4/...@master
//          OR: brew install amass
// Output format with -json: JSON objects, one per line:
//   {"name":"sub.example.com","domain":"example.com","addresses":[...],"tag":"cert","source":"CertSpotter"}
//
// Flags used:
//   enum          passive enumeration subcommand
//   -passive      no active brute-force / zone transfer (safer, faster)
//   -d <domain>   target domain
//   -json -       write JSON to stdout

export async function runAmass(domain: string): Promise<ToolRunResult> {
  const start = Date.now();
  const tool = "amass" as const;

  const binPath = await resolveBinary("amass");
  if (!binPath) {
    return { tool, available: false, subdomains: [], elapsedMs: Date.now() - start };
  }

  try {
    const subdomains = await runAndCollectLines(
      binPath,
      ["enum", "-passive", "-d", domain, "-json", "-"],
      180_000,
      (line) => {
        if (!line) return null;
        try {
          const obj = JSON.parse(line) as { name?: string };
          const fqdn = obj.name?.toLowerCase().trim();
          if (fqdn && (fqdn.endsWith(`.${domain}`) || fqdn === domain)) return fqdn;
        } catch { /* progress lines */ }
        return null;
      },
    );

    logger.info({ tool, domain, count: subdomains.length }, "tool-runner: amass complete");
    return { tool, available: true, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { tool, available: true, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── Sublist3r ──────────────────────────────────────────────────────────────
// Install: pip install sublist3r  OR  git clone + python sublist3r.py
// Output format: one FQDN per line (interleaved with progress messages).
//
// Flags used:
//   -d <domain>   target domain
//   -o /dev/stdout (or stdout directly)
//   -t 10         threads
//   -v            verbose — subdomains printed as discovered
//
// Because Sublist3r mixes progress output with results we filter aggressively:
// only lines that end with the base domain and look like FQDNs.

export async function runSublist3r(domain: string): Promise<ToolRunResult> {
  const start = Date.now();
  const tool = "sublist3r" as const;

  // Try the installed `sublist3r` command first, then fall back to the
  // project bin/ directory path, then skip.
  const binPath = await resolveBinary("sublist3r");
  if (!binPath) {
    return { tool, available: false, subdomains: [], elapsedMs: Date.now() - start };
  }

  try {
    const fqdnRe = /^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$/;
    const subdomains = await runAndCollectLines(
      binPath,
      ["-d", domain, "-t", "10", "-v"],
      120_000,
      (line) => {
        const fqdn = line.toLowerCase().trim();
        if (!fqdn.endsWith(`.${domain}`) && fqdn !== domain) return null;
        if (!fqdnRe.test(fqdn)) return null;
        return fqdn;
      },
    );

    logger.info({ tool, domain, count: subdomains.length }, "tool-runner: sublist3r complete");
    return { tool, available: true, subdomains, elapsedMs: Date.now() - start };
  } catch (err: any) {
    return { tool, available: true, subdomains: [], elapsedMs: Date.now() - start, error: err.message };
  }
}

// ── Convenience: run all tools in parallel ─────────────────────────────────

export async function runAllTools(domain: string): Promise<ToolRunResult[]> {
  const results = await Promise.allSettled([
    runSubfinder(domain),
    runAmass(domain),
    runSublist3r(domain),
  ]);

  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { tool: "subfinder" as const, available: false, subdomains: [], elapsedMs: 0, error: String(r.reason) },
  );
}
