import { useState, useEffect, useRef } from "react";
import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Modal from "./modals/Modal";
import UploadBackupModal from "./modals/UploadBackupModal";
import { UserIcon } from "../helpers/Icons";

function BandSelectionScreen({
  handleCreateBandAttempt,
  joinBand,
  user,
  userData,
  db,
  error,
  infoMessage,
  isOfflineMode,
  setError,
  setInfoMessage,
  switchActiveBand,
  handleSignOut,
  handleDeleteAccount,
  handleUpdateUserName,
  onEnterOfflineMode,
  cachedBandIds = new Set(),
}) {
  const [mode, setMode] = useState("select");
  const [bandIdInput, setBandIdInput] = useState("");
  const [newBandName, setNewBandName] = useState("");
  const [bands, setBands] = useState([]);
  const name = userData?.name || "";
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [inviteDetails, setInviteDetails] = useState(null);
  const [isInviteLoading, setIsInviteLoading] = useState(true);
  const [showJoinInfoModal, setShowJoinInfoModal] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [newName, setNewName] = useState(name);
  const [cachedBands, setCachedBands] = useState([]);
  const userMenuRef = useRef(null);
  const functions = getFunctions();

  // --- EXISTING useEffect hooks ---
  useEffect(() => {
    const fetchBandDetails = async () => {
      if (userData?.bandIds?.length > 0) {
        if (isOfflineMode) {
          // Don't try to fetch online bands when offline
          setBands([]);
          return;
        }
        const bandPromises = userData.bandIds.map((id) =>
          getDoc(doc(db, "bands", id))
        );
        const results = (await Promise.all(bandPromises))
          .map((d) => (d.exists() ? { id: d.id, ...d.data() } : null))
          .filter(Boolean);
        setBands(results);
      } else {
        setBands([]);
      }
    };
    fetchBandDetails();
  }, [userData, db, isOfflineMode]);

  useEffect(() => {
    const processToken = async () => {
      const token = sessionStorage.getItem("setlistsync_join_token");
      if (token && db) {
        try {
          const inviteRef = doc(db, "bandInvites", token);
          const inviteDoc = await getDoc(inviteRef);
          if (inviteDoc.exists() && inviteDoc.data().status === "active") {
            setInviteDetails({ id: inviteDoc.id, ...inviteDoc.data() });
            setMode("join");
          } else {
            sessionStorage.removeItem("setlistsync_join_token");
          }
        } catch (err) {
          console.error("Error processing invite token:", err);
          sessionStorage.removeItem("setlistsync_join_token");
        }
      }
      setIsInviteLoading(false);
    };
    processToken();
  }, [db]);

  useEffect(() => {
    const bandDetails = [];
    for (const bandId of cachedBandIds) {
      const dataString = localStorage.getItem(
        `setlistsync_offline_band_${bandId}`
      );
      if (dataString) {
        try {
          const { bandData } = JSON.parse(dataString);
          if (bandData) {
            bandDetails.push({ id: bandData.id, name: bandData.name });
          }
        } catch (e) {
          console.error(
            `Error parsing offline band data for band ${bandId}:`,
            e
          );
        }
      }
    }
    setCachedBands(bandDetails);
  }, [cachedBandIds]);

  // --- NEW useEffect to close menu on outside click ---
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuRef]);

  // --- NEW: Handler for submitting name change ---
  const handleNameUpdate = (e) => {
    e.preventDefault();
    if (newName.trim()) {
      handleUpdateUserName(newName.trim());
      setIsNameModalOpen(false);
    }
  };


  const handleClaimBand = async (band) => {
    showConfirmation({
      title: `Claim "${band.name}"?`,
      message:
        "You will become the new owner of this band. This will use one of your Free band slots.",
      confirmText: "Claim Ownership",
      confirmColor: "bg-sky-600",
      onConfirm: async () => {
        try {
          const claimBandOwnership = httpsCallable(
            functions,
            "claimBandOwnership"
          );
          await claimBandOwnership({ bandId: band.id });
          window.location.reload();
        } catch (e) {
          console.error("Claim failed", e);
          setError(e.message || "Failed to claim band.");
        }
      },
    });
  };

  const handleUnlockBand = async (band) => {
    try {
      await updateDoc(doc(db, "bands", band.id), {
        locked: false,
      });
      // No reload needed if listener updates, but for safety:
      // window.location.reload();
      // Actually, let's just let the snapshot update it.
    } catch (e) {
      console.error("Unlock failed", e);
      setError("Failed to unlock band.");
    }
  };

  let message = null;
  let messageClass = "";

  if (isOfflineMode) {
    message = "Server unreachable. Check internet connection.";
    messageClass = "bg-yellow-600 text-yellow-50 p-3 rounded-md my-4";
  } else if (infoMessage) {
    message = infoMessage;
    messageClass = "bg-sky-900 text-sky-300 p-3 rounded-md my-4";
  } else if (error) {
    message = error;
    messageClass = "bg-red-900 text-red-300 p-3 rounded-md my-4";
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-lg shadow-lg relative">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">Welcome, {name}!</h1>
          {message && <p className={messageClass}>{message}</p>}
        </div>

        <>
            {mode === "select" && (
              <>
                <p className="text-gray-400 mb-4 text-center">
                  Select a band to continue, or join/create a new one.
                </p>
                <div className="border-b border-gray-600 mb-6"></div>
                <div className="space-y-4 mb-4">
                  {isOfflineMode && bands.length === 0 && (
                    <p className="text-gray-400 text-center italic">
                      Currently offline. Only showing available offline bands.
                    </p>
                  )}
                  {bands.map((band) => (
                    <div key={band.id}>
                      <button
                        onClick={() => {
                          if (band.locked) {
                            // Prevent entry if locked, unless we want to allow viewing?
                            // Usually locked means no access.
                            return;
                          }
                          switchActiveBand(band.id);
                        }}
                        className={`w-full text-center font-bold py-4 px-6 rounded-md transition duration-300 flex flex-col items-center justify-center gap-1 relative ${
                          band.locked
                            ? "bg-gray-700 cursor-default border border-gray-600"
                            : "bg-sky-800 hover:bg-sky-700 text-white"
                        }`}
                      >
                        <span className={band.locked ? "text-gray-400" : ""}>
                          {band.name}
                        </span>
                        {band.locked && (
                          <div className="mt-2 flex flex-col items-center gap-2 w-full">
                            <span className="text-xs text-red-400 font-bold uppercase tracking-wider border border-red-900 bg-red-900/20 px-2 py-1 rounded">
                              Locked
                            </span>
                            {band.ownerId === user.uid ? (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnlockBand(band);
                                }}
                                className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded cursor-pointer"
                              >
                                Unlock
                              </div>
                            ) : (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleClaimBand(band);
                                }}
                                className="text-xs bg-sky-700 hover:bg-sky-600 text-white px-3 py-1 rounded cursor-pointer"
                              >
                                Claim Ownership
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                {cachedBands.length > 0 && (
                  <>
                    <div className="relative flex py-5 items-center">
                      <div className="flex-grow border-t border-gray-600"></div>
                      <span className="flex-shrink mx-4 text-gray-400">or</span>
                      <div className="flex-grow border-t border-gray-600"></div>
                    </div>
                    <div className="text-center space-y-3">
                      <p className="text-gray-400">Load Offline Version:</p>
                      {cachedBands.map((band) => (
                        <button
                          key={band.id}
                          onClick={() => onEnterOfflineMode(band.id)}
                          className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-md transition-colors duration-200"
                        >
                          {band.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {/* --- This div was moved up to ensure consistent spacing --- */}
                <div className="relative flex py-5 items-center">
                  <div className="flex-grow border-t border-gray-600"></div>
                  <span className="flex-shrink mx-4 text-gray-400">or</span>
                  <div className="flex-grow border-t border-gray-600"></div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => setShowJoinInfoModal(true)}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-md transition duration-300"
                  >
                    Join a Band
                  </button>
                  <button
                    onClick={() => setMode("create")}
                    className="flex-1 bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-md transition duration-300"
                  >
                    Create a New Band
                  </button>
                  <button
                    onClick={() => setShowBackupModal(true)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-md transition duration-300"
                  >
                    Create from Backup
                  </button>
                </div>
              </>
            )}

            {mode === "join" && (
              <div className="text-center">
                <h2 className="text-3xl font-bold text-green-400 my-6">
                  {inviteDetails
                    ? `Join ${inviteDetails.bandName}`
                    : "Join a Band"}
                </h2>
                <div className="space-y-4 text-left">
                  <input
                    id="band-id"
                    type="text"
                    value={inviteDetails ? inviteDetails.bandId : bandIdInput}
                    onChange={(e) =>
                      !inviteDetails && setBandIdInput(e.target.value)
                    }
                    placeholder="Paste Band ID or use invite link"
                    className={`w-full bg-gray-700 p-3 rounded-md ${inviteDetails ? "cursor-not-allowed opacity-50" : ""}`}
                    readOnly={!!inviteDetails}
                  />
                </div>
                {inviteDetails?.type === "email" && (
                  <p className="text-sm text-gray-400 mt-2">
                    This is a private invite for {inviteDetails.restrictedEmail}
                    .
                  </p>
                )}
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() =>
                      joinBand(
                        inviteDetails ? inviteDetails.bandId : bandIdInput,
                        name,
                        inviteDetails ? inviteDetails.id : null
                      )
                    }
                    disabled={
                      !(inviteDetails
                        ? inviteDetails.bandId
                        : bandIdInput.trim()) || isInviteLoading
                    }
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-md transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    {isInviteLoading
                      ? "Verifying Invite..."
                      : "Join Band via Invite"}
                  </button>
                  <button
                    onClick={() => {
                      setMode("select");
                      setInviteDetails(null);
                      sessionStorage.removeItem("setlistsync_join_token");
                      setError("");
                      setInfoMessage("");
                    }}
                    className="w-full text-gray-400 hover:text-white py-2"
                  >
                    &larr; Back
                  </button>
                </div>
              </div>
            )}

            {mode === "create" && (
              <div className="text-center">
                <h2 className="text-3xl font-bold text-sky-400 my-6">
                  Create a New Band
                </h2>
                <div className="space-y-4 text-left">
                  <input
                    id="band-name"
                    type="text"
                    value={newBandName}
                    onChange={(e) => setNewBandName(e.target.value)}
                    placeholder="E.g., The Silver Beetles"
                    className="w-full bg-gray-700 p-3 rounded-md"
                  />
                </div>
                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => {
                      if (!name) {
                        setIsNameModalOpen(true);
                      } else {
                        handleCreateBandAttempt(newBandName);
                      }
                    }}
                    disabled={!newBandName.trim()}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-md transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    Create Band
                  </button>
                  <button
                    onClick={() => {
                      setMode("select");
                      setError("");
                      setInfoMessage("");
                    }}
                    className="w-full text-gray-400 hover:text-white py-2"
                  >
                    &larr; Back
                  </button>
                </div>
              </div>
            )}
          </>

        {showBackupModal && (
          <UploadBackupModal
            user={user}
            createBand={handleCreateBandAttempt}
            yourName={name}
            onCancel={() => setShowBackupModal(false)}
          />
        )}

        {/* --- UPDATED: User Menu Dropdown --- */}
        <div ref={userMenuRef} className="absolute top-4 right-4">
          <button
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="text-gray-300 hover:text-white hover:bg-gray-700 p-2 rounded-full transition-colors"
          >
            <UserIcon />
          </button>

          {isUserMenuOpen && (
            <div className="absolute top-12 right-0 w-48 bg-gray-700 rounded-md shadow-lg py-1 z-10">
              <button
                onClick={() => {
                  setIsNameModalOpen(true);
                  setIsUserMenuOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-sky-600"
              >
                Change Name
              </button>
              <button
                onClick={handleSignOut}
                className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-sky-600"
              >
                Sign Out
              </button>
              <div className="border-t border-gray-600 my-1"></div>
              <button
                onClick={() => {
                  handleDeleteAccount();
                  setIsUserMenuOpen(false);
                }}
                className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-600 hover:text-white"
              >
                Delete Account
              </button>
            </div>
          )}
        </div>

        {/* --- NEW: Name Change Modal --- */}
        {isNameModalOpen && (
          <Modal onClose={() => setIsNameModalOpen(false)} size="lg">
            <form onSubmit={handleNameUpdate}>
              <h2 className="text-2xl text-gray-300 font-bold mb-4">
                Update Your Name
              </h2>
              <p className="text-gray-400 mb-6">
                This name is used as the default when you join or create a new
                band.
              </p>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-gray-900 p-3 rounded-md mb-6"
                required
              />
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setIsNameModalOpen(false)}
                  className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-6 rounded-md"
                >
                  Save
                </button>
              </div>
            </form>
          </Modal>
        )}

        {showJoinInfoModal && (
          <Modal onClose={() => setShowJoinInfoModal(false)} size="lg">
            <h2 className="text-2xl text-sky-400 font-bold mb-4">
              How to Join a Band
            </h2>
            <p className="text-gray-300 mb-6">
              To join an existing band, contact a band leader and ask for an
              invite link from their band settings menu.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowJoinInfoModal(false)}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-6 rounded-md"
              >
                Got it
              </button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

export default BandSelectionScreen;
