import Modal from "./Modal";

function SetlistOverviewModal({ activeSetlist, allSongs, currentSongIndex, onClose }) {
    const songsInSetlist = activeSetlist.songOrder.map(id => allSongs.find(s => s.id === id)).filter(Boolean);
    return (
        <Modal onClose={onClose} size="xl">
            <div className="flex flex-col h-[85vh]">
                <h2 className="text-3xl font-bold text-sky-400 mb-4">Setlist: {activeSetlist.name}</h2>
                <div className="bg-gray-900 p-4 rounded-lg flex-1 overflow-y-auto">
                    <ol className="list-decimal list-inside space-y-2">
                        {songsInSetlist.map((song, index) => (
                            <li key={song.id} className={`p-3 rounded-md transition-colors ${ index === currentSongIndex ? 'bg-sky-800 text-white' : 'bg-gray-700 text-gray-300' }`}>
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-lg">{song.title}</span>
                                    {index === currentSongIndex && <span className="text-xs bg-sky-500 text-white px-2 py-1 rounded-full font-bold">NOW PLAYING</span>}
                                </div>
                                {song.notes && <p className="text-sm text-gray-400 pl-6">{song.notes}</p>}
                            </li>
                        ))}
                    </ol>
                </div>
            </div>  
        </Modal>
    );
}

export default SetlistOverviewModal;