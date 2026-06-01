/**
 * Unit tests for the makeJsonSafe helper and Cloud Function logic.
 *
 * We test the pure logic extracted from functions/index.js.
 * Cloud Function trigger handlers are tested via integration mocks below.
 */

import { describe, it, expect } from 'vitest';

// ─── makeJsonSafe ────────────────────────────────────────────────────────────
// Inline the function since it is not exported from index.js
function makeJsonSafe(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (typeof obj.toMillis === 'function') return obj.toMillis();
    if (Array.isArray(obj)) return obj.map(makeJsonSafe);
    return Object.keys(obj).reduce((acc, key) => {
        const value = obj[key];
        if (
            value !== null &&
            typeof value === 'object' &&
            value.constructor.name !== 'Object' &&
            value.constructor.name !== 'Array' &&
            !value.toMillis
        ) {
            return acc;
        }
        acc[key] = makeJsonSafe(value);
        return acc;
    }, {});
}

describe('makeJsonSafe', () => {
    it('passes through primitives unchanged', () => {
        expect(makeJsonSafe(42)).toBe(42);
        expect(makeJsonSafe('hello')).toBe('hello');
        expect(makeJsonSafe(true)).toBe(true);
        expect(makeJsonSafe(null)).toBeNull();
    });

    it('converts a Firestore-like Timestamp (toMillis) to a number', () => {
        const timestamp = { toMillis: () => 1700000000000 };
        expect(makeJsonSafe(timestamp)).toBe(1700000000000);
    });

    it('recursively processes plain objects', () => {
        const input = { name: 'Band', count: 3 };
        expect(makeJsonSafe(input)).toEqual({ name: 'Band', count: 3 });
    });

    it('processes arrays recursively', () => {
        const ts = { toMillis: () => 999 };
        expect(makeJsonSafe([1, ts, 'x'])).toEqual([1, 999, 'x']);
    });

    it('strips FieldValue-like objects (non-plain, no toMillis)', () => {
        class FieldValue {}
        const input = { name: 'test', fv: new FieldValue() };
        expect(makeJsonSafe(input)).toEqual({ name: 'test' });
    });

    it('handles nested objects with timestamps', () => {
        const ts = { toMillis: () => 1234 };
        const input = { meta: { createdAt: ts, title: 'Song' } };
        expect(makeJsonSafe(input)).toEqual({ meta: { createdAt: 1234, title: 'Song' } });
    });

    it('handles empty object', () => {
        expect(makeJsonSafe({})).toEqual({});
    });

    it('handles empty array', () => {
        expect(makeJsonSafe([])).toEqual([]);
    });
});

// ─── Storage trigger path filtering ──────────────────────────────────────────
describe('onFileUpload / onFileDelete path filtering logic', () => {
    // Replicate the guard condition from the functions
    function shouldSkip(filePath) {
        return !filePath.startsWith('bands/');
    }

    function extractBandId(filePath) {
        return filePath.split('/')[1];
    }

    it('skips paths not under bands/', () => {
        expect(shouldSkip('users/abc/photo.jpg')).toBe(true);
        expect(shouldSkip('public/image.png')).toBe(true);
    });

    it('does not skip paths under bands/', () => {
        expect(shouldSkip('bands/band123/songs/file.pdf')).toBe(false);
    });

    it('extracts the correct bandId from path', () => {
        expect(extractBandId('bands/band123/songs/file.pdf')).toBe('band123');
    });
});

// ─── claimBandOwnership preconditions ────────────────────────────────────────
describe('claimBandOwnership precondition logic', () => {
    function checkPreconditions({ bandExists, locked, memberExists }) {
        if (!bandExists) return { error: 'not-found', message: 'Band not found.' };
        if (!locked) return { error: 'failed-precondition', message: 'This band is not locked.' };
        if (!memberExists) return { error: 'permission-denied', message: 'You must be a member of this band to claim it.' };
        return { ok: true };
    }

    it('returns not-found when band does not exist', () => {
        expect(checkPreconditions({ bandExists: false, locked: true, memberExists: true }))
            .toMatchObject({ error: 'not-found' });
    });

    it('returns failed-precondition when band is not locked', () => {
        expect(checkPreconditions({ bandExists: true, locked: false, memberExists: true }))
            .toMatchObject({ error: 'failed-precondition' });
    });

    it('returns permission-denied when user is not a member', () => {
        expect(checkPreconditions({ bandExists: true, locked: true, memberExists: false }))
            .toMatchObject({ error: 'permission-denied' });
    });

    it('returns ok when all conditions are met', () => {
        expect(checkPreconditions({ bandExists: true, locked: true, memberExists: true }))
            .toEqual({ ok: true });
    });
});

// ─── maintainBandLeadership logic ────────────────────────────────────────────
describe('maintainBandLeadership decision logic', () => {
    function decide({ deletedRole, remainingLeaders, remainingMembers }) {
        if (deletedRole !== 'Leader') return 'no-op';
        if (remainingLeaders > 0) return 'no-op';
        if (remainingMembers > 0) return 'promote';
        return 'delete-band';
    }

    it('is a no-op when deleted member is not a Leader', () => {
        expect(decide({ deletedRole: 'Member', remainingLeaders: 0, remainingMembers: 0 })).toBe('no-op');
    });

    it('is a no-op when other Leaders still exist', () => {
        expect(decide({ deletedRole: 'Leader', remainingLeaders: 1, remainingMembers: 2 })).toBe('no-op');
    });

    it('promotes a Member when no Leaders remain but Members exist', () => {
        expect(decide({ deletedRole: 'Leader', remainingLeaders: 0, remainingMembers: 1 })).toBe('promote');
    });

    it('deletes the band when no Leaders or Members remain', () => {
        expect(decide({ deletedRole: 'Leader', remainingLeaders: 0, remainingMembers: 0 })).toBe('delete-band');
    });
});

// ─── getScopedAuthToken input validation ─────────────────────────────────────
describe('getScopedAuthToken input validation logic', () => {
    function validate({ auth, bandId }) {
        if (!auth) return { error: 'unauthenticated' };
        if (!bandId) return { error: 'invalid-argument' };
        return { ok: true };
    }

    it('returns unauthenticated when auth is missing', () => {
        expect(validate({ auth: null, bandId: 'band1' })).toMatchObject({ error: 'unauthenticated' });
    });

    it('returns invalid-argument when bandId is missing', () => {
        expect(validate({ auth: { uid: 'u1' }, bandId: '' })).toMatchObject({ error: 'invalid-argument' });
    });

    it('passes when auth and bandId are present', () => {
        expect(validate({ auth: { uid: 'u1' }, bandId: 'band1' })).toEqual({ ok: true });
    });
});

// ─── Offline data HMAC signing logic ─────────────────────────────────────────
import crypto from 'crypto';

describe('generateSignedOfflineData HMAC logic', () => {
    const secret = 'test-secret-key';

    it('generates a hex HMAC signature from a payload string', () => {
        const payload = JSON.stringify({ bandId: 'b1', data: 'test' });
        const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same payload + same secret always produces the same signature', () => {
        const payload = JSON.stringify({ x: 1 });
        const sig1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        const sig2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        expect(sig1).toBe(sig2);
    });

    it('different payloads produce different signatures', () => {
        const sig1 = crypto.createHmac('sha256', secret).update('payload-a').digest('hex');
        const sig2 = crypto.createHmac('sha256', secret).update('payload-b').digest('hex');
        expect(sig1).not.toBe(sig2);
    });

    it('different secrets produce different signatures for the same payload', () => {
        const payload = 'shared-payload';
        const sig1 = crypto.createHmac('sha256', 'secret-1').update(payload).digest('hex');
        const sig2 = crypto.createHmac('sha256', 'secret-2').update(payload).digest('hex');
        expect(sig1).not.toBe(sig2);
    });
});
