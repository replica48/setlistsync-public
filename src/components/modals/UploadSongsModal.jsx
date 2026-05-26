import { useState } from 'react';
import { Button } from '@mui/material';
import Modal from './Modal';
import Spinner from '../ui/Spinner';

function UploadSongsModal({ onUpload, onCancel }) {
    const [csvFile, setCsvFile] = useState(null);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
            setCsvFile(file);
            setError('');
        } else {
            setCsvFile(null);
            setError('Please select a valid .csv file.');
        }
    };

    const parseCsv = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const text = event.target.result;
                    const dataRows = [];
                    let currentRow = [];
                    let currentField = '';
                    let inQuotes = false;

                    for (let i = 0; i < text.length; i++) {
                        const char = text[i];
                        if (inQuotes) {
                            if (char === '"' && i + 1 < text.length && text[i + 1] === '"') {
                                currentField += '"';
                                i++; // Skip next quote
                            } else if (char === '"') {
                                inQuotes = false;
                            } else {
                                currentField += char;
                            }
                        } else {
                            if (char === '"') {
                                inQuotes = true;
                            } else if (char === ',') {
                                currentRow.push(currentField);
                                currentField = '';
                            } else if (char === '\n' || char === '\r') {
                                if (i > 0 && text[i-1] !== '\n' && text[i-1] !== '\r') {
                                    currentRow.push(currentField);
                                    dataRows.push(currentRow);
                                    currentRow = [];
                                    currentField = '';
                                }
                                if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                                    i++; // Handle CRLF
                                }
                            } else {
                                currentField += char;
                            }
                        }
                    }
                    // Add the last field and row if the file doesn't end with a newline
                    if (currentField || currentRow.length > 0) {
                        currentRow.push(currentField);
                        dataRows.push(currentRow);
                    }

                    if (dataRows.length < 2) {
                        return reject(new Error('CSV file must have a header and at least one song.'));
                    }

                    const headerRow = dataRows[0].map(h => h.trim().toLowerCase());
                    const songDataRows = dataRows.slice(1);

                    const songs = songDataRows.map(row => {
                        const songObject = {};
                        headerRow.forEach((header, index) => {
                            const key = header.replace(/\s+/g, ''); // 'song name' -> 'songname'
                            if (key === 'songname') songObject['title'] = row[index] || '';
                            else if (key === 'lyricschords') songObject['lyricsChords'] = row[index] || '';
                            else songObject[key] = row[index] || '';
                        });
                        return songObject;
                    }).filter(song => song.title && song.title.trim() !== '');

                    if (!headerRow.includes('song name')) return reject(new Error("CSV must contain a 'song name' column."));

                    resolve(songs);
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read the file.'));
            reader.readAsText(file);
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!csvFile) {
            setError('Please select a CSV file.');
            return;
        }
        setIsProcessing(true);
        setError('');
        try {
            const songs = await parseCsv(csvFile);
            if (songs.length === 0) {
                setError('No valid songs found in the CSV file.');
            }
            else {
                onUpload(songs);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Modal onClose={onCancel}>
            <form onSubmit={handleSubmit}>
                <h2 className="text-2xl font-bold mb-4">Upload Songs from CSV</h2>
                <p className="text-gray-400 text-sm mb-4">Upload a .csv file to add or update songs. Required column: <strong>`song name`</strong>. Optional columns: <strong>`notes`</strong>, <strong>`tempo`</strong>, <strong>`lyricsChords`</strong>.</p>
                {error && <p className="bg-red-900 text-red-300 p-3 rounded-md mb-4">{error}</p>}
                <input type="file" accept=".csv" onChange={handleFileChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-500" required />
                <div className="flex justify-end gap-4 mt-6">
                    <Button
                        onClick={onCancel}
                        disabled={isProcessing}
                        sx={{
                            backgroundColor: 'rgb(75 85 99)',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'rgb(107 114 128)',
                            },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isProcessing || !csvFile}
                        sx={{
                            backgroundColor: 'rgb(22 163 74)',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'rgb(34 197 94)',
                            },
                        }}
                    >
                        {isProcessing && <Spinner />} {isProcessing ? 'Processing...' : 'Upload & Add Songs'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default UploadSongsModal;