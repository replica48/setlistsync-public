/**
 * @file chordPreferences.js
 * @description Manages user preferences for default chord voicings on a per-song basis using localStorage.
 */

const STORAGE_KEY = 'setlistSync_chordVoicingPreferences';

/**
 * Retrieves the entire preferences object from localStorage.
 * @returns {Object} An object where keys are chord names (e.g., "Am") and values are the preferred voicing index.
 */ 
const getPreferences = () => {
    try {
        const prefs = localStorage.getItem(STORAGE_KEY);
        return prefs ? JSON.parse(prefs) : {};
    } catch (e) {
        console.error("Could not read chord preferences from localStorage", e);
        return {};
    }
};

/**
 * Saves a default voicing index for a specific chord.
 * @param {string} songId - The ID of the song for which to save the preference.
 * @param {string} chordKey - The name of the chord (e.g., "Am", "G/B").
 * @param {number} voicingIndex - The index of the preferred voicing.
 */
export const saveDefaultVoicing = (songId, chordKey, voicingIndex) => {
    if (!songId) return;
    const prefs = getPreferences();
    if (!prefs[songId]) {
        prefs[songId] = {};
    }
    prefs[songId][chordKey] = voicingIndex;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
};

/**
 * Gets the saved default voicing index for a specific chord.
 * @param {string} songId - The ID of the song to check for a preference.
 * @param {string} chordKey - The name of the chord.
 * @returns {number} The saved index, or 0 if none is found.
 */
export const getDefaultVoicing = (songId, chordKey) => {
    const prefs = getPreferences();
    return prefs[songId]?.[chordKey] ?? 0;
};