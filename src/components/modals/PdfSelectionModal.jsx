import Modal from "./Modal";

function PdfSelectionModal({ song, onSelect, onClose }) {
  return (
    <Modal onClose={onClose} size="lg">
      <h2 className="text-2xl font-bold mb-4">Select view for: "{song.title}"</h2>
      <div className="space-y-3">
        {song.lyricsChords && (
            <button
                onClick={() => onSelect({ isLyrics: true })}
                className="w-full text-left bg-indigo-800 hover:bg-indigo-700 text-white font-bold py-3 px-5 rounded-md transition duration-300"
            >
                View Lyrics / Chords
            </button>
        )}
        {song.pdfs.map(pdf => (
          <button
            key={pdf.path}
            onClick={() => onSelect(pdf)}
            className="w-full text-left bg-sky-800 hover:bg-sky-700 text-white font-bold py-3 px-5 rounded-md transition duration-300"
          >
            {pdf.name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export default PdfSelectionModal;