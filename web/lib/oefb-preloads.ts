/**
 * ÖFB vereine.oefb.at Seiten liefern Daten in `SG.container.appPreloads['…'] = …`
 * (gleiche Logik wie `scripts/lib/oefb-preloads.mjs`).
 */

export function extractBalancedJson(
  source: string,
  startIndex: number,
): { endIndex: number; value: unknown } {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index]!)) {
    index += 1;
  }

  const opener = source[index];
  const closer = opener === "[" ? "]" : opener === "{" ? "}" : null;
  if (!closer) {
    throw new Error(`Expected JSON value at index ${startIndex}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor]!;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        const raw = source.slice(index, cursor + 1);
        return {
          endIndex: cursor + 1,
          value: JSON.parse(raw) as unknown,
        };
      }
    }
  }

  throw new Error(`Could not parse JSON payload starting at index ${startIndex}`);
}

export function extractAllAppPreloads(html: string): Record<string, unknown> {
  const marker = "SG.container.appPreloads['";
  const result: Record<string, unknown> = {};
  let startIndex = 0;

  while (startIndex < html.length) {
    const markerIndex = html.indexOf(marker, startIndex);
    if (markerIndex === -1) {
      break;
    }

    const idStart = markerIndex + marker.length;
    const idEnd = html.indexOf("']", idStart);
    if (idEnd === -1) {
      break;
    }

    const preloadId = html.slice(idStart, idEnd);
    const equalsIndex = html.indexOf("=", idEnd);
    if (equalsIndex === -1) {
      break;
    }

    try {
      const { endIndex, value } = extractBalancedJson(html, equalsIndex + 1);
      const prev = result[preloadId];
      if (prev != null) {
        const lenP = JSON.stringify(prev).length;
        const lenV = JSON.stringify(value).length;
        if (lenV <= lenP) {
          startIndex = endIndex;
          continue;
        }
      }
      result[preloadId] = value;
      startIndex = endIndex;
    } catch {
      startIndex = idEnd + 2;
    }
  }

  return result;
}
