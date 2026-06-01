import { describe, it, expect } from 'vitest';
import { encodeExpiration, decodeExpiration } from '../../helpers/offlineDataUtils.js';

describe('encodeExpiration / decodeExpiration', () => {
    it('round-trips a timestamp back to the original value', () => {
        const ts = Date.now();
        expect(decodeExpiration(encodeExpiration(ts))).toBe(ts);
    });

    it('produces a valid base64 string (no spaces, valid charset)', () => {
        const encoded = encodeExpiration(1700000000000);
        expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('encodeExpiration returns a non-empty string', () => {
        expect(encodeExpiration(Date.now()).length).toBeGreaterThan(0);
    });

    it('decodeExpiration returns null for a garbage string', () => {
        expect(decodeExpiration('not-valid-base64!!!')).toBeNull();
    });

    it('decodeExpiration returns a non-numeric value for an empty string', () => {
        // atob('') succeeds but parseInt of the reversed empty string is NaN
        expect(decodeExpiration('')).toBeNaN();
    });

    it('different timestamps produce different encoded strings', () => {
        const a = encodeExpiration(1700000000000);
        const b = encodeExpiration(1700000000001);
        expect(a).not.toBe(b);
    });
});
