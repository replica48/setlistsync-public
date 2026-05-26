import { useState } from 'react';
import Modal from "./Modal";
import Spinner from "../ui/Spinner";

function UploadSetlistModal({ onUpload, onCancel }) {
    const [setlistName, setSetlistName] = useState('');
    const [csvFile, setCsvFile] = useState(null);
    const [error, setError] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && (file.type === "text/csv" || file.name.endsWith('.csv'))) {
            setCsvFile(file);
            setError('');
        } else {
            setCsvFile(null);
            setError('Please select a valid .csv file.');
        }
    };
    const parseCSV = (file) => { return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
                if (rows.length < 1) {
                    return reject(new Error("CSV file is empty."));
                }
                const parseRow = (row) => {
                    const result = [];
                    let currentField = '';
                    let inQuotedField = false;
                    for (let i = 0; i < row.length; i++) {
                        const char = row[i];
                        if (char === '"') {
                            inQuotedField = !inQuotedField;
                        }
                        else if (char === ',' && !inQuotedField) {
                            result.push(currentField); currentField = '';
                        } else {
                            currentField += char;
                        }
                    }
                    result.push(currentField);
                    return result.map(val => val.trim().replace(/^"|"$/g, '').trim());
                };
                const header = parseRow(rows[0]).map(h => h.toLowerCase());
                const songNameIndex = header.indexOf('song name');
                const notesIndex = header.indexOf('notes');
                const tempoIndex = header.indexOf('tempo');
                if (songNameIndex === -1) {
                    return reject(new Error("CSV must contain a 'song name' column."));
                }
                const songs = []; 
                for (let i = 1; i < rows.length; i++) {
                    const columns = parseRow(rows[i]);
                    const title = columns[songNameIndex];
                    if (title) {
                        songs.push({ title: title, notes: notesIndex > -1 ? (columns[notesIndex] || '') : '', tempo: tempoIndex > -1 ? (columns[tempoIndex] || '') : '' });
                    }
                }
                resolve(songs);
            }
            catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read the file."));
        reader.readAsText(file);
    });};
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!csvFile || !setlistName) {
            return setError('Please provide a setlist name and select a CSV file.');
        }
        setIsParsing(true);
        setError('');
        try {
            const songs = await parseCSV(csvFile);
            if (songs.length === 0) {
                setError('No valid songs found in the CSV file.');
            } else {
                onUpload(setlistName, songs);
            }
        }
        catch (err) {
            setError(err.message);
        }
        setIsParsing(false);
    };
    return (
        <Modal onClose={onCancel}>
            <form onSubmit={handleSubmit}>
                <h2 className="text-2xl font-bold mb-4">Upload Setlist from CSV</h2>
                <p className="text-gray-400 text-sm mb-4"> Create a setlist by uploading a .csv file. The file must contain a column named <strong>`song name`</strong>. Optional columns are <strong>`notes`</strong> and <strong>`tempo`</strong>. </p>
                {error && <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4">{error}</p>}
                <div className="space-y-4">
                    <input type="text" placeholder="New Setlist Name" value={setlistName} onChange={e => setSetlistName(e.target.value)} className="w-full bg-gray-700 p-2 rounded" required />
                    <input type="file" accept=".csv" onChange={handleFileChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500" required />
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded" disabled={isParsing}> Cancel </button>
                    <button type="submit" className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded flex items-center" disabled={isParsing || !csvFile || !setlistName}> {isParsing && <Spinner />} {isParsing ? 'Processing...' : 'Upload & Create'} </button>
                </div>
            </form>
        </Modal>
    );
}

export default UploadSetlistModal;