import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from "firebase/functions";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  addDoc,
  updateDoc,
  writeBatch,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  getDocs,
  deleteField,
  serverTimestamp,
  runTransaction,
  increment,
  connectFirestoreEmulator,
  getDocFromServer,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  signInWithCustomToken,
  deleteUser,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getStorage,
  ref,
  getMetadata,
  connectStorageEmulator,
} from "firebase/storage";
import ConfirmationModal from "./components/modals/ConfirmationModal";
import Spinner from "./components/ui/Spinner";
import Toast from "./components/ui/Toast.jsx";
import { NudgeAlert, NudgeOverlay } from "./components/ui/Nudge";
import AppSidebar from "./components/AppSidebar";
import AuthScreen from "./components/AuthScreen.jsx";
import BandSelectionScreen from "./components/BandSelectionScreen.jsx";
import LiveView from "./components/LiveView.jsx";
import SongManagementView from "./components/SongManagementView.jsx";
import CombinedSetlistModal from "./components/modals/CombinedSetlistModal";
import NotesView from "./components/NotesView.jsx";
import PracticeView from "./components/PracticeView.jsx";
import MembersView from "./components/MembersView.jsx";
import EmailInvitePromptModal from "./components/modals/EmailInvitePromptModal.jsx";
import AssignManagerOnLeaveModal from "./components/modals/AssignManagerOnLeaveModal.jsx";
import ProfileModal from "./components/modals/ProfileModal";
import AssignOwnerOnLeaveModal from "./components/modals/AssignOwnerOnLeaveModal.jsx";
import FullScreenSongViewer from "./components/FullScreenSongViewer.jsx";
import { savePdf, deletePdf } from "./helpers/db.js";

// --- START FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
// --- END FIREBASE CONFIG ---

// --- THIS IS THE FIX: Initialize Firebase services once and export them. ---
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);
const firestoreAuth = getAuth(app);
const firestoreStorage = getStorage(app);
const functions = getFunctions(app);

/*
if (import.meta.env.DEV) {
  console.log("Development mode: Connecting to local Firebase emulators.");
  
  // Point to the emulators running on your local machine
  connectAuthEmulator(firestoreAuth, "http://localhost:9099");
  connectFirestoreEmulator(firestore, "localhost", 8080);
  connectStorageEmulator(firestoreStorage, "localhost", 9199);
  connectFunctionsEmulator(functions, "localhost", 5001);
}
*/

// --- NEW: Global Offline Indicator Component ---
const OfflineIndicator = ({ onToggle, isOnlineAvailable }) => (
  <div className="fixed top-0 left-1/2 -translate-x-1/2 bg-yellow-600/95 text-yellow-50 text-xs font-bold px-3 py-1 rounded-b-lg z-[100] flex items-center gap-3">
    <span>OFFLINE MODE</span>
    {isOnlineAvailable && (
      <>
        <div className="w-px h-4 bg-yellow-200/50"></div>
        <div
          className="flex items-center gap-1.5"
          title="Network connection found"
        >
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={false}
              onChange={onToggle}
              className="sr-only peer"
              title="Go Online"
            />
            <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
            <span className="ml-2 text-sm font-medium text-yellow-50">
              Online
            </span>
          </label>
        </div>
      </>
    )}
  </div>
);

// --- NEW: Banner for Offline Prompt ---
const OfflinePromptBanner = ({ onAccept, onDecline }) => (
  <div className="fixed top-0 left-0 right-0 bg-yellow-600 text-yellow-50 text-sm font-bold p-3 z-[100] flex items-center justify-center gap-6 shadow-lg">
    <span>Online connection lost. Use offline mode?</span>
    <div className="flex gap-4">
      <button
        onClick={onAccept}
        className="font-bold underline hover:text-yellow-200"
      >
        Yes
      </button>
      <button
        onClick={onDecline}
        className="font-bold underline hover:text-gray-200"
      >
        No
      </button>
    </div>
  </div>
);

// --- Main Application ---
export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeBandId, setActiveBandId] = useState(
    sessionStorage.getItem("setlistsync_activeBandId") || null
  );
  const [bandData, setBandData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentView, setCurrentView] = useState("live");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  // Use the singleton instances from the top level
  const [db] = useState(firestore);
  const [auth] = useState(firestoreAuth);
  const [storage] = useState(firestoreStorage);
  const [isBeingNudged, setIsBeingNudged] = useState(false);
  const [members, setMembers] = useState([]);
  const [nudgerName, setNudgerName] = useState(null);
  const nudgeTimeoutRef = useRef(null);
  const lastNudgeTimestampRef = useRef(null);
  const [emailInviteToShow, setEmailInviteToShow] = useState(null);
  const [showOwnerModal, setShowOwnerModal] = useState(false);
  const [keepScreenOn, setKeepScreenOn] = useState(() => {
    // Use React.useState
    const saved = sessionStorage.getItem("setlistsync_keepScreenOn");
    return saved === "true";
  });
  // --- State for Profile Modal ---
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // --- MOVED: State for Manager Modal (needed for leave logic) ---
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineBandName, setOfflineBandName] = useState("");
  const [cachedBandId, setCachedBandId] = useState(null);
  const [cachedBandIds, setCachedBandIds] = useState(new Set());
  const [isAutoOffline, setIsAutoOffline] = useState(false); // NEW: To track if offline mode was triggered automatically
  const [isOnlineAvailable, setIsOnlineAvailable] = useState(false); // NEW: To show reconnection toggle
  const [showOfflineFallbackToast, setShowOfflineFallbackToast] =
    useState(false); // NEW: To offer offline mode
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [songToView, setSongToView] = useState({ song: null, pdf: null }); // MOVED from LiveView

  // --- MOVED FROM LIVEVIEW: State for Tempo Alerts ---
  const [activeTempoAlert, setActiveTempoAlert] = useState(null);
  const tempoAlertTimeoutRef = useRef(null);
  const [isTempoChanging, setIsTempoChanging] = useState(false);

  // --- THIS IS THE FIX: Re-add the missing ref definitions ---
  const connectionCheckInterval = useRef(null);
  const stableConnectionTimeout = useRef(null);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "info",
  });
  const toastTimeoutRef = useRef(null);
  const [confirmation, setConfirmation] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    confirmText: "Confirm",
    confirmColor: "bg-red-600",
  });

  // --- NEW: Helper function to show a toast ---
  const showToast = (message, type = "info", duration = 3000) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ show: true, message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, duration);
  };
  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast((prev) => ({ ...prev, show: false }));
  };

  const setBandDataAndCacheOffline = (newBandData) => {
    setBandData(newBandData);
    if (isOfflineMode && newBandData) {
      const fullOfflineData = { bandData: newBandData, userData, members };
      localStorage.setItem(
        `setlistsync_offline_band_${newBandData.id}`,
        JSON.stringify(fullOfflineData)
      );
    }
  };

  // --- MOVED FROM LIVEVIEW: Handlers for FullScreenSongViewer ---
  const handleSongNav = async (direction, bandData, db, members) => {
    const isLiveConductor =
      isOfflineMode || user.uid === bandData.liveState?.liveConductorUid;
    const activeSetlist = bandData.setlists?.find(
      (s) => s.id === bandData.liveState.activeSetlistId
    );
    if (!isLiveConductor || !activeSetlist) return;

    let newIndex = bandData.liveState.currentSongIndex + direction;
    if (newIndex >= -1 && newIndex < activeSetlist.songOrder.length) {
      if (isOfflineMode) {
        // Offline: Update local state directly
        setBandData((prevBandData) => ({
          ...prevBandData,
          liveState: { ...prevBandData.liveState, currentSongIndex: newIndex },
        }));
        setMembers((prevMembers) =>
          prevMembers.map((m) => ({ ...m, isReady: false }))
        );
      } else {
        // Online: Update Firestore
        // --- THIS IS THE FIX: Optimistically update the UI before the database write ---
        const newSongId = activeSetlist.songOrder[newIndex];
        if (newSongId) {
          const songToJumpTo =
            bandData.songs.find((s) => s.id === newSongId) ||
            (newSongId === "BREAK_ITEM"
              ? { id: "BREAK_ITEM", title: "--- BREAK ---" }
              : null);
          if (songToJumpTo) {
            setSongToView({ song: songToJumpTo, pdf: null });
          }
        }
        await updateDoc(doc(db, "bands", bandData.id), {
          "liveState.currentSongIndex": newIndex,
        });
        const batch = writeBatch(db);
        members.forEach((member) => {
          const memberRef = doc(db, "bands", bandData.id, "members", member.id);
          batch.update(memberRef, { isReady: false });
        });
        await batch.commit();
      }
    }
  };

  const handleJumpToSong = async (index, bandData, db, members) => {
    const isLiveConductor =
      isOfflineMode || user.uid === bandData.liveState?.liveConductorUid;
    const activeSetlist = bandData.setlists?.find(
      (s) => s.id === bandData.liveState.activeSetlistId
    );
    if (!isLiveConductor || !activeSetlist) return;

    if (isOfflineMode) {
      // Offline: Update local state directly
      setBandData((prevBandData) => ({
        ...prevBandData,
        liveState: { ...prevBandData.liveState, currentSongIndex: index },
      }));
      setMembers((prevMembers) =>
        prevMembers.map((m) => ({ ...m, isReady: false }))
      );
    } else {
      // Online: Update Firestore
      await updateDoc(doc(db, "bands", bandData.id), {
        "liveState.currentSongIndex": index,
      });
      const batch = writeBatch(db);
      members.forEach((member) => {
        const memberRef = doc(db, "bands", bandData.id, "members", member.id);
        batch.update(memberRef, { isReady: false });
      });
      await batch.commit();
    }
  };
  // --- MOVED FROM LIVEVIEW: Handler for setting ready status ---
  const handleSetReady = async (isReady, user, bandData, db) => {
    if (isOfflineMode) {
      // Offline: Update local state directly
      setMembers((prevMembers) =>
        prevMembers.map((m) => (m.id === user.uid ? { ...m, isReady } : m))
      );
      return;
    }
    // Online logic
    if (!user || !bandData) return;
    const member = members.find((m) => m.id === user.uid);
    if (member?.role === "Viewer") return;
    await updateDoc(doc(db, "bands", bandData.id, "members", user.uid), {
      isReady,
    });
  };

  const enterOfflineMode = (argument) => {
    const isAuto = typeof argument === "boolean" ? argument : false;
    const bandId = typeof argument === "string" ? argument : null;

    const storageKey = bandId
      ? `setlistsync_offline_band_${bandId}`
      : "setlistsync_offline_data";

    const offlineDataString = localStorage.getItem(storageKey);

    if (offlineDataString) {
      try {
        const { bandData, userData, members } = JSON.parse(offlineDataString);

        delete bandData.nudgedMemberId;
        delete bandData.nudgerName;
        if (bandData.liveState) {
          bandData.liveState.tempoAlert = null;
        }
        const membersWithResetReadyState = members.map((m) => ({
          ...m,
          isReady: false,
        }));

        setUser({
          uid: userData.uid,
          email: userData.email,
          emailVerified: true,
        });
        setUserData(userData);
        setBandData(bandData);
        setMembers(membersWithResetReadyState);
        setActiveBandId(bandData.id);
        setIsOfflineMode(true);
        setCachedBandId(bandData.id);

        if (isAuto) {
          setIsAutoOffline(true);
          showToast(
            `Connection lost. Using offline version of ${bandData.name}.`,
            "warning",
            5000
          );
        } else {
          showToast(`Offline mode activated for ${bandData.name}.`, "info");
        }
        setIsLoading(false);
      } catch (e) {
        showToast(
          `Failed to load offline data for ${bandId ? `band ${bandId}` : "default band"}. It may be corrupt.`,
          "error"
        );
        console.error("Failed to parse offline data:", e);
      }
    } else {
      showToast(
        `No offline data found for ${bandId ? `band ${bandId}` : "default band"}.`,
        "error"
      );
    }
  };

  const exitOfflineMode = () => {
    // This will trigger a reload to clear state and re-authenticate online
    window.location.reload();
  };

  const toggleOfflineMode = () => {
    if (isOfflineMode) {
      exitOfflineMode();
    } else {
      const idToLoad = activeBandId;
      if (!idToLoad) {
        showToast("No active band to make offline.", "error");
        return;
      }
      const offlineDataString = localStorage.getItem(
        `setlistsync_offline_band_${idToLoad}`
      );
      if (offlineDataString) {
        try {
          const { bandData, userData, members } = JSON.parse(offlineDataString);

          delete bandData.nudgedMemberId;
          delete bandData.nudgerName;
          if (bandData.liveState) bandData.liveState.tempoAlert = null;
          const membersWithResetReadyState = members.map((m) => ({
            ...m,
            isReady: false,
          }));

          setUser({
            uid: userData.uid,
            email: userData.email,
            emailVerified: true,
          });
          setUserData(userData);
          setBandData(bandData);
          setMembers(membersWithResetReadyState);
          setActiveBandId(bandData.id);
          setIsOfflineMode(true);
          showToast(`Offline mode activated for ${bandData.name}.`, "info");
          setIsLoading(false);
        } catch (e) {
          showToast("Failed to load offline data. It may be corrupt.", "error");
          console.error("Failed to parse offline data:", e);
        }
      } else {
        showToast(
          "No offline data found for this band. Please cache it first.",
          "error"
        );
      }
    }
  };
  // --- MOVED FROM LIVEVIEW: Handler for tempo alerts ---
  const handleTempoAlert = async (alertType, bandData, db) => {
    if (!bandData || isTempoChanging) return;

    const currentAlert = activeTempoAlert;
    let newType = alertType;

    if (currentAlert === alertType) {
      newType = null;
    }

    // Optimistic UI update
    setActiveTempoAlert(newType);
    setIsTempoChanging(true);

    // Clear and set new timeout for optimistic update
    if (tempoAlertTimeoutRef.current) {
      clearTimeout(tempoAlertTimeoutRef.current);
    }
    if (newType) {
      tempoAlertTimeoutRef.current = setTimeout(() => {
        setActiveTempoAlert(null);
      }, 15000);
    }

    if (isOfflineMode) {
      setTimeout(() => setIsTempoChanging(false), 500); // Just a small delay to prevent spamming
      return;
    }

    try {
      await updateDoc(doc(db, "bands", bandData.id), {
        "liveState.tempoAlert": {
          type: newType,
          timestamp: serverTimestamp(),
        },
      });
      // The useEffect listening to bandData will set isTempoChanging to false
    } catch (error) {
      console.error("Failed to send tempo alert:", error);
      // Revert on failure
      setActiveTempoAlert(currentAlert);
      setIsTempoChanging(false);
      showToast("Failed to send tempo alert.", "error");
      // Clear optimistic timeout
      if (tempoAlertTimeoutRef.current) {
        clearTimeout(tempoAlertTimeoutRef.current);
      }
    }
  };

  // --- NEW: Moved from LiveView to be globally accessible ---
  const handleSaveSetlistChanges = async (
    newSongOrder,
    newSongs,
    bandData,
    db,
    jumpToIndex = null
  ) => {
    if (isOfflineMode) return;
    const isLiveConductor = user.uid === bandData.liveState?.liveConductorUid;
    if (!isLiveConductor) return;

    const activeSetlist = bandData.setlists?.find(
      (s) => s.id === bandData.liveState.activeSetlistId
    );
    if (!activeSetlist) return;

    const finalSongs = [...(bandData.songs || []), ...newSongs];
    const finalSetlists = bandData.setlists.map((setlist) =>
      setlist.id === activeSetlist.id
        ? { ...setlist, songOrder: newSongOrder }
        : setlist
    );

    const updates = { songs: finalSongs, setlists: finalSetlists };

    // --- THIS IS THE FIX: If a jump is requested, update the index in the same write operation ---
    if (
      jumpToIndex !== null &&
      jumpToIndex >= 0 &&
      jumpToIndex < newSongOrder.length
    ) {
      updates["liveState.currentSongIndex"] = jumpToIndex;
    }
    await updateDoc(doc(db, "bands", bandData.id), updates);
  };

  // --- MOVED FROM LIVEVIEW: Effects for managing tempo alert state ---
  useEffect(() => {
    if (tempoAlertTimeoutRef.current)
      clearTimeout(tempoAlertTimeoutRef.current);
    const tempoAlert = bandData?.liveState?.tempoAlert;

    if (tempoAlert && tempoAlert.type && tempoAlert.timestamp) {
      // --- THIS IS THE FIX: Handle both live and cached timestamps ---
      // Live Firestore Timestamps have a .toDate() method.
      // Timestamps from JSON (offline cache) are plain objects with .seconds and .nanoseconds.
      const alertTime =
        typeof tempoAlert.timestamp.toDate === "function"
          ? tempoAlert.timestamp.toDate().getTime()
          : new Date(tempoAlert.timestamp.seconds * 1000).getTime();
      const now = Date.now();
      const age = now - alertTime;

      if (age < 15000) {
        setActiveTempoAlert(tempoAlert.type);
        const remainingTime = 15000 - age;
        tempoAlertTimeoutRef.current = setTimeout(
          () => setActiveTempoAlert(null),
          remainingTime
        );
      } else {
        setActiveTempoAlert(null);
      }
    } else {
      setActiveTempoAlert(null);
    }

    setIsTempoChanging(false);

    return () => {
      if (tempoAlertTimeoutRef.current)
        clearTimeout(tempoAlertTimeoutRef.current);
    };
  }, [bandData?.liveState?.tempoAlert]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setIsTempoChanging(false);
  }, [bandData?.liveState?.tempoAlert]);

  // --- NEW: Helper functions to show/hide confirmation modal ---
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

  // --- DEFINITIVE FIX: A true, cache-busting network check function ---
  const checkRealInternetConnection = async () => {
    try {
      // We fetch a tiny, non-existent file from a reliable Google domain.
      // The key is to bypass any local or SDK caching.
      await fetch("https://www.google.com/images/cleardot.gif", {
        method: "HEAD", // We only need headers, not the content.
        cache: "no-store", // Do not use the browser cache.
        mode: "no-cors", // Prevents CORS errors for this simple check.
      });
      return true; // If the request doesn't throw, we have a connection.
    } catch (error) {
      return false; // Any network error means we are offline.
    }
  };

  // --- DEFINITIVE FIX: HYBRID OFFLINE DETECTION ---

  // Function to trigger the offline prompt. Centralized to be called from multiple places.
  const triggerOfflinePrompt = () => {
    // Only show the prompt if we are currently online and not already showing it.
    if (!isOfflineMode && !showOfflineFallbackToast) {
      console.log(
        "[Offline Check] Condition met: App is online. Checking for local cache."
      );
      const offlineDataString = localStorage.getItem(
        "setlistsync_offline_data"
      );
      if (offlineDataString) {
        console.log(
          "[Offline Check] Condition met: Offline data found. SHOWING PROMPT."
        );
        setShowOfflineFallbackToast(true);
      } else {
        console.log(
          "[Offline Check] Condition failed: No offline data found in localStorage."
        );
      }
    } else {
      console.log(
        "[Offline Check] Condition failed: App is already in offline mode or prompt is already showing."
      );
    }
  };

  // STRATEGY 1: Use the browser's native online/offline events for instant detection.
  useEffect(() => {
    const handleOffline = () => {
      console.log("[Offline Check] TRIGGER: Browser 'offline' event fired.");
      triggerOfflinePrompt();
    };
    const handleOnline = () => {
      console.log("[Offline Check] TRIGGER: Browser 'online' event fired.");
      // The reconnection logic is handled by a separate effect when isAutoOffline is true.
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [isOfflineMode, showOfflineFallbackToast]); // Re-bind if offline mode changes.

  // STRATEGY 2: Proactively poll Firestore as a reliable fallback.
  useEffect(() => {
    // This check only runs when the app is in ONLINE mode.
    if (isOfflineMode) return;

    const firestoreCheckInterval = setInterval(async () => {
      if (await checkRealInternetConnection()) {
        console.log("Conn OK");
      } else {
        console.log("Offline. Connection to Firestore is likely lost.");
        triggerOfflinePrompt();
      }
    }, 15000); // Check every 15 seconds.

    return () => clearInterval(firestoreCheckInterval);
  }, [isOfflineMode, db, activeBandId]); // Rerun this setup if mode, db, or band changes.

  useEffect(() => {
    const storedIds = localStorage.getItem("setlistsync_cached_bands");
    if (storedIds) {
      try {
        setCachedBandIds(new Set(JSON.parse(storedIds)));
      } catch (e) {
        console.error("Failed to parse cached_bands from localStorage", e);
        localStorage.removeItem("setlistsync_cached_bands");
      }
    }
  }, []);

  useEffect(() => {
    window.auth = auth;
  }, [auth]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const joinToken = urlParams.get("join_token");
    if (joinToken) {
      sessionStorage.setItem("setlistsync_join_token", joinToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const offlineDataString = localStorage.getItem("setlistsync_offline_data");
    if (offlineDataString) {
      const { bandData, userData } = JSON.parse(offlineDataString);
      setOfflineBandName(bandData.name);
      setCachedBandId(bandData.id);
    }

    if (!auth || !db) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setIsLoading(true);
      setUser(currentUser);
      if (currentUser) {
        const lastActiveBandId = sessionStorage.getItem(
          "setlistsync_activeBandId"
        );
        if (lastActiveBandId) {
          setActiveBandId(lastActiveBandId);
        } else {
          setActiveBandId(null);
        }
        const userDocRef = doc(db, "users", currentUser.uid);
        const unsubUser = onSnapshot(userDocRef, (userDoc) => {
          if (userDoc.exists()) setUserData(userDoc.data());
        });
        setIsLoading(false);
        return () => unsubUser();
      } else {
        setUserData(null);
        setActiveBandId(null);
        setBandData(null);
        sessionStorage.removeItem("setlistsync_activeBandId");
        setIsLoading(false);
      }
    });
    return () => {
      unsubscribe();
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, [auth, db]);

  useEffect(() => {
    if (isOfflineMode) return;
    if (!user || !activeBandId || !db) {
      setBandData(null);
      setMembers([]);
      return;
    }

    // This error handler remains as a fallback, but the primary detection
    // is now handled by the proactive network status monitor.
    const handleSnapshotError = (error) => {
      console.error("Firestore snapshot error:", error); // Log errors, but don't trigger UI from here.
    };

    const bandDocRef = doc(db, "bands", activeBandId);
    const unsubBand = onSnapshot(
      bandDocRef,
      (doc) => {
        if (doc.exists()) {
          setBandData({ id: doc.id, ...doc.data() });
        } else {
          setError("Active band not found.");
          switchActiveBand(null);
        }
      },
      handleSnapshotError
    );
    const membersColRef = collection(db, "bands", activeBandId, "members");
    const unsubMembers = onSnapshot(
      membersColRef,
      (snapshot) => {
        setMembers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      handleSnapshotError
    );
    return () => {
      unsubBand();
      unsubMembers();
    };
  }, [user, activeBandId, db, isOfflineMode]);

  useEffect(() => {
    if (isAutoOffline && !isOnlineAvailable) {
      // Only check if we haven't already detected a connection
      // Start checking for connection every 10 seconds
      connectionCheckInterval.current = setInterval(async () => {
        try {
          if (!(await checkRealInternetConnection()))
            throw new Error("No real connection");
          console.log("Connection check successful.");
          // If it succeeds, start a "stability" timer
          if (!stableConnectionTimeout.current) {
            stableConnectionTimeout.current = setTimeout(() => {
              setIsOnlineAvailable(true); // Set state to show the toggle
              clearInterval(connectionCheckInterval.current); // Stop checking once stable
            }, 5000); // 5 seconds of stability required
          }
        } catch (error) {
          console.log("Connection check failed, remaining offline.");
          // If it fails, reset the stability timer
          clearTimeout(stableConnectionTimeout.current);
          stableConnectionTimeout.current = null;
        }
      }, 10000); // Check every 10 seconds
    }

    return () => {
      // Cleanup on component unmount or when exiting auto-offline mode
      clearInterval(connectionCheckInterval.current);
      clearTimeout(stableConnectionTimeout.current);
    };
  }, [isAutoOffline, db, activeBandId, isOnlineAvailable]);

  useEffect(() => {
    // --- THIS IS THE FIX: Only process nudges when online. ---
    // This prevents the effect from running with stale cached data during the offline switch.
    if (isOfflineMode) return;

    if (
      bandData &&
      bandData.nudgedMemberId === user?.uid &&
      bandData.nudgeTimestamp > (lastNudgeTimestampRef.current || 0)
    ) {
      console.log("Processing nudge for user:", user.uid);
      // 1. Acknowledge this nudge
      lastNudgeTimestampRef.current = bandData.nudgeTimestamp;

      // 2. Clear any *previous* nudge timeout
      clearTimeout(nudgeTimeoutRef.current);

      // 3. Show the nudge
      setIsBeingNudged(true);
      setNudgerName(bandData.nudgerName || "A bandmate");

      // 4. Set a timer to hide the nudge after 2.5 seconds
      nudgeTimeoutRef.current = setTimeout(() => {
        setIsBeingNudged(false);
        setNudgerName(null);
      }, 2500);

      // Set a *separate, short* timer to clear the database field.
      // This gives React time to render the flash before the onSnapshot fires again.
      setTimeout(() => {
        const bandRef = doc(db, "bands", activeBandId);
        if (isOfflineMode) return;
        updateDoc(bandRef, {
          nudgedMemberId: deleteField(),
          nudgerName: deleteField(),
        });
      }, 100); // 100ms delay is all it needs
    }
  }, [
    bandData?.nudgedMemberId,
    bandData?.nudgeTimestamp,
    user,
    db,
    activeBandId,
    isOfflineMode,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- THIS IS THE DEFINITIVE FIX: Sync the song viewer with the current song index ---
  // This effect ensures that whenever the currentSongIndex changes in the bandData,
  // the FullScreenSongViewer is updated to show the correct song. This fixes the
  // desynchronization between the setlist modal and the viewer.
  useEffect(() => {
    if (currentView === "fullScreenSong" && bandData?.liveState) {
      const activeSetlist = bandData.setlists?.find(
        (s) => s.id === bandData.liveState.activeSetlistId
      );
      const currentIndex = bandData.liveState.currentSongIndex;

      if (activeSetlist && currentIndex >= 0) {
        const currentSongId = activeSetlist.songOrder[currentIndex];
        const songToDisplay =
          bandData.songs.find((s) => s.id === currentSongId) ||
          (currentSongId === "BREAK_ITEM"
            ? { id: "BREAK_ITEM", title: "--- BREAK ---" }
            : null);

        // Only update if the song is different from what's already being viewed
        if (songToDisplay && songToDisplay.id !== songToView.song?.id) {
          setSongToView({ song: songToDisplay, pdf: null });
        }
      }
    }
  }, [
    bandData?.liveState?.currentSongIndex,
    currentView,
    bandData?.songs,
    bandData?.setlists,
    songToView.song?.id,
  ]); // Rerun whenever the song index changes

  useEffect(() => {
    sessionStorage.setItem("setlistsync_keepScreenOn", keepScreenOn);
  }, [keepScreenOn]);

  const refreshAuthToken = async () => {
    if (isOfflineMode) return;
    if (!activeBandId) return; // Don't refresh if no band is active
    try {
      const getScopedAuthToken = httpsCallable(functions, "getScopedAuthToken");
      const result = await getScopedAuthToken({ bandId: activeBandId });
      const customToken = result.data.token;
      await signInWithCustomToken(auth, customToken);
      console.log("Auth token refreshed for file operation.");
    } catch (error) {
      console.error("Failed to refresh token:", error);
      // Throwing an error here will stop the upload/save
      throw new Error("Could not verify permissions. Please try again.");
    }
  };
  const switchActiveBand = async (bandId) => {
    // --- THIS IS THE FIX ---
    // If no bandId is provided, we're switching to the band selection screen.
    // This should be allowed even in offline mode.
    if (!bandId) {
      sessionStorage.removeItem("setlistsync_activeBandId");
      setActiveBandId(null);
      return;
    }

    // If we are in offline mode and a specific bandId is requested, prevent switching.
    if (isOfflineMode) return;

    try {
      setIsLoading(true);
      const getScopedAuthToken = httpsCallable(functions, "getScopedAuthToken");
      const result = await getScopedAuthToken({ bandId });
      const customToken = result.data.token;
      await signInWithCustomToken(auth, customToken);
      console.log("Successfully refreshed auth token with band role.");
      sessionStorage.setItem("setlistsync_activeBandId", bandId);
      setActiveBandId(bandId);
    } catch (error) {
      console.error("Failed to switch band and get scoped token:", error);
      setError(`Could not switch to band. Error: ${error.message}`);
      if (auth) signOut(auth);
    } finally {
      setIsLoading(false);
    }
  };
  const handleCreateBand = async (yourName, bandName, backupData = null) => {
    if (isOfflineMode) return;
    if (!db || !user || !yourName || !bandName) return;
    setIsLoading(true);
    try {
      let songsToImport = [];
      if (backupData && backupData.songs) {
        songsToImport = backupData.songs.map((song) => {
          const { pdfs, ...songWithoutPdfs } = song;
          return { ...songWithoutPdfs, pdfs: [] };
        });
      }

      const bandRef = await addDoc(collection(db, "bands"), {
        name: bandName,
        ownerId: user.uid,
        memberCount: 1,
        leaders: { [user.uid]: true },
        liveState: { currentSongIndex: -1, liveConductorUid: null },
        songs: songsToImport,
        setlists: backupData?.setlists || [],
        createdDate: serverTimestamp(),
        storageUsed: 0,
        storageQuota: 524288000, // 500 MB
      });

      // --- UPDATED: Removed status field ---
      await setDoc(doc(db, "bands", bandRef.id, "members", user.uid), {
        name: yourName,
        isReady: false,
        role: "Leader",
        checkedIn: true,
        joinedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", user.uid), {
        name: yourName,
        bandIds: arrayUnion(bandRef.id),
      });

      await switchActiveBand(bandRef.id);
    } catch (err) {
      setError("Failed to create band.");
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleLeaveAsOwner = async (newOwnerId) => {
    if (!newOwnerId) {
      showToast("You must select a new owner before leaving.", "error");
      return;
    }
    // This is a special call to handleLeaveBand with the new owner's ID
    const success = await handleLeaveBand(null, newOwnerId);
    if (success) {
      setShowOwnerModal(false);
      switchActiveBand(null);
    }
  };

  const handleJoinBand = async (idToJoin, name, inviteId = null) => {
    if (isOfflineMode) return;
    if (!db || !user || !name || !idToJoin) return;
    setIsLoading(true);
    setError("");

    try {
      if (!inviteId) {
        throw new Error(
          "A valid invite link is required to join this band. Please ask a band leader for an invite."
        );
      }

      await runTransaction(db, async (transaction) => {
        const bandRef = doc(db, "bands", idToJoin);
        const bandDoc = await transaction.get(bandRef);
        if (!bandDoc.exists()) {
          throw new Error("Band ID not found.");
        }

        const bandData = bandDoc.data();
        const memberCount = bandData.memberCount || 0;
        const memberLimit = 20;

        if (memberCount >= memberLimit) {
          throw new Error("This band is full and cannot accept new members.");
        }

        const memberRef = doc(db, "bands", idToJoin, "members", user.uid);
        const userRef = doc(db, "users", user.uid);

        const memberDoc = await transaction.get(memberRef);
        if (memberDoc.exists()) {
          throw new Error("already-exists");
        }

        const inviteRef = doc(db, "bandInvites", inviteId);
        const inviteDoc = await transaction.get(inviteRef);
        if (!inviteDoc.exists() || inviteDoc.data().status !== "active") {
          throw new Error(
            "This invite link is invalid or has already been used."
          );
        }
        const inviteData = inviteDoc.data();
        if (
          inviteData.expiresAt &&
          inviteData.expiresAt.toDate() < new Date()
        ) {
          transaction.delete(inviteRef);
          throw new Error("This invite link has expired.");
        }
        if (inviteData.useCount >= inviteData.maxUses) {
          transaction.delete(inviteRef);
          throw new Error(
            "This invite has reached its maximum number of uses."
          );
        }
        if (inviteData.bandId !== idToJoin) {
          throw new Error("Invite and Band ID mismatch.");
        }
        if (
          inviteData.type === "email" &&
          inviteData.restrictedEmail !== user.email
        ) {
          const email = inviteData.restrictedEmail;
          const parts = email.split("@");
          if (parts.length === 2) {
            const anonEmail = `${parts[0].substring(0, 2)}***@${parts[1]}`;
            throw new Error(`This invite is for ${anonEmail}.`);
          } else {
            throw new Error(`This invite is restricted to a different email.`);
          }
        }

        const newUseCount = (inviteData.useCount || 0) + 1;
        if (newUseCount >= inviteData.maxUses) {
          transaction.delete(inviteRef);
        } else {
          transaction.update(inviteRef, {
            useCount: newUseCount,
            status: newUseCount >= inviteData.maxUses ? "inactive" : "active",
          });
        }

        // --- UPDATED: Removed status field ---
        transaction.set(memberRef, {
          name: name,
          isReady: false,
          role: "Member",
          checkedIn: true,
          joinedAt: serverTimestamp(),
        });

        transaction.update(userRef, {
          name: name,
          bandIds: arrayUnion(idToJoin),
        });
        transaction.update(bandRef, { memberCount: memberCount + 1 });
      });

      if (sessionStorage.getItem("setlistsync_join_token")) {
        sessionStorage.removeItem("setlistsync_join_token");
      }

      await switchActiveBand(idToJoin);
      showToast("Successfully joined band!", "success");
    } catch (err) {
      if (err.message.includes("Band ID not found")) {
        setError("Band ID not found.");
      } else if (err.message === "already-exists") {
        setError("You are already a member of this band.");
      } else {
        setError(err.message || "Failed to join band.");
      }
      console.error(err);
    }
    setIsLoading(false);
  };

  // --- Band-specific name changes ---
  const handleUpdateBandMemberName = async (newName) => {
    if (isOfflineMode) return;
    if (!user || !activeBandId || !newName.trim()) return;
    try {
      const memberRef = doc(db, "bands", activeBandId, "members", user.uid);
      await updateDoc(memberRef, { name: newName.trim() });
      showToast("Your name for this band has been updated.", "success");
    } catch (err) {
      console.error("Failed to update band member name:", err);
      showToast("Could not update your name for this band.", "error");
    }
  };

  const handleUpdateUserName = async (newName) => {
    if (isOfflineMode) return;
    if (!user || !newName.trim()) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { name: newName.trim() });
      showToast("Your name has been updated.", "success");
    } catch (err) {
      console.error("Failed to update user name:", err);
      showToast("Could not update your name. Please try again.", "error");
    }
  };

  const handleLeaveBand = async (newLeaderId = null, newOwnerId = null) => {
    if (isOfflineMode) return;
    setIsLoading(true);
    let success = false;
    try {
      const batch = writeBatch(db);
      const bandId = bandData.id;
      const bandRef = doc(db, "bands", bandId);

      if (newOwnerId) {
        batch.update(bandRef, { ownerId: newOwnerId });
        const newOwnerMemberRef = doc(
          db,
          "bands",
          bandId,
          "members",
          newOwnerId
        );
        batch.update(newOwnerMemberRef, { role: "Leader" });
        // --- THIS IS THE FIX ---
        // Add the new owner to the leaders map for consistency.
        batch.update(bandRef, { [`leaders.${newOwnerId}`]: true });
      }

      if (newLeaderId) {
        const newLeaderRef = doc(db, "bands", bandId, "members", newLeaderId);
        batch.update(newLeaderRef, { role: "Leader" });
        batch.update(bandRef, { [`leaders.${newLeaderId}`]: true });
      }
      const myMemberRef = doc(db, "bands", bandId, "members", user.uid);
      batch.delete(myMemberRef);
      const userRef = doc(db, "users", user.uid);
      batch.update(userRef, { bandIds: arrayRemove(bandId) });
      batch.update(bandRef, {
        memberCount: increment(-1),
        [`leaders.${user.uid}`]: deleteField(),
      });
      await batch.commit();
      success = true;
      if (showManagerModal) setShowManagerModal(false);
    } catch (err) {
      console.error("Error leaving band:", err);
      showToast("Could not leave the band. Please try again.", "error");
    } finally {
      setIsLoading(false);
      return success;
    }
  };

  const handleAttemptLeave = () => {
    // --- NEW: Check if the current user is the owner ---
    if (user.uid === bandData.ownerId && members.length > 1) {
      setShowOwnerModal(true); // Open the new "Assign Owner" modal
      return;
    }

    // Existing logic for non-owners
    showConfirmation({
      title: "Leave Band?",
      message: "Are you sure you want to leave this band?",
      confirmText: "Leave",
      confirmColor: "bg-yellow-600",
      onConfirm: async () => {
        const leaderCount = members.filter((m) => m.role === "Leader").length;
        const amILeader =
          members.find((m) => m.id === user.uid)?.role === "Leader";
        if (amILeader && leaderCount <= 1 && members.length > 1) {
          setShowManagerModal(true);
        } else {
          const success = await handleLeaveBand(null);
          if (success) {
            switchActiveBand(null);
          }
        }
      },
    });
  };

  const handleLeaveAsLeader = async (newLeaderId) => {
    if (!newLeaderId) {
      showToast("You must select a new leader to promote.", "error");
      return;
    }
    const success = await handleLeaveBand(newLeaderId);
    if (success) {
      setShowManagerModal(false);
      switchActiveBand(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (isOfflineMode) return;
    showConfirmation({
      title: "Delete Account?",
      message:
        "Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.",
      confirmText: "Delete My Account",
      confirmColor: "bg-red-800",
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const currentUser = auth.currentUser;
          if (!currentUser) {
            setIsLoading(false);
            return;
          }
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          const bandIds = userDoc.data()?.bandIds || [];

          for (const bandId of bandIds) {
            const bandRef = doc(db, "bands", bandId);
            const bandDocSnap = await getDoc(bandRef);
            if (!bandDocSnap.exists()) continue;

            if (currentUser.uid === bandDocSnap.data().ownerId) {
              const membersSnap = await getDocs(
                collection(db, "bands", bandId, "members")
              );
              const otherMembers = membersSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .filter((m) => m.id !== currentUser.uid);

              if (otherMembers.length > 0) {
                const sortedMembers = otherMembers.sort(
                  (a, b) =>
                    (a.joinedAt?.toDate()?.getTime() || 0) -
                    (b.joinedAt?.toDate()?.getTime() || 0)
                );
                const otherLeaders = sortedMembers.filter(
                  (m) => m.role === "Leader"
                );
                const newOwner =
                  otherLeaders.length > 0 ? otherLeaders[0] : sortedMembers[0];

                if (newOwner) {
                  const newOwnerMemberRef = doc(
                    db,
                    "bands",
                    bandId,
                    "members",
                    newOwner.id
                  );
                  const transferBatch = writeBatch(db);
                  transferBatch.update(bandRef, { ownerId: newOwner.id });
                  transferBatch.update(newOwnerMemberRef, { role: "Leader" });
                  // --- THIS IS THE FIX ---
                  transferBatch.update(bandRef, {
                    [`leaders.${newOwner.id}`]: true,
                  });
                  await transferBatch.commit();
                }
              }
            }

            const memberRef = doc(
              db,
              "bands",
              bandId,
              "members",
              currentUser.uid
            );
            await runTransaction(db, async (transaction) => {
              transaction.delete(memberRef);
              transaction.update(bandRef, {
                memberCount: increment(-1),
                [`leaders.${currentUser.uid}`]: deleteField(),
              });
            });
          }
          await deleteDoc(doc(db, "users", currentUser.uid));
          await deleteUser(currentUser);
        } catch (err) {
          // ... existing error handling ...
          if (err.code === "auth/requires-recent-login") {
            showToast(
              "This is a sensitive operation. Please log out and log back in to delete your account.",
              "error",
              5000
            );
          } else {
            console.error("Error deleting account:", err);
            showToast(
              "An error occurred while deleting your account. Please try again.",
              "error"
            );
          }
          setIsLoading(false);
        }
      },
    });
  };

  // --- NEW, CORRECT FUNCTION ---
  // This function now saves to IndexedDB with metadata
  const handleCachePdf = async (songId, pdf) => {
    if (isOfflineMode)
      return {
        success: false,
        name: pdf.name,
        error: new Error("Cannot cache files in offline mode."),
      };
    try {
      const key = `${songId}-${pdf.path}`;
      const fileRef = ref(storage, pdf.path); // Use 'storage' from App.jsx

      // 1. Get the latest metadata
      const metadata = await getMetadata(fileRef);

      // 2. Fetch the actual file content
      const response = await fetch(pdf.url);
      if (!response.ok)
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      const pdfBlob = await response.blob();

      // 3. Save to IndexedDB (db.js) with the 'updated' timestamp
      await savePdf(key, pdfBlob, metadata.updated);

      return { success: true, name: pdf.name };
    } catch (err) {
      console.error("Error saving PDF offline:", err);
      return { success: false, name: pdf.name, error: err };
    }
  };

  // --- NEW, CORRECT FUNCTION ---
  // This function now deletes from IndexedDB
  const handleRemoveCachedPdf = async (songId, pdf) => {
    if (isOfflineMode)
      return {
        success: false,
        name: pdf.name,
        error: new Error("Cannot modify cache in offline mode."),
      };
    try {
      const key = `${songId}-${pdf.path}`;
      await deletePdf(key); // Deletes from IndexedDB (db.js)
      return { success: true, name: pdf.name };
    } catch (err) {
      console.error("Error removing cached PDF:", err);
      return { success: false, name: pdf.name, error: err };
    }
  };

  const handleCreateOfflineData = () => {
    if (!bandData || !userData || !members) {
      showToast("Not enough data to create offline snapshot.", "error");
      return;
    }
    // --- FIX: Save to both the generic and band-specific keys ---
    const offlineBandData = { bandData, userData, members };
    const dataString = JSON.stringify(offlineBandData);

    // Save to the band-specific key for use within the app
    localStorage.setItem(`setlistsync_offline_band_${bandData.id}`, dataString);
    // Also save to the generic key for the login/auth screen to use
    localStorage.setItem("setlistsync_offline_data", dataString);

    // Update the list of cached bands
    const newCachedIds = new Set(cachedBandIds).add(bandData.id);
    localStorage.setItem(
      "setlistsync_cached_bands",
      JSON.stringify(Array.from(newCachedIds))
    );

    setCachedBandIds(newCachedIds);
    setOfflineBandName(bandData.name); // Ensure the offline name is updated for the auth screen
    showToast(`Offline data created for ${bandData.name}.`, "success");
  };

  const handleRemoveOfflineData = () => {
    if (!bandData) return;

    // Remove band-specific data
    localStorage.removeItem(`setlistsync_offline_band_${bandData.id}`);

    // Update the list of cached bands
    const newCachedIds = new Set(cachedBandIds);
    newCachedIds.delete(bandData.id);
    localStorage.setItem(
      "setlistsync_cached_bands",
      JSON.stringify(Array.from(newCachedIds))
    );

    setCachedBandIds(newCachedIds);
    showToast(`Offline data for ${bandData.name} has been removed.`, "info");
  };

  const handleSignOut = () => {
    if (isOfflineMode) {
      exitOfflineMode();
    } else if (auth) {
      signOut(auth);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-900 text-white min-h-screen flex flex-col justify-center items-center">
        <Spinner />
        <p className="mt-4">Loading SetlistSync...</p>
      </div>
    );
  }
  if (!user) {
    return (
      <AuthScreen
        auth={auth}
        db={db}
        error={error}
        setError={setError}
        onEnterOfflineMode={enterOfflineMode}
        offlineBandName={offlineBandName}
      />
    );
  }
  if (!user.emailVerified && !isOfflineMode) {
    return (
      <div>Email not verified</div>
    ); /* Placeholder for EmailVerificationScreen */
  } // This should be replaced with the actual EmailVerificationScreen component

  const currentUserMemberData = members.find((m) => m.id === user.uid);
  // --- Simplified userRole check ---
  const userRole = currentUserMemberData?.role || "Viewer";

  // This provides the titles for your new mobile header
  const viewTitles = {
    live: "Live",
    songs: "Songs & Sets",
    notes: "Notes",
    members: "Settings",
  };
  const currentTitle = viewTitles[currentView];

  // We'll pass this function to the sidebar to let it close itself
  const closeSidebar = () => setIsSidebarCollapsed(true);
  //if (!activeBandId || !bandData) { return <BandSelectionScreen handleDeleteAccount={handleDeleteAccount} handleUpdateUserName={handleUpdateUserName} createBand={handleCreateBand} joinBand={handleJoinBand} user={user} userData={userData} db={db} storage={storage} error={error} switchActiveBand={switchActiveBand} handleSignOut={handleSignOut} />; }

  return (
    <>
      {/* Global components like Modals and Toasts */}
      {showOfflineFallbackToast && (
        <OfflinePromptBanner
          onAccept={() => {
            enterOfflineMode(true);
            setShowOfflineFallbackToast(false);
          }}
          onDecline={() => setShowOfflineFallbackToast(false)}
        />
      )}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        memberName={currentUserMemberData?.name}
        members={members}
        handleUpdateBandMemberName={handleUpdateBandMemberName}
        handleAttemptLeave={handleAttemptLeave}
        handleDeleteAccount={handleDeleteAccount}
      />
      {showManagerModal && (
        <AssignManagerOnLeaveModal
          members={members}
          band={bandData}
          user={user}
          db={db}
          onLeave={handleLeaveAsLeader}
          onCancel={() => setShowManagerModal(false)}
        />
      )}
      {showOwnerModal && (
        <AssignOwnerOnLeaveModal
          members={members}
          user={user}
          onLeave={handleLeaveAsOwner}
          onCancel={() => setShowOwnerModal(false)}
        />
      )}
      {isBeingNudged && <NudgeOverlay />}
      {nudgerName && <NudgeAlert nudgerName={nudgerName} />}

      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/60 z-20"
          onClick={closeSidebar}
        ></div>
      )}

      {/* --- THIS IS THE FIX --- */}
      {/* This relative container ensures the fixed-position viewer has a proper context */}
      <div className="relative h-screen">
        {/* AppSidebar is now rendered conditionally as an overlay */}
        <AppSidebar
          isCollapsed={isSidebarCollapsed}
          closeSidebar={closeSidebar}
          currentView={currentView}
          setCurrentView={setCurrentView}
          handleSignOut={handleSignOut}
          switchActiveBand={switchActiveBand}
          onProfileClick={() => setIsProfileModalOpen(true)}
        />
        {isOfflineMode && (
          <OfflineIndicator
            onToggle={toggleOfflineMode}
            isOnlineAvailable={isOnlineAvailable}
          />
        )}

        {/* Root layout - uses min-h-screen to fix content cutoff */}
        <div className="bg-gray-900 text-white min-h-screen">
          {!activeBandId ||
          !bandData ||
          (activeBandId && members.length === 0) ? (
            <BandSelectionScreen
              createBand={handleCreateBand}
              joinBand={handleJoinBand}
              user={user}
              userData={userData}
              db={db}
              storage={storage}
              error={error}
              switchActiveBand={switchActiveBand}
              handleSignOut={handleSignOut}
              handleDeleteAccount={handleDeleteAccount}
              handleUpdateUserName={handleUpdateUserName}
              onEnterOfflineMode={enterOfflineMode}
              offlineBandName={offlineBandName}
              cachedBandIds={cachedBandIds}
              isOfflineMode={isOfflineMode}
            />
          ) : (
            // We re-introduce the wrapper function to define isLeader,
            // canEdit, and isLiveConductor where bandData is guaranteed to exist.
            (() => {
              const isOffline = isOfflineMode;
              const isLeader = userRole === "Leader";
              const canEdit = userRole === "Leader" || userRole === "Member";
              const isLiveConductor =
                isOffline || user.uid === bandData.liveState?.liveConductorUid;

              return (
                <main className="p-4 md:p-6 flex flex-col h-full min-w-0 overflow-x-hidden">
                  {currentView === "fullScreenSong" &&
                    songToView.song &&
                    (() => {
                      // --- THIS IS THE FIX: Use the song from songToView directly ---
                      // The previous logic ignored the optimistic update and recalculated the song
                      // from the old bandData state, causing the jump to fail.
                      const songToDisplay = songToView.song;
                      const activeSetlist = bandData.setlists?.find(
                        (s) => s.id === bandData.liveState.activeSetlistId
                      );
                      const currentSongIndex =
                        bandData.liveState.currentSongIndex;
                      const currentUserMemberData = members.find(
                        (m) => m.id === user.uid
                      );

                      let previousSong = null;
                      let nextSong = null;

                      if (activeSetlist && currentSongIndex >= 0) {
                        if (currentSongIndex > 0) {
                          const prevSongId =
                            activeSetlist.songOrder[currentSongIndex - 1];
                          previousSong =
                            prevSongId === "BREAK_ITEM"
                              ? { id: "BREAK_ITEM", title: "Break" }
                              : bandData.songs.find((s) => s.id === prevSongId);
                        }
                        if (
                          currentSongIndex <
                          activeSetlist.songOrder.length - 1
                        ) {
                          const nextSongId =
                            activeSetlist.songOrder[currentSongIndex + 1];
                          nextSong =
                            nextSongId === "BREAK_ITEM"
                              ? { id: "BREAK_ITEM", title: "--- BREAK ---" }
                              : bandData.songs.find((s) => s.id === nextSongId);
                        }
                      }

                      return (
                        <FullScreenSongViewer
                          key={songToDisplay.id}
                          song={songToDisplay}
                          pdf={songToView.pdf}
                          storage={storage}
                          onClose={() => {
                            setSongToView({ song: null, pdf: null });
                            setCurrentView("live");
                          }}
                          bandData={bandData}
                          db={db}
                          user={user}
                          showToast={showToast}
                          isLiveConductor={isLiveConductor}
                          currentSongIndex={currentSongIndex}
                          setlist={activeSetlist}
                          currentUserMemberData={currentUserMemberData}
                          previousSong={previousSong}
                          nextSong={nextSong}
                          members={members}
                          onSaveSetlist={(order, newSongs, jumpToIndex, jumpToPdf = null) =>
                            handleSaveSetlistChanges(
                              order,
                              newSongs,
                              bandData,
                              db,
                              jumpToIndex
                            )
                          }
                          onSongSelected={(song, pdf, index) => {
                            handleJumpToSong(index, bandData, db, members);
                            setSongToView({ song, pdf });
                          }}
                          onJumpToSong={(index) =>
                            handleJumpToSong(index, bandData, db, members)
                          }
                          handleSetReady={(isReady) =>
                            handleSetReady(isReady, user, bandData, db)
                          }
                          onSongNav={(direction) =>
                            handleSongNav(direction, bandData, db, members)
                          }
                          tempoAlert={activeTempoAlert}
                          handleTempoAlert={(type) =>
                            handleTempoAlert(type, bandData, db)
                          }
                          isTempoChanging={isTempoChanging}
                          isOffline={isOffline}
                        />
                      );
                    })()}
                  {currentView === "live" && (
                    <LiveView
                      bandData={bandData}
                      user={user}
                      db={db}
                      storage={storage}
                      isLiveConductor={isLiveConductor}
                      canEdit={canEdit}
                      members={members}
                      userRole={userRole}
                      keepScreenOn={keepScreenOn}
                      setKeepScreenOn={setKeepScreenOn}
                      showToast={showToast}
                      setIsSidebarCollapsed={setIsSidebarCollapsed}
                      setCurrentView={setCurrentView}
                      songToView={songToView}
                      setSongToView={setSongToView}
                      handleSetReady={(isReady) =>
                        handleSetReady(isReady, user, bandData, db)
                      }
                      handleSongNav={handleSongNav}
                      handleSaveSetlistChanges={handleSaveSetlistChanges}
                      handleJumpToSong={handleJumpToSong}
                      activeTempoAlert={activeTempoAlert}
                      handleTempoAlert={(type) =>
                        handleTempoAlert(type, bandData, db)
                      }
                      isTempoChanging={isTempoChanging}
                      isOffline={isOffline}
                      currentUserMemberData={currentUserMemberData}
                    />
                  )}
                  {currentView === "practice" && (
                    <PracticeView
                      bandData={bandData}
                      db={db}
                      storage={storage}
                      showToast={showToast}
                      setIsSidebarCollapsed={setIsSidebarCollapsed}
                      isOffline={isOffline}
                      user={user}
                    />
                  )}
                  {currentView === "songs" && (
                    <SongManagementView
                      bandData={bandData}
                      user={user}
                      db={db}
                      storage={storage}
                      canEdit={canEdit}
                      showToast={showToast}
                      showConfirmation={showConfirmation}
                      handleCachePdf={handleCachePdf}
                      handleRemoveCachedPdf={handleRemoveCachedPdf}
                      setIsSidebarCollapsed={setIsSidebarCollapsed}
                      refreshAuthToken={refreshAuthToken}
                      isOffline={isOffline}
                      userRole={userRole}
                      setBandData={setBandDataAndCacheOffline}
                    />
                  )}
                  {currentView === "notes" && (
                    <NotesView
                      bandData={bandData}
                      db={db}
                      canEdit={canEdit}
                      showToast={showToast}
                      isOffline={isOffline}
                      showConfirmation={showConfirmation}
                      setIsSidebarCollapsed={setIsSidebarCollapsed}
                    />
                  )}
                  {currentView === "members" && (
                    <MembersView
                      bandData={bandData}
                      user={user}
                      db={db}
                      auth={auth}
                      isLeader={isLeader}
                      members={members}
                      canEdit={canEdit}
                      userRole={userRole}
                      switchActiveBand={switchActiveBand}
                      storage={storage}
                      showToast={showToast}
                      showConfirmation={showConfirmation}
                      setIsSidebarCollapsed={setIsSidebarCollapsed}
                      handleDeleteAccount={handleDeleteAccount}
                      isOffline={isOffline}
                      handleCreateOfflineData={handleCreateOfflineData}
                      cachedBandIds={cachedBandIds}
                      toggleOfflineMode={toggleOfflineMode}
                      handleRemoveOfflineData={handleRemoveOfflineData}
                      handleAttemptLeave={handleAttemptLeave}
                    />
                  )}
                </main>
              );
            })() // End of the wrapper function
          )}
        </div>
      </div>
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
