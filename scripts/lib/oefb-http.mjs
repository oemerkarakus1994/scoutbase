import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_HEADERS = {
  "accept-language": "de-AT,de;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

export async function fetchText(url) {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-fsSL",
        "--max-time",
        String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
        "-A",
        DEFAULT_HEADERS["user-agent"],
        "-H",
        `Accept-Language: ${DEFAULT_HEADERS["accept-language"]}`,
        url,
      ],
      {
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    return stdout;
  } catch (error) {
    throw new Error(`Request failed for ${url}: ${error.message}`);
  }
}
