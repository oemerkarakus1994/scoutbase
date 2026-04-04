export function extractBalancedJson(source, startIndex) {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index])) {
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
    const char = source[cursor];

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
          value: JSON.parse(raw),
        };
      }
    }
  }

  throw new Error(`Could not parse JSON payload starting at index ${startIndex}`);
}

export function extractAllAppPreloads(html) {
  const marker = "SG.container.appPreloads['";
  const result = {};
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
        /** ÖFB dupliziert dieselbe Preload-ID (z. B. leeres `{}` nach großem Payload). */
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

export function findFirstPreload(preloads, predicate) {
  for (const [preloadId, value] of Object.entries(preloads)) {
    if (predicate(value)) {
      return { preloadId, value };
    }
  }
  return null;
}
