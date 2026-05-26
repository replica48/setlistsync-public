import { useState } from 'react';
import Modal from "./Modal";
import Spinner from "../ui/Spinner";

function UploadBackupModal({ onCancel, createBand, yourName: initialName }) {
    const [backupFile, setBackupFile] = useState(null);
    const [error, setError] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [bandName, setBandName] = useState('');
    const [yourName, setYourName] = useState(initialName || '');

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && file.type === "application/json") {
            setBackupFile(file);
            setError('');
            const cleanName = file.name.replace('_backup.json', '').replace(/_/g, ' ');
            setBandName(cleanName);
        } else {
            setBackupFile(null);
            setError('Please select a valid .json backup file.');
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!backupFile || !bandName || !yourName) {
            return setError('Please provide all details and select a backup file.');
        }
        setIsParsing(true);
        setError('');
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const backupData = JSON.parse(event.target.result);
                if (!backupData.songs || !backupData.setlists) {
                    throw new Error("Invalid backup file format.");
                }
                createBand(yourName, bandName, backupData);
            } catch (err) {
                setError(err.message || "Could not parse the backup file.");
                setIsParsing(false);
            }
        };
        reader.onerror = () => {
             setError("Failed to read the file.");
             setIsParsing(false);
        };
        reader.readAsText(backupFile);
    };

    return (
        <Modal onClose={onCancel}>
            <form onSubmit={handleSubmit}>
                <h2 className="text-2xl font-bold mb-4">Create Band from Backup</h2>
                <p className="text-gray-400 text-sm mb-4">Restore a band's songs and setlists from an `_backup.json` file. PDFs are not included in backups and will need to be re-uploaded.</p>
                {error && <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4">{error}</p>}
                <div className="space-y-4">
                    <input type="text" placeholder="Your Name in this Band" value={yourName} onChange={e => setYourName(e.target.value)} className="w-full bg-gray-700 p-2 rounded" required />
                    <input type="text" placeholder="New Band Name" value={bandName} onChange={e => setBandName(e.target.value)} className="w-full bg-gray-700 p-2 rounded" required />
                    <input type="file" accept=".json" onChange={handleFileChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500" required />
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded" disabled={isParsing}>Cancel</button>
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded flex items-center" disabled={isParsing || !backupFile || !bandName || !yourName}>
                        {isParsing && <Spinner />}
                        {isParsing ? 'Restoring...' : 'Create from Backup'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

export default UploadBackupModal;