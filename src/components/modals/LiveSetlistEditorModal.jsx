import { useState, useEffect, useRef } from 'react';
import Modal from "./Modal";
import { MoveVerticalIcon } from "../../helpers/Icons";

function LiveSetlistEditorModal({ bandData, activeSetlist, onSave, onClose, currentSongIndex }) {
    const [songOrder, setSongOrder] = useState(activeSetlist.songOrder || []);
    const [newSongs, setNewSongs] = useState([]);
    const [addMode, setAddMode] = useState('library');
    const [selectedLibrarySongId, setSelectedLibrarySongId] = useState('');
    const [newSongTitle, setNewSongTitle] = useState('');
    const [newSongNotes, setNewSongNotes] = useState('');

    const dragItem = useRef(null);
    const [dropIndicator, setDropIndicator] = useState(null);
    const scrollContainerRef = useRef(null);
    const scrollIntervalRef = useRef(null);

    const allSongs = [...bandData.songs, ...newSongs];
    const songsInSetlist = songOrder.map(id => allSongs.find(s => s.id === id)).filter(Boolean);
    const availableLibrarySongs = bandData.songs.filter(s => !songOrder.includes(s.id)).sort((a, b) => a.title.localeCompare(b.title));

    useEffect(() => {
        if (availableLibrarySongs.length > 0) {
            setSelectedLibrarySongId(availableLibrarySongs[0].id);
        } else {
            setSelectedLibrarySongId('');
        }
    }, [songOrder, bandData.songs]);

    const handleAddSong = () => {
        const newOrder = [...songOrder];
        const insertIndex = currentSongIndex + 1;
        if (addMode === 'library' && selectedLibrarySongId) {
            newOrder.splice(insertIndex, 0, selectedLibrarySongId);
            setSongOrder(newOrder);
        } else if (addMode === 'new' && newSongTitle) {
            const newSong = { id: `new_${Date.now()}`, title: newSongTitle, notes: newSongNotes, tempo: '', lyricsChords: '' };
            setNewSongs([...newSongs, newSong]);
            newOrder.splice(insertIndex, 0, newSong.id);
            setSongOrder(newOrder);
            setNewSongTitle('');
            setNewSongNotes('');
        }
    };

    const handleRemoveSong = (songIdToRemove) => {
        setSongOrder(songOrder.filter(id => id !== songIdToRemove));
        setNewSongs(newSongs.filter(s => s.id !== songIdToRemove));
    };

    const handleMoveSong = (index, direction) => {
        const newOrder = [...songOrder];
        const [movedItem] = newOrder.splice(index, 1);
        newOrder.splice(index + direction, 0, movedItem);
        setSongOrder(newOrder);
    };

    const stopScrolling = () => {
        if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    };

    const handleDragOverContainer = (e) => {
        e.preventDefault();
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const rect = container.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const scrollZone = 60;
        const scrollSpeed = 10;

        if (y < scrollZone) {
            if (!scrollIntervalRef.current) {
                scrollIntervalRef.current = setInterval(() => { container.scrollTop -= scrollSpeed; }, 50);
            }
        } else if (rect.height - y < scrollZone) {
            if (!scrollIntervalRef.current) {
                scrollIntervalRef.current = setInterval(() => { container.scrollTop += scrollSpeed; }, 50);
            }
        } else {
            stopScrolling();
        }
    };

    const handleDragEnd = () => {
        stopScrolling();
        setDropIndicator(null);
        dragItem.current = null;
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        const draggedIndex = dragItem.current;
        if (draggedIndex === null || draggedIndex === dropIndex) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        let targetIndex = dropIndex;

        if (e.clientY > midpoint) {
            targetIndex = dropIndex + 1;
        }

        const newSongOrder = [...songOrder];
        const [reorderedItem] = newSongOrder.splice(draggedIndex, 1);

        if (draggedIndex < targetIndex) {
            newSongOrder.splice(targetIndex - 1, 0, reorderedItem);
        } else {
            newSongOrder.splice(targetIndex, 0, reorderedItem);
        }

        setSongOrder(newSongOrder);
    };


    const handleSave = () => {
        onSave(songOrder, newSongs);
    };

    return (
        <Modal onClose={onClose} size="xl">
            <div className="flex flex-col h-[85vh]">
                <h2 className="text-3xl font-bold mb-4">Edit Live Set: {activeSetlist.name}</h2>
                <div className="grid grid-cols-2 gap-6 flex-1 overflow-y-hidden">
                    <div className="flex flex-col min-h-0">
                        <h3 className="text-lg font-semibold mb-2">Setlist Order</h3>
                        <div
                            ref={scrollContainerRef}
                            onDragOver={handleDragOverContainer}
                            onDragLeave={stopScrolling}
                            className="bg-gray-900 p-2 rounded-lg flex-1 overflow-y-auto"
                        >
                            {songsInSetlist.map((song, index) => (
                                <div key={song.id}
                                    className="relative"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const midpoint = rect.top + rect.height / 2;
                                        setDropIndicator({ index, position: e.clientY < midpoint ? 'top' : 'bottom' });
                                    }}
                                    onDragLeave={() => setDropIndicator(null)}
                                    onDrop={(e) => handleDrop(e, index)}
                                >
                                     {dropIndicator?.index === index && dropIndicator.position === 'top' && (
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400 rounded-full z-10" />
                                    )}
                                    <div
                                        className={`flex items-center justify-between p-2 rounded group transition-all my-2
                                            ${index === currentSongIndex ? 'bg-sky-800' : 'bg-gray-700'}
                                        `}
                                        draggable
                                        onDragStart={() => dragItem.current = index}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <div className="flex items-center gap-3 flex-1 truncate">
                                            <span className="text-gray-500 cursor-grab active:cursor-grabbing group-hover:text-gray-300 transition-colors"><MoveVerticalIcon /></span>
                                            <span className="truncate">{index + 1}. {song.title}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <button type="button" onClick={() => handleMoveSong(index, -1)} disabled={index === 0} className="px-2 disabled:opacity-25">&#9650;</button>
                                            <button type="button" onClick={() => handleMoveSong(index, 1)} disabled={index === songsInSetlist.length - 1} className="px-2 disabled:opacity-25">&#9660;</button>
                                            <button type="button" onClick={() => handleRemoveSong(song.id)} className="text-red-500 font-bold ml-2 px-2">&times;</button>
                                        </div>
                                    </div>
                                    {dropIndicator?.index === index && dropIndicator.position === 'bottom' && (
                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400 rounded-full z-10" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col min-h-0">
                        <h3 className="text-lg font-semibold mb-2">Add a Song (Inserts as Next Song)</h3>
                        <div className="bg-gray-900 p-4 rounded-lg">
                            <div className="bg-gray-700 rounded-lg p-1 flex mb-4">
                                <button onClick={() => setAddMode('library')} className={`flex-1 p-2 rounded-md text-sm ${addMode === 'library' ? 'bg-sky-600' : ''}`}>From Library</button>
                                <button onClick={() => setAddMode('new')} className={`flex-1 p-2 rounded-md text-sm ${addMode === 'new' ? 'bg-sky-600' : ''}`}>As New Song</button>
                            </div>
                            {addMode === 'library' ? (
                                <div className="flex gap-2">
                                    <select value={selectedLibrarySongId} onChange={e => setSelectedLibrarySongId(e.target.value)} className="w-full bg-gray-700 p-3 rounded text-sm">
                                        {availableLibrarySongs.length > 0 ? availableLibrarySongs.map(s => <option key={s.id} value={s.id}>{s.title}</option>) : <option>No songs to add</option>}
                                    </select>
                                    <button onClick={handleAddSong} disabled={!selectedLibrarySongId} className="bg-green-600 text-white rounded px-4 disabled:bg-gray-500">Add</button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input type="text" placeholder="New Song Title" value={newSongTitle} onChange={e => setNewSongTitle(e.target.value)} className="w-full bg-gray-700 p-3 rounded text-sm"/>
                                    <input type="text" placeholder="Quick Notes (optional)" value={newSongNotes} onChange={e => setNewSongNotes(e.target.value)} className="w-full bg-gray-700 p-3 rounded text-sm"/>
                                    <button onClick={handleAddSong} disabled={!newSongTitle} className="w-full bg-green-600 text-white rounded px-4 py-3 disabled:bg-gray-500">Add</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
                    <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-500 font-bold py-2 px-6 rounded-md">Cancel</button>
                    <button type="button" onClick={handleSave} className="bg-sky-600 hover:bg-sky-500 font-bold py-2 px-6 rounded-md">Save Changes</button>
                </div>
            </div>
        </Modal>
    );
}

export default LiveSetlistEditorModal;