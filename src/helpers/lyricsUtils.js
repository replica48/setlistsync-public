/**
 * Checks if a lyricsChords string is effectively empty.
 * It handles null, empty strings, old JSON format, and new HTML format.
 * @param {string | null | undefined} lyricsChords The lyrics content from the song object.
 * @returns {boolean} True if the lyrics are considered empty, false otherwise.
 */
export const areLyricsEmpty = (lyricsChords) => {
    // Handles null, undefined, or an empty string
    if (!lyricsChords || lyricsChords.trim() === '') {
        return true;
    }

    try {
        // First, try to parse as JSON (for old format)
        const parsedJson = JSON.parse(lyricsChords);
        if (!parsedJson.root || !parsedJson.root.children || parsedJson.root.children.length === 0) return true;
        if (parsedJson.root.children.length === 1) {
            const firstChild = parsedJson.root.children[0];
            if (firstChild.type === 'paragraph' && (!firstChild.children || firstChild.children.length === 0)) return true;
        }
        return false; // JSON has content
    } catch (e) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(lyricsChords, 'text/html');
        return (doc.body.textContent || "").trim() === '';
    }
};