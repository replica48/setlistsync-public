import { openDB } from 'idb';
import { doc, collection, writeBatch, arrayRemove, getDocs } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';

const DB_NAME = 'setlistsync-pdfs';
const STORE_NAME = 'pdf-cache';
const DB_VERSION = 3;

// Initializes the database
async function initDB() {
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, _transaction) {
      
      // --- YOUR CORRECTED LOGIC ---
      // This will run for any user who has a version *less than* the current DB_VERSION
      if (oldVersion < DB_VERSION) {
        console.log(`Upgrading database from v${oldVersion} to v${DB_VERSION}... clearing old PDF cache.`);
        if (db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME);
        }
      }
      // --- END OF FIX ---

      // Re-create the store for all new users or upgraded users.
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
  return db;
}

/**
 * Deletes a band and all associated data, including members, user references, and stored files.
 * @param {object} db - The Firestore database instance.
 * @param {object} storage - The Firebase Storage instance.
 * @param {string} bandId - The ID of the band to delete.
 * @param {Array} songs - The array of songs associated with the band, used to delete stored files.
 */
export async function deleteBand(db, storage, bandId, songs = []) {
    const bandRef = doc(db, "bands", bandId);
    const batch = writeBatch(db);

    // 1. Remove bandId from each member's user document
    const membersSnapshot = await getDocs(collection(db, "bands", bandId, "members"));
    for (const memberDoc of membersSnapshot.docs) {
        const userId = memberDoc.id;
        const userRef = doc(db, "users", userId);
        batch.update(userRef, {
            bandIds: arrayRemove(bandId)
        });
    }

    // 2. Delete associated song files (e.g., PDFs) from Firebase Storage
    for (const song of songs) {
        if (song.pdfs) {
            for (const pdf of song.pdfs) {
                const fileRef = ref(storage, pdf.path);
                // We don't want to block deletion if a single file fails to delete
                await deleteObject(fileRef).catch(err => console.error(`Failed to delete file ${pdf.path}:`, err));
            }
        }
    }

    // 3. Delete all documents in the 'members' subcollection
    membersSnapshot.forEach(memberDoc => {
        batch.delete(memberDoc.ref);
    });

    // 4. Delete the main band document itself
    batch.delete(bandRef);

    // 5. Commit all batched writes to Firestore
    await batch.commit();
}


/**
 * Saves a PDF file and its update timestamp to the database.
 * @param {string} key - The unique key for the file.
 * @param {Blob} pdfBlob - The PDF file data.
 * @param {string} updatedTimestamp - The ISO string of when the file was last updated in storage.
 */
export async function savePdf(key, pdfBlob, updatedTimestamp) {
  const db = await initDB();
  const dataToStore = { blob: pdfBlob, updated: updatedTimestamp };
  return db.put(STORE_NAME, dataToStore, key);
}

/**
 * Retrieves an object { blob, updated } from the database.
 * @param {string} key - The key of the file to retrieve.
 * @returns {Promise<{blob: Blob, updated: string}|undefined>}
 */
export async function getPdf(key) {
  const db = await initDB();
  return db.get(STORE_NAME, key);
}

// Deletes a PDF file from the database
export async function deletePdf(key) {
    const db = await initDB();
    return db.delete(STORE_NAME, key);
}

// Gets a list of all saved PDF keys
export async function getAllPdfKeys() {
    const db = await initDB();
    return db.getAllKeys(STORE_NAME);
}

/**
 * Converts a Blob into a base64 data URL.
 * @param {Blob} blob - The file blob to convert.
 * @returns {Promise<string>} A promise that resolves with the base64 data URL.
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}