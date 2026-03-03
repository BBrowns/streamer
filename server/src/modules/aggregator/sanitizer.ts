import { logger } from '../../config/logger.js';

/** Allowed URL protocols for add-on stream/image URLs */
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'magnet:']);

/** Protocols that are always dangerous and must be blocked */
const BLOCKED_PROTOCOLS = new Set(['javascript:', 'vbscript:', 'data:']);

/** Maximum allowed length for text fields to prevent mega-string DoS */
const MAX_TEXT_LENGTH = 10_000;

/** Maximum allowed URL length */
const MAX_URL_LENGTH = 2_048;

/**
 * Decode HTML entities iteratively until no more remain.
 * Prevents double-encoding bypass attacks like `&amp;lt;script&amp;gt;`.
 */
function decodeHtmlEntities(input: string): string {
    let result = input;
    let previous = '';
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (result !== previous && iterations < MAX_ITERATIONS) {
        previous = result;
        result = result
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/&#(\d+);/g, (_match, code) =>
                String.fromCharCode(parseInt(code, 10))
            )
            .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
                String.fromCharCode(parseInt(hex, 16))
            );
        iterations++;
    }

    return result;
}

/**
 * Strip HTML tags to prevent XSS from untrusted add-on content.
 * Handles script/style blocks, event handlers, and nested tags.
 */
export function stripHtml(input: string): string {
    if (typeof input !== 'string') return '';

    // Truncate oversized strings early
    const truncated = input.length > MAX_TEXT_LENGTH
        ? input.slice(0, MAX_TEXT_LENGTH)
        : input;

    // Decode entities first to catch encoded payloads
    const decoded = decodeHtmlEntities(truncated);

    return decoded
        // Remove script blocks
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove style blocks
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        // Remove event handlers in remaining tags (onclick, onerror, etc.)
        .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\bon\w+\s*=\s*\S+/gi, '')
        // Remove all remaining HTML tags
        .replace(/<[^>]+>/g, '')
        .trim();
}

/**
 * Validate that a URL uses an allowed protocol.
 * Blocks javascript:, vbscript:, data: URIs, and excessively long URLs.
 */
export function isValidUrl(url: string): boolean {
    if (typeof url !== 'string' || url.length === 0) return false;
    if (url.length > MAX_URL_LENGTH) return false;

    // Trim and normalize
    const trimmed = url.trim();

    // Block protocol-less javascript/data injection
    const lower = trimmed.toLowerCase().replace(/\s/g, '');
    for (const blocked of BLOCKED_PROTOCOLS) {
        if (lower.startsWith(blocked)) return false;
    }

    try {
        // Magnet links don't parse as URLs with URL constructor
        if (trimmed.startsWith('magnet:')) return true;

        const parsed = new URL(trimmed);
        return ALLOWED_PROTOCOLS.has(parsed.protocol);
    } catch {
        return false;
    }
}

/** Sanitize a meta object from an add-on response */
export function sanitizeMeta<T extends Record<string, unknown>>(meta: T): T {
    const sanitized = { ...meta };

    for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string') {
            if (key === 'poster' || key === 'background' || key === 'logo') {
                // Validate URLs
                if (!isValidUrl(value)) {
                    (sanitized as Record<string, unknown>)[key] = undefined;
                    logger.debug({ key, url: value.slice(0, 100) }, 'Stripped invalid URL from add-on meta');
                }
            } else if (key === 'description' || key === 'name' || key === 'title') {
                // Strip HTML from text fields
                (sanitized as Record<string, unknown>)[key] = stripHtml(value);
            } else if (typeof value === 'string' && value.length > MAX_TEXT_LENGTH) {
                // Truncate any other oversized string field
                (sanitized as Record<string, unknown>)[key] = value.slice(0, MAX_TEXT_LENGTH);
                logger.debug({ key }, 'Truncated oversized string field from add-on meta');
            }
        }

        // Recursively sanitize nested arrays of strings
        if (Array.isArray(value)) {
            (sanitized as Record<string, unknown>)[key] = value.map((item) => {
                if (typeof item === 'string') return stripHtml(item);
                return item;
            });
        }
    }

    return sanitized;
}

/** Sanitize stream URLs */
export function sanitizeStreamUrl(url: string): string | null {
    if (!isValidUrl(url)) {
        logger.debug({ url: url.slice(0, 100) }, 'Stripped invalid stream URL');
        return null;
    }
    return url;
}

/** Sanitize an array of meta objects */
export function sanitizeMetas<T extends Record<string, unknown>>(metas: T[]): T[] {
    if (!Array.isArray(metas)) return [];
    return metas.map((m) => sanitizeMeta(m));
}
