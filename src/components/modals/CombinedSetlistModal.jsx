import { useState, useRef, useCallback } from "react";
import Modal from "./Modal";
import Spinner from "../ui/Spinner"; // Assuming a Spinner component
import LexicalEditor from "../ui/LexicalEditor"; // --- THIS IS THE FIX: Import the Lexical Editor ---
import {
  PlusCircleIcon,
  TrashIcon,
  MoveUpIcon,
  MoveDownIcon,
} from "../../helpers/Icons"; // Assuming these icons exist
import { Description } from "@mui/icons-material";
import PdfSelectionModal from "./PdfSelectionModal";

function CombinedSetlistModal({
  bandData,
  activeSetlist,
  allSongs,
  members,
  currentSongIndex,
  isLiveConductor,
  onClose,
  onSaveSetlist, // This will handle saving both order and new songs
  onJumpToSong, // New prop for jumping to a song
  onSongSelected, // NEW: Callback when a song/pdf is selected for viewing
  showToast,
  db, // Firestore instance
  isOffline, // NEW: Prop to indicate offline status
}) {
  const [editedSongOrder, setEditedSongOrder] = useState(
    activeSetlist.songOrder || []
  );
  const [newlyAddedSongs, setNewlyAddedSongs] = useState([]); // Songs created within this modal
  const [addSongMode, setAddSongMode] = useState("library"); // 'library' or 'new'
  const [selectedLibrarySongId, setSelectedLibrarySongId] = useState("");
  const [newSongTitle, setNewSongTitle] = useState("");
  const [newSongNotes, setNewSongNotes] = useState("");
  const [newSongLyrics, setNewSongLyrics] = useState(""); // New state for lyrics
  const [newSongTempo, setNewSongTempo] = useState(""); // New state for tempo
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewMode, setViewMode] = useState("setlist"); // 'setlist' or 'add'
  const [songForPdfSelection, setSongForPdfSelection] = useState(null);

  // --- State for Touch Drag & Drop ---
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const longPressTimeoutRef = useRef(null);
  const touchStartInfo = useRef(null); // { index: number, y: number, element: HTMLElement }

  // Combine existing songs and newly added songs for display
  const setlistSongs = editedSongOrder
    .map((songId) => {
      if (songId === "BREAK_ITEM") {
        return { id: "BREAK_ITEM", title: "--- BREAK ---" };
      }
      return (
        allSongs.find((s) => s.id === songId) ||
        newlyAddedSongs.find((s) => s.id === songId)
      );
    })
    .filter(Boolean);

  // Filter out songs already in the edited setlist for the library selection
  const availableLibrarySongs = allSongs
    .filter((song) => !editedSongOrder.includes(song.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  const draggedSongIndex = useRef(null);
  const scrollContainerRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const dropTargetIndex = useRef(null); // To highlight drop position

  // --- Touch Event Handlers for Drag & Drop ---
  const handleTouchStart = (e, index) => {
    if (!isLiveConductor || isOffline) return;

    // Prevent interfering with scroll
    touchStartInfo.current = {
      index,
      y: e.touches[0].clientY,
      element: e.currentTarget,
      initialScrollTop: scrollContainerRef.current.scrollTop,
    };

    // Long press to initiate drag
    longPressTimeoutRef.current = setTimeout(() => {
      setIsTouchDragging(true);
      draggedSongIndex.current = index;
      // Provide haptic feedback if the browser supports it
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 300); // 300ms for a long press
  };

  const handleTouchMove = useCallback(
    (e) => {
      if (
        !isTouchDragging ||
        !isLiveConductor ||
        isOffline ||
        !touchStartInfo.current
      )
        return;

      // This is a drag, not a scroll
      e.preventDefault();

      const touch = e.touches[0];
      const container = scrollContainerRef.current;
      if (!container) return;

      // --- Re-use logic from handleDragOver for scrolling and drop target detection ---
      const containerRect = container.getBoundingClientRect();
      const scrollThreshold = 60;
      const scrollSpeed = 10;

      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);

      if (touch.clientY - containerRect.top < scrollThreshold) {
        scrollIntervalRef.current = setInterval(
          () => (container.scrollTop -= scrollSpeed),
          50
        );
      } else if (containerRect.bottom - touch.clientY < scrollThreshold) {
        scrollIntervalRef.current = setInterval(
          () => (container.scrollTop += scrollSpeed),
          50
        );
      }

      // Find the element being hovered over
      const touchTargetElement = document.elementFromPoint(
        touch.clientX,
        touch.clientY
      );
      const songElement = touchTargetElement?.closest("[data-song-id]");

      if (songElement) {
        const hoverIndex = parseInt(songElement.dataset.songIndex, 10);
        const targetRect = songElement.getBoundingClientRect();
        const middleY = targetRect.top + targetRect.height / 2;
        if (touch.clientY < middleY) {
          dropTargetIndex.current = hoverIndex;
        } else {
          dropTargetIndex.current = hoverIndex + 1;
        }
        // Force a re-render to show the drop indicator
        setEditedSongOrder((prev) => [...prev]);
      }
    },
    [isLiveConductor, isTouchDragging, isOffline]
  );

  const handleDragStart = (e, index) => {
    if (isOffline) return;
    draggedSongIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index); // Required for Firefox
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (!isLiveConductor || isOffline) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const mouseY = e.clientY;

    const scrollThreshold = 60; // pixels from top/bottom to trigger scroll
    const scrollSpeed = 10; // pixels per interval

    // Clear any existing scroll interval
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    // Scroll up
    if (mouseY - containerRect.top < scrollThreshold) {
      scrollIntervalRef.current = setInterval(() => {
        container.scrollTop -= scrollSpeed;
      }, 50);
    }
    // Scroll down
    else if (containerRect.bottom - mouseY < scrollThreshold) {
      scrollIntervalRef.current = setInterval(() => {
        container.scrollTop += scrollSpeed;
      }, 50);
    }

    // Determine drop target index for visual feedback
    const targetRect = e.currentTarget.getBoundingClientRect();
    const middleY = targetRect.top + targetRect.height / 2;
    if (mouseY < middleY) {
      dropTargetIndex.current = index; // Drop above this item
    } else {
      dropTargetIndex.current = index + 1; // Drop below this item
    }
  };

  const handleDragLeave = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
    dropTargetIndex.current = null;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!isLiveConductor || isOffline) return;
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    const dragIndex = draggedSongIndex.current;
    const hoverIndex = dropTargetIndex.current;

    if (
      dragIndex === null ||
      hoverIndex === null ||
      dragIndex === hoverIndex ||
      dragIndex + 1 === hoverIndex
    ) {
      draggedSongIndex.current = null;
      dropTargetIndex.current = null;
      return;
    }

    const newOrder = [...editedSongOrder];
    const [movedSongId] = newOrder.splice(dragIndex, 1);
    newOrder.splice(
      hoverIndex > dragIndex ? hoverIndex - 1 : hoverIndex,
      0,
      movedSongId
    ); // Adjust index if moving down

    setEditedSongOrder(newOrder);
    draggedSongIndex.current = null;
    dropTargetIndex.current = null;
  };

  const handleTouchEnd = (e) => {
    clearTimeout(longPressTimeoutRef.current);
    if (isTouchDragging) {
      // Essentially, perform the drop
      handleDrop(e);

      // Cleanup document listeners
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    }
    setIsTouchDragging(false);
    touchStartInfo.current = null;
    handleDragLeave(); // Cleans up drop indicators and scroll intervals
  };

  const handleMoveItem = (index, direction) => {
    if (!isLiveConductor || isOffline) return;
    const newOrder = [...editedSongOrder];
    const [movedSongId] = newOrder.splice(index, 1);
    newOrder.splice(index + direction, 0, movedSongId);
    setEditedSongOrder(newOrder);
  };

  const handleRemoveItem = (index) => {
    if (!isLiveConductor || isOffline) return;
    const newOrder = [...editedSongOrder];
    const removedItemId = newOrder.splice(index, 1)[0];
    setEditedSongOrder(newOrder);
    // If the removed item was a newly created song, remove it from that list too
    if (removedItemId.startsWith("new_")) {
      setNewlyAddedSongs((prev) =>
        prev.filter((song) => song.id !== removedItemId)
      );
    }
  };

  const handleAddSong = () => {
    if (!isLiveConductor || isOffline) return;
    setErrorMessage("");
    const insertIndex = currentSongIndex + 1; // Insert after current song

    if (addSongMode === "library") {
      if (!selectedLibrarySongId) {
        setErrorMessage("Please select a song from the library.");
        return;
      }
      if (editedSongOrder.includes(selectedLibrarySongId)) {
        setErrorMessage("Song is already in the setlist.");
        return;
      }
      setEditedSongOrder((prev) => {
        const newOrder = [...prev];
        newOrder.splice(insertIndex, 0, selectedLibrarySongId);
        return newOrder;
      });
      setViewMode("setlist"); // Switch back to setlist view
    } else {
      // addSongMode === 'new'
      if (!newSongTitle.trim()) {
        setErrorMessage("New song title cannot be empty.");
        return;
      }
      const newSongId = `new_${Date.now()}`; // Temporary ID for new song
      const newSong = {
        id: newSongId,
        title: newSongTitle.trim(),
        notes: newSongNotes.trim(),
        tempo: newSongTempo.trim(), // Add tempo here
        lyricsChords: newSongLyrics.trim(), // Add lyrics here
        pdfs: [],
      };
      setNewlyAddedSongs((prev) => [...prev, newSong]);
      setEditedSongOrder((prev) => {
        const newOrder = [...prev];
        newOrder.splice(insertIndex, 0, newSongId);
        return newOrder;
      });
      setNewSongTitle("");
      setNewSongNotes("");
      setNewSongLyrics(""); // Reset lyrics field
      setNewSongTempo(""); // Reset tempo field
      setViewMode("setlist"); // Switch back to setlist view
    }
  };

  const handleSave = async () => {
    if (!isLiveConductor || isOffline) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onSaveSetlist(editedSongOrder, newlyAddedSongs);
      showToast("Setlist updated successfully!", "success");
      onClose();
    } catch (error) {
      console.error("Failed to save setlist:", error);
      setErrorMessage("Failed to save setlist. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileClick = (e, song) => {
    e.stopPropagation();
    setSongForPdfSelection(song);
  };

  const handlePdfSelect = async (selection) => {
    const song = songForPdfSelection;
    const index = editedSongOrder.indexOf(song.id);
    const pdf = selection.isLyrics ? null : selection;

    setSongForPdfSelection(null);

    // Check for unsaved changes
    const originalOrder = activeSetlist.songOrder || [];
    const hasOrderChanged =
      editedSongOrder.length !== originalOrder.length ||
      editedSongOrder.some((id, i) => id !== originalOrder[i]);
    const hasNewSongs = newlyAddedSongs.length > 0;
    const isDirty = hasOrderChanged || hasNewSongs;

    if (isDirty) {
      if (isOffline) {
        onClose();
        return;
      }
      // Save and jump, passing the PDF to be opened
      await onSaveSetlist(editedSongOrder, newlyAddedSongs, index, pdf);
      showToast("Setlist updated and opening file!", "success");
    } else {
      if (onSongSelected) {
        onSongSelected(song, pdf, index);
      } else if (isLiveConductor) {
        await onJumpToSong(index, bandData, db, members);
      }
      onClose();
    }
  };

  const handleJump = async (songId) => {
    if (!isLiveConductor) return; // Only conductor can jump
    setIsSaving(true);
    setErrorMessage("");

    const index = editedSongOrder.indexOf(songId);
    if (index === -1) return; // Should not happen

    try {
      // --- THIS IS THE FIX: Check if the setlist is "dirty" before deciding how to act ---
      const originalOrder = activeSetlist.songOrder || [];
      const hasOrderChanged =
        editedSongOrder.length !== originalOrder.length ||
        editedSongOrder.some((id, i) => id !== originalOrder[i]);
      const hasNewSongs = newlyAddedSongs.length > 0;
      const isDirty = hasOrderChanged || hasNewSongs;

      if (isDirty) {
        // If offline and dirty, we can't save, so just close the modal.
        if (isOffline) {
          onClose();
          return;
        }
        // If the list was changed, use the combined save-and-jump handler.
        await onSaveSetlist(editedSongOrder, newlyAddedSongs, index);
        showToast("Setlist updated and jumped to song!", "success");
      } else {
        // If the list was NOT changed, just perform the jump.
        await onJumpToSong(index, bandData, db, members);
      }
      onClose();
    } catch (error) {
      console.error("Failed to save and/or jump:", error);
      setErrorMessage("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} size="xxl">
      <div className="flex flex-col h-[85vh]">
        <h2 className="text-3xl font-bold text-sky-400 mb-4">
          Setlist: {activeSetlist.name}
        </h2>
        {isOffline && (
          <p className="bg-yellow-600 text-yellow-50 p-3 rounded-md mb-4">
            Setlist editing is disabled while offline.
          </p>
        )}
        {errorMessage && (
          <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4">
            {errorMessage}
          </p>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          {viewMode === "setlist" && (
            <div
              ref={scrollContainerRef}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={handleDragLeave}
              className="bg-gray-900 p-2 rounded-lg flex-1 overflow-y-auto"
            >
              {setlistSongs.map((song, index) => (
                <div
                  data-song-id={song.id} // Add data attributes for touch move detection
                  data-song-index={index}
                  key={`${song.id}-${index}`} // Use index for unique key for breaks
                  draggable={isLiveConductor && !isOffline}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragLeave} // Clear drop target on drag end
                  onTouchStart={(e) => handleTouchStart(e, index)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className="relative"
                >
                  {dropTargetIndex.current === index && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400 rounded-full z-10" />
                  )}
                  <div
                    className={`flex items-center justify-between p-2 rounded group transition-all my-2 ${
                      index === currentSongIndex
                        ? "bg-sky-800 text-white"
                        : song.id === "BREAK_ITEM"
                          ? "bg-indigo-900/50"
                          : "bg-gray-700 text-gray-300"
                    }
                                        ${isLiveConductor && !isOffline ? "cursor-grab active:cursor-grabbing" : ""} ${isTouchDragging && draggedSongIndex.current === index ? "opacity-50" : ""}
                                    `}
                  >
                    <div
                      onClick={() =>
                        song.id !== "BREAK_ITEM" && handleJump(song.id)
                      }
                      className={`flex items-center gap-3 flex-1 truncate ${song.id !== "BREAK_ITEM" ? "cursor-pointer" : ""}`}
                    >
                      <span
                        className={`${song.id === "BREAK_ITEM" ? "font-bold text-indigo-300" : ""}`}
                      >
                        {index + 1}. {song.title}
                      </span>
                      {index === currentSongIndex && (
                        <span className="text-xs bg-sky-500 text-white px-2 py-1 rounded-full font-bold">
                          NOW PLAYING
                        </span>
                      )}
                    </div>
                    {song.pdfs && song.pdfs.length > 0 && (
                      <button
                        onClick={(e) => handleFileClick(e, song)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-sky-400 bg-gray-800 px-2 py-1 rounded border border-gray-600 hover:border-sky-400 transition-colors ml-2 mr-2"
                        title="Open attached file"
                      >
                        <Description fontSize="small" />
                        <span>
                          {song.pdfs.length} file
                          {song.pdfs.length > 1 ? "s" : ""}
                        </span>
                      </button>
                    )}
                    {isLiveConductor && !isOffline && (
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => handleMoveItem(index, -1)}
                          disabled={index === 0}
                          className="px-2 disabled:opacity-25"
                          title="Move Up"
                        >
                          <MoveUpIcon size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveItem(index, 1)}
                          disabled={index === setlistSongs.length - 1}
                          className="px-2 disabled:opacity-25"
                          title="Move Down"
                        >
                          <MoveDownIcon size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-500 font-bold ml-2 px-2"
                          title="Remove from Setlist"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {dropTargetIndex.current === index + 1 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400 rounded-full z-10" />
                  )}
                </div>
              ))}
            </div>
          )}

          {viewMode === "add" && isLiveConductor && (
            <div className="bg-gray-900 p-4 rounded-lg flex flex-col overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4 flex-shrink-0">
                Add a Song (Inserts as Next Song)
              </h3>
              <div className="bg-gray-700 rounded-lg p-1 flex mb-4">
                <button
                  onClick={() => setAddSongMode("library")}
                  className={`flex-1 p-2 rounded-md text-sm ${addSongMode === "library" ? "bg-sky-600" : ""}`}
                >
                  From Library
                </button>
                <button
                  onClick={() => setAddSongMode("new")}
                  className={`flex-1 p-2 rounded-md text-sm ${addSongMode === "new" ? "bg-sky-600" : ""}`}
                >
                  As New Song
                </button>
              </div>
              {addSongMode === "library" ? (
                <div className="flex gap-2">
                  <select
                    value={selectedLibrarySongId}
                    onChange={(e) => setSelectedLibrarySongId(e.target.value)}
                    className="w-full bg-gray-700 p-3 rounded text-sm"
                  >
                    <option value="">-- Select a song --</option>
                    {availableLibrarySongs.length > 0 ? (
                      availableLibrarySongs.map((song) => (
                        <option key={song.id} value={song.id}>
                          {song.title}
                        </option>
                      ))
                    ) : (
                      <option value="">No songs to add</option>
                    )}
                  </select>
                  <button
                    onClick={handleAddSong}
                    disabled={!selectedLibrarySongId || isOffline}
                    className="bg-green-600 text-white rounded px-4 disabled:bg-gray-500"
                  >
                    <PlusCircleIcon size={20} />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="New Song Title"
                    value={newSongTitle}
                    onChange={(e) => setNewSongTitle(e.target.value)}
                    className="w-full bg-gray-700 p-3 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Quick Notes (optional)"
                    value={newSongNotes}
                    onChange={(e) => setNewSongNotes(e.target.value)}
                    className="w-full bg-gray-700 p-3 rounded text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Tempo (e.g., 120bpm)"
                    value={newSongTempo}
                    onChange={(e) => setNewSongTempo(e.target.value)}
                    className="w-full bg-gray-700 p-3 rounded text-sm"
                  />
                  <div className="text-xs text-sky-300/80 p-2 bg-gray-900/50 rounded-md -mt-2">
                    <strong>Tip:</strong> Place chords inside square brackets,
                    like <code>[Am]</code> or <code>[Cadd9]</code>. These will
                    become formatted text and diagrams in the song viewer.
                  </div>
                  <LexicalEditor
                    initialContent={newSongLyrics}
                    onChange={setNewSongLyrics}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
            disabled={isSaving}
          >
            Cancel
          </button>
          {isLiveConductor && viewMode === "setlist" && (
            <>
              <button
                type="button"
                onClick={() => setViewMode("add")}
                className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded flex items-center disabled:bg-gray-500"
                disabled={isSaving || isOffline}
              >
                <PlusCircleIcon size={20} />
                <span className="ml-2">Add Song</span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded flex items-center disabled:bg-gray-500"
                disabled={isSaving || isOffline}
              >
                {isSaving && <Spinner />}
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}
          {isLiveConductor && viewMode === "add" && (
            <button
              type="button"
              onClick={() => setViewMode("setlist")}
              className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
              disabled={isSaving}
            >
              Back to Setlist
            </button>
          )}
          {isLiveConductor && viewMode === "add" && addSongMode === "new" && (
            <button
              onClick={handleAddSong}
              disabled={!newSongTitle.trim() || isSaving || isOffline}
              className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2 disabled:bg-gray-500"
            >
              <PlusCircleIcon size={20} /> Add Song
            </button>
          )}
        </div>
        {songForPdfSelection && (
          <PdfSelectionModal
            song={songForPdfSelection}
            onClose={() => setSongForPdfSelection(null)}
            onSelect={handlePdfSelect}
          />
        )}
      </div>
    </Modal>
  );
}

export default CombinedSetlistModal;
