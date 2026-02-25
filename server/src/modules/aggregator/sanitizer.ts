import { logger } from '../../config/logger.js';

/** Allowed URL protocols for add-on stream/image URLs */
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'magnet:'];

/** Strip HTML tags to prevent XSS from untrusted add-on content */
export function stripHtml(input: string): string {
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .trim();
}

/** Validate that a URL uses an allowed protocol */
export function isValidUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return ALLOWED_PROTOCOLS.includes(parsed.protocol);
    } catch {
        return false;
    }
}

/** Sanitize a meta object from an add-on response */
export function sanitizeMeta<T extends Record<string, unknown>>(meta: T): T {
    const sanitized = { ...meta };

    // Sanitize string fields
    for (const [key, value] of Object.entries(sanitized)) {
        if (typeof value === 'string') {
            if (key === 'poster' || key === 'background' || key === 'logo') {
                // Validate URLs
                if (!isValidUrl(value)) {
                    (sanitized as Record<string, unknown>)[key] = undefined;
                    logger.debug({ key, value }, 'Stripped invalid URL from add-on meta');
                }
            } else if (key === 'description' || key === 'name' || key === 'title') {
                // Strip HTML from text fields
                (sanitized as Record<string, unknown>)[key] = stripHtml(value);
            }
        }
    }

    return sanitized;
}

/** Sanitize stream URLs */
export function sanitizeStreamUrl(url: string): string | null {
    if (!isValidUrl(url)) {
        logger.debug({ url }, 'Stripped invalid stream URL');
        return null;
    }
    return url;
}

/** Sanitize an array of meta objects */
export function sanitizeMetas<T extends Record<string, unknown>>(metas: T[]): T[] {
    return metas.map((m) => sanitizeMeta(m));
}
