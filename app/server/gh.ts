import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

export async function ghJson<T>(args: string[]): Promise<T> {
  const stdout = await gh(args);
  return (stdout ? JSON.parse(stdout) : null) as T;
}

export function isBot(login: string): boolean {
  const l = login.toLowerCase();
  return (
    l.endsWith("[bot]") ||
    l === "renovate" ||
    l === "dependabot" ||
    l === "github-actions[bot]" ||
    l === "github-actions"
  );
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function isStale(updatedAt: string): boolean {
  return Date.now() - Date.parse(updatedAt) >= STALE_MS;
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
