import { useState, useRef } from 'react';
import { MoveVerticalIcon } from "../helpers/Icons";

function SetlistEditor({ setlist, allSongs, onSave, onCancel }) {
    const [name, setName] = useState(setlist.name || '');
    const [songOrder, setSongOrder] = useState((setlist.songOrder || []).map(id => String(id)));
    
    const dragItem = useRef(null);
    const [dropIndicator, setDropIndicator] = useState(null);
    const scrollContainerRef = useRef(null);
    const scrollIntervalRef = useRef(null);

    const handleAddSong = (songId) => {
        if (!songOrder.includes(String(songId))) { setSongOrder([...songOrder, String(songId)]); }
    };
    const handleAddBreak = () => { setSongOrder([...songOrder, 'BREAK_ITEM']); };
    // Changed to remove by index to support multiple breaks
    const handleRemoveItem = (index) => { const newOrder = [...songOrder]; newOrder.splice(index, 1); setSongOrder(newOrder); };
    
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
        const draggedData = dragItem.current;
        if (!draggedData) return;

        const newSongOrder = [...songOrder];

        if (draggedData.type === 'reorder') {
            const draggedIndex = draggedData.index;
            if (draggedIndex === null || draggedIndex === dropIndex) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            let targetIndex = dropIndex;
            
            if (e.clientY > midpoint) {
                targetIndex = dropIndex + 1;
            }

            const [reorderedItem] = newSongOrder.splice(draggedIndex, 1);
            
            if (draggedIndex < targetIndex) {
                newSongOrder.splice(targetIndex - 1, 0, reorderedItem);
            } else {
                newSongOrder.splice(targetIndex, 0, reorderedItem);
            }
        } else if (draggedData.type === 'add') {
            const songId = draggedData.songId;
            if (!newSongOrder.includes(String(songId))) {
                newSongOrder.splice(dropIndex, 0, String(songId));
            }
        }
        setSongOrder(newSongOrder);
    };

    const handleSubmit = (e) => { e.preventDefault(); onSave({ id: setlist.id, name, songOrder }); }; 
    
    const songsInSetlist = songOrder.map(id => {
        if (id === 'BREAK_ITEM') {
            return { id: 'BREAK_ITEM', title: '--- BREAK ---' };
        }
        return allSongs.find(s => String(s.id) === id);
    }).filter(Boolean);

    const availableSongs = allSongs.filter(s => !songOrder.includes(String(s.id))).sort((a, b) => a.title.localeCompare(b.title));

    return ( 
        <form onSubmit={handleSubmit} className="flex flex-col h-[80vh]">
            <h2 className="text-2xl font-bold mb-4">{setlist.id ? 'Edit Setlist' : 'Create New Setlist'}</h2> 
            <input type="text" placeholder="Setlist Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-700 p-3 rounded mb-4" required />
            <div className="grid md:grid-cols-2 gap-4 flex-1 overflow-y-hidden">
                <div className="flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold">Setlist Order</h3>
                        <button type="button" onClick={handleAddBreak} className="text-sm bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded-md">+ Add Break</button>
                    </div>
                    <div 
                        ref={scrollContainerRef}
                        onDragOver={handleDragOverContainer}
                        onDragLeave={stopScrolling}
                        className="bg-gray-900 p-2 rounded-lg flex-1 overflow-y-auto"
                    >
                        {songsInSetlist.map((song, index) => (
                             <div key={`${song.id}-${index}`}
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
                                    className={`flex items-center justify-between p-2 rounded group my-2 ${song.id === 'BREAK_ITEM' ? 'bg-indigo-900/50' : 'bg-gray-700'}`}
                                    draggable
                                    onDragStart={() => dragItem.current = { type: 'reorder', index }}
                                    onDragEnd={handleDragEnd}
                                >
                                    <div className="flex items-center gap-3 flex-1 truncate">
                                        <span className="text-gray-500 cursor-grab active:cursor-grabbing group-hover:text-gray-300 transition-colors">
                                            <MoveVerticalIcon />
                                        </span>
                                        <span className={`truncate ${song.id === 'BREAK_ITEM' ? 'font-bold text-indigo-300' : ''}`}>
                                            {index + 1}. {song.title}
                                        </span>
                                    </div>
                                    <button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 font-bold ml-2 px-2">&times;</button>
                                </div>
                                 {dropIndicator?.index === index && dropIndicator.position === 'bottom' && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400 rounded-full z-10" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex flex-col min-h-0">
                    <h3 className="text-lg font-semibold mb-2">Song Library</h3>
                    <div className="bg-gray-900 p-2 rounded-lg flex-1 overflow-y-auto">
                        {availableSongs.map(song => (
                            <div 
                                key={song.id} 
                                className="flex items-center justify-between p-2 hover:bg-gray-700 rounded cursor-grab active:cursor-grabbing"
                                draggable
                                onDragStart={() => dragItem.current = { type: 'add', songId: song.id }}
                                onDragEnd={handleDragEnd}
                            >
                                <span>{song.title}</span>
                                <button type="button" onClick={() => handleAddSong(song.id)} className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center">+</button>
                            </div>
                        ))}
                        <div className="h-1" onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, songsInSetlist.length)}></div>
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Cancel</button>
                <button type="submit" className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded">Save Setlist</button>
            </div>
        </form>
    );
}

export default SetlistEditor;