import { useState, useCallback } from "react";
import {
  DownloadIcon,
  TrashIcon,
  UploadIcon,
  FileTextIcon,
} from "../helpers/Icons";
import { Chord } from "tonal";
import ConfirmationModal from "./modals/ConfirmationModal.jsx";
import LexicalEditor from "./ui/LexicalEditor.jsx";
import * as pdfjs from "pdfjs-dist/build/pdf.min.mjs";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Spinner from "./ui/Spinner.jsx";
import { createWorker } from "tesseract.js";

// Configure the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function SongEditor({
  song,
  onSave,
  onCancel,
  allSongs,
  bandData = {},
  storage,
  user,
  showToast,
  refreshAuthToken,
  isOffline = false,
}) {
  const [title, setTitle] = useState(song.title || "");

  // Initialize state with auto-conversion for legacy plaintext
  const [lyricsChords, setLyricsChords] = useState(() => {
    const content = song.lyricsChords || "";

    // Helper to create paragraph node
    const createParagraph = (text) => ({
      children: text
        ? [
            {
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: text,
              type: "text",
              version: 1,
            },
          ]
        : [],
      direction: "ltr",
      format: "",
      indent: 0,
      type: "paragraph",
      version: 1,
    });

    // Helper to create root JSON
    const createRoot = (paragraphs) =>
      JSON.stringify({
        root: {
          children: paragraphs,
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      });

    // Check if it looks like JSON (starts with '{'). If not, and it has content, wrap it.
    if (
      content &&
      typeof content === "string" &&
      !content.trim().startsWith("{")
    ) {
      const cleanText = content
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "");

      const lines = cleanText.split("\n");
      const paragraphs = lines.map((line) => createParagraph(line));
      return createRoot(paragraphs);
    }

    // Fix for "One Giant Node" JSON (previously converted songs that are causing errors)
    if (
      content &&
      typeof content === "string" &&
      content.trim().startsWith("{")
    ) {
      try {
        const parsed = JSON.parse(content);
        const children = parsed.root?.children || [];

        // Check if it's a single paragraph with a single text node containing newlines
        if (children.length === 1 && children[0].type === "paragraph") {
          const grandChildren = children[0].children || [];
          if (grandChildren.length === 1 && grandChildren[0].type === "text") {
            const text = grandChildren[0].text || "";
            if (text.includes("\n")) {
              // Detected "One Giant Node" with newlines! Re-convert to multi-paragraph.
              const lines = text.split("\n");
              const paragraphs = lines.map((line) => createParagraph(line));
              return createRoot(paragraphs);
            }
          }
        }
      } catch (e) {
        // Ignore parsing errors, let Lexical handle it or fail gracefully
      }
    }
    return content;
  });

  const [editorKey, setEditorKey] = useState(song.id || "new-song");

  const [tempo, setTempo] = useState(song.tempo || "");
  const [notes, setNotes] = useState(song.notes || "");
  const [newPdfFiles, setNewPdfFiles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState("");
  const [existingPdfs, setExistingPdfs] = useState(song.pdfs || []);
  const [validationError, setValidationError] = useState("");
  const [pdfsToDelete, setPdfsToDelete] = useState([]);

  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    confirmText: "Confirm",
    confirmColor: "bg-red-600",
  });

  const handleLyricsChange = useCallback((htmlString) => {
    setLyricsChords(htmlString);
  }, []);

  const showConfirmation = ({
    title,
    message,
    onConfirm,
    confirmText,
    confirmColor,
  }) => {
    setConfirmation({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        hideConfirmation();
      },
      confirmText,
      confirmColor,
    });
  };

  const hideConfirmation = () => {
    setConfirmation({
      isOpen: false,
      title: "",
      message: "",
      onConfirm: () => {},
    });
  };

  const handleDeletePdf = (pdfToDelete) => {
    showConfirmation({
      title: "Delete File?",
      message: `This will permanently delete the file "${pdfToDelete.name}". This cannot be undone.`,
      confirmText: "Delete",
      confirmColor: "bg-red-600",
      onConfirm: () => {
        setPdfsToDelete((prev) => [...prev, pdfToDelete]);
        setExistingPdfs((prev) =>
          prev.filter((p) => p.path !== pdfToDelete.path)
        );
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setValidationError("");

    if (!title.trim()) {
      setValidationError("Title is required.");
      return;
    }

    const totalFileSize = newPdfFiles.reduce((acc, file) => acc + file.size, 0);
    if (totalFileSize > 50 * 1024 * 1024) {
      // 50MB per upload limit
      setError("Total file size for a single upload cannot exceed 50 MB.");
      return;
    }

    const normalizedTitle = title.trim().toLowerCase();
    const duplicateSong = allSongs.find(
      (s) =>
        s.id !== song.id && s.title.trim().toLowerCase() === normalizedTitle
    );
    if (duplicateSong) {
      setError("A song with this title already exists in your library.");
      return;
    }

    const existingPdfNames = existingPdfs.map((p) => p.name.toLowerCase());
    const newPdfNames = newPdfFiles.map((f) => f.name.toLowerCase());

    if (new Set(newPdfNames).size !== newPdfNames.length) {
      setError(
        "Cannot upload multiple files with the same name at the same time."
      );
      return;
    }

    const duplicatePdfName = newPdfNames.find((name) =>
      existingPdfNames.includes(name)
    );
    if (duplicatePdfName) {
      setError(
        `A PDF named "${duplicatePdfName}" already exists for this song. Please remove the old one first or rename the new one.`
      );
      return;
    }

    setIsSaving(true);
    try {
      const songData = {
        ...song,
        title,
        lyricsChords,
        tempo,
        notes,
        pdfs: existingPdfs,
      };
      await onSave(songData, newPdfFiles, pdfsToDelete);
    } catch (error) {
      console.error("Failed to save song:", error);
      const firebaseError = error.message || "An unknown error occurred.";
      let claims = {
        bandRole: "Not found",
        activeBandId: "Not found",
        error: null,
      };

      if (window.auth && window.auth.currentUser) {
        try {
          const idTokenResult =
            await window.auth.currentUser.getIdTokenResult(true);
          claims = idTokenResult.claims;
        } catch (tokenError) {
          claims.error = "Could not retrieve token claims.";
        }
      } else {
        claims.error = "No current user found.";
      }

      const detailedError = `**Error:** ${firebaseError}`;
      setError(detailedError);

      setPdfsToDelete([]);
      setExistingPdfs(song.pdfs || []);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePdfImport = async (file) => {
    setIsParsing(true);
    setError("");
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const pdfData = new Uint8Array(event.target.result);
          const pdf = await pdfjs.getDocument({ data: pdfData }).promise;
          // allParagraphs accumulates Lexical paragraph nodes from the pdfjs path.
          // We build JSON directly instead of HTML so that space-based chord/lyric
          // alignment is preserved — HTML collapses multiple spaces into one.
          let allParagraphs = [];
          let fullText = ""; // Used only by the OCR fallback path below

          const mkParagraph = (text) => ({
            children: text
              ? [{ detail: 0, format: 0, mode: "normal", style: "", text, type: "text", version: 1 }]
              : [],
            direction: "ltr",
            format: "",
            indent: 0,
            type: "paragraph",
            version: 1,
          });

          const isChordLine = (lineItems) => {
            if (!lineItems || lineItems.length === 0) return false;
            const tokens = lineItems
              .map((item) => item.str.trim())
              .filter((s) => s);
            if (tokens.length === 0) return false;
            const chordCount = tokens.filter(
              (token) => !Chord.get(token).empty
            ).length;
            return chordCount / tokens.length > 0.5;
          };

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            if (!textContent.items || textContent.items.length === 0) continue;

            let totalWidthAll = 0;
            let totalCharsAll = 0;
            for (const item of textContent.items) {
              const text = item.str.trim();
              if (text.length > 0) {
                totalWidthAll += item.width;
                totalCharsAll += text.length;
              }
            }
            const pageAvgCharWidth =
              totalCharsAll > 0 ? totalWidthAll / totalCharsAll : 6;

            const lines = new Map();
            for (const item of textContent.items) {
              const y = Math.round(item.transform[5]);
              if (!lines.has(y)) lines.set(y, []);
              lines.get(y).push(item);
            }

            const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
            const processedY = new Set();
            let pageParagraphs = [];

            for (let i = 0; i < sortedY.length; i++) {
              const y = sortedY[i];
              if (processedY.has(y)) continue;

              const lineItems = lines
                .get(y)
                .sort((a, b) => a.transform[4] - b.transform[4]);

              if (isChordLine(lineItems)) {
                const nextY = i + 1 < sortedY.length ? sortedY[i + 1] : null;
                const nextLineItems = nextY
                  ? lines
                      .get(nextY)
                      .sort((a, b) => a.transform[4] - b.transform[4])
                  : null;

                if (
                  nextY &&
                  nextLineItems &&
                  nextLineItems.length > 0 &&
                  !isChordLine(nextLineItems)
                ) {
                  processedY.add(nextY);

                  // Prefer the lyric line's own char width for both lines — chord text is often
                  // bold/larger, so using the lyric line's metrics gives a more accurate shared grid.
                  // Fall back to the page average if lyric widths are zero (some PDF renderers omit them).
                  const lyricTotalWidth = nextLineItems.reduce((s, item) => s + item.width, 0);
                  const lyricTotalChars = nextLineItems.reduce((s, item) => s + item.str.trim().length, 0);
                  const pairCharWidth = (lyricTotalChars > 0 && lyricTotalWidth > 0)
                    ? lyricTotalWidth / lyricTotalChars
                    : pageAvgCharWidth;

                  const firstChordX = lineItems[0].transform[4];
                  const firstLyricX = nextLineItems[0].transform[4];
                  const blockStartX = Math.min(firstChordX, firstLyricX);

                  // Build lyric line, tracking visual column explicitly so positions
                  // stay in sync with the chord line using the same character grid.
                  let lyricLineHtml = "";
                  let lyricCol = 0;
                  for (const item of nextLineItems) {
                    const itemText = item.str.trim();
                    if (!itemText) continue;
                    const targetCol = Math.round((item.transform[4] - blockStartX) / pairCharWidth);
                    if (targetCol > lyricCol) {
                      lyricLineHtml += " ".repeat(targetCol - lyricCol);
                      lyricCol = targetCol;
                    } else if (lyricCol > 0 && !lyricLineHtml.endsWith(" ")) {
                      lyricLineHtml += " ";
                      lyricCol++;
                    }
                    lyricLineHtml += itemText;
                    lyricCol += itemText.length;
                  }

                  // Build chord line using the same pairCharWidth and explicit column tracking.
                  // chordCol tracks the visual column (not string length) so bracket chars
                  // don't throw off the position of subsequent chords.
                  const chordItems = lineItems
                    .map((item) => ({
                      text: item.str.trim(),
                      x: item.transform[4],
                    }))
                    .filter((item) => item.text && !Chord.get(item.text).empty);

                  let chordLineHtml = "";
                  let chordCol = 0;
                  for (const chordItem of chordItems) {
                    const targetCol = Math.max(chordCol, Math.round((chordItem.x - blockStartX) / pairCharWidth));
                    if (targetCol > chordCol) {
                      chordLineHtml += " ".repeat(targetCol - chordCol);
                      chordCol = targetCol;
                    } else if (chordCol > 0 && !chordLineHtml.endsWith(" ")) {
                      chordLineHtml += " ";
                      chordCol++;
                    }
                    chordLineHtml += `[${chordItem.text}]`;
                    chordCol += chordItem.text.length + 2; // +2 for [ and ]
                  }

                  pageParagraphs.push(mkParagraph(chordLineHtml));
                  pageParagraphs.push(mkParagraph(lyricLineHtml.trimEnd()));
                } else {
                  // Chord-only line (e.g. intro/outro progressions): evenly space with double-space separator
                  const chords = lineItems
                    .map((item) => item.str.trim())
                    .filter((text) => text && !Chord.get(text).empty)
                    .map((text) => `[${text}]`);
                  if (chords.length > 0) {
                    pageParagraphs.push(mkParagraph(chords.join("  ")));
                  }
                }
              } else {
                pageParagraphs.push(mkParagraph(lineItems.map((item) => item.str).join(" ")));
              }
              processedY.add(y);
            }
            allParagraphs.push(...pageParagraphs);
          }

          // If the pdfjs path produced no paragraphs, try OCR (Optical Character Recognition)
          if (allParagraphs.length === 0) {
            try {
              showToast(
                "No text found. Scanning a different way. This may take a moment...",
                "info"
              );
              const worker = await createWorker("eng");

              for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext("2d");

                await page.render({ canvasContext: context, viewport }).promise;
                const { data } = await worker.recognize(canvas);

                let linesToProcess = [];
                // Try to use detailed line/word data to reconstruct spacing
                if (data.lines && data.lines.length > 0) {
                  linesToProcess = data.lines.map((line) => {
                    if (!line.words || line.words.length === 0)
                      return line.text;

                    // Calculate average character width for this line
                    let totalWidth = 0;
                    let totalChars = 0;
                    line.words.forEach((w) => {
                      totalWidth += w.bbox.x1 - w.bbox.x0;
                      totalChars += w.text.length;
                    });
                    const avgCharWidth =
                      totalChars > 0
                        ? Math.max(5, totalWidth / totalChars)
                        : 12;

                    let constructedLine = "";
                    let lastX = line.words[0].bbox.x0;

                    line.words.forEach((w, i) => {
                      if (i > 0) {
                        const gap = w.bbox.x0 - lastX;
                        const numSpaces = Math.max(
                          1,
                          Math.round(gap / avgCharWidth)
                        );
                        constructedLine += " ".repeat(numSpaces);
                      }
                      constructedLine += w.text;
                      lastX = w.bbox.x1;
                    });
                    return constructedLine;
                  });
                } else if (data.text) {
                  linesToProcess = data.text.split("\n");
                }

                if (linesToProcess.length > 0) {
                  for (const line of linesToProcess) {
                    const originalText = line.replace(/[\r\n]+$/, "");
                    if (!originalText.trim()) {
                      fullText += "<p><br/></p>";
                      continue;
                    }

                    // Helper to split merged chords (e.g. "CFCG7" -> ["C", "F", "C", "G7"])
                    const trySplitChords = (str) => {
                      const results = [];
                      let remaining = str;
                      while (remaining.length > 0) {
                        let match = null;
                        // Try matching from longest to shortest (max chord length ~10)
                        for (
                          let len = Math.min(remaining.length, 10);
                          len > 0;
                          len--
                        ) {
                          const sub = remaining.substring(0, len);
                          // Must start with A-G and be a valid chord
                          if (/^[A-G]/.test(sub) && !Chord.get(sub).empty) {
                            match = sub;
                            break;
                          }
                        }
                        if (match) {
                          results.push(match);
                          remaining = remaining.substring(match.length);
                        } else {
                          return null; // Failed to parse completely as chords
                        }
                      }
                      return results;
                    };

                    // Heuristic to detect chord lines and fix OCR errors
                    const parts = originalText.split(/(\s+)/);
                    let validChordCount = 0;
                    let contentTokenCount = 0;

                    const analyzedTokens = parts.map((part) => {
                      if (!part.trim()) return null;
                      contentTokenCount++;
                      let t = part.trim();
                      // Specific OCR fixes
                      if (t === "6") t = "G";
                      if (t === "67") t = "G7";
                      if (t === "GI") t = "G7";
                      if (t === "6I") t = "G7";
                      if (t === "F:") t = "F";
                      if (t === "Cc") t = "C";
                      if (t === "c") t = "C";
                      if (t === "[A") t = "C";
                      if (t === "[4") t = "C";
                      if (t === "[+") t = "C";
                      if (t === "I") t = "C";
                      if (/^[a-g]/.test(t))
                        t = t.charAt(0).toUpperCase() + t.slice(1);

                      if (!Chord.get(t).empty) {
                        validChordCount++;
                        return { isChord: true, text: t };
                      }

                      // Try splitting merged chords
                      const split = trySplitChords(t);
                      if (split) {
                        validChordCount += split.length;
                        contentTokenCount += split.length - 1;
                        return { isChord: true, isMulti: true, chords: split };
                      }

                      return { isChord: false, text: part.trim() };
                    });

                    const isChordLine =
                      contentTokenCount > 0 &&
                      validChordCount / contentTokenCount > 0.5;
                    let lineHtml = "";

                    parts.forEach((part, index) => {
                      if (!part.trim()) {
                        lineHtml += part;
                      } else if (
                        isChordLine &&
                        analyzedTokens[index]?.isChord
                      ) {
                        if (analyzedTokens[index].isMulti) {
                          lineHtml += analyzedTokens[index].chords
                            .map((c) => `[${c}]`)
                            .join(" ");
                        } else {
                          lineHtml += `[${analyzedTokens[index].text}]`;
                        }
                      } else {
                        lineHtml += part
                          .trim()
                          .replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;");
                      }
                    });

                    fullText += `<p>${lineHtml}</p>`;
                  }
                }
              }
              await worker.terminate();
            } catch (ocrError) {
              console.error("OCR failed:", ocrError);
            }
          }

          if (allParagraphs.length === 0 && !fullText.trim()) {
            setError(
              "No text content could be extracted from this PDF. It might contain only images or be in an unsupported format."
            );
          } else if (allParagraphs.length > 0) {
            // pdfjs path: output as Lexical JSON so spaces are preserved exactly
            const lexicalJson = JSON.stringify({
              root: {
                children: allParagraphs,
                direction: "ltr",
                format: "",
                indent: 0,
                type: "root",
                version: 1,
              },
            });
            setLyricsChords(lexicalJson);
            setEditorKey((prevKey) => prevKey + "-update");
            showToast("PDF content imported successfully!", "success");
          } else {
            // OCR fallback path: output as HTML (spaces are approximate here anyway)
            setLyricsChords(fullText);
            setEditorKey((prevKey) => prevKey + "-update");
            showToast("PDF content imported successfully!", "success");
          }
        } catch (e) {
          console.error("Error parsing PDF content:", e);
          setError(
            "Could not read content from the PDF. The file might be corrupted or in an unsupported format."
          );
        } finally {
          setIsParsing(false);
        }
      };
      reader.onerror = () => {
        setError("Failed to read the file for parsing.");
        setIsParsing(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error("Error setting up PDF import:", e);
      setError("An unexpected error occurred while setting up the PDF import.");
      setIsParsing(false);
    }
  };

  const handleAttachmentChange = (e) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter(
        (file) => file.type === "application/pdf" || file.type === "text/plain"
      );

      if (validFiles.length !== files.length) {
        setError("Only PDF and TXT files are allowed.");
      } else {
        setError("");
      }

      setNewPdfFiles(files);
    }
  };

  const handleImportLyricsChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type === "application/pdf") {
        handlePdfImport(file);
        e.target.value = null; // Reset input to allow re-selecting the same file
      } else {
        setError("Please select a PDF file for lyrics import.");
      }
    }
  };

  const handleDirectDownload = async (pdf) => {
    try {
      const response = await fetch(pdf.url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = pdf.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Error downloading file:", error);
      showToast("Could not download file.", "error");
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <h2 className="text-2xl font-bold mb-4 flex-shrink-0">
          {song.id ? "Edit Song" : "Add New Song"}
        </h2>
        {error && (
          <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4 flex-shrink-0 whitespace-pre-wrap">
            {error}
          </p>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto pr-2 min-h-0">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Song Title
            </label>
            <input
              type="text"
              placeholder="Song Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setValidationError("");
              }}
              className={`w-full bg-gray-700 p-2 rounded ${validationError ? "border border-red-500" : "border border-transparent"}`}
              required
            />
            {validationError && (
              <p className="text-red-400 text-xs mt-1">{validationError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Tempo
            </label>
            <input
              type="text"
              placeholder="Tempo (e.g., 120bpm)"
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              className="w-full bg-gray-700 p-2 rounded"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Quick Notes
            </label>
            <input
              type="text"
              placeholder="Quick Notes (e.g., Capo 2, Drop-D)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-700 p-2 rounded"
            />
          </div>

          <div className="bg-gray-900 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-400">
                Attachments
              </label>
              <div className="relative">
                <input
                  type="file"
                  id="attachment-upload"
                  accept=".pdf,.txt"
                  multiple
                  onChange={handleAttachmentChange}
                  className="hidden"
                />
                <label
                  htmlFor="attachment-upload"
                  className="cursor-pointer bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-1 px-3 rounded flex items-center gap-2 transition-colors"
                >
                  <UploadIcon size={14} /> Attach Files
                </label>
              </div>
            </div>

            <div className="space-y-2">
              {existingPdfs.map((pdf) => (
                <div
                  key={pdf.path}
                  className="flex items-center justify-between bg-gray-700 p-2 rounded-md"
                >
                  <span className="truncate text-sm flex-1" title={pdf.name}>
                    {pdf.name}
                  </span>
                  <div className="flex items-center gap-3 ml-2">
                    <button
                      type="button"
                      onClick={() => handleDirectDownload(pdf)}
                      title="Download File to Computer"
                      className="p-1 text-sky-400 hover:text-sky-300"
                    >
                      <DownloadIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePdf(pdf)}
                      title="Delete File Permanently"
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              ))}
              {newPdfFiles.map((file, index) => (
                <div
                  key={`new-${index}`}
                  className="flex items-center justify-between bg-gray-700/50 border border-sky-500/30 p-2 rounded-md"
                >
                  <span
                    className="truncate text-sm flex-1 text-sky-200"
                    title={file.name}
                  >
                    {file.name} (Pending)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewPdfFiles((prev) =>
                        prev.filter((_, i) => i !== index)
                      )
                    }
                    className="text-red-400 hover:text-red-300 ml-2"
                  >
                    <TrashIcon size={16} />
                  </button>
                </div>
              ))}
              {existingPdfs.length === 0 && newPdfFiles.length === 0 && (
                <p className="text-gray-500 text-sm italic text-center py-2">
                  No files attached.
                </p>
              )}
            </div>
          </div>

          <div className="bg-gray-900 p-4 rounded-lg space-y-4">
            <label className="block text-lg font-medium text-gray-200">
              Lyrics & Chords
            </label>

            <div>
              <div className="flex items-center gap-4 mb-2">
                <input
                  id="lyrics-import"
                  type="file"
                  accept=".pdf"
                  onChange={handleImportLyricsChange}
                  className="hidden"
                  disabled={isParsing}
                />
                <label
                  htmlFor="lyrics-import"
                  className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-md border border-dashed border-gray-600 hover:border-sky-500 hover:bg-gray-800 cursor-pointer transition-all ${isParsing ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <FileTextIcon className="text-sky-400" />
                  <span className="text-sm text-gray-300">
                    Import Lyrics from PDF
                  </span>
                </label>
              </div>
            </div>
            <div className="text-xs text-sky-300/80 p-2 mb-2 bg-gray-800/50 rounded-md">
              <strong>Note:</strong> SetlistSync will attempt to match letters
              to valid chords and lyrics automatically. Review after import as
              PDF conversion isn't 100% accurate.
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-grow border-t border-gray-600"></div>
              <span className="text-gray-400 text-xs">OR</span>
              <div className="flex-grow border-t border-gray-600"></div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Enter Manually
              </label>
              <div className="text-xs text-sky-300/80 p-2 mb-2 bg-gray-800/50 rounded-md">
                <strong>Tip:</strong> Type chords inside square brackets, like{" "}
                <code>[Am]</code> or <code>[Cadd9]</code>. These will become
                formatted text (Free) and diagrams (Pro only) in the song
                viewer.
              </div>
              <LexicalEditor
                key={editorKey}
                initialContent={lyricsChords}
                onChange={handleLyricsChange}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
            disabled={isSaving || isParsing}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded flex items-center"
            disabled={isSaving || isParsing}
          >
            {(isSaving || isParsing) && <Spinner />}
            {isParsing ? "Parsing..." : isSaving ? "Saving..." : "Save Song"}
          </button>
        </div>
      </form>
      {confirmation.isOpen && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          onConfirm={confirmation.onConfirm}
          onCancel={hideConfirmation}
          confirmText={confirmation.confirmText}
          confirmColor={confirmation.confirmColor}
        />
      )}
    </>
  );
}

export default SongEditor;
