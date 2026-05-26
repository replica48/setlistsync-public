import React from 'react';

const CustomPianoDiagram = ({ notes = [], chordName }) => {
    // --- THIS IS THE FIX: Define layout for TWO octaves ---
    const octaves = [4, 5]; // Render octaves 4 and 5
    const whiteKeyNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const blackKeyMapping = { C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#' };

    const enharmonicMap = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    const pressedNotes = new Set(notes.map(n => {
        if (!n) return null; // Guard against null/undefined notes

        // Separate the note name from the octave number.
        const firstDigitIndex = n.search(/\d/);
        if (firstDigitIndex === -1) return null; // Invalid note format (e.g., no octave)

        const noteName = n.substring(0, firstDigitIndex);
        const octave = parseInt(n.substring(firstDigitIndex), 10); // Keep octave for the key
        const normalizedName = enharmonicMap[noteName] || noteName;
        return `${normalizedName}${octave}`;
    }));

    const keyWidth = 12;
    const keyHeight = 60;
    const blackKeyWidth = 7;
    const blackKeyHeight = 38;
    const totalWhiteKeys = whiteKeyNotes.length * octaves.length;
    const textHeight = 20; // Extra space for the title
    const yOffset = textHeight;

    return (
        <svg
            viewBox={`0 0 ${totalWhiteKeys * keyWidth} ${keyHeight + textHeight}`}
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
        >
            {/* --- Chord Name Title --- */}
            <text
                x={(totalWhiteKeys * keyWidth) / 2}
                y={textHeight / 1.5} 
                fontFamily="system-ui, sans-serif"
                fontSize="10"
                textAnchor="middle"
                fill="#1F2937"
            >
                {chordName}
            </text>

            {/* --- Render White Keys --- */}
            {octaves.flatMap((octave, octaveIndex) =>
                whiteKeyNotes.map((note, noteIndex) => {
                    const fullNote = `${note}${octave}`;
                    const isPressed = pressedNotes.has(fullNote);

                    const xPos = (octaveIndex * whiteKeyNotes.length + noteIndex) * keyWidth;
                    return (
                        <rect
                            key={fullNote}
                            x={xPos}
                            y={yOffset}
                            width={keyWidth}
                            height={keyHeight}
                            fill={isPressed ? '#60A5FA' : '#FFFFFF'} // Blue when pressed
                            stroke={isPressed ? '#075985' : '#6B7280'} // Darker blue border when pressed
                            strokeWidth={isPressed ? '0.75' : '0.5'} // Thicker border when pressed
                        />
                    );
                })
            )}

            {/* --- Render Black Keys --- */}
            {octaves.flatMap((octave, octaveIndex) =>
                whiteKeyNotes.map((note, noteIndex) => {
                    if (!blackKeyMapping[note]) return null;
                    const blackNote = `${blackKeyMapping[note]}${octave}`;
                    const isPressed = pressedNotes.has(blackNote);
                    const xPos = (octaveIndex * whiteKeyNotes.length + noteIndex) * keyWidth + (keyWidth - blackKeyWidth / 2);
                    return (
                        <rect
                            key={blackNote}
                            x={xPos}
                            y={yOffset}
                            width={blackKeyWidth}
                            height={blackKeyHeight}
                            fill={isPressed ? '#60A5FA' : '#1F2937'} // Blue when pressed
                            stroke={isPressed ? '#075985' : '#1F2937'} // Add darker blue border only when pressed
                            strokeWidth={isPressed ? '0.75' : '1'} // Add thicker border only when pressed
                        />
                    );
                })
            )}
        </svg>
    );
};

export default CustomPianoDiagram;