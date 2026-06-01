import { describe, it, expect } from 'vitest';
import customChords from '../../helpers/customChords.js';

describe('customChords structure', () => {
    it('exports guitar and ukulele keys', () => {
        expect(customChords).toHaveProperty('guitar');
        expect(customChords).toHaveProperty('ukulele');
    });

    it('guitar chords object contains expected root keys', () => {
        const keys = Object.keys(customChords.guitar.chords);
        expect(keys).toContain('A');
        expect(keys).toContain('E');
        expect(keys).toContain('G');
    });

    it('guitar suffixes includes "5" (power chords)', () => {
        expect(customChords.guitar.suffixes).toContain('5');
    });

    it('each guitar chord entry has a positions array', () => {
        for (const [, entries] of Object.entries(customChords.guitar.chords)) {
            for (const entry of entries) {
                expect(Array.isArray(entry.positions)).toBe(true);
                expect(entry.positions.length).toBeGreaterThan(0);
            }
        }
    });

    it('each position has frets and fingers strings', () => {
        for (const [, entries] of Object.entries(customChords.guitar.chords)) {
            for (const entry of entries) {
                for (const pos of entry.positions) {
                    expect(typeof pos.frets).toBe('string');
                    expect(typeof pos.fingers).toBe('string');
                }
            }
        }
    });

    it('ukulele chords is empty by default', () => {
        expect(Object.keys(customChords.ukulele.chords)).toHaveLength(0);
    });

    it('ukulele suffixes is empty by default', () => {
        expect(customChords.ukulele.suffixes).toHaveLength(0);
    });
});
