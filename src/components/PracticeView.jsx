import { useState, useMemo } from "react";
import { IconButton } from "@mui/material";
import { MusicNote, Description } from "@mui/icons-material";
import { MenuIcon, MusicIcon, ListMusicIcon } from "../helpers/Icons.jsx";
import FullScreenSongViewer from "./FullScreenSongViewer";
import PdfSelectionModal from "./modals/PdfSelectionModal.jsx";
import { areLyricsEmpty } from "../helpers/lyricsUtils.js";

function PracticeView({
  bandData,
  db,
  storage,
  showToast,
  setIsSidebarCollapsed,
  isOffline,
  user,
}) {
  const [activeTab, setActiveTab] = useState("songs"); // 'songs' or 'setlists'
  const [currentSong, setCurrentSong] = useState(null);
  const [currentSetlist, setCurrentSetlist] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [currentPdf, setCurrentPdf] = useState(null);
  const [songForSelection, setSongForSelection] = useState(null);
  useState("alpha-asc"); // songSortOrder — sort UI not yet implemented

  const sortedSongs = useMemo(() => {
    return [...(bandData.songs || [])].sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }, [bandData.songs]);

  const handleSongClick = (song) => {
    const hasLyrics = song.lyricsChords && !areLyricsEmpty(song.lyricsChords);
    const hasPdfs = song.pdfs && song.pdfs.length > 0;

    if (hasPdfs) {
      if (hasLyrics || song.pdfs.length > 1) {
        setSongForSelection(song);
        return;
      }
      setCurrentSong(song);
      setCurrentPdf(song.pdfs[0]);
    } else {
      setCurrentSong(song);
      setCurrentPdf(null);
    }

    setCurrentSetlist(null);
    setCurrentIndex(-1);
  };

  const handleSetlistClick = (setlist) => {
    if (!setlist.songOrder || setlist.songOrder.length === 0) {
      showToast("This setlist is empty.", "info");
      return;
    }
    setCurrentSetlist(setlist);
    setCurrentIndex(0);
    loadSongFromSetlist(setlist, 0);
  };

  const loadSongFromSetlist = (setlist, index) => {
    if (index >= 0 && index < setlist.songOrder.length) {
      const songId = setlist.songOrder[index];
      const song =
        songId === "BREAK_ITEM"
          ? { id: "BREAK_ITEM", title: "--- BREAK ---" }
          : bandData.songs.find((s) => s.id === songId);

      if (song) {
        setCurrentSong(song);
        setCurrentPdf(null);
      }
    }
  };

  const handleSongNav = (direction) => {
    if (!currentSetlist) return;
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < currentSetlist.songOrder.length) {
      setCurrentIndex(newIndex);
      loadSongFromSetlist(currentSetlist, newIndex);
    }
  };

  const handleJumpToSong = (index) => {
    if (!currentSetlist) return;
    if (index >= 0 && index < currentSetlist.songOrder.length) {
      setCurrentIndex(index);
      loadSongFromSetlist(currentSetlist, index);
    }
  };

  const handleCloseViewer = () => {
    setCurrentSong(null);
    setCurrentPdf(null);
    setCurrentSetlist(null);
    setCurrentIndex(-1);
  };

  // Calculate previous and next songs for the viewer
  let previousSong = null;
  let nextSong = null;
  if (currentSetlist && currentIndex >= 0) {
    if (currentIndex > 0) {
      const prevId = currentSetlist.songOrder[currentIndex - 1];
      previousSong =
        prevId === "BREAK_ITEM"
          ? { id: "BREAK_ITEM", title: "Break" }
          : bandData.songs.find((s) => s.id === prevId);
    }
    if (currentIndex < currentSetlist.songOrder.length - 1) {
      const nextId = currentSetlist.songOrder[currentIndex + 1];
      nextSong =
        nextId === "BREAK_ITEM"
          ? { id: "BREAK_ITEM", title: "--- BREAK ---" }
          : bandData.songs.find((s) => s.id === nextId);
    }
  }

  if (currentSong) {
    return (
      <FullScreenSongViewer
        song={currentSong}
        pdf={currentPdf}
        storage={storage}
        onClose={handleCloseViewer}
        bandData={bandData}
        db={db}
        user={user}
        showToast={showToast}
        isLiveConductor={true} // Enable navigation controls locally
        currentSongIndex={currentIndex}
        setlist={currentSetlist}
        previousSong={previousSong}
        nextSong={nextSong}
        onSongNav={handleSongNav}
        onJumpToSong={handleJumpToSong}
        onSongSelected={(song, pdf, index) => {
          setCurrentSong(song);
          setCurrentPdf(pdf);
          if (currentSetlist && typeof index === "number" && index >= 0) {
            setCurrentIndex(index);
          }
        }}
        onSaveSetlist={() =>
          showToast("Setlist editing is disabled in Practice Mode.", "info")
        }
        isPracticeMode={true}
        isOffline={isOffline}
        // Pass dummy or null for props not needed in practice mode
        currentUserMemberData={{ checkedIn: false }}
        handleSetReady={() => {}}
        handleTempoAlert={() => {}}
        activeTempoAlert={null}
        isTempoChanging={false}
        members={[]}
      />
    );
  }

  return (
    <>
      {songForSelection && (
        <PdfSelectionModal
          song={songForSelection}
          onClose={() => setSongForSelection(null)}
          onSelect={(selection) => {
            setCurrentSong(songForSelection);
            setCurrentPdf(selection.isLyrics ? null : selection);
            setCurrentSetlist(null);
            setCurrentIndex(-1);
            setSongForSelection(null);
          }}
        />
      )}
      <div className="flex-1 flex flex-col min-h-0 h-full">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <IconButton
              onClick={() => setIsSidebarCollapsed(false)}
              aria-label="Open navigation"
              sx={{ color: "white" }}
            >
              <MenuIcon />
            </IconButton>
            <h1 className="text-3xl font-bold">Practice Time</h1>
          </div>
        </div>

        <div className="flex border-b border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab("songs")}
            className={`flex-1 py-3 text-center font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === "songs" ? "border-b-2 border-sky-500 text-sky-400" : "text-gray-400 hover:text-gray-200"}`}
          >
            <MusicIcon /> All Songs
          </button>
          <button
            onClick={() => setActiveTab("setlists")}
            className={`flex-1 py-3 text-center font-semibold transition-colors flex items-center justify-center gap-2 ${activeTab === "setlists" ? "border-b-2 border-sky-500 text-sky-400" : "text-gray-400 hover:text-gray-200"}`}
          >
            <ListMusicIcon /> Setlists
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-800 rounded-lg p-4">
          {activeTab === "songs" && (
            <div className="space-y-2">
              {sortedSongs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No songs found.
                </p>
              ) : (
                sortedSongs.map((song) => (
                  <div
                    key={song.id}
                    onClick={() => handleSongClick(song)}
                    className="p-3 bg-gray-700/50 hover:bg-gray-700 rounded-md cursor-pointer transition-colors flex justify-between items-center"
                  >
                    <span className="font-medium text-gray-200">
                      {song.title}
                    </span>
                    <div className="flex items-center gap-3 text-gray-500">
                      {song.lyricsChords && (
                        <MusicNote titleAccess="Lyrics/Chords available" />
                      )}
                      {song.pdfs?.length > 0 && (
                        <Description
                          titleAccess={`${song.pdfs.length} file(s) attached`}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "setlists" && (
            <div className="space-y-2">
              {!bandData.setlists || bandData.setlists.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No setlists found.
                </p>
              ) : (
                bandData.setlists.map((setlist) => (
                  <div
                    key={setlist.id}
                    onClick={() => handleSetlistClick(setlist)}
                    className="p-4 bg-gray-700/50 hover:bg-gray-700 rounded-md cursor-pointer transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-lg text-gray-200">
                        {setlist.name}
                      </h3>
                      <span className="text-sm text-gray-400">
                        {setlist.songOrder.length} songs
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default PracticeView;
