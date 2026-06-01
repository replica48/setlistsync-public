import { describe, it, expect } from 'vitest';
import { areLyricsEmpty } from '../../helpers/lyricsUtils.js';

describe('areLyricsEmpty', () => {
    it('returns true for null', () => {
        expect(areLyricsEmpty(null)).toBe(true);
    });

    it('returns true for undefined', () => {
        expect(areLyricsEmpty(undefined)).toBe(true);
    });

    it('returns true for empty string', () => {
        expect(areLyricsEmpty('')).toBe(true);
    });

    it('returns true for whitespace-only string', () => {
        expect(areLyricsEmpty('   ')).toBe(true);
    });

    describe('JSON (old Lexical) format', () => {
        it('returns true for JSON with no root children', () => {
            const json = JSON.stringify({ root: { children: [] } });
            expect(areLyricsEmpty(json)).toBe(true);
        });

        it('returns true for JSON with missing root.children', () => {
            const json = JSON.stringify({ root: {} });
            expect(areLyricsEmpty(json)).toBe(true);
        });

        it('returns true for JSON with a single empty paragraph', () => {
            const json = JSON.stringify({
                root: { children: [{ type: 'paragraph', children: [] }] },
            });
            expect(areLyricsEmpty(json)).toBe(true);
        });

        it('returns false for JSON with a single paragraph that has text', () => {
            const json = JSON.stringify({
                root: { children: [{ type: 'paragraph', children: [{ text: 'verse 1' }] }] },
            });
            expect(areLyricsEmpty(json)).toBe(false);
        });

        it('returns false for JSON with multiple children', () => {
            const json = JSON.stringify({
                root: { children: [{ type: 'paragraph' }, { type: 'paragraph' }] },
            });
            expect(areLyricsEmpty(json)).toBe(false);
        });
    });

    describe('HTML (new) format', () => {
        it('returns true for HTML with only whitespace text', () => {
            expect(areLyricsEmpty('<p>   </p>')).toBe(true);
        });

        it('returns true for empty HTML tags', () => {
            expect(areLyricsEmpty('<p></p><br>')).toBe(true);
        });

        it('returns false for HTML with real text content', () => {
            expect(areLyricsEmpty('<p>Hello world</p>')).toBe(false);
        });

        it('returns false for HTML with nested text', () => {
            expect(areLyricsEmpty('<div><span>Verse 1</span></div>')).toBe(false);
        });
    });
});
