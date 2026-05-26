import { useState, useEffect } from 'react';
import { orderBy, doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query } from 'firebase/firestore';
import LexicalEditor from './ui/LexicalEditor.jsx';
import LexicalViewer from './ui/LexicalViewer.jsx';
import { areLyricsEmpty } from '../helpers/lyricsUtils.js';
import { IconButton } from '@mui/material';
import { MenuIcon, PinIcon } from "../helpers/Icons";

function NotesView({ bandData, db, canEdit, showConfirmation, showToast, setIsSidebarCollapsed, isOffline }) {
    const [notes, setNotes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newNoteTitle, setNewNoteTitle] = useState('');
    const [newNoteContent, setNewNoteContent] = useState('');

    // State for handling inline editing
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedContent, setEditedContent] = useState('');
    const [validationErrors, setValidationErrors] = useState({});

    const notesCollectionRef = collection(db, "bands", bandData.id, "notes");

    // Listen for real-time updates, now sorted by pinned status first
    useEffect(() => {
        if (isOffline) {
            // In offline mode, we don't listen for real-time updates.
            // The notes are part of the bandData object.
            setNotes(bandData.notes || []);
            setIsLoading(false);
            return;
        }
        const q = query(notesCollectionRef, orderBy('pinned', 'desc'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setNotes(notesData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching notes:", error);
            setIsLoading(false);
            // If there's an error (like permission denied or offline),
            // fall back to the data we already have if any.
            if (bandData.notes) {
                setNotes(bandData.notes);
            }
        });
        return () => unsubscribe();
    }, [bandData.id, db, isOffline, bandData.notes]);

    const handleAddNote = async (e) => {
        e.preventDefault();
        if (isOffline) return;
        const errors = {};
        if (!newNoteTitle.trim()) {
            errors.title = 'Title is required.';
        }
        if (areLyricsEmpty(newNoteContent)) {
            errors.content = 'Content is required.';
        }

        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        try {
            await addDoc(notesCollectionRef, {
                title: newNoteTitle.trim(),
                content: newNoteContent,
                createdAt: serverTimestamp(),
                pinned: false // Default pinned to false
            });
            setNewNoteTitle('');
            setNewNoteContent('');
            setValidationErrors({});
            showToast("Note added!", "success");
        } catch (error) {
            showToast("Failed to add note.", "error");
        }
    };

    const handleDeleteNote = (note) => {
        if (isOffline) return;
        showConfirmation({
            title: `Delete Note: "${note.title}"?`,
            message: "This action cannot be undone.",
            onConfirm: async () => {
                const noteDocRef = doc(db, "bands", bandData.id, "notes", note.id);
                await deleteDoc(noteDocRef);
                showToast("Note deleted.", "info");
            }
        });
    };

    const handleTogglePin = async (note) => {
        if (isOffline) return;
        const noteDocRef = doc(db, "bands", bandData.id, "notes", note.id);
        await updateDoc(noteDocRef, { pinned: !note.pinned });
        showToast(note.pinned ? "Note unpinned." : "Note pinned to top.", "info");
    };
    
    const startEditing = (note) => {
        if (isOffline) return;
        setEditingNoteId(note.id);
        setEditedTitle(note.title);
        setEditedContent(note.content);
    };

    const cancelEditing = () => {
        setEditingNoteId(null);
    };

    const handleUpdateNote = async (noteId) => {
        if (isOffline) return;
        const errors = {};
        if (!editedTitle.trim()) {
            errors.title = 'Title is required.';
        }
        if (areLyricsEmpty(editedContent)) {
            errors.content = 'Content is required.';
        }

        setValidationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        const noteDocRef = doc(db, "bands", bandData.id, "notes", noteId);
        await updateDoc(noteDocRef, {
            title: editedTitle.trim(),
            content: editedContent
        });
        setValidationErrors({});
        cancelEditing();
        showToast("Note updated.", "success");
    };

    return (
        <div className="overflow-y-auto space-y-6 pb-6 pr-4">
            <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <IconButton
                            onClick={() => setIsSidebarCollapsed(false)}
                            aria-label="Open navigation"
                            sx={{ color: 'white' }}
                        >
                            <MenuIcon />
                        </IconButton>
                        <h1 className="text-3xl font-bold">Notes</h1>
                    </div>
                </div>
            {isOffline && <p className="bg-yellow-600 text-yellow-50 p-3 rounded-md mb-4">Editing is disabled while offline.</p>}
            
            {canEdit && !isOffline && (
                <form onSubmit={handleAddNote} className="bg-gray-800 p-4 rounded-lg space-y-3">
                    <h2 className="text-xl font-semibold text-sky-400">Add a New Note</h2>
                    <div>
                        <input type="text" placeholder="Note Title..." value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} className={`w-full bg-gray-700 p-2 rounded-md ${validationErrors.title ? 'border border-red-500' : 'border border-transparent'}`} />
                        {validationErrors.title && <p className="text-red-400 text-xs mt-1">{validationErrors.title}</p>}
                    </div>
                    <div>
                        <div className={`${validationErrors.content ? 'border border-red-500 rounded-md' : ''}`}>
                            <LexicalEditor
                                initialContent={newNoteContent}
                                onChange={setNewNoteContent}
                                placeholder="Enter note details here..."
                            />
                        </div>
                        {validationErrors.content && <p className="text-red-400 text-xs mt-1">{validationErrors.content}</p>}
                    </div>

                    <button type="submit" className="bg-green-600 hover:bg-green-500 font-bold py-2 px-5 rounded-md">Save Note</button>
                </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? <p>Loading notes...</p> : notes.length === 0 ? <p className="text-gray-500 col-span-full">No notes yet. Add one above!</p> : (
                    notes.map(note => (
                        <div key={note.id} className={`bg-gray-800 rounded-lg flex flex-col shadow-lg transition-all duration-300 ${note.pinned ? 'border-2 border-yellow-500' : 'border-2 border-transparent'}`}>
                            {editingNoteId === note.id ? (
                                // --- EDITING VIEW ---
                                <div className="p-4 space-y-3">
                                    <div>
                                        <input type="text" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} className={`w-full bg-gray-900 font-bold text-lg text-sky-300 p-2 rounded-md ${validationErrors.title ? 'border border-red-500' : 'border border-transparent'}`} />
                                        {validationErrors.title && <p className="text-red-400 text-xs mt-1">{validationErrors.title}</p>}
                                    </div>
                                    <div>
                                        <div className={`${validationErrors.content ? 'border border-red-500 rounded-md' : ''}`}>
                                            <LexicalEditor
                                                initialContent={editedContent}
                                                onChange={setEditedContent}
                                                placeholder="Enter note details here..."
                                            />
                                        </div>
                                        {validationErrors.content && <p className="text-red-400 text-xs mt-1">{validationErrors.content}</p>}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={cancelEditing} className="bg-gray-600 hover:bg-gray-500 text-sm font-bold py-1 px-3 rounded-md">Cancel</button>
                                        <button onClick={() => handleUpdateNote(note.id)} className="bg-sky-600 hover:bg-sky-500 text-sm font-bold py-1 px-3 rounded-md">Save</button>
                                    </div>
                                </div>
                            ) : (
                                // --- DISPLAY VIEW ---
                                <div className="p-4 flex flex-col justify-between flex-grow">
                                    <div>
                                        <h3 className="font-bold text-lg text-sky-300 break-words">{note.title}</h3>
                                        <div className="text-gray-300 whitespace-pre-wrap mt-2 break-words prose prose-invert max-w-none">
                                            <LexicalViewer contentJSON={note.content} />
                                        </div>
                                    </div>
                                    {canEdit && (
                                        <div className="flex items-center justify-end gap-3 mt-4">
                                            <button onClick={() => handleTogglePin(note)} title={note.pinned ? "Unpin" : "Pin"} disabled={isOffline} className={`p-1 rounded-full transition-colors ${note.pinned ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-400'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                                                <PinIcon />
                                            </button>
                                            <button onClick={() => startEditing(note)} disabled={isOffline} className="text-gray-400 hover:text-sky-400 text-sm disabled:opacity-50 disabled:cursor-not-allowed">Edit</button>
                                            <button onClick={() => handleDeleteNote(note)} disabled={isOffline} className="text-gray-400 hover:text-red-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed">Delete</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default NotesView;