import { useState, useEffect, useRef } from "react";
import {
  doc,
  updateDoc,
  getDoc,
  collection,
  query,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { Button, IconButton } from "@mui/material";
import {
  Add,
  Check,
  ChevronLeft,
  ChevronRight,
  DirectionsWalk,
  DirectionsRun,
} from "@mui/icons-material";
import {
  FileTextIcon,
  LyricsIcon,
  ListMusicIcon,
  BellIcon,
  MenuIcon,
  SunIcon,
  LayoutIcon,
  MoveVerticalIcon,
  EyeOffIcon,
  PlusCircleIcon,
  ChevronRightIcon,
} from "../helpers/Icons";
import FullScreenSongViewer from "./FullScreenSongViewer";
import TempoIndicator from "./ui/TempoIndicator";
import CombinedSetlistModal from "./modals/CombinedSetlistModal";
import PdfSelectionModal from "./modals/PdfSelectionModal";
import LexicalViewer from "./ui/LexicalViewer";
import { areLyricsEmpty } from "../helpers/lyricsUtils.js";

// --- NEW: Wrapper component for draggable sections ---
function SectionWrapper({
  children,
  isEditingLayout,
  onMoveLeft,
  onMoveRight,
  onRemove,
}) {
  return (
    <div
      className={`relative transition-all duration-200 flex flex-col ${isEditingLayout ? "outline-2 outline-dashed outline-sky-500/60 rounded-lg" : ""}`}
    >
      {isEditingLayout && (
        <>
          {/* The controls are on top */}
          <div className="absolute top-2 right-2 z-40 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full p-1">
            <IconButton
              onClick={onMoveLeft}
              sx={{
                color: "white",
                "&:hover": { backgroundColor: "rgb(75 85 99)" },
                padding: "0.25rem",
              }}
              title="Move Left"
            >
              <ChevronLeft fontSize="large" />
            </IconButton>
            <IconButton
              onClick={onMoveRight}
              sx={{
                color: "white",
                "&:hover": { backgroundColor: "rgb(75 85 99)" },
                padding: "0.25rem",
              }}
              title="Move Right"
            >
              <ChevronRight fontSize="large" />
            </IconButton>
            <IconButton
              onClick={onRemove}
              sx={{
                backgroundColor: "rgb(220 38 38)",
                color: "white",
                "&:hover": { backgroundColor: "rgb(239 68 68)" },
                padding: "0.25rem",
              }}
              title="Hide Section"
            >
              <EyeOffIcon size={24} />
            </IconButton>
          </div>
          {/* This overlay prevents interaction with the content below during edit mode and sits above the content (z-30) */}
          <div className="absolute inset-0 bg-black/30 rounded-lg z-30 pointer-events-none"></div>
        </>
      )}
      {/* The content container */}
      <div className={`flex-1 flex flex-col`}>{children}</div>
    </div>
  );
}

function LiveView({
  bandData,
  user,
  db,
  isLiveConductor,
  canEdit, // eslint-disable-line no-unused-vars
  members,
  userRole,
  keepScreenOn,
  setKeepScreenOn,
  storage, // eslint-disable-line no-unused-vars
  setIsSidebarCollapsed,
  showToast,
  songToView, // eslint-disable-line no-unused-vars
  setSongToView,
  handleSongNav,
  handleJumpToSong,
  activeTempoAlert,
  handleTempoAlert,
  isTempoChanging,
  handleSetReady,
  setCurrentView,
  handleSaveSetlistChanges,
  isOffline,
  currentUserMemberData,
}) {
  // --- THIS IS THE FIX ---
  // The declaration for currentUserMemberData was moved from the bottom of the component to the top.
  // It's also now passed in as a prop from App.jsx to ensure it's always available.
  const [showSetlistEditor, setShowSetlistEditor] = useState(false);
  const [showPdfSelectionModal, setShowPdfSelectionModal] = useState(null);
  const wakeLockSentinel = useRef(null);

  // --- NEW: State for layout control ---
  const [layout, setLayout] = useState("default"); // 'default', 'grid', 'stacked'
  const [showLayoutOptions, setShowLayoutOptions] = useState(false);
  const layoutButtonRef = useRef(null);
  // --- NEW: State for custom layout editing ---
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [sectionLayout, setSectionLayout] = useState([]);
  const originalLayout = useRef([]); // To store layout on edit start
  const draggedSectionId = useRef(null); // eslint-disable-line no-unused-vars
  const longPressTimeoutRef = useRef(null); // eslint-disable-line no-unused-vars
  const touchDragInfo = useRef(null); // eslint-disable-line no-unused-vars
  const layoutContainerRef = useRef(null); // Ref for the main layout container
  const [showAddSectionMenu, setShowAddSectionMenu] = useState(false);
  const [notes, setNotes] = useState([]); // NEW: State to hold fetched notes

  const ALL_SECTIONS = {
    nowPlaying: { id: "nowPlaying", title: "Now Playing" },
    nextUp: { id: "nextUp", title: "Next Up" },
    readyCheck: { id: "readyCheck", title: "Ready Check" },
    tempoControl: { id: "tempoControl", title: "Tempo Control" },
    noteDisplay: { id: "noteDisplay", title: "Note" }, // Generic definition
  };

  // --- NEW: Effect to fetch notes from the subcollection ---
  useEffect(() => {
    if (!bandData.id) return;
    const notesCollectionRef = collection(db, "bands", bandData.id, "notes");
    const q = query(notesCollectionRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNotes(notesData);
    });
    return () => unsubscribe();
  }, [bandData.id, db]);

  // --- NEW: Effect to close layout dropdown when clicking outside ---
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        layoutButtonRef.current &&
        !layoutButtonRef.current.contains(event.target)
      ) {
        setShowLayoutOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [layoutButtonRef]);

  // --- NEW: Load and save custom layout from Firestore ---
  const memberLayoutRef =
    !isOffline && db && bandData?.id && user?.uid
      ? doc(db, "bands", bandData.id, "members", user.uid)
      : null;

  useEffect(() => {
    if (isEditingLayout) return;

    const loadLayout = async () => {
      // --- THIS IS THE FIX ---
      // If we are offline (or the ref is otherwise invalid), load a default layout.
      if (!memberLayoutRef) {
        // In offline mode, the user's specific layout isn't stored, so we fall back to a default.
        // We check if the offline `currentUserMemberData` has a layout saved and use it,
        // otherwise, we use the hardcoded default.
        const offlineLayout = currentUserMemberData?.layouts?.liveView;
        setSectionLayout(
          offlineLayout && Array.isArray(offlineLayout)
            ? offlineLayout
            : Object.values(ALL_SECTIONS)
        );
        return;
      }

      // Online logic remains the same
      try {
        const memberDoc = await getDoc(memberLayoutRef);
        const memberData = memberDoc.data();
        const savedLayout = memberData?.layouts?.liveView;

        if (savedLayout && Array.isArray(savedLayout)) {
          // Filter out any sections that might have been removed from the app,
          // ensuring we correctly identify note sections by their 'type' property.
          const validSections = savedLayout.filter((s) => {
            const sectionType = s.type || s.id; // A note section has a 'type', others use 'id'
            return !!ALL_SECTIONS[sectionType];
          });
          setSectionLayout(validSections);
        } else {
          setSectionLayout(Object.values(ALL_SECTIONS));
        }
      } catch (e) {
        console.error("Failed to load layout from Firestore", e);
        setSectionLayout(Object.values(ALL_SECTIONS));
      }
    };
    loadLayout();
  }, [memberLayoutRef, isOffline, currentUserMemberData, isEditingLayout]); // Add isOffline and currentUserMemberData as dependencies

  const handleCancelLayoutEdit = () => {
    setSectionLayout(originalLayout.current); // Revert to original layout
    setIsEditingLayout(false);
    setShowLayoutOptions(false);
  };

  const handleSaveLayout = async (newLayout) => {
    if (!memberLayoutRef) return; // Don't save if offline
    try {
      await updateDoc(memberLayoutRef, { "layouts.liveView": newLayout });
      showToast("Layout saved!", "success");
    } catch (error) {
      console.error("Failed to save layout:", error);
      showToast("Could not save layout.", "error");
    }
  };

  const handleSetConductor = async () => {
    if (userRole === "Viewer") return;
    await updateDoc(doc(db, "bands", bandData.id), {
      "liveState.liveConductorUid": user.uid,
    });
  };
  const handleStopConducting = async () => {
    await updateDoc(doc(db, "bands", bandData.id), {
      "liveState.liveConductorUid": null,
    });
  };

  const handleNudge = async (memberId) => {
    const nudger = members.find((m) => m.id === user.uid);
    await updateDoc(doc(db, "bands", bandData.id), {
      nudgedMemberId: memberId,
      nudgerName: nudger?.name || "A bandmate",
      nudgeTimestamp: Date.now(),
    });
  };

  const handleViewLyrics = (_e) => {
    // Always open the viewer for the current song (lyrics view by default)
    if (currentSong) {
      setSongToView({ song: currentSong, pdf: null });
      setCurrentView("fullScreenSong");
    }
  };

  const handleViewPdfs = (e) => {
    e.stopPropagation(); // Prevent triggering handleViewLyrics
    setShowPdfSelectionModal(currentSong);
  };

  const activeSetlist = bandData.setlists?.find(
    (s) => s.id === bandData.liveState.activeSetlistId
  );
  const currentSongIndex = bandData.liveState.currentSongIndex;
  let currentSong = null;
  let nextSong = null;
  let __previousSong = null;
  let nextNextSong = null; // NEW: Variable for the song after next

  if (activeSetlist) {
    if (
      currentSongIndex >= 0 &&
      currentSongIndex < activeSetlist.songOrder.length
    ) {
      const songId = activeSetlist.songOrder[currentSongIndex];
      if (songId === "BREAK_ITEM") {
        currentSong = { id: "BREAK_ITEM", title: "--- BREAK ---" };
      } else {
        currentSong = bandData.songs?.find((s) => s.id === songId);
      }
    }
    if (currentSongIndex > 0) {
      // NEW: Get the previous song
      const prevSongId = activeSetlist.songOrder[currentSongIndex - 1];
      if (prevSongId === "BREAK_ITEM") {
        _previousSong = { id: "BREAK_ITEM", title: "Break" };
      } else {
        _previousSong = bandData.songs?.find((s) => s.id === prevSongId);
      }
    }
    if (currentSongIndex + 1 < activeSetlist.songOrder.length) {
      const nextSongId = activeSetlist.songOrder[currentSongIndex + 1];
      if (nextSongId === "BREAK_ITEM") {
        nextSong = { id: "BREAK_ITEM", title: "--- BREAK ---" };
      } else {
        nextSong = bandData.songs?.find((s) => s.id === nextSongId);
      }
    }
    if (currentSongIndex + 2 < activeSetlist.songOrder.length) {
      // NEW: Get the song after next
      const nextNextSongId = activeSetlist.songOrder[currentSongIndex + 2];
      if (nextNextSongId === "BREAK_ITEM") {
        nextNextSong = { id: "BREAK_ITEM", title: "Break" };
      } else {
        nextNextSong = bandData.songs?.find((s) => s.id === nextNextSongId);
      }
    }
  }

  const activeMembers = members;
  const checkedInMembers = activeMembers.filter((m) => m.checkedIn);
  const allReady =
    checkedInMembers.length > 0 &&
    checkedInMembers.filter((m) => m.role !== "Viewer").every((m) => m.isReady);
  const conductor = members.find(
    (m) => m.id === bandData.liveState?.liveConductorUid
  );

  useEffect(() => {
    const requestWakeLock = async () => {
      if ("wakeLock" in navigator && keepScreenOn) {
        try {
          wakeLockSentinel.current = await navigator.wakeLock.request("screen");
          wakeLockSentinel.current.addEventListener("release", () => {});
        } catch (err) {
          console.error(`${err.name}, ${err.message}`);
        }
      }
    };
    const releaseWakeLock = async () => {
      if (wakeLockSentinel.current) {
        try {
          await wakeLockSentinel.current.release();
          wakeLockSentinel.current = null;
        } catch (err) {
          console.error(
            `Failed to release wake lock: ${err.name}, ${err.message}`
          );
        }
      }
    };
    const handleVisibilityChange = () => {
      if (
        wakeLockSentinel.current !== null &&
        document.visibilityState === "visible"
      ) {
        requestWakeLock();
      }
    };
    if (keepScreenOn) {
      requestWakeLock();
      document.addEventListener("visibilitychange", handleVisibilityChange);
      document.addEventListener("fullscreenchange", handleVisibilityChange);
    } else {
      releaseWakeLock();
    }
    return () => {
      releaseWakeLock();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleVisibilityChange);
    };
  }, [keepScreenOn]);

  const handleMoveRight = (sectionId) => {
    const index = sectionLayout.findIndex((s) => s.id === sectionId);
    if (index < sectionLayout.length - 1) {
      const newLayout = [...sectionLayout];
      [newLayout[index], newLayout[index + 1]] = [
        newLayout[index + 1],
        newLayout[index],
      ];
      setSectionLayout(newLayout);
    }
  };

  const handleMoveLeft = (sectionId) => {
    const index = sectionLayout.findIndex((s) => s.id === sectionId);
    if (index > 0) {
      const newLayout = [...sectionLayout];
      [newLayout[index], newLayout[index - 1]] = [
        newLayout[index - 1],
        newLayout[index],
      ];
      setSectionLayout(newLayout);
    }
  };

  const handleHideSection = (idToRemove) => {
    setSectionLayout((prev) => prev.filter((s) => s.id !== idToRemove));
  };

  const handleAddSection = (section) => {
    setSectionLayout((prev) => [...prev, section]);
    setShowAddSectionMenu(false);
  };

  // --- NEW: Handler for adding a specific note section ---
  const handleAddNoteSection = (note) => {
    setSectionLayout((prev) => [
      ...prev,
      {
        id: `note_${note.id}`,
        type: "noteDisplay",
        noteId: note.id,
        title: note.title,
      },
    ]);
    setShowAddSectionMenu(false);
  };

  // --- NEW: Helper to determine grid classes based on layout state ---
  const getLayoutClasses = () => {
    switch (layout) {
      case "grid":
        return "grid grid-cols-2 gap-4 flex-1 min-h-0 overflow-y-auto";
      case "stacked":
        return "grid grid-cols-1 gap-4 flex-1 min-h-0 overflow-y-auto";
      case "default":
      default:
        return "grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-y-auto";
    }
  };

  const layoutOptions = [
    { key: "default", label: "Default" },
    { key: "grid", label: "Grid" },
    { key: "stacked", label: "Stacked" },
  ];

  const handleLayoutChange = (newLayout) => {
    setLayout(newLayout);
    setShowLayoutOptions(false);
  };

  const hiddenSections = Object.values(ALL_SECTIONS)
    .filter((section) => !sectionLayout.find((s) => s.id === section.id))
    .filter((s) => s.id !== "noteDisplay"); // Exclude generic noteDisplay from this list

  // --- NEW: Get available notes to add ---
  const availableNotes = (notes || [])
    .filter((note) => !sectionLayout.find((s) => s.noteId === note.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  const renderSection = (section) => {
    switch (section.id) {
      case "nowPlaying":
        return (
          <div className="bg-gray-700/50 border-2 border-sky-500 shadow-lg shadow-sky-500/20 p-6 rounded-lg flex flex-col relative flex-1">
            <div className="grid grid-cols-3 items-center mb-2">
              <h3 className="text-lg font-bold text-gray-300 col-start-1">
                Now Playing
              </h3>
              {currentSong?.tempo && (
                <div className="col-start-2 flex items-center justify-center gap-2">
                  <TempoIndicator tempo={currentSong.tempo} />
                </div>
              )}
            </div>
            {currentSong ? (
              <div
                className={`flex-1 flex flex-col justify-center min-h-[6rem] ${isLiveConductor ? "pb-16" : ""}`}
              >
                <div>
                  <h2
                    className={`text-4xl font-bold ${currentSong.id === "BREAK_ITEM" ? "text-indigo-300" : "text-sky-300"}`}
                  >
                    {currentSong.title}
                  </h2>
                  {currentSong.id !== "BREAK_ITEM" && (
                    <p className="text-gray-300 mt-2">{currentSong.notes}</p>
                  )}
                </div>
                {/* This overlay makes the whole card clickable */}
                <div
                  onClick={handleViewLyrics}
                  className="absolute inset-0 z-10 cursor-pointer"
                ></div>

                <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
                  <IconButton
                    onClick={handleViewLyrics}
                    title="View Song"
                    disabled={
                      currentSong.id === "BREAK_ITEM" ||
                      areLyricsEmpty(currentSong.lyricsChords)
                    }
                    sx={{
                      color: !areLyricsEmpty(currentSong.lyricsChords)
                        ? "white"
                        : "rgb(156 163 175)",
                      "&:hover": { backgroundColor: "rgb(75 85 99)" },
                    }}
                  >
                    <LyricsIcon />
                  </IconButton>
                  <IconButton
                    onClick={handleViewPdfs}
                    title={
                      currentSong.pdfs?.length > 0
                        ? "View PDFs"
                        : "PDFs not available"
                    }
                    disabled={
                      !currentSong.pdfs?.length > 0 ||
                      currentSong.id === "BREAK_ITEM"
                    }
                    sx={{
                      color:
                        currentSong.pdfs?.length > 0 &&
                        currentSong.id !== "BREAK_ITEM"
                          ? "white"
                          : "rgb(156 163 175)",
                      "&:hover": { backgroundColor: "rgb(75 85 99)" },
                    }}
                  >
                    <FileTextIcon />
                  </IconButton>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center min-h-[8rem]">
                <p className="text-gray-500">
                  {activeSetlist
                    ? "Press 'Next' to start the set!"
                    : "No active setlist"}
                </p>
              </div>
            )}
            {isLiveConductor && activeSetlist && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center z-20">
                {" "}
                {/** This is the new location for the nav buttons */}
                <IconButton
                  onClick={() => handleSongNav(-1, bandData, db, members)}
                  disabled={currentSongIndex < 0}
                  sx={{
                    backgroundColor: "rgb(75 85 99)",
                    color: "white",
                    "&:hover": { backgroundColor: "rgb(107 114 128)" },
                  }}
                >
                  <ChevronLeft />
                </IconButton>
                <IconButton
                  onClick={() => handleSongNav(1, bandData, db, members)}
                  disabled={!nextSong}
                  sx={{
                    backgroundColor: "rgb(75 85 99)",
                    color: "white",
                    "&:hover": { backgroundColor: "rgb(107 114 128)" },
                  }}
                >
                  <ChevronRight />
                </IconButton>
              </div>
            )}
          </div>
        );
      case "nextUp":
        return (
          <div
            className="bg-gray-800 p-6 rounded-lg flex flex-col justify-between relative group cursor-pointer hover:bg-gray-700 transition-colors flex-1"
            onClick={() => activeSetlist && setShowSetlistEditor(true)}
          >
            {" "}
            {/* UPDATED: onClick to open CombinedSetlistModal */}
            <div>
              <h3 className="text-lg font-bold text-gray-300 mb-3">Next Up</h3>
              {nextSong ? (
                <div>
                  <div className="flex items-center gap-3 py-1 w-full">
                    {/* This title now takes up 2/3 of the container width */}
                    <h2
                      className={`text-3xl font-bold truncate leading-tight w-2/3 ${nextSong.id === "BREAK_ITEM" ? "text-indigo-300" : ""}`}
                    >
                      {nextSong.title}
                    </h2>
                    {nextNextSong && (
                      <div className="flex items-center gap-3 w-1/3 min-w-0">
                        <ChevronRightIcon className="text-gray-500 flex-shrink-0" />
                        {/* This title is now constrained to 1/3 of the width */}
                        <span
                          className={`text-xl text-gray-400/70 truncate ${nextNextSong.id === "BREAK_ITEM" ? "text-indigo-400/70" : ""}`}
                          title={`Then: ${nextNextSong.title}`}
                        >
                          {nextNextSong.title}
                        </span>
                      </div>
                    )}
                  </div>
                  {nextSong.id !== "BREAK_ITEM" && nextSong.notes && (
                    <p className="text-gray-300 mt-1 text-sm">
                      {nextSong.notes}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center py-4">
                  <p className="text-gray-400 italic">
                    {activeSetlist ? "End of the set!" : "..."}
                  </p>
                </div>
              )}
            </div>
            {activeSetlist && (
              <div className="flex justify-end items-center text-gray-400 mt-4 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
                {" "}
                <span className="text-xs mr-2 uppercase font-semibold tracking-wider">
                  Tap for Full Setlist
                </span>{" "}
                <ListMusicIcon />{" "}
              </div>
            )}
          </div>
        );
      case "readyCheck":
        return (
          <div
            className={`bg-gray-800 p-4 rounded-lg flex flex-col flex-1 ${allReady ? "border-2 border-green-500 shadow-lg shadow-green-500/20" : ""}`}
          >
            <h3
              className={`text-lg font-bold mb-3 ${allReady ? "text-green-400" : "text-gray-300"}`}
            >
              {allReady ? "ALL READY!" : "Ready Check"}
            </h3>
            <div className="flex-1 overflow-y-auto pr-2 mb-4 min-h-[5rem]">
              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                {checkedInMembers
                  .filter((m) => m.role !== "Viewer")
                  .map((m) => (
                    <Button
                      key={m.id}
                      onClick={() => handleNudge(m.id)}
                      title="Click to get attention"
                      size="small"
                      variant="contained"
                      endIcon={<BellIcon />}
                      sx={{
                        borderRadius: "20px",
                        textTransform: "none",
                        fontWeight: "600",
                        boxShadow: 2,
                        margin: "2px",
                        transition: "all 0.2s ease",
                        backgroundColor: m.isReady
                          ? "rgb(22 163 74)"
                          : "rgb(55 65 81)",
                        color: "white",
                        "&:hover": {
                          transform: "translateY(-2px)",
                          boxShadow: 4,
                          backgroundColor: m.isReady
                            ? "rgb(21 128 61)"
                            : "rgb(2 132 199)",
                        },
                      }}
                    >
                      {m.name}
                      {m.id === user.uid && " (You)"}
                    </Button>
                  ))}
              </div>
            </div>
            {userRole !== "Viewer" && currentUserMemberData?.checkedIn && (
              <Button
                onClick={() =>
                  handleSetReady(
                    !currentUserMemberData?.isReady,
                    user,
                    bandData,
                    db
                  )
                }
                disabled={isOffline}
                variant="contained"
                fullWidth
                className={
                  allReady && !currentUserMemberData?.isReady
                    ? "animate-bounce"
                    : ""
                }
                sx={{
                  padding: "1rem 2rem",
                  fontSize: "1.25rem",
                  fontWeight: "bold",
                  borderRadius: "12px",
                  boxShadow: 4,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  transition: "all 0.2s",
                  backgroundColor: currentUserMemberData?.isReady
                    ? "rgb(220 38 38)"
                    : "rgb(22 163 74)",
                  "&:hover": {
                    backgroundColor: currentUserMemberData?.isReady
                      ? "rgb(239 68 68)"
                      : "rgb(21 128 61)",
                    boxShadow: 6,
                    transform: "translateY(-1px)",
                  },
                  "&.Mui-disabled": {
                    backgroundColor: "rgb(55 65 81)",
                    color: "rgb(107 114 128)",
                  },
                }}
              >
                {currentUserMemberData?.isReady ? "NOT READY" : "READY?"}
              </Button>
            )}
          </div>
        );
      case "tempoControl":
        return (
          <div
            className={`p-4 rounded-lg flex flex-col flex-1 ${
              activeTempoAlert === "speedUp"
                ? "animate-fast-pulse bg-green-900/50 border-4 border-green-400 shadow-lg shadow-green-400/50"
                : activeTempoAlert === "slowDown"
                  ? "animate-fast-pulse bg-yellow-900/50 border-4 border-yellow-400 shadow-lg shadow-yellow-400/50"
                  : "bg-gray-800 border-2 border-transparent"
            }`}
          >
            <h3 className="text-lg font-bold text-gray-300 mb-3">
              Tempo Control
            </h3>
            <div className="grid grid-cols-2 gap-3 flex-1 content-center">
              {/* --- 4. UPDATED: SLOW DOWN Button --- */}
              <Button
                onClick={() => handleTempoAlert("slowDown")}
                disabled={
                  isOffline ||
                  !currentUserMemberData?.checkedIn ||
                  isTempoChanging
                }
                variant="contained"
                startIcon={<DirectionsWalk sx={{ fontSize: "2rem" }} />}
                className={
                  activeTempoAlert === "slowDown" ? "animate-fast-pulse" : ""
                }
                sx={{
                  p: "1.5rem",
                  fontWeight: "bold",
                  fontSize: "1.25rem",
                  borderRadius: "16px",
                  boxShadow: 3,
                  color: "white",
                  transition: "all 0.2s",
                  backgroundColor: "rgb(161 98 7)", // yellow-700
                  "&:hover": {
                    backgroundColor: "rgb(202 138 4)", // yellow-600
                    boxShadow: 6,
                    transform: "translateY(-2px)",
                  },
                  ...(activeTempoAlert === "slowDown" && {
                    backgroundColor: "rgb(234 179 8)", // yellow-500
                    boxShadow: "0 0 0 4px rgba(234, 179, 8, 0.5)",
                  }),
                  "&.Mui-disabled": {
                    bgcolor: "rgb(55 65 81)",
                    color: "rgb(107 114 128)",
                  },
                }}
              >
                SLOW DOWN
              </Button>

              {/* --- 4. UPDATED: SPEED UP Button --- */}
              <Button
                onClick={() => handleTempoAlert("speedUp")}
                disabled={
                  isOffline ||
                  !currentUserMemberData?.checkedIn ||
                  isTempoChanging
                }
                variant="contained"
                startIcon={<DirectionsRun sx={{ fontSize: "2rem" }} />}
                className={
                  activeTempoAlert === "speedUp" ? "animate-fast-pulse" : ""
                }
                sx={{
                  p: "1.5rem",
                  fontWeight: "bold",
                  fontSize: "1.25rem",
                  borderRadius: "16px",
                  boxShadow: 3,
                  color: "white",
                  transition: "all 0.2s",
                  backgroundColor: "rgb(21 128 61)", // green-700
                  "&:hover": {
                    backgroundColor: "rgb(22 163 74)", // green-600
                    boxShadow: 6,
                    transform: "translateY(-2px)",
                  },
                  ...(activeTempoAlert === "speedUp" && {
                    backgroundColor: "rgb(34 197 94)", // green-500
                    boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.5)",
                  }),
                  "&.Mui-disabled": {
                    bgcolor: "rgb(55 65 81)",
                    color: "rgb(107 114 128)",
                  },
                }}
              >
                SPEED UP
              </Button>
            </div>
          </div>
        );
      default:
        // This handles all 'noteDisplay' sections by checking their type
        if (section.type === "noteDisplay") {
          const note = notes?.find((n) => n.id === section.noteId);
          return (
            <div className="bg-gray-800 p-4 rounded-lg flex flex-col flex-1">
              <h3
                className="text-lg font-bold text-gray-300 mb-3 truncate"
                title={note?.title || "Note"}
              >
                {note?.title || "Note"}
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 text-gray-300">
                {note ? (
                  <LexicalViewer contentJSON={note.content} />
                ) : (
                  <p className="text-gray-500">Note not found.</p>
                )}
              </div>
            </div>
          );
        }
        return null;
    }
  };

  return (
    <>
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* --- 1. HEADER (Unchanged) --- */}
        <div className="flex justify-between items-center gap-3">
          {/* Left Side: Menu button and Title */}
          <div className="flex items-center gap-4 flex-1">
            <IconButton
              onClick={() => setIsSidebarCollapsed(false)}
              aria-label="Open navigation"
              sx={{ color: "white" }}
            >
              <MenuIcon />
            </IconButton>
            <h1 className="text-3xl font-bold">Live</h1>
          </div>

          {/* Center: Controls */}
          <div className="flex-1 flex justify-center items-center">
            {" "}
            {/* This button opens the modal on the main LiveView */}
            {activeSetlist && (
              <>
                <IconButton
                  onClick={() => setShowSetlistEditor(true)}
                  title="View Setlist"
                  sx={{
                    backgroundColor: "rgb(2 132 199)",
                    "&:hover": { backgroundColor: "rgb(2 132 199 / 0.9)" },
                    color: "white",
                    borderRadius: "0.375rem",
                    padding: "0.75rem",
                  }}
                >
                  <ListMusicIcon />
                </IconButton>
                <div className="relative ml-2">
                  <IconButton
                    onClick={() => setShowLayoutOptions((prev) => !prev)}
                    title="Change Layout"
                    sx={{
                      backgroundColor: "rgb(75 85 99)",
                      "&:hover": { backgroundColor: "rgb(107 114 128)" },
                      color: "white",
                      borderRadius: "0.375rem",
                      padding: "0.75rem",
                    }}
                  >
                    <LayoutIcon />
                  </IconButton>
                  {showLayoutOptions && ( // UPDATED: Layout options menu
                    <div
                      ref={layoutButtonRef}
                      className="absolute top-full mt-2 w-40 bg-gray-700 rounded-md shadow-lg py-1 z-20"
                    >
                      {layoutOptions.map((option) => (
                        <Button
                          key={option.key}
                          onClick={() => handleLayoutChange(option.key)}
                          fullWidth
                          sx={{
                            justifyContent: "flex-start",
                            padding: "0.5rem 1rem",
                            borderRadius: "0.375rem",
                            color: "rgb(229 231 235)",
                            backgroundColor:
                              layout === option.key
                                ? "rgb(2 132 199)"
                                : "transparent",
                            "&:hover": {
                              backgroundColor: "rgb(75 85 99)",
                            },
                          }}
                        >
                          {option.label}
                        </Button>
                      ))}
                      <div className="border-t border-gray-600 my-1"></div>
                      <Button
                        onClick={() => {
                          setIsEditingLayout(true);
                          originalLayout.current = sectionLayout; // Store original layout
                          setShowLayoutOptions(false);
                        }}
                        fullWidth
                        disabled={isEditingLayout}
                        sx={{
                          justifyContent: "flex-start",
                          padding: "0.5rem 1rem",
                          fontSize: "0.875rem",
                          borderRadius: "0.375rem",
                          color: "rgb(229 231 235)",
                          "&:hover": {
                            backgroundColor: "rgb(75 85 99)",
                          },
                        }}
                      >
                        Edit Layout
                      </Button>
                    </div>
                  )}
                </div>
                <IconButton
                  onClick={() => setKeepScreenOn(!keepScreenOn)}
                  sx={{
                    marginLeft: "0.5rem",
                    borderRadius: "0.375rem",
                    padding: "0.75rem",
                    ...(keepScreenOn
                      ? {
                          backgroundColor: "rgb(234 179 8)",
                          color: "black",
                          "&:hover": { backgroundColor: "rgb(202 138 4)" },
                        }
                      : {
                          backgroundColor: "rgb(75 85 99)",
                          color: "white",
                          "&:hover": { backgroundColor: "rgb(107 114 128)" },
                        }),
                  }}
                  title={
                    keepScreenOn
                      ? "Screen will stay on"
                      : "Screen will turn off"
                  }
                >
                  <SunIcon />
                </IconButton>
              </>
            )}
          </div>

          {/* Right Side: Controls */}
          <div className="flex items-center justify-end gap-2 flex-1">
            <div className="bg-gray-800 p-2 rounded-lg text-sm text-center">
              <div className="font-semibold">
                Leader:{" "}
                {conductor
                  ? conductor.id === user.uid
                    ? "You"
                    : conductor.name
                  : "None"}
              </div>

              {isLiveConductor && (
                <Button
                  onClick={handleStopConducting}
                  variant="contained"
                  size="small"
                  sx={{
                    backgroundColor: "rgb(220 38 38)",
                    "&:hover": { backgroundColor: "rgb(185 28 28)" },
                    color: "white",
                    width: "100%",
                    marginTop: "0.5rem",
                    borderRadius: "8px",
                    boxShadow: 2,
                    fontWeight: "bold",
                  }}
                >
                  Stop
                </Button>
              )}
              {!isLiveConductor && userRole !== "Viewer" && (
                <Button
                  onClick={handleSetConductor}
                  variant="contained"
                  size="small"
                  sx={{
                    backgroundColor: "rgb(2 132 199)",
                    "&:hover": { backgroundColor: "rgb(3 105 161)" },
                    color: "white",
                    width: "100%",
                    marginTop: "0.5rem",
                    borderRadius: "8px",
                    boxShadow: 2,
                    fontWeight: "bold",
                  }}
                >
                  Take Control
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* --- 2. MAIN CONTENT GRID (UPDATED) --- */}
        <div
          ref={layoutContainerRef}
          className={`${getLayoutClasses()} ${isEditingLayout ? "p-2 border-2 border-dashed border-sky-500/50 rounded-lg" : ""}`}
        >
          {sectionLayout.map((section) => (
            <SectionWrapper
              key={section.id}
              isEditingLayout={isEditingLayout}
              onMoveLeft={() => handleMoveLeft(section.id)}
              onMoveRight={() => handleMoveRight(section.id)}
              onRemove={() => handleHideSection(section.id)}
            >
              {renderSection(section)}
            </SectionWrapper>
          ))}
        </div>{" "}
        {/* --- End of Main Grid --- */}
        {/* --- 3. MODALS & FLOATING BUTTONS --- */}
        {isEditingLayout && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
            <div className="relative">
              <Button
                onClick={() => setShowAddSectionMenu((prev) => !prev)}
                variant="contained"
                startIcon={<PlusCircleIcon size={20} />}
                sx={{
                  backgroundColor: "rgb(2 132 199)",
                  "&:hover": { backgroundColor: "rgb(3 105 161)" },
                  borderRadius: "24px",
                  boxShadow: 4,
                  textTransform: "none",
                  fontWeight: "bold",
                  padding: "8px 20px",
                }}
              >
                Add Section
              </Button>
              {showAddSectionMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-700 rounded-md shadow-lg py-1">
                  <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase">
                    Notes
                  </div>
                  {availableNotes.length > 0 ? (
                    availableNotes.map((note) => (
                      <Button
                        fullWidth
                        key={note.id}
                        onClick={() => handleAddNoteSection(note)}
                        sx={{
                          justifyContent: "flex-start",
                          textTransform: "none",
                          color: "rgb(229 231 235)",
                          "&:hover": { backgroundColor: "rgb(75 85 99)" },
                        }}
                      >
                        {note.title}
                      </Button>
                    ))
                  ) : (
                    <span className="block px-4 py-2 text-sm text-gray-500">
                      No more notes to add
                    </span>
                  )}
                  <div className="border-t border-gray-600 my-1"></div>
                  <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase">
                    Standard Sections
                  </div>
                  {hiddenSections.length > 0 ? (
                    hiddenSections.map((s) => (
                      <Button
                        fullWidth
                        key={s.id}
                        onClick={() => handleAddSection(s)}
                        sx={{
                          justifyContent: "flex-start",
                          textTransform: "none",
                          color: "rgb(229 231 235)",
                          "&:hover": { backgroundColor: "rgb(75 85 99)" },
                        }}
                      >
                        {s.title}
                      </Button>
                    ))
                  ) : (
                    <span className="block px-4 py-2 text-sm text-gray-500">
                      No hidden sections
                    </span>
                  )}
                </div>
              )}
            </div>
            <Button
              onClick={handleCancelLayoutEdit}
              variant="contained"
              sx={{
                backgroundColor: "rgb(75 85 99)",
                "&:hover": { backgroundColor: "rgb(55 65 81)" },
                borderRadius: "24px",
                boxShadow: 4,
                textTransform: "none",
                fontWeight: "bold",
                padding: "8px 20px",
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                handleSaveLayout(sectionLayout);
                setIsEditingLayout(false);
              }}
              variant="contained"
              sx={{
                backgroundColor: "rgb(22 163 74)",
                "&:hover": { backgroundColor: "rgb(21 128 61)" },
                borderRadius: "24px",
                boxShadow: 4,
                textTransform: "none",
                fontWeight: "bold",
                padding: "8px 20px",
              }}
            >
              Save Layout
            </Button>
          </div>
        )}
        {showPdfSelectionModal && (
          <PdfSelectionModal
            song={showPdfSelectionModal}
            onClose={() => setShowPdfSelectionModal(null)}
            onSelect={(selection) => {
              const songData = {
                song: showPdfSelectionModal,
                pdf: selection.isLyrics ? null : selection,
              };
              if (selection.isLyrics) {
                setSongToView(songData);
              } else {
                setSongToView(songData);
              }
              setCurrentView("fullScreenSong");
              setShowPdfSelectionModal(null);
            }}
          />
        )}
        {/* The setlist modal is now rendered here, outside the viewer, to handle clicks from the main LiveView */}
        {activeSetlist && showSetlistEditor && (
          <CombinedSetlistModal
            bandData={bandData}
            activeSetlist={activeSetlist}
            allSongs={bandData.songs}
            members={members}
            currentSongIndex={currentSongIndex}
            isLiveConductor={isLiveConductor}
            onClose={() => setShowSetlistEditor(false)}
            // --- THIS IS THE FIX: Optimistically update the UI ---
            onSaveSetlist={(order, newSongs, jumpToIndex, jumpToPdf = null) => {
              // 1. Save the changes in the background.
              handleSaveSetlistChanges(
                order,
                newSongs,
                bandData,
                db,
                jumpToIndex
              );

              // 2. If a jump was requested, immediately update the local state to show the new song.
              if (jumpToIndex !== null && jumpToIndex >= 0) {
                const newSongId = order[jumpToIndex];
                const songToJumpTo = bandData.songs.find(
                  (s) => s.id === newSongId
                );
                if (songToJumpTo)
                  setSongToView({ song: songToJumpTo, pdf: jumpToPdf });
              }
              // 3. Close the modal.
              setShowSetlistEditor(false);
            }}
            onJumpToSong={handleJumpToSong}
            onSongSelected={(song, pdf, index) => {
              handleJumpToSong(index, bandData, db, members);
              setSongToView({ song, pdf });
              setShowSetlistEditor(false);
            }}
            showToast={showToast}
            isOffline={isOffline}
            db={db}
            user={user}
          />
        )}
      </div>
    </>
  );
}

export default LiveView;
