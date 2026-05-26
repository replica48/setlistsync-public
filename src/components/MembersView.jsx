import { useState, useEffect } from "react";
import {
  doc,
  updateDoc,
  deleteDoc,
  arrayRemove,
  increment,
  writeBatch,
} from "firebase/firestore";
import { IconButton } from "@mui/material";
import { MenuIcon, DownloadIcon, CheckIcon } from "../helpers/Icons";
import Modal from "./modals/Modal";
import InviteModal from "./modals/InviteModal";
import AssignManagerOnLeaveModal from "./modals/AssignManagerOnLeaveModal";
import { deleteBand } from "../helpers/db";

function MembersView({
  bandData,
  user,
  db,
  auth,
  isLeader,
  members,
  canEdit,
  userRole,
  isOffline,
  handleCreateOfflineData,
  cachedBandIds = new Set(),
  toggleOfflineMode,
  handleRemoveOfflineData,
  switchActiveBand,
  storage,
  showToast,
  showConfirmation,
  handleDeleteAccount,
  setIsSidebarCollapsed,
  handleAttemptLeave,
  handleDowngradeAttempt,
  signalBandDeletion,
}) {
  // --- State Variables (Keep all existing state) ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [newBandName, setNewBandName] = useState(bandData.name);
  const [isEditingMyName, setIsEditingMyName] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const myName = members.find((m) => m.id === user.uid)?.name || "";
  const [newMyName, setNewMyName] = useState(myName);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const formatBytes = (bytes, decimals = 2) => {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Event Handlers
  const handleUpdateRole = async (memberId, newRole) => {
    if (isOffline) {
      showToast("Cannot change roles in offline mode.", "warning");
      return;
    }
    if (!isLeader || bandData.ownerId === memberId) return; // Cannot change owner's role
    if (newRole === "Remove") {
      const memberName = members.find((m) => m.id === memberId)?.name;
      showConfirmation({
        title: `Remove ${memberName}?`,
        message: `Are you sure you want to remove ${memberName} from the band? This cannot be undone.`,
        confirmText: "Remove",
        confirmColor: "bg-red-600",
        onConfirm: async () => {
          const userToRemoveRef = doc(db, "users", memberId);
          await updateDoc(userToRemoveRef, {
            bandIds: arrayRemove(bandData.id),
          });
          await deleteDoc(doc(db, "bands", bandData.id, "members", memberId));
          await updateDoc(doc(db, "bands", bandData.id), {
            memberCount: increment(-1),
          });
          showToast(`${memberName} has been removed.`, "info");
        },
      });
    } else {
      const memberRef = doc(db, "bands", bandData.id, "members", memberId);
      await updateDoc(memberRef, { role: newRole });
      showToast("Member role updated.", "info");
    }
  };
  const handleToggleCheckIn = async (memberId, checkedIn) => {
    if (isOffline) {
      showToast("Cannot change check-in status in offline mode.", "warning");
      return;
    }
    const memberRole = members.find((m) => m.id === memberId)?.role;
    if (memberRole === "Viewer" && !isLeader) return;
    await updateDoc(doc(db, "bands", bandData.id, "members", memberId), {
      checkedIn: checkedIn,
    });
  };
  const handleUpdateBandName = async (e) => {
    e.preventDefault();
    if (!newBandName.trim()) return;
    if (isOffline) {
      showToast("Cannot change band name in offline mode.", "warning");
      return;
    }
    if (!isLeader) {
      showToast("Only a band leader can change the band name.", "error");
      return;
    }
    await updateDoc(doc(db, "bands", bandData.id), {
      name: newBandName.trim(),
    });
    setIsEditingName(false);
  };
  const handleUpdateMyName = async (e) => {
    e.preventDefault();
    if (!newMyName.trim()) return;
    if (isOffline) {
      showToast("Cannot change your name in offline mode.", "warning");
      return;
    }
    const batch = writeBatch(db);
    batch.update(doc(db, "bands", bandData.id, "members", user.uid), {
      name: newMyName.trim(),
    });
    batch.update(doc(db, "users", user.uid), { name: newMyName.trim() });
    await batch.commit();
    setIsEditingMyName(false);
  };
  const handleDownloadBackup = () => {
    const backupData = {
      songs: bandData.songs || [],
      setlists: bandData.setlists || [],
    };
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${bandData.name}_backup.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleDeleteBand = async () => {
    if (isOffline) {
      showToast("Cannot delete band in offline mode.", "warning");
      return;
    }
    if (!isLeader) return;
    showConfirmation({
      title: "DELETE BAND?",
      message: `ARE YOU SURE? This will permanently delete '${bandData.name}' and all of its songs and data for everyone. This action cannot be undone.`,
      confirmText: "DELETE PERMANENTLY",
      confirmColor: "bg-red-800",
      onConfirm: async () => {
        const bandId = bandData.id;
        try {
          setIsLoading(true);
          signalBandDeletion();
          await deleteBand(db, storage, bandId, bandData.songs);
          switchActiveBand(null); // Navigate away AFTER successful deletion
        } catch (err) {
          console.error("Error deleting band: ", err);
          showToast(
            "An error occurred while deleting the band. Please try again.",
            "error"
          );
        } finally {
          setIsLoading(false); // Ensure loading state is reset
        }
      },
    });
  };

  const activeMembers = members.sort((a, b) => a.name.localeCompare(b.name));
  const storageUsed = bandData.storageUsed || 0;
  const storageQuota = bandData.storageQuota || 524288000; // 500 MB default
  const usagePercent = Math.min(100, (storageUsed / storageQuota) * 100);

  // --- NEW: JSX Structure ---
  return (
    <div className="overflow-y-auto space-y-8 pb-6 pr-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <IconButton
            onClick={() => setIsSidebarCollapsed(false)}
            aria-label="Open navigation"
            sx={{ color: "white" }}
          >
            <MenuIcon />
          </IconButton>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
      </div>

      {/* Section 1: Members & Roles */}
      <section>
        <h2 className="text-2xl font-bold text-sky-400 border-b border-gray-700 pb-2 mb-4">
          Members & Roles
        </h2>
        {isLeader && (
          <div className="mb-6">
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-5 rounded-md w-full sm:w-auto"
            >
              + Invite New Members
            </button>
          </div>
        )}
        <div className="space-y-3 bg-gray-800 p-4 rounded-lg">
          {activeMembers.map((member) => (
            <div
              key={member.id}
              className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border-b border-gray-700 last:border-b-0"
            >
              <div className="mb-2 sm:mb-0">
                <p
                  className={`font-semibold text-lg transition-colors ${member.checkedIn ? "text-white" : "text-gray-400"}`}
                >
                  {member.name} {member.id === user.uid && "(You)"}
                </p>
                {isLeader && member.id !== user.uid ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      handleUpdateRole(member.id, e.target.value)
                    }
                    disabled={member.id === bandData.ownerId}
                    className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 p-1.5 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                  >
                    <option value="Leader">Leader</option>
                    <option value="Member">Member</option>
                    <option value="Viewer">Viewer</option>
                    <option value="Remove">Remove Member</option>
                  </select>
                ) : (
                  <span
                    className={`text-xs px-2 py-1 rounded-full mt-1 inline-block ${member.role === "Leader" ? "bg-sky-500" : member.role === "Member" ? "bg-indigo-500" : "bg-gray-500"} text-white`}
                  >
                    {member.role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                {((canEdit && member.id === user.uid) || isLeader) &&
                member.role !== "Viewer" ? (
                  <label className="relative inline-flex items-center cursor-pointer ml-auto">
                    <input
                      type="checkbox"
                      checked={member.checkedIn || false}
                      onChange={(e) =>
                        handleToggleCheckIn(member.id, e.target.checked)
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-green-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    <span className="ml-3 text-sm font-medium text-gray-300">
                      Checked In
                    </span>
                  </label>
                ) : (
                  member.role === "Viewer" && (
                    <span className="text-sm text-gray-500 ml-auto">
                      {" "}
                      (Viewer)
                    </span>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Band Details */}
      <section>
        <h2 className="text-2xl font-bold text-sky-400 border-b border-gray-700 pb-2 mb-4">
          Band Details
        </h2>
        <div className="space-y-4">
          {/* Subsection: Band Name */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 border-b border-gray-700">
            <div>
              <h3 className="font-semibold text-gray-200">Band Name</h3>
              {!isEditingName && (
                <p className="text-sm text-gray-400 mt-1">{bandData.name}</p>
              )}
            </div>
            {isLeader &&
              (!isEditingName ? (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="mt-2 sm:mt-0 text-sm bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded-md"
                >
                  Edit
                </button>
              ) : (
                <form
                  onSubmit={handleUpdateBandName}
                  className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto sm:max-w-xs"
                >
                  <input
                    type="text"
                    value={newBandName}
                    onChange={(e) => setNewBandName(e.target.value)}
                    className="flex-grow bg-gray-700 p-2 rounded-md outline-none"
                  />
                  <button
                    type="submit"
                    className="bg-sky-600 hover:bg-sky-500 px-3 py-2 rounded-md text-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingName(false)}
                    className="bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded-md text-sm"
                  >
                    Cancel
                  </button>
                </form>
              ))}
          </div>
          {/* Subsection: Backup */}
          {canEdit && (
            <div className="flex items-center justify-between py-4 border-b border-gray-700">
              <div>
                <h3 className="font-semibold text-gray-200">
                  Backup Band Data
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Download a JSON file of your songs and setlists.
                </p>
              </div>
              <button
                onClick={handleDownloadBackup}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-md text-sm"
              >
                Download Backup
              </button>
            </div>
          )}

          {/* Subsection: Offline Data */}
          <div className="py-4 border-b border-gray-700">
            <h3 className="font-semibold text-gray-200 mb-2">Offline</h3>
            <p className="text-sm text-gray-400 mb-4">
              {isOffline
                ? "You are in offline mode. Your changes are not being saved."
                : "Use the app without internet. Changes made while offline will not be saved."}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-end">
              <div className="flex items-center gap-4 flex-grow sm:flex-grow-0">
                {/* Caching Controls */}
                <div className="flex items-center gap-4">
                  {cachedBandIds.has(bandData.id) ? (
                    <>
                      <div
                        className="flex items-center justify-center w-6 h-6 bg-green-500 rounded-full flex-shrink-0"
                        title="Offline data is cached"
                      >
                        <CheckIcon size={14} className="text-white" />
                      </div>
                      <button
                        onClick={handleRemoveOfflineData}
                        disabled={isOffline}
                        className="bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-3 rounded-md text-sm disabled:bg-gray-500 disabled:cursor-not-allowed"
                      >
                        Remove Cache
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCreateOfflineData}
                      disabled={isOffline}
                      className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-1 px-3 rounded-md text-sm flex items-center justify-center gap-2 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                      <DownloadIcon size={14} /> Cache Offline
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-gray-700 hidden sm:block"></div>

                {/* Toggle Switch */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!isOffline}
                    onChange={toggleOfflineMode}
                    className="sr-only peer"
                    disabled={!cachedBandIds.has(bandData.id) && !isOffline}
                  />
                  <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-sky-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600 peer-disabled:bg-gray-700 peer-disabled:cursor-not-allowed"></div>
                  <span className="ml-3 text-sm font-medium text-gray-300">
                    {isOffline ? "Offline" : "Online"}
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between py-4 border-b border-gray-700">
            <div>
              <h3 className="font-semibold text-gray-200">Leave This Band</h3>
              <p className="text-sm text-gray-400 mt-1">
                Remove yourself from the member list.
              </p>
            </div>
            <button
              onClick={handleAttemptLeave}
              className="bg-yellow-600 hover:bg-yellow-500 text-black font-bold py-2 px-4 rounded-md text-sm"
            >
              Leave Band
            </button>
          </div>
        </div>
      </section>
      {isLeader && (
        <section>
          <h2 className="text-2xl font-bold text-red-500 border-b border-red-900 pb-2 mb-4">
            Danger Zone
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-900/50 rounded-lg">
              <div>
                <h3 className="font-semibold text-red-400">Delete This Band</h3>
                <p className="text-sm text-red-500 mt-1">
                  Permanently delete '{bandData.name}' for everyone.
                </p>
              </div>
              <button
                onClick={handleDeleteBand}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-md text-sm flex-shrink-0 ml-4"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </section>
      )}
      {/* --- Modals (Keep Existing) --- */}
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

      {showInviteModal && isLeader && (
        <InviteModal
          bandData={bandData}
          db={db}
          user={user}
          onClose={() => setShowInviteModal(false)}
        />
      )}

    </div>
  );
}

export default MembersView;
