import { useState, useEffect, useRef, useMemo } from "react";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  getMetadata,
} from "firebase/storage";
import { doc, collection, updateDoc, runTransaction } from "firebase/firestore";
import { Button, IconButton, CircularProgress } from "@mui/material";
import {
  Edit,
  Delete,
  Menu,
  MusicNote,
  Description,
  Upload,
  Download,
  Add,
} from "@mui/icons-material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Modal from "./modals/Modal";
import UploadSongsModal from "./modals/UploadSongsModal";
import UploadSetlistModal from "./modals/UploadSetlistModal";
import SongEditor from "./SongEditor";
import SetlistEditor from "./SetlistEditor";
import useLongPress from "../helpers/useLongPress";

function SongListItem({
  song,
  isSelectMode,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onLongPress,
  hasEditPermission,
}) {
  const songPressEvents = useLongPress(
    () => hasEditPermission && onLongPress(song.id),
    (e) => {
      if (isSelectMode && hasEditPermission) {
        if (e.target.closest('input[type="checkbox"]')) return;
        onToggleSelect(song.id);
        if (e.type === "touchend" || e.type === "touchcancel")
          e.preventDefault();
      }
    },
    { delay: 500 }
  );

  return (
    <div
      {...songPressEvents}
      className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 p-4 border-b border-gray-700 last:border-b-0 ${hasEditPermission ? "hover:bg-gray-700/50" : ""}`}
    >
      <div className="w-5">
        {isSelectMode && hasEditPermission && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(song.id);
            }}
            className="w-5 h-5 bg-gray-600 border-gray-500 rounded text-sky-500 focus:ring-sky-600"
          />
        )}
      </div>
      <div className="truncate" title={song.title}>
        {song.title}
      </div>
      <div className="flex items-center justify-center gap-3 text-gray-500">
        {song.lyricsChords && <MusicNote title="Lyrics/Chords available" />}
        {song.pdfs?.length > 0 && (
          <Description title={`${song.pdfs.length} file(s) attached`} />
        )}
      </div>
      <div className="flex justify-end">
        {!isSelectMode && hasEditPermission && (
          <div className="flex-shrink-0 flex items-center gap-1">
            <IconButton
              onClick={() => onEdit(song)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Edit Song"
              sx={{
                color: "rgb(56 189 248)",
                "&:hover": { backgroundColor: "rgba(56, 189, 248, 0.1)" },
              }}
            >
              <Edit />
            </IconButton>
            <IconButton
              onClick={() => onDelete(song)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Delete Song"
              sx={{
                color: "rgb(239 68 68)",
                "&:hover": { backgroundColor: "rgba(239, 68, 68, 0.1)" },
              }}
            >
              <Delete />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

function SongManagementView({
  setIsSidebarCollapsed,
  bandData,
  user,
  db,
  storage,
  showToast,
  showConfirmation,
  refreshAuthToken,
  isOffline,
  userRole,
  setBandData,
}) {
  const [editingSong, setEditingSong] = useState(null);
  const [editingSetlist, setEditingSetlist] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUploadSongsModal, setShowUploadSongsModal] = useState(false);
  const [showSongMenu, setShowSongMenu] = useState(false);
  const [showSetlistMenu, setShowSetlistMenu] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState(new Set());
  const [songSortOrder, setSongSortOrder] = useState("alpha-asc");
  const [activeTab, setActiveTab] = useState("songs");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const songMenuRef = useRef(null);
  const setlistMenuRef = useRef(null);
  const sortMenuRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);

  const hasEditPermission =
    (userRole === "Leader" || userRole === "Member") && !isOffline;
  const sortOptions = {
    "alpha-asc": "Name (A-Z)",
    "alpha-desc": "Name (Z-A)",
    "date-desc": "Newest",
    "date-asc": "Oldest",
  };
  const canAddSong = true;
  const canAddSetlist = true;

  useEffect(() => {
    function handleClickOutside(event) {
      if (songMenuRef.current && !songMenuRef.current.contains(event.target))
        setShowSongMenu(false);
      if (
        setlistMenuRef.current &&
        !setlistMenuRef.current.contains(event.target)
      )
        setShowSetlistMenu(false);
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target))
        setShowSortMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isSelectMode) setSelectedSongs(new Set());
  }, [isSelectMode]);

  const handleSaveSong = async (songData, pdfFiles, pdfsToDelete) => {
    if (isOffline) {
      if (pdfFiles.length > 0 || pdfsToDelete.length > 0)
        showToast("File uploads are disabled while offline.", "warning");
      const isNewSong = !songData.id;
      const updatedSong = {
        ...songData,
        id: isNewSong ? `offline_${Date.now()}` : songData.id,
        pdfs: (songData.pdfs || []).filter(
          (p) => !pdfsToDelete.some((pd) => pd.path === p.path)
        ),
      };
      const newSongs = isNewSong
        ? [...(bandData.songs || []), updatedSong]
        : (bandData.songs || []).map((s) =>
            s.id === updatedSong.id ? updatedSong : s
          );
      setBandData({ ...bandData, songs: newSongs });
      setEditingSong(null);
      showToast("Local change saved. Will not sync online.", "info");
      return;
    }
    try {
      let songId =
        songData.id || doc(collection(db, "bands", bandData.id, "songs")).id;
      for (const pdf of pdfsToDelete) {
        await deleteObject(ref(storage, pdf.path)).catch((err) =>
          console.warn("Failed to delete old file:", err)
        );
      }
      const newPdfData = await Promise.all(
        pdfFiles.map(async (file) => {
          const filePath = `bands/${bandData.id}/${songId}/${file.name}`;
          const uploadTask = await uploadBytesResumable(
            ref(storage, filePath),
            file
          );
          const downloadURL = await getDownloadURL(uploadTask.ref);
          const metadata = await getMetadata(uploadTask.ref);
          return {
            name: file.name,
            url: downloadURL,
            path: filePath,
            size: metadata.size,
            updated: metadata.updated,
          };
        })
      );
      const finalPdfs = (songData.pdfs || []).concat(newPdfData);
      const updatedSong = {
        ...songData,
        id: songId,
        pdfs: finalPdfs,
        title: songData.title.trim(),
      };
      if (!songData.id) updatedSong.createdAt = new Date();
      const updatedSongs = !songData.id
        ? [...(bandData.songs || []), updatedSong]
        : (bandData.songs || []).map((s) =>
            s.id === updatedSong.id ? updatedSong : s
          );
      await updateDoc(doc(db, "bands", bandData.id), { songs: updatedSongs });
      setEditingSong(null);
      showToast(songData.id ? "Song updated!" : "Song created!", "success");
    } catch (error) {
      console.error("Failed to save song:", error);
      throw error;
    }
  };

  const handleDeleteSong = (songToDelete) => {
    if (isOffline) {
      const newSongs = (bandData.songs || []).filter(
        (s) => s.id !== songToDelete.id
      );
      const newSetlists = (bandData.setlists || []).map((setlist) => ({
        ...setlist,
        songOrder: setlist.songOrder.filter((id) => id !== songToDelete.id),
      }));
      setBandData({ ...bandData, songs: newSongs, setlists: newSetlists });
      showToast("Song removed locally. Will not sync online.", "info");
      return;
    }
    showConfirmation({
      title: "Delete Song?",
      message: `Are you sure you want to permanently delete "${songToDelete.title}"?`,
      confirmText: "Delete",
      confirmColor: "bg-red-600",
      onConfirm: async () => {
        try {
          await runTransaction(db, async (transaction) => {
            const bandRef = doc(db, "bands", bandData.id);
            const freshBandDoc = await transaction.get(bandRef);
            if (!freshBandDoc.exists()) throw new Error("Band does not exist!");
            const currentBandData = freshBandDoc.data();
            let storageToDecrement = 0;
            await Promise.all(
              (songToDelete.pdfs || []).map(async (pdf) => {
                try {
                  storageToDecrement += (
                    await getMetadata(ref(storage, pdf.path))
                  ).size;
                  await deleteObject(ref(storage, pdf.path));
                } catch (e) {
                  if (e.code !== "storage/object-not-found")
                    console.error("Could not delete PDF:", e);
                }
              })
            );
            const newSongs = (currentBandData.songs || []).filter(
              (s) => s.id !== songToDelete.id
            );
            const newSetlists = (currentBandData.setlists || []).map((sl) => ({
              ...sl,
              songOrder: sl.songOrder.filter((id) => id !== songToDelete.id),
            }));
            transaction.update(bandRef, {
              songs: newSongs,
              setlists: newSetlists,
              storageUsed: Math.max(
                0,
                (currentBandData.storageUsed || 0) - storageToDecrement
              ),
            });
          });
          showToast("Song deleted.", "info");
        } catch (e) {
          showToast("Failed to delete song.", "error");
        }
      },
    });
  };

  const handleBulkDelete = () => {
    if (selectedSongs.size === 0) return;
    if (isOffline) {
      const newSongs = (bandData.songs || []).filter(
        (s) => !selectedSongs.has(s.id)
      );
      const newSetlists = (bandData.setlists || []).map((setlist) => ({
        ...setlist,
        songOrder: setlist.songOrder.filter((id) => !selectedSongs.has(id)),
      }));
      setBandData({ ...bandData, songs: newSongs, setlists: newSetlists });
      setIsSelectMode(false);
      showToast(`${selectedSongs.size} songs removed locally.`, "info");
      return;
    }
    showConfirmation({
      title: `Delete ${selectedSongs.size} Songs?`,
      message: `This will permanently delete ${selectedSongs.size} songs.`,
      confirmText: "Delete",
      confirmColor: "bg-red-600",
      onConfirm: async () => {
        try {
          await runTransaction(db, async (transaction) => {
            const bandRef = doc(db, "bands", bandData.id);
            const freshBandDoc = await transaction.get(bandRef);
            if (!freshBandDoc.exists()) throw new Error("Band not found");
            const currentBandData = freshBandDoc.data();
            const songsToDelete = currentBandData.songs.filter((s) =>
              selectedSongs.has(s.id)
            );
            await Promise.all(
              songsToDelete.flatMap((song) =>
                (song.pdfs || []).map((pdf) =>
                  deleteObject(ref(storage, pdf.path)).catch((err) =>
                    console.warn(err)
                  )
                )
              )
            );
            const newSongs = currentBandData.songs.filter(
              (s) => !selectedSongs.has(s.id)
            );
            const newSetlists = currentBandData.setlists.map((sl) => ({
              ...sl,
              songOrder: sl.songOrder.filter((id) => !selectedSongs.has(id)),
            }));
            transaction.update(bandRef, {
              songs: newSongs,
              setlists: newSetlists,
            });
          });
          showToast(`${selectedSongs.size} songs deleted.`, "info");
          setIsSelectMode(false);
        } catch (error) {
          showToast("Failed to delete songs.", "error");
        }
      },
    });
  };

  const handleSaveSetlist = async (setlistData) => {
    if (isOffline) {
      const isNew = !setlistData.id;
      const updatedSetlist = {
        ...setlistData,
        id: isNew ? `offline_${Date.now()}` : setlistData.id,
      };
      const newSetlists = isNew
        ? [...(bandData.setlists || []), updatedSetlist]
        : (bandData.setlists || []).map((s) =>
            s.id === updatedSetlist.id ? updatedSetlist : s
          );
      setBandData({ ...bandData, setlists: newSetlists });
      setEditingSetlist(null);
      showToast("Local change saved. Will not sync.", "info");
      return;
    }
    const newSetlists = setlistData.id
      ? bandData.setlists.map((s) =>
          s.id === setlistData.id ? setlistData : s
        )
      : [
          ...(bandData.setlists || []),
          { ...setlistData, id: Date.now().toString() },
        ];
    await updateDoc(doc(db, "bands", bandData.id), { setlists: newSetlists });
    setEditingSetlist(null);
  };

  const handleDeleteSetlist = (setlistId) => {
    if (isOffline) {
      const newSetlists = bandData.setlists.filter((s) => s.id !== setlistId);
      setBandData({ ...bandData, setlists: newSetlists });
      showToast("Setlist removed locally.", "info");
      return;
    }
    showConfirmation({
      title: "Delete Setlist?",
      message: "Are you sure you want to delete this setlist?",
      confirmText: "Delete",
      confirmColor: "bg-red-600",
      onConfirm: async () => {
        const newSetlists = bandData.setlists.filter((s) => s.id !== setlistId);
        const liveStateUpdates =
          bandData.liveState?.activeSetlistId === setlistId
            ? { activeSetlistId: null, currentSongIndex: -1 }
            : {};
        await updateDoc(doc(db, "bands", bandData.id), {
          setlists: newSetlists,
          liveState: { ...bandData.liveState, ...liveStateUpdates },
        });
        showToast("Setlist deleted.", "info");
      },
    });
  };

  const handleSetActiveSetlist = async (setlistId) => {
    const liveState = {
      ...bandData.liveState,
      activeSetlistId: setlistId,
      currentSongIndex: -1,
    };
    if (isOffline) {
      setBandData({ ...bandData, liveState });
      showToast("Active setlist changed locally.", "info");
      return;
    }
    await updateDoc(doc(db, "bands", bandData.id), { liveState });
  };

  useEffect(() => {
    if (bandData.setlists?.length === 1) {
      const singleSetlistId = bandData.setlists[0].id;
      if (bandData.liveState?.activeSetlistId !== singleSetlistId) {
        handleSetActiveSetlist(singleSetlistId);
      }
    }
  }, [bandData.setlists, bandData.liveState?.activeSetlistId]);

  const escapeCsvCell = (cell) => {
    if (cell === null || cell === undefined) return "";
    const str = String(cell);
    if (str.includes(",") || str.includes('"') || str.includes("\n"))
      return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const handleDownloadSetlist = (setlistId) => {
    const setlistToDownload = bandData.setlists.find((s) => s.id === setlistId);
    if (!setlistToDownload) return;
    const headers = ["song name", "notes", "tempo"];
    let csvContent = headers.join(",") + "\r\n";
    setlistToDownload.songOrder.forEach((songId) => {
      const song = bandData.songs.find((s) => s.id === songId);
      if (song)
        csvContent +=
          [song.title, song.notes, song.tempo].map(escapeCsvCell).join(",") +
          "\r\n";
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${setlistToDownload.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_setlist.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSongs = () => {
    const headers = ["song name", "notes", "tempo", "lyricsChords"];
    let csvContent = headers.join(",") + "\r\n";
    (bandData.songs || []).forEach((song) => {
      csvContent +=
        [song.title, song.notes, song.tempo, song.lyricsChords]
          .map(escapeCsvCell)
          .join(",") + "\r\n";
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bandData.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_songs.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleSelectSong = (songId) => {
    setSelectedSongs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(songId)) newSet.delete(songId);
      else newSet.add(songId);
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedSongs.size === sortedSongs.length) setSelectedSongs(new Set());
    else setSelectedSongs(new Set(sortedSongs.map((s) => s.id)));
  };

  const sortedSongs = useMemo(
    () =>
      [...(bandData.songs || [])].sort((a, b) => {
        switch (songSortOrder) {
          case "alpha-desc":
            return b.title.localeCompare(a.title);
          case "date-asc":
            return (
              (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0)
            );
          case "date-desc":
            return (
              (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
            );
          default:
            return a.title.localeCompare(b.title);
        }
      }),
    [bandData.songs, songSortOrder]
  );

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      const isAllSelected =
        selectedSongs.size > 0 && selectedSongs.size === sortedSongs.length;
      selectAllCheckboxRef.current.checked = isAllSelected;
      selectAllCheckboxRef.current.indeterminate =
        selectedSongs.size > 0 && !isAllSelected;
    }
  }, [selectedSongs, sortedSongs]);

  const handleUploadSongs = async (songsFromCsv) => {
    if (isOffline) {
      showToast("Cannot upload songs while offline.", "warning");
      return;
    }
    if (!hasEditPermission || songsFromCsv.length === 0) return;
    const updatedSongs = [...(bandData.songs || [])];
    songsFromCsv.forEach((csvSong) => {
      const normalizedCsvTitle = csvSong.title.trim().toLowerCase();
      const existingSongIndex = updatedSongs.findIndex(
        (s) => s.title.trim().toLowerCase() === normalizedCsvTitle
      );
      if (existingSongIndex > -1)
        updatedSongs[existingSongIndex] = {
          ...updatedSongs[existingSongIndex],
          ...csvSong,
        };
      else
        updatedSongs.push({
          id: doc(collection(db, "bands", bandData.id, "songs")).id,
          pdfs: [],
          ...csvSong,
          createdAt: new Date(),
        });
    });
    await updateDoc(doc(db, "bands", bandData.id), { songs: updatedSongs });
    setShowUploadSongsModal(false);
    showToast("Song library updated successfully!", "success");
  };

  const handleUploadSetlist = async (newSetlistName, songsFromCsv) => {
    if (isOffline) {
      showToast("Cannot upload setlists while offline.", "warning");
      return;
    }
    if (!hasEditPermission || !newSetlistName || songsFromCsv.length === 0)
      return;
    const existingSongs = [...(bandData.songs || [])];
    const newSongsToAdd = [];
    const setlistSongOrder = [];
    songsFromCsv.forEach((csvSong) => {
      const normalizedCsvTitle = csvSong.title.trim().toLowerCase();
      let existingSong = existingSongs.find(
        (s) => s.title.trim().toLowerCase() === normalizedCsvTitle
      );
      if (existingSong) {
        setlistSongOrder.push(existingSong.id);
      } else {
        const newSong = {
          id: `offline_${Date.now()}` + Math.random(),
          title: csvSong.title.trim(),
          notes: csvSong.notes || "",
          tempo: csvSong.tempo || "",
          lyricsChords: "",
          pdfs: [],
        };
        newSongsToAdd.push(newSong);
        existingSongs.push(newSong);
        setlistSongOrder.push(newSong.id);
      }
    });
    const newSetlist = {
      id: Date.now().toString(),
      name: newSetlistName.trim(),
      songOrder: setlistSongOrder,
    };
    await updateDoc(doc(db, "bands", bandData.id), {
      songs: [...(bandData.songs || []), ...newSongsToAdd],
      setlists: [...(bandData.setlists || []), newSetlist],
    });
    setShowUploadModal(false);
  };

  const handleSongPress = (songId) => {
    if (!isSelectMode) {
      setIsSelectMode(true);
      setSelectedSongs(new Set([songId]));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <IconButton
            onClick={() => setIsSidebarCollapsed(false)}
            aria-label="Open navigation"
            sx={{ color: "white" }}
          >
            <Menu />
          </IconButton>
          <h1 className="text-3xl font-bold">Songs & Setlists</h1>
        </div>
      </div>
      {isOffline && (
        <p className="bg-yellow-600 text-yellow-50 p-3 rounded-md my-4">
          Editing is disabled while offline.
        </p>
      )}
      {!isOffline && !hasEditPermission && (
        <p className="bg-yellow-600 text-yellow-50 p-3 rounded-md my-4">
          You do not have permission to edit songs and setlists.
        </p>
      )}
      <div className="md:hidden my-4">
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab("songs")}
            className={`flex-1 py-2 text-center font-semibold transition-colors ${activeTab === "songs" ? "border-b-2 border-sky-500 text-sky-400" : "text-gray-400"}`}
          >
            Songs ({sortedSongs.length})
          </button>
          <button
            onClick={() => setActiveTab("setlists")}
            className={`flex-1 py-2 text-center font-semibold transition-colors ${activeTab === "setlists" ? "border-b-2 border-sky-500 text-sky-400" : "text-gray-400"}`}
          >
            Setlists ({(bandData.setlists || []).length})
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-0">
        <div
          className={`${activeTab === "songs" ? "flex" : "hidden"} md:flex flex-col min-h-0`}
        >
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold">Song Library</h2>
              {isSelectMode && selectedSongs.size > 0 && (
                <span className="text-sm bg-sky-800 text-sky-200 px-2 py-0.5 rounded-md">
                  {selectedSongs.size} selected
                </span>
              )}
            </div>
            {hasEditPermission && (
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsSelectMode((p) => !p)}
                  variant="contained"
                  size="small"
                  sx={{
                    backgroundColor: "rgb(75 85 99)",
                    "&:hover": { backgroundColor: "rgb(107 114 128)" },
                  }}
                >
                  {isSelectMode ? "Cancel" : "Select"}
                </Button>
                {isSelectMode && (
                  <Button
                    onClick={handleBulkDelete}
                    disabled={selectedSongs.size === 0}
                    variant="contained"
                    size="small"
                    sx={{
                      backgroundColor: "rgb(220 38 38)",
                      "&:hover": { backgroundColor: "rgb(239 68 68)" },
                      "&.Mui-disabled": {
                        backgroundColor: "rgb(55 65 81)",
                        color: "rgb(107 114 128)",
                      },
                    }}
                  >
                    Delete ({selectedSongs.size})
                  </Button>
                )}
                <div className="relative" ref={songMenuRef}>
                  <IconButton
                    onClick={() => setShowSongMenu((p) => !p)}
                    sx={{
                      color: "rgb(156 163 175)",
                      "&:hover": {
                        backgroundColor: "rgb(55 65 81)",
                        color: "white",
                      },
                    }}
                  >
                    <MoreVertIcon />
                  </IconButton>
                  {showSongMenu && (
                    <div className="absolute top-full right-0 mt-2 w-56 bg-gray-700 rounded-md shadow-lg py-1 z-10 flex flex-col">
                      <Button
                        onClick={() => {
                          setEditingSong({});
                          setShowSongMenu(false);
                        }}
                        disabled={!canAddSong}
                        startIcon={<Add />}
                        fullWidth
                        sx={{
                          justifyContent: "flex-start",
                          color: "white",
                          textTransform: "none",
                          "&:hover": {
                            backgroundColor: "rgba(2, 132, 199, 0.5)",
                          },
                        }}
                      >
                        Add New Song
                      </Button>
                      <Button
                        onClick={() => {
                          setShowUploadSongsModal(true);
                          setShowSongMenu(false);
                        }}
                        disabled={isOffline}
                        startIcon={<Upload />}
                        fullWidth
                        sx={{
                          justifyContent: "flex-start",
                          color: "white",
                          textTransform: "none",
                          "&:hover": {
                            backgroundColor: "rgba(2, 132, 199, 0.5)",
                          },
                        }}
                      >
                        Upload Songs (CSV)
                      </Button>
                      <Button
                        onClick={handleDownloadSongs}
                        startIcon={<Download />}
                        fullWidth
                        sx={{
                          justifyContent: "flex-start",
                          color: "white",
                          textTransform: "none",
                          "&:hover": {
                            backgroundColor: "rgba(2, 132, 199, 0.5)",
                          },
                        }}
                      >
                        Download Songs (CSV)
                      </Button>
                    </div>
                  )}
                  {!canAddSong && (
                    <p className="text-yellow-400 text-sm">
                      Song limit reached.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="bg-gray-800 rounded-lg flex-1 flex flex-col min-h-0">
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 p-4 border-b border-gray-700 text-sm font-semibold text-gray-400">
              <div className="w-5">
                {hasEditPermission && (
                  <input
                    type="checkbox"
                    ref={selectAllCheckboxRef}
                    onChange={handleToggleSelectAll}
                    className="w-5 h-5 bg-gray-600 border-gray-500 rounded text-sky-500 focus:ring-sky-600"
                  />
                )}
              </div>
              <div
                className="relative cursor-pointer"
                ref={sortMenuRef}
                onClick={() => setShowSortMenu((p) => !p)}
              >
                <div className="flex items-center gap-1">
                  <span>{sortOptions[songSortOrder]}</span>
                  <svg
                    className="fill-current h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
                {showSortMenu && (
                  <div className="absolute top-full left-0 mt-2 w-40 bg-gray-700 rounded-md shadow-lg py-1 z-20 flex flex-col">
                    {Object.entries(sortOptions).map(([key, label]) => (
                      <Button
                        key={key}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSongSortOrder(key);
                          setShowSortMenu(false);
                        }}
                        fullWidth
                        sx={{
                          justifyContent: "flex-start",
                          textTransform: "none",
                          color:
                            songSortOrder === key
                              ? "white"
                              : "rgb(229 231 235)",
                          backgroundColor:
                            songSortOrder === key
                              ? "rgb(2 132 199)"
                              : "transparent",
                          "&:hover": {
                            backgroundColor:
                              songSortOrder === key
                                ? "rgb(3 105 161)"
                                : "rgba(75, 85, 99, 0.5)",
                          },
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-center">Attachments</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="overflow-y-auto">
              {sortedSongs.map((song) => (
                <SongListItem
                  key={song.id}
                  song={song}
                  isSelectMode={isSelectMode}
                  selected={selectedSongs.has(song.id)}
                  onToggleSelect={handleToggleSelectSong}
                  onEdit={setEditingSong}
                  onDelete={handleDeleteSong}
                  onLongPress={handleSongPress}
                  hasEditPermission={hasEditPermission}
                />
              ))}
            </div>
          </div>
        </div>
        <div
          className={`${activeTab === "setlists" ? "flex" : "hidden"} md:flex flex-col min-h-0`}
        >
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-semibold">Setlists</h2>
            {hasEditPermission && (
              <div className="relative" ref={setlistMenuRef}>
                <IconButton
                  onClick={() => setShowSetlistMenu((p) => !p)}
                  sx={{
                    color: "rgb(156 163 175)",
                    "&:hover": {
                      backgroundColor: "rgb(55 65 81)",
                      color: "white",
                    },
                  }}
                >
                  <MoreVertIcon />
                </IconButton>
                {showSetlistMenu && (
                  <div className="absolute top-full right-0 mt-2 w-56 bg-gray-700 rounded-md shadow-lg py-1 z-10 flex flex-col">
                    <Button
                      onClick={() => {
                        setEditingSetlist({});
                        setShowSetlistMenu(false);
                      }}
                      disabled={!canAddSetlist}
                      startIcon={<Add />}
                      fullWidth
                      sx={{
                        justifyContent: "flex-start",
                        color: "white",
                        textTransform: "none",
                        "&:hover": {
                          backgroundColor: "rgba(2, 132, 199, 0.5)",
                        },
                      }}
                    >
                      Add New Setlist
                    </Button>
                    <Button
                      onClick={() => {
                        setShowUploadModal(true);
                        setShowSetlistMenu(false);
                      }}
                      disabled={isOffline}
                      startIcon={<Upload />}
                      fullWidth
                      sx={{
                        justifyContent: "flex-start",
                        color: "white",
                        textTransform: "none",
                        "&:hover": {
                          backgroundColor: "rgba(2, 132, 199, 0.5)",
                        },
                      }}
                    >
                      Upload Setlist (CSV)
                    </Button>
                  </div>
                )}
                {!canAddSetlist && (
                  <p className="text-yellow-400 text-sm">
                    Setlist limit reached.
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="bg-gray-800 p-4 rounded-lg flex-1 overflow-y-auto">
            {(bandData.setlists || []).map((setlist) => (
              <div
                key={setlist.id}
                className="p-3 border-b border-gray-700 last:border-b-0"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{setlist.name}</h3>
                    <p className="text-gray-400 mt-1 text-sm">
                      {setlist.songOrder.length} song
                      {setlist.songOrder.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {hasEditPermission && (
                      <>
                        <IconButton
                          onClick={() => setEditingSetlist(setlist)}
                          sx={{
                            color: "rgb(56 189 248)",
                            "&:hover": {
                              backgroundColor: "rgba(56, 189, 248, 0.1)",
                            },
                          }}
                        >
                          <Edit />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteSetlist(setlist.id)}
                          sx={{
                            color: "rgb(239 68 68)",
                            "&:hover": {
                              backgroundColor: "rgba(239, 68, 68, 0.1)",
                            },
                          }}
                        >
                          <Delete />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      onClick={() => handleDownloadSetlist(setlist.id)}
                      title="Download CSV"
                      sx={{
                        color: "rgb(156 163 175)",
                        "&:hover": { color: "white" },
                      }}
                    >
                      <Download />
                    </IconButton>

                    {bandData.liveState?.activeSetlistId === setlist.id ? (
                      <Button
                        variant="contained"
                        size="small"
                        sx={{
                          backgroundColor: "rgb(2 132 199)",
                          "&:hover": { backgroundColor: "rgb(3 105 161)" },
                          whiteSpace: "nowrap",
                          "&.Mui-disabled": {
                            backgroundColor: "rgb(2 132 199)",
                            color: "white",
                            opacity: 1,
                          },
                        }}
                        disabled
                      >
                        Active
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSetActiveSetlist(setlist.id)}
                        variant="outlined"
                        size="small"
                        sx={{
                          borderColor: "rgb(156 163 175)",
                          color: "rgb(156 163 175)",
                          "&:hover": { borderColor: "white", color: "white" },
                          whiteSpace: "nowrap",
                        }}
                      >
                        Set Active
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {hasEditPermission && editingSong && (
        <Modal size="xl" onClose={() => setEditingSong(null)}>
          <SongEditor
            song={editingSong}
            bandData={bandData}
            allSongs={bandData.songs || []}
            onSave={handleSaveSong}
            onCancel={() => setEditingSong(null)}
            storage={storage}
            user={user}
            showToast={showToast}
            refreshAuthToken={refreshAuthToken}
            isOffline={isOffline}
          />
        </Modal>
      )}
      {hasEditPermission && editingSetlist && (
        <Modal size="xl" onClose={() => setEditingSetlist(null)}>
          <SetlistEditor
            setlist={editingSetlist}
            allSongs={bandData.songs || []}
            onSave={handleSaveSetlist}
            onCancel={() => setEditingSetlist(null)}
            isOffline={isOffline}
          />
        </Modal>
      )}
      {hasEditPermission && showUploadModal && (
        <Modal onClose={() => setShowUploadModal(false)}>
          <UploadSetlistModal
            onUpload={handleUploadSetlist}
            onCancel={() => setShowUploadModal(false)}
          />
        </Modal>
      )}
      {hasEditPermission && showUploadSongsModal && (
        <Modal onClose={() => setShowUploadSongsModal(false)}>
          <UploadSongsModal
            onUpload={handleUploadSongs}
            onCancel={() => setShowUploadSongsModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

export default SongManagementView;
