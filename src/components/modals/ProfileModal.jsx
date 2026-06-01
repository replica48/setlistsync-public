import { useState } from 'react';
import Modal from "./Modal";

// User profile modal from the app sidebar "User" icon
function ProfileModal({
    isOpen,
    onClose,
    memberName, // Use band-specific name
    members,
    handleUpdateBandMemberName, // Use band-specific handler
    handleAttemptLeave,
    handleDeleteAccount
    }) {
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(memberName || '');

    if (!isOpen) return null;

    const handleNameUpdate = (e) => {
        e.preventDefault();
        if (newName.trim()) {
            handleUpdateBandMemberName(newName.trim()); // Call the correct handler
            setIsEditingName(false);
        }
    };

    return (
        <Modal onClose={onClose} size="lg">
            <h2 className="text-3xl font-bold text-gray-200 mb-6">Your Profile</h2>

            {/* Section 1: Your Name (now band-specific) */}
            <section className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 border-b border-gray-700">
                    <div>
                        <h3 className="font-semibold text-gray-200">Your Name in this Band</h3>
                        {!isEditingName && <p className="text-sm text-gray-400 mt-1">{memberName}</p>}
                    </div>
                    {!isEditingName ? (
                        <button onClick={() => setIsEditingName(true)} className="mt-2 sm:mt-0 text-sm bg-sky-800 text-white hover:bg-sky-700 px-3 py-1 rounded-md">Edit</button>
                    ) : (
                        <form onSubmit={handleNameUpdate} className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto sm:max-w-xs">
                            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-grow bg-gray-700 text-white p-2 rounded-md outline-none" />
                            <button type="submit" className="bg-sky-600 hover:bg-sky-500 px-3 py-2 rounded-md text-sm">Save</button>
                            <button type="button" onClick={() => setIsEditingName(false)} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md text-sm">Cancel</button>
                        </form>
                    )}
                </div>
            </section>

            {/* Section 2: Danger Zone (no changes here) */}
            <section className="mt-6">
                 <h2 className="text-xl font-bold text-red-500 border-b border-red-900 pb-2 mb-4">Danger Zone</h2>
                 <div className="space-y-4">
                    {members && members.length > 1 && (
                        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                            <div>
                                <h3 className="font-semibold text-yellow-400">Leave Current Band</h3>
                                <p className="text-sm text-gray-400 mt-1">You will need a new invite to rejoin this band.</p>
                            </div>
                            <button onClick={() => { handleAttemptLeave(); onClose(); }} className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-md text-sm">Leave Band</button>
                        </div>
                    )}
                    <div className="flex items-center justify-between p-4 bg-red-900/20 border border-red-900/50 rounded-lg">
                        <div>
                            <h3 className="font-semibold text-red-400">Delete Account</h3>
                            <p className="text-sm text-red-500 mt-1">Permanently delete your user account.</p>
                        </div>
                        <button onClick={() => { handleDeleteAccount(); onClose(); }} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-md text-sm flex-shrink-0 ml-4">Delete Account</button>
                    </div>
                 </div>
            </section>
        </Modal>
    );
}

export default ProfileModal;