import { describe, it, expect, beforeEach } from 'vitest';
import { saveDefaultVoicing, getDefaultVoicing } from '../../helpers/chordPreferences.js';

const STORAGE_KEY = 'setlistSync_chordVoicingPreferences';

beforeEach(() => {
    localStorage.clear();
});

describe('getDefaultVoicing', () => {
    it('returns 0 when nothing is stored', () => {
        expect(getDefaultVoicing('song1', 'Am')).toBe(0);
    });

    it('returns 0 when songId is not in prefs', () => {
        saveDefaultVoicing('song1', 'G', 2);
        expect(getDefaultVoicing('song2', 'G')).toBe(0);
    });

    it('returns 0 when chord is not stored for that song', () => {
        saveDefaultVoicing('song1', 'Am', 1);
        expect(getDefaultVoicing('song1', 'G')).toBe(0);
    });
});

describe('saveDefaultVoicing', () => {
    it('persists a voicing index and retrieves it', () => {
        saveDefaultVoicing('song1', 'Am', 3);
        expect(getDefaultVoicing('song1', 'Am')).toBe(3);
    });

    it('stores independently per song', () => {
        saveDefaultVoicing('song1', 'G', 1);
        saveDefaultVoicing('song2', 'G', 2);
        expect(getDefaultVoicing('song1', 'G')).toBe(1);
        expect(getDefaultVoicing('song2', 'G')).toBe(2);
    });

    it('overwrites an existing preference', () => {
        saveDefaultVoicing('song1', 'Am', 1);
        saveDefaultVoicing('song1', 'Am', 4);
        expect(getDefaultVoicing('song1', 'Am')).toBe(4);
    });

    it('does nothing when songId is falsy', () => {
        saveDefaultVoicing('', 'Am', 2);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('stores multiple chords for the same song', () => {
        saveDefaultVoicing('song1', 'Am', 1);
        saveDefaultVoicing('song1', 'G', 2);
        expect(getDefaultVoicing('song1', 'Am')).toBe(1);
        expect(getDefaultVoicing('song1', 'G')).toBe(2);
    });
});
