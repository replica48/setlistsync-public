/**
 * @file offlineDataUtils.js
 * @description Utilities for handling offline data, including obfuscating sensitive values.
 */

/**
 * Encodes a timestamp to an obfuscated string.
 * @param {number} timestamp The timestamp (e.g., Date.now()).
 * @returns {string} An obfuscated string representation of the timestamp.
 */
export const encodeExpiration = (timestamp) => {
    // Convert to string, reverse it, then encode to Base64
    const reversed = String(timestamp).split('').reverse().join('');
    return btoa(reversed);
};

/**
 * Decodes an obfuscated string back into a timestamp.
 * @param {string} encodedString The obfuscated string from localStorage.
 * @returns {number | null} The original timestamp as a number, or null if decoding fails.
 */
export const decodeExpiration = (encodedString) => {
    try {
        // --- THIS IS THE FIX: Decode from Base64 and handle potential UTF-8 characters ---
        const binaryString = atob(encodedString);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }
        const reversed = new TextDecoder().decode(bytes);
        const timestampStr = reversed.split('').reverse().join('');
        return parseInt(timestampStr, 10);
    } catch (e) {
        console.error("Failed to decode expiration date:", e);
        return null; // Return null if the string is invalid
    }
};