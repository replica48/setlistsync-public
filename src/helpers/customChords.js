// A supplemental database of chords not included in the default chords-db library.
// We are primarily adding power chords (e.g., "A5", "D5").
// Structure must match the chords-db format.

const customGuitarChords = {
    A: [
        { key: 'A', suffix: '5', positions: [{ frets: 'x022xx', fingers: ' 12  ' }, { frets: '577xxx', fingers: '134   ' }] }
    ],
    Ab: [
        { key: 'Ab', suffix: '5', positions: [{ frets: '466xxx', fingers: '134   ' }, { frets: 'xbddxx', fingers: ' 134  ' }] }
    ],
    B: [
        { key: 'B', suffix: '5', positions: [{ frets: 'x244xx', fingers: ' 134  ' }, { frets: '799xxx', fingers: '134   ' }] }
    ],
    Bb: [
        { key: 'Bb', suffix: '5', positions: [{ frets: 'x133xx', fingers: ' 134  ' }, { frets: '688xxx', fingers: '134   ' }] }
    ],
    C: [
        { key: 'C', suffix: '5', positions: [{ frets: 'x355xx', fingers: ' 134  ' }, { frets: '8aaxxx', fingers: '134   ' }] }
    ],
    Db: [
        { key: 'Db', suffix: '5', positions: [{ frets: 'x466xx', fingers: ' 134  ' }, { frets: '9bbxxx', fingers: '134   ' }] }
    ],
    D: [
        { key: 'D', suffix: '5', positions: [
            { frets: 'x577xx', fingers: ' 134  ' },
            { frets: 'xx0232', fingers: '  132 ' },
            { frets: 'accxxx', fingers: '134   ' },
            { frets: 'xx023x', fingers: '  12 ' }
        ] }
    ],
    Eb: [
        { key: 'Eb', suffix: '5', positions: [{ frets: 'x688xx', fingers: ' 134  ' }, { frets: 'bddxxx', fingers: ' 134  ' }] }
    ],
    E: [
        { key: 'E', suffix: '5', positions: [{ frets: '022xxx', fingers: ' 12   ' }, { frets: 'x799xx', fingers: ' 134  ' }] }
    ],
    F: [
        { key: 'F', suffix: '5', positions: [{ frets: '133xxx', fingers: '134   ' }, { frets: 'x8aaxx', fingers: ' 134  ' }] }
    ],
    Gb: [
        { key: 'Gb', suffix: '5', positions: [{ frets: '244xxx', fingers: '134   ' }, { frets: 'x9bbxx', fingers: ' 134  ' }] }
    ],
    G: [
        { key: 'G', suffix: '5', positions: [{ frets: '355xxx', fingers: '134   ' }, { frets: 'xaaccx', fingers: ' 134  ' }] }
    ],
};

// We can add ukulele chords here in the future if needed.
const customUkuleleChords = {};

export default {
    guitar: {
        chords: customGuitarChords,
        suffixes: ['5']
    },
    ukulele: {
        chords: customUkuleleChords,
        suffixes: []
    }
};
