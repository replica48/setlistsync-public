import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { getMetadata, ref } from "firebase/storage";
import PianoIcon from "@mui/icons-material/Piano";
import {
  XIcon,
  CachedIcon,
  CacheReadyIcon,
  ShareNetworkIcon,
  FileTextIcon,
  ReadyIcon,
  NotReadyIcon,
  DotsVerticalIcon,
  ListMusicIcon,
  InfoIcon,
  ChordIcon,
} from "../helpers/Icons.jsx";
import TempoIndicator from "./ui/TempoIndicator";
import LexicalViewer from "./ui/LexicalViewer.jsx"; // Import the new viewer
import defaultDbChords from "@tombatossals/chords-db/src/db.js";
import customChords from "../helpers/customChords.js";
import Chord from "@tombatossals/react-chords/lib/Chord";
import { Chord as TonalChord, Note as TonalNote } from "tonal"; // --- NEW: For piano chord note detection
import CustomPianoDiagram from "./ui/CustomPianoDiagram.jsx"; // --- THIS IS THE FIX: Import our new custom component
import CombinedSetlistModal from "./modals/CombinedSetlistModal.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";
import {
  saveDefaultVoicing,
  getDefaultVoicing,
} from "../helpers/chordPreferences.js";
import { getPdf, savePdf } from "../helpers/indexedDB";
import { areLyricsEmpty } from "../helpers/lyricsUtils.js";

// --- THIS IS THE FINAL FIX: A simple, reliable lyrics renderer ---
const LyricsRenderer = ({ lyrics, onChordClick, validChordNames }) => {
  // This regex splits the text by chords, keeping the chords in the resulting array.
  const parts = lyrics.split(/(\[[^\]]+\])/g);

  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((part, index) => {
        if (part.startsWith("[") && part.endsWith("]")) {
          const chordName = part.slice(1, -1);
          if (validChordNames.has(chordName)) {
            // It's a valid chord, make it clickable and blue
            return (
              <span
                key={index}
                className="text-sky-300 font-bold cursor-pointer hover:bg-sky-700/50 rounded-md px-1 transition-colors"
                onClick={() => onChordClick(part)}
              >
                {part}
              </span>
            );
          } else {
            // Not a valid chord, make it yellow and not clickable
            return (
              <span
                key={index}
                className="text-yellow-400 font-bold rounded-md px-1"
              >
                {part}
              </span>
            );
          }
        } else {
          // It's a regular text part
          return <span key={index}>{part}</span>;
        }
      })}
    </div>
  );
};

// --- Merge custom chords into the main chord database ---
const chords = JSON.parse(JSON.stringify(defaultDbChords)); // Use 'chords' as the variable name

// Merge custom guitar chords
if (customChords.guitar && customChords.guitar.chords) {
  Object.keys(customChords.guitar.chords).forEach((root) => {
    const customChordList = customChords.guitar.chords[root];
    if (!chords.guitar.chords[root]) {
      chords.guitar.chords[root] = [];
    }
    customChordList.forEach((customChord) => {
      // Check if a chord with the same suffix already exists
      const exists = chords.guitar.chords[root].some(
        (existing) => existing.suffix === customChord.suffix
      );
      if (!exists) {
        chords.guitar.chords[root].push(customChord);
      }
    });
  });
}

// Merge custom guitar suffixes, ensuring no duplicates
if (customChords.guitar && customChords.guitar.suffixes) {
  customChords.guitar.suffixes.forEach((suffix) => {
    if (!chords.guitar.suffixes.includes(suffix)) {
      chords.guitar.suffixes.push(suffix);
    }
  });
}
// --- End of chord merging ---

// --- Helper function to map tempo to scroll speed ---
// We define this *outside* the component so it's not recreated on every render.
const SCROLL_SPEEDS = { SLOW: 1, MEDIUM: 35, FAST: 65 };
const MIN_TEMPO = 60; // Slowest BPM we'll map
const MAX_TEMPO = 180; // Fastest BPM we'll map
const MIN_SCROLL = 1; // Corresponds to SLOW
const MAX_SCROLL = 65; // Corresponds to FAST
const DEFAULT_SCROLL = SCROLL_SPEEDS.MEDIUM; // Default if no tempo is set

const mapTempoToScrollSpeed = (tempo) => {
  if (!tempo) {
    return DEFAULT_SCROLL;
  }

  // First, map the tempo to a continuous range (e.g., 1-50)
  const tempoRange = MAX_TEMPO - MIN_TEMPO;
  const scrollRange = MAX_SCROLL - MIN_SCROLL;
  const mapped = ((tempo - MIN_TEMPO) * scrollRange) / tempoRange + MIN_SCROLL;

  // Then, find which of our three speeds (1, 35, 65) the result is closest to.
  const speeds = Object.values(SCROLL_SPEEDS);
  const closest = speeds.reduce((a, b) =>
    Math.abs(b - mapped) < Math.abs(a - mapped) ? b : a
  );
  return closest;
};

// --- THIS IS THE FIX ---
// This helper function converts the string-based fret data from 'chords-db'
// into the number array format that 'react-chords' expects.
const transformChordData = (chordPosition) => {
  // This function is robust and returns null for any invalid chord data,
  // which prevents crashes when mapping over chord positions.
  try {
    if (!chordPosition || !chordPosition.frets || !chordPosition.fingers) {
      throw new Error("Invalid chord position data: missing frets or fingers.");
    }

    // --- FIX: Use radix 36 to correctly parse frets with letters (a=10, b=11, etc.) ---
    // The chords-db library uses letters for frets beyond the 9th.
    const frets = chordPosition.frets
      .split("")
      .map((f) => (f === "x" ? -1 : parseInt(f, 36)));

    const fingers = chordPosition.fingers
      .split("")
      .map((f) => (f === "x" || f === " " ? 0 : parseInt(f, 10)));

    const rawBarres = chordPosition.barres
      ? Array.isArray(chordPosition.barres)
        ? chordPosition.barres
        : [chordPosition.barres]
      : [];
    const validRawBarres = rawBarres.filter(
      (b) => b !== undefined && b !== null && b > 0
    );

    const playableFrets = frets.filter((f) => f > 0);
    const minFret = playableFrets.length > 0 ? Math.min(...playableFrets) : 1;
    const baseFret = minFret > 1 ? minFret : 1;

    const relativeFrets = frets.map((f) => (f > 0 ? f - baseFret + 1 : f));
    const relativeBarres = validRawBarres
      .map((b) => b - baseFret + 1)
      .filter((b) => b > 0);

    return {
      frets: relativeFrets,
      fingers,
      barres: relativeBarres,
      baseFret,
      capotasto: chordPosition.capotasto || false,
    };
  } catch (error) {
    console.warn(
      "Skipping invalid chord voicing due to error:",
      error.message,
      "Data:",
      chordPosition
    );
    return null; // Return null for any invalid chord position.
  }
};

// --- NEW: Helper function to get notes for a piano chord ---
const getPianoChordNotes = (chordName, inversion = 0) => {
  try {
    const chordDetails = TonalChord.get(chordName);
    if (chordDetails.empty || !chordDetails.tonic) {
      return [];
    }

    // --- NEW: Use Chord.degrees for accurate inversion and octave calculation ---
    const noteCount = chordDetails.intervals.length;
    if (noteCount === 0) {
      return [];
    }

    // Create a function that maps a degree number to a note in the correct octave, starting from octave 4.
    const getNoteForDegree = TonalChord.degrees(
      chordDetails.aliases[0] || chordDetails.symbol,
      `${chordDetails.tonic}4`
    );

    // Generate the degrees for the requested inversion.
    // Root is [1, 2, 3, ...], 1st inv is [2, 3, 4, ...], etc.
    const degrees = [];
    for (let i = 0; i < noteCount; i++) {
      degrees.push(inversion + i + 1);
    }

    // Map the degrees to the actual note names with octaves.
    const notesWithOctaves = degrees.map(getNoteForDegree);

    // The CustomPianoDiagram expects notes with octaves (e.g., "C4", "E4").
    return notesWithOctaves;
  } catch (e) {
    console.error(`Could not get notes for piano chord: ${chordName}`, e);
    return [];
  }
};

const isIOSDevice = () => {
  // Standard check for iPhone/iPod
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    return true;
  }
  // Check for modern iPad (which pretends to be a Mac)
  if (navigator.userAgent.includes("Macintosh") && "ontouchend" in document) {
    return true;
  }
  return false;
};

const isAndroidDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
};

// --- Button View Component ---
// This is rendered for iOS and Android
const ButtonView = ({
  songTitle,
  browserOpenUrl,
  onShare,
  isShareSupported,
  isLoadingShare,
}) => (
  <div className="p-8 flex flex-col items-center justify-center h-full text-center">
    <h2 className="text-2xl font-bold mb-4 text-white">{songTitle}</h2>
    <p className="text-gray-300 mb-8">How would you like to open this file?</p>
    <div className="w-full max-w-xs space-y-4">
      {/* 1. Open in Browser Button */}
      <a
        href={browserOpenUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg text-lg w-full flex items-center justify-center"
      >
        <FileTextIcon className="mr-2" size={20} />
        Open in Browser
      </a>

      {/* 2. Share to App Button (Only if supported) */}
      {isShareSupported && (
        <button
          onClick={onShare}
          disabled={isLoadingShare}
          className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-6 rounded-lg text-lg w-full flex items-center justify-center disabled:opacity-50"
        >
          {isLoadingShare ? (
            <>
              <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
              Preparing...
            </>
          ) : (
            <>
              <ShareNetworkIcon className="mr-2" size={20} />
              Share to App...
            </>
          )}
        </button>
      )}
    </div>
  </div>
);

function FullScreenSongViewer({
  song,
  pdf,
  storage,
  onClose,
  tempoAlert,
  onSongNav,
  isLiveConductor,
  currentSongIndex,
  setlist,
  handleTempoAlert,
  isTempoChanging,
  currentUserMemberData,
  previousSong,
  nextSong,
  handleSetReady,
  bandData,
  db,
  user,
  showToast,
  onSaveSetlist,
  onSongSelected, // NEW PROP
  onJumpToSong,
  members,
  isOffline,
  isPracticeMode = false,
}) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(() => {
    if (!pdf && song.tempo) {
      return mapTempoToScrollSpeed(song.tempo);
    }
    return SCROLL_SPEEDS.MEDIUM;
  });
  const contentRef = useRef(null);
  const intervalRef = useRef(null);
  const bottomBarRef = useRef(null); // --- THIS IS THE FIX: Ref for the bottom bar ---
  const [pdfSource, setPdfSource] = useState("");
  const [statusMessage, setStatusMessage] = useState("Loading...");
  const objectUrlRef = useRef(null); // To store object URL for cleanup
  const [isCached, setIsCached] = useState(false);
  const statusTimeoutRef = useRef(null);
  const [isShareSupported, setIsShareSupported] = useState(false);
  const [isLoadingShare, setIsLoadingShare] = useState(false);
  const [cachedBlob, setCachedBlob] = useState(null); // To hold cached blob for Android
  const [browserOpenUrl, setBrowserOpenUrl] = useState(""); // URL for the "Open in Browser" button
  // --- State for swipe navigation ---
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const SWIPE_THRESHOLD = 50; // Minimum pixels for a swipe
  // --- NEW: State for control sidebar ---
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  // --- NEW: State for flashing tempo alert message ---
  const [flash, setFlash] = useState({ show: false, message: "" });
  const [showSetlistModal, setShowSetlistModal] = useState(false);
  const handleTouchStartX = useRef(null);
  const handleTouchStartY = useRef(null);
  const flashTimeoutRef = useRef(null);
  const [isNoteManuallyVisible, setIsNoteManuallyVisible] = useState(false);
  const [isNoteTemporarilyVisible, setIsNoteTemporarilyVisible] =
    useState(false);
  const noteTimeoutRef = useRef(null);
  // --- NEW: State to control the visibility of the chord bar ---
  const isProTier = true;
  const [selectedVoicingIndex, setSelectedVoicingIndex] = useState(0);
  const [pianoInversions, setPianoInversions] = useState([]);
  const endOfSongRef = useRef(null);
  const [isChordBarVisible, setIsChordBarVisible] = useState(false);
  // --- NEW: State to control the instrument type for diagrams ---
  const [diagramInstrument, setDiagramInstrument] = useState("guitar");
  const [forceUpdate, setForceUpdate] = useState(0); // --- NEW: To re-render chord bar on default change
  // --- NEW: State for the enlarged chord diagram modal ---
  const [selectedChord, setSelectedChord] = useState(null);

  // --- NEW: Memo to get plaintext from either HTML or Lexical JSON ---
  const plainTextLyrics = useMemo(() => {
    const lyrics = song.lyricsChords || "";
    if (lyrics.startsWith("{")) {
      // It's Lexical JSON
      try {
        const state = JSON.parse(lyrics);
        if (!state.root || !state.root.children) return "";

        const extractText = (nodes) => {
          let text = "";
          for (const node of nodes) {
            if (node.type === "linebreak") {
              text += "\n";
            } else if (node.text) {
              text += node.text;
            } else if (node.children) {
              text += extractText(node.children);
            }
          }
          return text;
        };

        let textContent = "";
        for (const p of state.root.children) {
          if (p.children) {
            textContent += extractText(p.children);
          }
          textContent += "\n"; // Add newline between paragraphs
        }
        return textContent.trim();
      } catch (e) {
        console.error("Failed to parse Lexical JSON for plaintext", e);
        return ""; // Return empty string on error
      }
    } else {
      // It's legacy HTML or plaintext
      // Replace HTML break tags with newlines before parsing text content
      const textWithBreaks = lyrics
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n");
      const parser = new DOMParser();
      const doc = parser.parseFromString(textWithBreaks, "text/html");
      return doc.body.textContent || "";
    }
  }, [song.lyricsChords]);

  // --- NEW: Logic to extract and display chord diagrams ---
  const uniqueChords = useMemo(() => {
    if (!plainTextLyrics) return [];
    try {
      const chordRegex = /\[([^\]]+)\]/g;
      const matches = plainTextLyrics.match(chordRegex) || [];
      const uniqueChordNames = [
        ...new Set(matches.map((m) => m.slice(1, -1).trim())),
      ];

      const enharmonicMap = {
        "A#": "Bb",
        "C#": "Db",
        "D#": "Eb",
        "F#": "Gb",
        "G#": "Ab",
        Cb: "B",
        "E#": "F",
        "B#": "C",
      };
      const sharpMap = {
        "C#": "Csharp",
        "D#": "Dsharp",
        "F#": "Fsharp",
        "G#": "Gsharp",
        "A#": "Asharp",
      }; // Map to library's naming
      const guitarInstrument = chords.guitar;

      // This map converts the verbose chord types from Tonal.js into the suffixes used by chords-db.
      const tonalTypeToSuffixMap = {
        major: "major",
        minor: "minor",
        "major seventh": "maj7",
        "minor seventh": "m7",
        "dominant seventh": "7",
        "suspended fourth": "sus4",
        "suspended second": "sus2",
        augmented: "aug",
        diminished: "dim",
        "power chord": "5",
        fifth: "5",
        "major sixth": "6",
        "minor sixth": "m6",
        "major ninth": "maj9",
        "minor ninth": "m9",
        "dominant ninth": "9",
        "dominant eleventh": "11",
        "major eleventh": "maj11",
        "minor eleventh": "m11",
        "dominant thirteenth": "13",
        "major thirteenth": "maj13",
        "minor thirteenth": "m13",
        "minor-major seventh": "mmaj7",
        "minor major seventh": "mmaj7",
        "diminished seventh": "dim7",
        // Altered / complex dominant chords
        "augmented seventh": "aug7",
        "augmented ninth": "aug9",
        "dominant seventh sharp ninth": "7#9",
        "dominant seventh flat ninth": "7b9",
        "dominant seventh flat fifth": "7b5",
        "dominant seventh suspended fourth": "7sus4",
        "dominant ninth sharp eleventh": "9#11",
        "dominant ninth flat fifth": "9b5",
        // Half-diminished
        "half-diminished": "m7b5",
        "minor seventh flat fifth": "m7b5",
        // Major with altered 5th/7th
        "major seventh sharp fifth": "maj7#5",
        "major seventh flat fifth": "maj7b5",
        // Minor-major
        "minor major seventh flat fifth": "mmaj7b5",
        "minor major ninth": "mmaj9",
        "minor major eleventh": "mmaj11",
        // Added / slash / other
        "major added ninth": "add9",
        "minor added ninth": "madd9",
        "sixth added ninth": "69",
        "minor sixth added ninth": "m69",
        altered: "alt",
      };

      return uniqueChordNames
        .map((name) => {
          const chordInfo = TonalChord.get(name);
          if (chordInfo.empty) {
            return null; // Tonal couldn't parse it, so it's not a valid chord we can look up.
          }

          if (diagramInstrument === "piano") {
            const defaultInversionIndex = getDefaultVoicing(song.id, name);
            const allInversions = Array.from(
              { length: chordInfo.intervals.length },
              (_, i) => getPianoChordNotes(name, i)
            );
            const pianoNotes =
              allInversions[defaultInversionIndex] ||
              getPianoChordNotes(name, 0);

            if (pianoNotes.length > 0) {
              return {
                key: name,
                isPiano: true,
                chord: { frets: pianoNotes },
                inversions: allInversions,
              };
            }
            return null;
          }

          // --- Guitar Logic using Tonal.js ---
          const root = chordInfo.tonic;
          const type = chordInfo.type;

          if (!root) return null; // Can't proceed without a root.

          // Priority 1: 'add9' must be checked first — Tonal sometimes classifies
          // 'Cadd9' as "major ninth" which would incorrectly map to 'maj9'.
          let finalSuffix;
          if (chordInfo.aliases.includes("add9")) {
            finalSuffix = "add9";
          } else if (chordInfo.aliases.includes("madd9")) {
            finalSuffix = "madd9";
          } else if (type === "power chord") {
            finalSuffix = "5";
          } else {
            // Priority 2: Use the type → suffix map.
            finalSuffix = tonalTypeToSuffixMap[type];

            // Priority 3: If the type isn't mapped, try Tonal's aliases directly.
            // e.g., Tonal aliases for A7#9 include "7#9" which matches a chords-db suffix.
            if (finalSuffix === undefined) {
              const availableSuffixes = new Set(guitarInstrument.suffixes);
              for (const alias of chordInfo.aliases) {
                if (availableSuffixes.has(alias)) {
                  finalSuffix = alias;
                  break;
                }
              }
            }
          }

          // Priority 4: Suffix approximation — for complex chords (e.g. m7add11)
          // that have no exact entry in chords-db, fall back to the closest
          // available voicing so a diagram is still shown.
          if (finalSuffix === undefined) {
            const suffixApproximationMap = {
              // "add" extension variants → nearest standard suffix
              "m7add11": "m11",
              "m7add9":  "m9",
              "maj7add9": "maj9",
              "maj7add11": "maj11",
              "7add9":   "9",
              "7add11":  "11",
              "madd11":  "m11",
              "add11":   "sus4",
              // Slash / polychord simplifications
              "m7b5add11": "m7b5",
            };
            for (const alias of chordInfo.aliases) {
              if (suffixApproximationMap[alias] !== undefined) {
                finalSuffix = suffixApproximationMap[alias];
                break;
              }
            }
          }

          if (finalSuffix === undefined) {
            return null; // The chord type is not supported.
          }

          const sharpRoot = sharpMap[root]; // e.g., 'Csharp'
          const enharmonicRoot = enharmonicMap[root]; // e.g., 'Db'

          const keyData =
            (sharpRoot && guitarInstrument.chords[sharpRoot]) ||
            (enharmonicRoot && guitarInstrument.chords[enharmonicRoot]) ||
            guitarInstrument.chords[root];

          const chordData = keyData?.find((c) => c.suffix === finalSuffix);

          if (chordData && chordData.positions.length > 0) {
            const transformedPositions = chordData.positions
              .map(transformChordData)
              .filter(Boolean);
            if (transformedPositions.length > 0) {
              return {
                key: name,
                isPiano: false,
                instrument: {
                  ...guitarInstrument.main,
                  keys: guitarInstrument.keys,
                  tunings: guitarInstrument.tunings,
                },
                positions: transformedPositions,
              };
            }
          }
          return null;
        })
        .filter(
          (c) => c && (c.isPiano || (c.positions && c.positions.length > 0))
        )
        .map((chord) => {
          // After filtering, assign the first valid position to the 'chord' property for the small diagram.
          if (!chord.isPiano) {
            const defaultVoicingIndex = getDefaultVoicing(song.id, chord.key);
            const defaultPosition =
              chord.positions[defaultVoicingIndex] || chord.positions[0];
            chord.chord = defaultPosition;
          }
          return chord;
        });
    } catch (e) {
      console.error("Failed to parse lyrics for chord diagrams:", e);
      return [];
    }
  }, [plainTextLyrics, diagramInstrument, forceUpdate]);

  const validChordNames = useMemo(
    () => new Set(uniqueChords.map((c) => c.key)),
    [uniqueChords]
  );

  // --- MOVED: Navigation button availability ---
  const canGoNext = setlist && currentSongIndex < setlist.songOrder.length - 1;
  const canGoPrev = setlist && currentSongIndex > 0;

  // --- NEW: Effect to trigger the flashing alert ---
  useEffect(() => {
    // Clear any existing timer to prevent the message from getting stuck
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }

    if (tempoAlert) {
      const message = tempoAlert === "speedUp" ? "SPEED UP!" : "SLOW DOWN!";
      setFlash({ show: true, message });

      // Set a new timer to hide the message after the animation finishes
      flashTimeoutRef.current = setTimeout(() => {
        setFlash({ show: false, message: "" });
      }, 4000); // 4 flashes * 1s per flash
    } else {
      // If there's no alert, make sure the message is hidden.
      setFlash({ show: false, message: "" });
    }
  }, [tempoAlert]); // Trigger only when the alert type changes

  // --- NEW: Effect to automatically show notes on song change ---
  useEffect(() => {
    // Clear any previous auto-hide timer
    if (noteTimeoutRef.current) {
      clearTimeout(noteTimeoutRef.current);
    }
    // Reset manual visibility when song changes
    setIsNoteManuallyVisible(false);

    // --- THIS IS THE FIX ---
    // Also hide the chord bar when the song changes.
    setIsChordBarVisible(false);

    if (song.notes) {
      setIsNoteTemporarilyVisible(true);
      noteTimeoutRef.current = setTimeout(() => {
        setIsNoteTemporarilyVisible(false);
      }, 5000); // Hide after 5 seconds
    } else {
      setIsNoteTemporarilyVisible(false);
    }

    return () => clearTimeout(noteTimeoutRef.current);
  }, [song.id]); // Trigger only when the song ID changes

  // Check for Web Share API support
  useEffect(() => {
    if (navigator.share && navigator.canShare) {
      const dummyFile = new File([""], "test.pdf", { type: "application/pdf" });
      if (navigator.canShare({ files: [dummyFile] })) {
        setIsShareSupported(true);
      }
    }
  }, []);

  // This useEffect handles loading the PDF and checking the cache
  useEffect(() => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);

    // This ref is for object URLs. Clear any old one.
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const loadPdf = async () => {
      if (!pdf) {
        // 1. Lyrics-only view
        setStatusMessage("");
        setPdfSource("");
        setIsCached(false);
        return;
      }

      // 2. iOS path (Requirement #3)
      if (isIOSDevice()) {
        console.log("iOS device detected. Preparing button view.");
        setStatusMessage("Ready to open...");
        setPdfSource(null); // Don't set source, we want the button view
        setBrowserOpenUrl(pdf.url); // "Open in browser" uses network link

        // We can still check cache status for the icon
        try {
          const key = `${song.id}-${pdf.path}`;
          if (await getPdf(key)) setIsCached(true);
        } catch (e) {}

        statusTimeoutRef.current = setTimeout(() => {
          setStatusMessage("");
        }, 5000);
        return; // Stop here for iOS
      }

      // 3. Android & Desktop path (Cache-first)
      const key = `${song.id}-${pdf.path}`;
      let localData = null;
      let remoteMetadata = null;

      try {
        localData = await getPdf(key);
        if (localData) setCachedBlob(localData.blob); // Save blob for sharing
      } catch (error) {
        console.error("Error getting PDF from IndexedDB:", error);
      }

      if (navigator.onLine) {
        try {
          const fileRef = ref(storage, pdf.path);
          remoteMetadata = await getMetadata(fileRef);
        } catch (error) {
          console.warn("Could not fetch remote metadata (likely offline).");
        }
      } else {
        console.log("Offline: will only check local cache.");
      }

      // Check if local data is good
      const useLocalData =
        localData &&
        (!remoteMetadata ||
          localData.updated === remoteMetadata.updated ||
          !navigator.onLine);

      if (isAndroidDevice()) {
        // 4. Android path (Requirement #2)
        console.log("Android device detected. Preparing button view.");
        if (useLocalData) {
          setStatusMessage("Ready (cached)");
          setIsCached(true);
          // Create a blob:url for the "Open in Browser" button
          const objectUrl = URL.createObjectURL(localData.blob);
          objectUrlRef.current = objectUrl; // Save ref for cleanup
          setBrowserOpenUrl(objectUrl);
        } else {
          setStatusMessage("Ready (network)");
          setIsCached(false);
          setBrowserOpenUrl(pdf.url); // Use network link
          // Auto-cache in background if online
          if (navigator.onLine && remoteMetadata) {
            fetch(pdf.url)
              .then((res) => res.blob())
              .then((blob) => {
                savePdf(key, blob, remoteMetadata.updated);
                setCachedBlob(blob); // Save for sharing
                setIsCached(true);
              });
          }
        }
        setPdfSource(null); // Don't set source, we want the button view
      } else {
        // 5. Desktop path (Requirement #1)
        console.log("Desktop device detected. Preparing embedded view.");
        if (useLocalData) {
          console.log("Loading PDF from local cache.");
          setStatusMessage("Loaded from cache");
          setIsCached(true);
          const objectUrl = URL.createObjectURL(localData.blob);
          objectUrlRef.current = objectUrl;
          setPdfSource(objectUrl);
        } else if (navigator.onLine && remoteMetadata) {
          console.log("Fetching fresh PDF from Firebase Storage.");
          setStatusMessage("Fetching latest version...");
          setIsCached(false);
          try {
            setPdfSource(pdf.url); // Display network URL
            // Auto-cache in the background
            const response = await fetch(pdf.url);
            if (!response.ok)
              throw new Error("Failed to fetch PDF for caching.");
            const newBlob = await response.blob();
            await savePdf(key, newBlob, remoteMetadata.updated);
            console.log("Automatically cached new version.");
            setStatusMessage("Updated and cached for offline use");
            setIsCached(true);
          } catch (error) {
            console.error("Failed to fetch PDF:", error);
            setStatusMessage("Error loading file.");
          }
        } else if (localData && !navigator.onLine) {
          console.log("Offline: Using existing cached PDF.");
          setStatusMessage("Loaded from cache (offline)");
          setIsCached(true);
          const objectUrl = URL.createObjectURL(localData.blob);
          objectUrlRef.current = objectUrl;
          setPdfSource(objectUrl);
        } else {
          console.error("No cached PDF and failed to fetch from network.");
          setStatusMessage(
            "Error: No offline copy and failed to load from network."
          );
          setPdfSource("");
        }
      }

      if (!statusMessage.includes("Error")) {
        statusTimeoutRef.current = setTimeout(() => {
          setStatusMessage("");
        }, 5000);
      }
    };

    loadPdf();

    // Cleanup function
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, [song, pdf, storage]); // Dependencies

  // --- NEW: Handle Share Button Click (for iOS & Android) ---
  const handleShare = async () => {
    if (!pdf?.url) return;

    setIsLoadingShare(true);
    let blobToShare = cachedBlob; // Use cached blob if available (Android)

    try {
      // If no cached blob (iOS, or Android not cached), fetch it
      if (!blobToShare) {
        console.log("No cached blob, fetching from network for sharing...");
        const response = await fetch(pdf.url);
        if (!response.ok) {
          throw new Error("Failed to fetch PDF for sharing");
        }
        blobToShare = await response.blob();
      }

      const fileName = song.title
        ? `${song.title.replace(/ /g, "_")}.pdf`
        : "song.pdf";
      const file = new File([blobToShare], fileName, {
        type: "application/pdf",
      });

      await navigator.share({
        title: song.title || "Song PDF",
        text: `PDF for ${song.title}`,
        files: [file],
      });
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("User cancelled the share action.");
      } else {
        console.error("Error sharing the file:", err);
        setStatusMessage("Error sharing file.");
        statusTimeoutRef.current = setTimeout(() => {
          setStatusMessage("");
        }, 5000);
      }
    } finally {
      setIsLoadingShare(false);
    }
  };

  // --- THIS IS THE FIX: Callback for when a chord is clicked in the lyrics ---
  const handleChordClick = (chordNameWithBrackets) => {
    if (!isProTier) {
      showToast("Chord diagrams are a Pro feature.", "info");
      return;
    }
    // The payload includes brackets, e.g., "[Am]". We need to remove them.
    const chordName = chordNameWithBrackets.slice(1, -1);

    // Find the corresponding chord data object from our pre-calculated list.
    const chordData = uniqueChords.find((c) => c.key === chordName);

    if (chordData) {
      // --- NEW: Set the initial voicing to the user's default ---
      const defaultVoicingIndex = getDefaultVoicing(song.id, chordName);
      const maxIndex = chordData.isPiano
        ? (chordData.inversions?.length || 1) - 1
        : (chordData.positions?.length || 1) - 1;

      // Ensure the default index is valid
      setSelectedVoicingIndex(
        defaultVoicingIndex > maxIndex ? 0 : defaultVoicingIndex
      );

      // If it's a piano chord, ensure inversions are ready for the modal
      if (chordData.isPiano) {
        // Use the pre-calculated inversions from the chordData object
        if (chordData.inversions && chordData.inversions.length > 0) {
          setPianoInversions(chordData.inversions);
        } else {
          setPianoInversions([]);
        }
      }

      setSelectedChord(chordData); // Use the existing state to open the modal
    }
  };

  // --- NEW: Handler to set a default voicing ---
  const handleSetDefaultVoicing = () => {
    if (!selectedChord) return;
    saveDefaultVoicing(song.id, selectedChord.key, selectedVoicingIndex);
    setForceUpdate((prev) => prev + 1); // Force a re-render of the chord bar
  };

  // --- Scrolling Logic (Unchanged) ---
  const startScrolling = () => {
    setIsScrolling(true);
    // --- THIS IS THE FIX: Check scroll position on each interval ---
    intervalRef.current = setInterval(() => {
      if (contentRef.current && endOfSongRef.current) {
        const container = contentRef.current;
        const endMarker = endOfSongRef.current;

        // --- THIS IS THE FIX: Account for the bottom bar's height ---
        // Get the height of the bottom bar. If it doesn't exist, default to 0.
        const bottomBarHeight = bottomBarRef.current
          ? bottomBarRef.current.offsetHeight
          : 0;
        // The target position is the bottom of the container, minus the bar's height and a small margin.
        const stopPosition =
          container.getBoundingClientRect().bottom - bottomBarHeight;

        if (endMarker.getBoundingClientRect().top <= stopPosition) {
          stopScrolling();
        } else {
          container.scrollTop += 1; // Continue scrolling
        }
      }
    }, 110 - scrollSpeed);
  };
  const stopScrolling = () => {
    setIsScrolling(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };
  useEffect(() => {
    if (isScrolling) {
      stopScrolling();
      startScrolling();
    }
    return () => stopScrolling();
  }, [scrollSpeed, isScrolling]);
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // --- NEW: Keyboard and Swipe Navigation ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't interfere with typing in the modal
      if (showSetlistModal) return;

      // Spacebar to start/stop scroll (for any user, but only on lyrics view)
      if (!pdf && (e.key === " " || e.code === "Space")) {
        e.preventDefault(); // Prevent page from scrolling
        isScrolling ? stopScrolling() : startScrolling();
      }

      // Arrow keys for song navigation (conductor only, on lyrics view)
      if (isLiveConductor && !pdf) {
        if (e.key === "ArrowLeft" && canGoPrev) {
          onSongNav(-1);
        } else if (e.key === "ArrowRight" && canGoNext) {
          onSongNav(1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isLiveConductor,
    pdf,
    onSongNav,
    isScrolling,
    showSetlistModal,
    canGoPrev,
    canGoNext,
  ]); // Add dependencies

  const handleTouchStart = (e) => {
    if (!isLiveConductor || pdf) return;
    // Record starting touch position
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (
      !isLiveConductor ||
      pdf ||
      touchStartX.current === null ||
      touchStartY.current === null
    )
      return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;

    // Only trigger a song change if the swipe is mostly horizontal
    // and exceeds the threshold.
    if (
      Math.abs(deltaX) > SWIPE_THRESHOLD &&
      Math.abs(deltaX) > Math.abs(deltaY) * 2
    ) {
      if (deltaX > 0 && canGoPrev) {
        // Swipe Right (Previous)
        onSongNav(-1);
      } else if (deltaX < 0 && canGoNext) {
        // Swipe Left (Next)
        onSongNav(1);
      }
    }

    // Reset for next touch
    touchStartX.current = null; // Reset for next touch
    touchStartY.current = null;
  };

  const handleTouchMove = (e) => {
    // Prevent pull-to-refresh when at the top of the lyrics
    if (
      contentRef.current?.scrollTop === 0 &&
      e.touches[0].clientY > (touchStartY.current ?? 0)
    ) {
      e.preventDefault();
    }
  };

  const handleSidebarSwipeStart = (e) => {
    handleTouchStartX.current = e.touches[0].clientX;
    handleTouchStartY.current = e.touches[0].clientY;
  };

  const handleSidebarSwipeEnd = (e) => {
    if (
      handleTouchStartX.current === null ||
      handleTouchStartY.current === null
    )
      return;

    const deltaX = e.changedTouches[0].clientX - handleTouchStartX.current;
    const deltaY = e.changedTouches[0].clientY - handleTouchStartY.current;

    // Only toggle if it's a clear horizontal swipe
    if (Math.abs(deltaX) > 30 && Math.abs(deltaX) > Math.abs(deltaY)) {
      setIsControlsVisible(deltaX < 0); // Swipe left to open, right to close
    }

    handleTouchStartX.current = null;
    handleTouchStartY.current = null;
  };

  const handleNoteToggle = () => {
    // --- THIS IS THE FIX ---
    // The logic is updated to correctly handle toggling off the notes
    // when they are temporarily visible.

    // First, always clear the temporary auto-hide timer. Any manual interaction should stop it.
    if (noteTimeoutRef.current) {
      clearTimeout(noteTimeoutRef.current);
    }

    const areNotesCurrentlyVisible =
      isNoteManuallyVisible || isNoteTemporarilyVisible;
    setIsNoteTemporarilyVisible(false); // Always turn off temporary visibility on manual toggle.
    setIsNoteManuallyVisible(!areNotesCurrentlyVisible); // The new manual state is the opposite of the current overall visibility.
  };

  const handleScrollSpeedToggle = () => {
    setScrollSpeed((currentSpeed) => {
      if (currentSpeed === SCROLL_SPEEDS.SLOW) return SCROLL_SPEEDS.MEDIUM;
      if (currentSpeed === SCROLL_SPEEDS.MEDIUM) return SCROLL_SPEEDS.FAST;
      if (currentSpeed === SCROLL_SPEEDS.FAST) return SCROLL_SPEEDS.SLOW;
      return SCROLL_SPEEDS.MEDIUM; // Default fallback
    });
  };

  const getScrollSpeedLabel = () => {
    switch (scrollSpeed) {
      case SCROLL_SPEEDS.SLOW:
        return "Slow";
      case SCROLL_SPEEDS.MEDIUM:
        return "Med";
      case SCROLL_SPEEDS.FAST:
        return "Fast";
      default:
        return "Med";
    }
  };

  // --- Determine device type for rendering ---
  const isMobileButtonView = pdf && (isIOSDevice() || isAndroidDevice());

  // --- NEW: Calculate allReady status directly inside the component ---
  // We now use the 'members' prop, which guarantees a re-render when any member's status changes.
  const checkedInMembers =
    members?.filter((m) => m.checkedIn && m.role !== "Viewer") || [];
  const allReady =
    checkedInMembers.length > 0
      ? checkedInMembers.every((member) => member.isReady)
      : false;

  return (
    // --- THIS IS THE FIX ---
    // By defining the customization object outside the render loop,
    // we ensure it's a stable reference and doesn't cause re-renders. I've also
    // updated the colors for better readability and contrast.
    (
      useMemo(() => {
        window.chordDiagramCustomizations = {
          diagram: {
            strings: "#4A5568", // Lighter gray for strings
            frets: "#4A5568", // Lighter gray for frets
            dots: "#1A202C", // Dark, solid color for dots
            barre: "#1A202C", // Dark, solid color for the barre
          },
          text: {
            color: "#FFFFFF", // White finger numbers
            size: 0.8,
          },
        };
      }, []),
      (
        <div className="fixed inset-0 bg-gray-900 z-[70] flex flex-col">
          {/* --- NEW: Flashing Alert Overlay --- */}
          {flash.show && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
              <h1 className="text-5xl md:text-7xl font-black text-white/40 animate-pulse-four-times">
                {flash.message}
              </h1>
            </div>
          )}

          {/* --- Top-Right Overlay: Status and Close Button --- */}
          <div className="absolute top-4 right-4 z-20 bg-black/60 p-1 rounded-lg flex items-center gap-2">
            {tempoAlert ? (
              <span
                className={`text-xl font-bold animate-fast-pulse drop-shadow-md ${tempoAlert === "speedUp" ? "text-green-400" : "text-yellow-400"}`}
              >
                {tempoAlert === "speedUp" ? "SPEED UP!" : "SLOW DOWN!"}
              </span>
            ) : (
              <span className="text-xs text-gray-300 mr-2">
                {statusMessage}
              </span>
            )}
            {pdf &&
              (isCached ? (
                <span
                  title="File is cached offline"
                  className="p-1 text-green-500"
                >
                  <CachedIcon />
                </span>
              ) : (
                <span
                  title="File is not cached offline"
                  className="p-1 text-gray-500"
                >
                  <CacheReadyIcon />
                </span>
              ))}
            {song.tempo && <TempoIndicator tempo={song.tempo} />}
            <button
              onClick={onClose}
              className="text-white p-2 rounded-full hover:bg-gray-700"
            >
              <XIcon />
            </button>
          </div>

          {/* --- Top-Center Title --- */}
          <div className="absolute top-0 left-0 right-0 pt-4 text-center pointer-events-none z-10">
            <h1 className="text-lg font-semibold text-gray-400">
              {song.title}
            </h1>
          </div>

          {/* --- PDF/Lyrics Content (NEW RENDER LOGIC) --- */}
          <div className="flex-1 bg-gray-900 overflow-hidden">
            {isMobileButtonView ? (
              // --- 1. iOS / Android Render ---
              <ButtonView
                songTitle={song.title}
                browserOpenUrl={browserOpenUrl}
                onShare={handleShare}
                isShareSupported={isShareSupported}
                isLoadingShare={isLoadingShare}
              />
            ) : pdfSource ? (
              // --- 2. PC/Desktop Render ---
              <embed
                src={pdfSource}
                type="application/pdf"
                width="100%"
                height="100%"
              />
            ) : song.id === "BREAK_ITEM" ? (
              <div
                className="flex items-center justify-center h-full text-indigo-300 text-5xl font-bold"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                --- BREAK ---
              </div>
            ) : (
              // --- 3. Lyrics Render (All platforms) ---
              <div
                ref={contentRef}
                className="h-full overflow-y-auto p-4"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={(e) => handleTouchMove(e, { passive: false })}
              >
                {!areLyricsEmpty(song.lyricsChords) ? (
                  <>
                    {/* --- THIS IS THE FIX: Increased spacer height to push lyrics down --- */}
                    <div className="h-[25vh]"></div>
                    <div
                      className="text-gray-200 text-lg prose prose-invert max-w-none"
                      style={{
                        fontFamily:
                          "'Roboto Mono', 'Consolas', 'Menlo', monospace",
                      }}
                    >
                      {/* --- THIS IS THE FIX --- */}
                      {/* The `key` prop ensures the viewer re-initializes when the song changes. */}
                      <LyricsRenderer
                        lyrics={plainTextLyrics}
                        onChordClick={handleChordClick}
                        validChordNames={validChordNames}
                      />
                    </div>
                    {/* --- THIS IS THE FIX: Add an end-of-song marker --- */}
                    <div className="h-8"></div> {/* Spacer */}
                    <div
                      ref={endOfSongRef}
                      className="text-center text-gray-500 font-semibold py-4"
                    >
                      -- END --
                    </div>
                    <div className="h-[50vh]"></div>{" "}
                    {/* Extra space at the bottom */}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-xl">
                    No lyrics available
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- Bottom Bar: Conductor Nav & Scroll Controls --- */}
          {!pdf && ( // Show for lyrics view, including breaks
            <div
              ref={bottomBarRef} // --- THIS IS THE FIX: Attach the ref ---
              className="bg-gray-700 py-2 px-4 flex items-center justify-between gap-4 flex-shrink-0"
            >
              {/* Left: Previous Button */}
              <div className="flex-1 flex justify-start">
                {isLiveConductor && (
                  <button
                    onClick={() => onSongNav(-1)}
                    disabled={!canGoPrev}
                    className="bg-gray-600 p-3 rounded-full hover:bg-gray-500 disabled:opacity-25 disabled:cursor-not-allowed flex items-center gap-2 text-sm uppercase font-semibold tracking-wider min-w-0 text-white"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    {previousSong ? (
                      <span className="hidden md:inline truncate">
                        Prev: {previousSong.title}
                      </span>
                    ) : (
                      <span className="hidden md:inline text-gray-300 font-semibold">
                        At Start
                      </span>
                    )}
                  </button>
                )}
              </div>

              {/* Center: Scroll Controls */}
              <div className="flex items-center justify-center gap-4">
                <div
                  className="relative"
                  title={!isProTier ? "Pro feature" : "Show Chord Diagrams"}
                >
                  <button
                    onClick={() =>
                      isProTier && setIsChordBarVisible((prev) => !prev)
                    }
                    disabled={!isProTier || uniqueChords.length === 0}
                    className={`bg-gray-600 p-3 rounded-full text-white ${isProTier ? "hover:bg-gray-500" : "opacity-50 cursor-not-allowed"} disabled:text-gray-500 disabled:hover:bg-gray-600`}
                  >
                    {diagramInstrument === "piano" ? (
                      <PianoIcon />
                    ) : (
                      <ChordIcon />
                    )}
                  </button>
                </div>
                <button
                  onClick={handleNoteToggle}
                  disabled={!song.notes}
                  title="Show Quick Notes"
                  className="bg-gray-600 p-3 rounded-full hover:bg-gray-500 text-white disabled:text-gray-500 disabled:hover:bg-gray-600 disabled:cursor-not-allowed"
                >
                  <InfoIcon />
                </button>
                <button
                  onClick={() => setShowSetlistModal(true)}
                  title="Setlist Overview"
                  className="bg-gray-600 p-3 rounded-full hover:bg-gray-500 text-white"
                >
                  <ListMusicIcon />
                </button>
                {song.id !== "BREAK_ITEM" && (
                  <button
                    onClick={handleScrollSpeedToggle}
                    title={`Scroll Speed: ${getScrollSpeedLabel()}`}
                    className="bg-gray-600 rounded-full hover:bg-gray-500 text-white h-[48px] px-4 flex items-center justify-center"
                  >
                    <span className="font-semibold text-sm tracking-wider">
                      {getScrollSpeedLabel()}
                    </span>
                  </button>
                )}
              </div>

              {/* Right: Next Button */}
              <div className="flex-1 flex justify-end items-center">
                {isLiveConductor && (
                  <button
                    onClick={() => onSongNav(1)}
                    disabled={!canGoNext}
                    className="bg-gray-600 p-3 rounded-full hover:bg-gray-500 disabled:opacity-25 disabled:cursor-not-allowed flex items-center gap-2 text-sm uppercase font-semibold tracking-wider min-w-0 text-white"
                  >
                    {nextSong ? (
                      <span className="hidden md:inline truncate">
                        Next: {nextSong.title}
                      </span>
                    ) : (
                      <span className="hidden md:inline text-gray-300 font-semibold">
                        End of the set!
                      </span>
                    )}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* --- NEW: Chord Diagram Overlay --- */}
          {isChordBarVisible && uniqueChords.length > 0 && (
            /* --- DEFINITIVE FIX --- */
            /* The styles are now consolidated onto a single div. This ensures the container is centered, */
            /* has a max-width of 80vw, and has the correct semi-transparent background. */
            /* --- THIS IS THE FIX: Restructured to ensure transparency works with backdrop-filter --- */
            <div
              className="fixed bottom-[60px] left-1/2 -translate-x-1/2 w-auto z-20 pointer-events-auto animate-fade-in-up rounded-lg shadow-lg backdrop-blur-sm"
              style={{ maxWidth: "80vw" }}
            >
              <div
                className="p-4 rounded-lg"
                style={{ backgroundColor: "rgba(31, 41, 55, 0.3)" }}
              >
                {/* --- NEW: Instrument Toggle --- */}
                <div className="flex justify-center mb-3">
                  <div className="bg-gray-700 rounded-full p-1 flex text-sm">
                    <button
                      onClick={() => setDiagramInstrument("guitar")}
                      className={`px-3 py-1 rounded-full transition-colors ${diagramInstrument === "guitar" ? "bg-sky-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
                    >
                      Guitar
                    </button>
                    <button
                      onClick={() => setDiagramInstrument("piano")}
                      className={`px-3 py-1 rounded-full transition-colors ${diagramInstrument === "piano" ? "bg-sky-600 text-white" : "text-gray-300 hover:bg-gray-600"}`}
                    >
                      Piano
                    </button>
                  </div>
                </div>

                {/* Chord Diagrams */}
                <div className="flex flex-nowrap items-start justify-start gap-2 max-h-[35vh] overflow-x-auto pb-2">
                  {uniqueChords.map((chordProps) => (
                    <div
                      key={chordProps.key}
                      className="flex flex-col items-center"
                      title={chordProps.key}
                    >
                      {/* --- THIS IS THE FIX: Added onClick to open the modal --- */}
                      <div
                        className="bg-white rounded-md p-1 w-28 h-32 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
                        onClick={() => handleChordClick(`[${chordProps.key}]`)}
                      >
                        {chordProps.isPiano ? (
                          <CustomPianoDiagram
                            notes={chordProps.chord.frets}
                            chordName={chordProps.key}
                          /> // --- REVERT: Use the react-chords component ---
                        ) : (
                          <Chord
                            chord={chordProps.chord}
                            instrument={chordProps.instrument}
                            customizations={window.chordDiagramCustomizations}
                          />
                        )}
                      </div>
                      <span className="text-xs font-semibold text-white mt-1">
                        {chordProps.key}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- NEW: Enlarged Chord Diagram Modal --- */}
          {selectedChord && (
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[80] flex items-center justify-center animate-fade-in"
              onClick={() => setSelectedChord(null)} // Close on background click
            >
              <div
                className="relative bg-white rounded-lg p-4 flex flex-col items-center"
                onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal content
              >
                <h3 className="text-2xl font-bold mb-4 text-black">
                  {selectedChord.key}
                </h3>
                <div className="w-64 h-72 flex items-center justify-center">
                  {selectedChord.isPiano ? (
                    <CustomPianoDiagram
                      notes={
                        selectedChord.inversions[selectedVoicingIndex] || []
                      }
                      chordName={selectedChord.key}
                    />
                  ) : (
                    // --- REVERT: Use the react-chords component with an Error Boundary ---
                    <ErrorBoundary
                      key={selectedVoicingIndex}
                      fallback={
                        <div className="text-center text-gray-500 p-4">
                          Could not display this chord.
                        </div>
                      }
                    >
                      <Chord
                        chord={selectedChord.positions[selectedVoicingIndex]}
                        instrument={selectedChord.instrument}
                        customizations={window.chordDiagramCustomizations}
                      />
                    </ErrorBoundary>
                  )}
                </div>
                <button
                  onClick={() => setSelectedChord(null)}
                  className="absolute top-2 right-2 text-gray-500 hover:text-black p-1"
                >
                  <XIcon size={24} />
                </button>

                {/* --- NEW: Voicing/Inversion Controls --- */}
                <div className="mt-4 flex flex-col items-center justify-center gap-3 w-full">
                  {/* --- NEW: Set as Default Button --- */}
                  <button
                    onClick={handleSetDefaultVoicing}
                    className={`text-sm font-semibold py-1 px-3 rounded-md transition-colors ${getDefaultVoicing(song.id, selectedChord.key) === selectedVoicingIndex ? "bg-sky-600 text-white cursor-default" : "bg-gray-200 text-black hover:bg-gray-300"}`}
                  >
                    {getDefaultVoicing(song.id, selectedChord.key) ===
                    selectedVoicingIndex
                      ? "★ Default"
                      : "Set as Default"}
                  </button>

                  {/* Voicing/Inversion Navigation */}
                  {selectedChord.isPiano &&
                    selectedChord.inversions.length > 1 && (
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={() =>
                            setSelectedVoicingIndex(
                              (prev) =>
                                (prev - 1 + selectedChord.inversions.length) %
                                selectedChord.inversions.length
                            )
                          }
                          className="bg-gray-200 text-black px-3 py-1 rounded-md"
                        >
                          Prev
                        </button>
                        <span className="text-sm font-semibold text-gray-600 w-32 text-center">
                          {
                            selectedVoicingIndex === 0
                              ? "Root Position"
                              : selectedVoicingIndex === 1
                                ? "1st Inversion"
                                : selectedVoicingIndex === 2
                                  ? "2nd Inversion"
                                  : selectedVoicingIndex === 3
                                    ? "3rd Inversion"
                                    : `${selectedVoicingIndex}th Inversion` // Fallback for 4th, 5th, etc.
                          }
                        </span>
                        <button
                          onClick={() =>
                            setSelectedVoicingIndex(
                              (prev) =>
                                (prev + 1) % selectedChord.inversions.length
                            )
                          }
                          className="bg-gray-200 text-black px-3 py-1 rounded-md"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  {!selectedChord.isPiano &&
                    selectedChord.positions.length > 1 && (
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={() =>
                            setSelectedVoicingIndex(
                              (prev) =>
                                (prev - 1 + selectedChord.positions.length) %
                                selectedChord.positions.length
                            )
                          }
                          className="bg-gray-200 text-black px-3 py-1 rounded-md"
                        >
                          Prev
                        </button>
                        <span className="text-sm font-semibold text-gray-600">
                          Voicing {selectedVoicingIndex + 1} of{" "}
                          {selectedChord.positions.length}
                        </span>
                        <button
                          onClick={() =>
                            setSelectedVoicingIndex(
                              (prev) =>
                                (prev + 1) % selectedChord.positions.length
                            )
                          }
                          className="bg-gray-200 text-black px-3 py-1 rounded-md"
                        >
                          Next
                        </button>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* --- NEW: Quick Notes Display --- */}
          {isChordBarVisible && uniqueChords.length === 0 && (
            <div className="fixed bottom-[60px] left-1/2 -translate-x-1/2 w-auto max-w-lg z-20 pointer-events-none animate-fade-in-up">
              <div className="bg-gray-800/90 backdrop-blur-sm shadow-lg rounded-lg p-3 text-center text-sky-300 text-base">
                No chords found for this song.
              </div>
            </div>
          )}

          {/* --- NEW: Quick Notes Display --- */}
          {(isNoteManuallyVisible || isNoteTemporarilyVisible) &&
            song.notes && (
              <div className="fixed bottom-[60px] left-1/2 -translate-x-1/2 w-auto max-w-lg z-20 pointer-events-none">
                <div className="bg-gray-800/90 backdrop-blur-sm shadow-lg rounded-lg p-3 text-center text-sky-300 text-base animate-fade-in-up">
                  {song.notes}
                </div>
              </div>
            )}

          {/* --- Floating Scroll Control Panel --- */}
          {!pdf && (
            <div
              className={`fixed top-1/2 right-0 -translate-y-1/2 flex items-center z-30 transition-transform duration-300 ease-in-out ${isControlsVisible ? "translate-x-0" : "translate-x-[calc(100%-1.5rem)]"}`}
              onTouchStart={handleSidebarSwipeStart}
              onTouchEnd={handleSidebarSwipeEnd}
            >
              {/* Handle for toggling - This is now part of the sliding container */}
              <div
                onClick={() => setIsControlsVisible(!isControlsVisible)}
                className="w-6 h-20 tall:h-24 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-l-lg cursor-pointer text-white"
              >
                <DotsVerticalIcon
                  className={`transition-transform duration-300 ${isControlsVisible ? "rotate-90" : ""}`}
                />
              </div>

              {/* Main Content Panel */}
              <div className="p-1 tall:p-2 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-l-lg gap-2 tall:gap-4 w-16 tall:w-20">
                {song.id !== "BREAK_ITEM" && (
                  <>
                    {/* Scroll Toggle Group */}
                    <div className="flex flex-col items-center gap-2 w-full">
                      <span className="text-xs text-gray-400">SCROLL</span>
                      {isScrolling ? (
                        <button
                          onClick={stopScrolling}
                          className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 tall:py-6 px-2 rounded-md text-sm tall:text-base"
                        >
                          STOP
                        </button>
                      ) : (
                        <button
                          onClick={startScrolling}
                          className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 tall:py-6 px-2 rounded-md text-sm tall:text-base"
                        >
                          START
                        </button>
                      )}
                    </div>
                    {/* Tempo Control Group */}
                    {!isPracticeMode && (
                      <div className="flex flex-col items-center gap-2 w-full">
                        <span className="text-xs text-gray-400">TEMPO</span>
                        <button
                          onClick={() => handleTempoAlert("speedUp")}
                          disabled={isTempoChanging}
                          className={`text-white font-bold py-3 tall:py-6 px-2 rounded-lg w-full text-center text-xl tall:text-2xl transition-all duration-150 ${tempoAlert === "speedUp" ? "animate-fast-pulse bg-green-500 scale-105" : "bg-gray-700 hover:bg-gray-600"} disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed`}
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleTempoAlert("slowDown")}
                          disabled={isTempoChanging}
                          className={`text-white font-bold py-3 tall:py-6 px-2 rounded-lg w-full text-center text-xl tall:text-2xl transition-all duration-150 ${tempoAlert === "slowDown" ? "animate-fast-pulse bg-yellow-500 scale-105" : "bg-gray-700 hover:bg-gray-600"} disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed`}
                        >
                          -
                        </button>
                      </div>
                    )}
                  </>
                )}
                {/* NEW: Ready Check Group */}
                {currentUserMemberData?.checkedIn && !isPracticeMode && (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <span className="text-xs text-gray-400">READY</span>
                    <button
                      onClick={() =>
                        handleSetReady(!currentUserMemberData?.isReady)
                      }
                      className={`w-full flex justify-center items-center font-bold py-4 tall:py-6 px-2 rounded-md text-sm tall:text-lg transition-all duration-300 ${allReady ? "bg-green-600 hover:bg-green-500 text-white" : currentUserMemberData?.isReady ? "bg-transparent border-2 border-green-500 text-green-400 hover:bg-green-500 hover:text-white" : "bg-gray-700 hover:bg-gray-600 text-white"}`}
                    >
                      {allReady ? (
                        "ALL"
                      ) : currentUserMemberData?.isReady ? (
                        <ReadyIcon />
                      ) : (
                        <NotReadyIcon />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* --- NEW: Render the modal inside the full-screen view --- */}
          {setlist && showSetlistModal && (
            <CombinedSetlistModal
              bandData={bandData}
              activeSetlist={setlist}
              allSongs={bandData.songs}
              currentSongIndex={currentSongIndex}
              isLiveConductor={isLiveConductor}
              onClose={() => setShowSetlistModal(false)} // Just close the modal
              onSaveSetlist={onSaveSetlist}
              onSongSelected={onSongSelected}
              onJumpToSong={onJumpToSong}
              showToast={showToast}
              db={db}
              user={user}
              isOffline={isOffline}
            />
          )}
        </div>
      )
    )
  );
}

export default FullScreenSongViewer;
