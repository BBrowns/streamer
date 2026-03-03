import { describe, it, expect } from 'vitest';
import { stripHtml, isValidUrl, sanitizeMeta, sanitizeStreamUrl } from '../src/modules/aggregator/sanitizer.js';

describe('stripHtml', () => {
    it('should strip basic HTML tags', () => {
        expect(stripHtml('<b>bold</b>')).toBe('bold');
        expect(stripHtml('<p>paragraph</p>')).toBe('paragraph');
    });

    it('should strip script blocks', () => {
        expect(stripHtml('<script>alert("xss")</script>safe')).toBe('safe');
        expect(stripHtml('before<script type="text/javascript">malicious()</script>after')).toBe('beforeafter');
    });

    it('should strip style blocks', () => {
        expect(stripHtml('<style>.x{color:red}</style>content')).toBe('content');
    });

    it('should strip event handlers', () => {
        expect(stripHtml('<div onclick="alert(1)">click</div>')).toBe('click');
        expect(stripHtml('<img onerror="alert(1)" src="x">')).toBe('');
        expect(stripHtml('<a onmouseover="hack()">link</a>')).toBe('link');
    });

    it('should handle nested tags', () => {
        expect(stripHtml('<div><p><span>nested</span></p></div>')).toBe('nested');
    });

    it('should handle double-encoded entities (bypass attack)', () => {
        // The sanitizer decodes entities, then strips the resulting <script> block AND its content
        expect(stripHtml('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;')).toBe('');
    });

    it('should handle HTML entity encoded payloads', () => {
        // Encoded <script> block is decoded then fully stripped (content included)
        expect(stripHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('');
    });

    it('should strip numeric character references', () => {
        // Numeric refs &#60; = < etc. — decoded, then script block fully stripped
        expect(stripHtml('&#60;script&#62;alert(1)&#60;/script&#62;')).toBe('');
    });

    it('should truncate oversized strings', () => {
        const huge = 'A'.repeat(20_000);
        const result = stripHtml(huge);
        expect(result.length).toBe(10_000);
    });

    it('should handle empty and non-string inputs', () => {
        expect(stripHtml('')).toBe('');
        expect(stripHtml(null as unknown as string)).toBe('');
        expect(stripHtml(undefined as unknown as string)).toBe('');
        expect(stripHtml(42 as unknown as string)).toBe('');
    });

    it('should trim the result', () => {
        expect(stripHtml('  <b>text</b>  ')).toBe('text');
    });

    it('should handle SVG payloads', () => {
        expect(stripHtml('<svg onload="alert(1)"><circle/></svg>')).toBe('');
    });
});

describe('isValidUrl', () => {
    it('should accept valid HTTP/HTTPS URLs', () => {
        expect(isValidUrl('https://example.com/poster.jpg')).toBe(true);
        expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should accept magnet links', () => {
        expect(isValidUrl('magnet:?xt=urn:btih:abc123')).toBe(true);
    });

    it('should reject javascript: URLs', () => {
        expect(isValidUrl('javascript:alert(1)')).toBe(false);
        expect(isValidUrl('JAVASCRIPT:alert(1)')).toBe(false);
        expect(isValidUrl('java script:alert(1)')).toBe(false); // whitespace bypass
    });

    it('should reject data: URIs', () => {
        expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should reject vbscript: URLs', () => {
        expect(isValidUrl('vbscript:MsgBox("xss")')).toBe(false);
    });

    it('should reject empty and oversized URLs', () => {
        expect(isValidUrl('')).toBe(false);
        expect(isValidUrl('https://x.com/' + 'a'.repeat(3000))).toBe(false);
    });

    it('should reject non-string inputs', () => {
        expect(isValidUrl(null as unknown as string)).toBe(false);
        expect(isValidUrl(undefined as unknown as string)).toBe(false);
    });

    it('should reject FTP and other protocols', () => {
        expect(isValidUrl('ftp://example.com/file.zip')).toBe(false);
        expect(isValidUrl('file:///etc/passwd')).toBe(false);
    });
});

describe('sanitizeMeta', () => {
    it('should strip HTML from text fields', () => {
        const result = sanitizeMeta({
            name: '<b>Test Movie</b>',
            description: '<script>alert(1)</script>A good movie',
            title: 'Normal Title',
        });
        expect(result.name).toBe('Test Movie');
        expect(result.description).toBe('A good movie');
        expect(result.title).toBe('Normal Title');
    });

    it('should validate URL fields', () => {
        const result = sanitizeMeta({
            poster: 'javascript:alert(1)',
            background: 'https://example.com/bg.jpg',
        });
        expect(result.poster).toBeUndefined();
        expect(result.background).toBe('https://example.com/bg.jpg');
    });

    it('should truncate oversized non-text fields', () => {
        const result = sanitizeMeta({
            customField: 'x'.repeat(20_000),
        });
        expect((result.customField as string).length).toBe(10_000);
    });

    it('should sanitize arrays of strings', () => {
        const result = sanitizeMeta({
            genres: ['Action', '<script>hack</script>Thriller'],
        });
        // Script block AND content is stripped, leaving only 'Thriller'
        expect(result.genres).toEqual(['Action', 'Thriller']);
    });
});

describe('sanitizeStreamUrl', () => {
    it('should return valid URLs as-is', () => {
        expect(sanitizeStreamUrl('https://streams.example.com/video.m3u8')).toBe(
            'https://streams.example.com/video.m3u8',
        );
    });

    it('should return null for invalid URLs', () => {
        expect(sanitizeStreamUrl('javascript:alert(1)')).toBeNull();
        expect(sanitizeStreamUrl('')).toBeNull();
    });

    it('should accept magnet links', () => {
        expect(sanitizeStreamUrl('magnet:?xt=urn:btih:abc123')).toBe('magnet:?xt=urn:btih:abc123');
    });
});
