const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function isWhitespace(value: string | undefined) {
  if (!value) return false;
  return value === " " || value === "\n" || value === "\r" || value === "\t";
}

function decodeEntity(value: string) {
  const named = NAMED_ENTITIES[value.toLowerCase()];
  if (named !== undefined) return named;

  if (value.startsWith("#x") || value.startsWith("#X")) {
    const codePoint = Number.parseInt(value.slice(2), 16);
    if (
      Number.isInteger(codePoint) &&
      codePoint >= 0 &&
      codePoint <= 0x10ffff
    ) {
      return String.fromCodePoint(codePoint);
    }
  }

  if (value.startsWith("#")) {
    const codePoint = Number.parseInt(value.slice(1), 10);
    if (
      Number.isInteger(codePoint) &&
      codePoint >= 0 &&
      codePoint <= 0x10ffff
    ) {
      return String.fromCodePoint(codePoint);
    }
  }

  return null;
}

function decodeHtmlEntitiesOnce(input: string) {
  const result: string[] = [];
  let index = 0;

  while (index < input.length) {
    if (input[index] !== "&") {
      result.push(input[index]);
      index += 1;
      continue;
    }

    const end = input.indexOf(";", index + 1);
    if (end < 0 || end - index > 16) {
      result.push("&");
      index += 1;
      continue;
    }

    const decoded = decodeEntity(input.slice(index + 1, end));
    if (decoded === null) {
      result.push(input.slice(index, end + 1));
    } else {
      result.push(decoded);
    }
    index = end + 1;
  }

  return result.join("");
}

/** Decode a bounded number of entity layers before markup is inspected. */
export function decodeHtmlEntities(input: string, maxPasses = 5) {
  let result = input;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const decoded = decodeHtmlEntitiesOnce(result);
    if (decoded === result) break;
    result = decoded;
  }
  return result;
}

function findTagEnd(input: string, start: number) {
  let quote: string | null = null;
  for (let index = start; index < input.length; index += 1) {
    const character = input[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function readTagName(rawTag: string) {
  let index = 0;
  while (isWhitespace(rawTag[index])) index += 1;
  if (rawTag[index] === "/") index += 1;
  while (isWhitespace(rawTag[index])) index += 1;
  if (rawTag[index] === "!" || rawTag[index] === "?") return "";

  const start = index;
  while (index < rawTag.length) {
    const code = rawTag.charCodeAt(index);
    const isNameCharacter =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    if (!isNameCharacter) break;
    index += 1;
  }
  return rawTag.slice(start, index).toLowerCase();
}

function findClosingTag(input: string, start: number, tagName: string) {
  const lowerInput = input.toLowerCase();
  const needle = `</${tagName}`;
  let candidate = lowerInput.indexOf(needle, start);

  while (candidate >= 0) {
    const afterName = lowerInput[candidate + needle.length];
    if (afterName === ">" || afterName === "/" || isWhitespace(afterName)) {
      const end = findTagEnd(input, candidate + needle.length);
      if (end >= 0) return { start: candidate, end };
    }
    candidate = lowerInput.indexOf(needle, candidate + needle.length);
  }

  return null;
}

export interface StripMarkupOptions {
  preserveBreaks?: boolean;
  removeRawTextContent?: boolean;
}

/** Remove tags with a small quote-aware tokenizer instead of HTML regexes. */
export function stripMarkup(input: string, options: StripMarkupOptions = {}) {
  const result: string[] = [];
  let index = 0;

  while (index < input.length) {
    const tagStart = input.indexOf("<", index);
    if (tagStart < 0) {
      result.push(input.slice(index));
      break;
    }

    result.push(input.slice(index, tagStart));
    const tagEnd = findTagEnd(input, tagStart + 1);
    if (tagEnd < 0) {
      result.push(input.slice(tagStart));
      break;
    }

    const rawTag = input.slice(tagStart + 1, tagEnd);
    const normalizedTag = rawTag.trim();
    const isClosing = normalizedTag.startsWith("/");
    const isSelfClosing = normalizedTag.endsWith("/");
    const tagName = readTagName(rawTag);

    if (options.preserveBreaks && !isClosing && tagName === "br") {
      result.push("\n");
    }

    if (
      options.removeRawTextContent &&
      !isClosing &&
      !isSelfClosing &&
      (tagName === "script" || tagName === "style")
    ) {
      const closingTag = findClosingTag(input, tagEnd + 1, tagName);
      if (closingTag === null) break;
      index = closingTag.end + 1;
      continue;
    }

    index = tagEnd + 1;
  }

  return result.join("");
}

function removeSubtitleOverrides(input: string) {
  const result: string[] = [];
  let index = 0;

  while (index < input.length) {
    if (input[index] === "{" && input[index + 1] === "\\") {
      const end = input.indexOf("}", index + 2);
      if (end >= 0) {
        index = end + 1;
        continue;
      }
    }
    result.push(input[index]);
    index += 1;
  }

  return result.join("");
}

/** Normalize subtitle text while removing markup and encoded markup payloads. */
export function stripSubtitleMarkup(input: string) {
  return stripMarkup(decodeHtmlEntities(removeSubtitleOverrides(input)), {
    preserveBreaks: true,
  });
}

/** Validate a provider-controlled URL before handing it to browser navigation. */
export function validateExternalNavigationUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
