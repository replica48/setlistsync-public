/**
 * @file indexedDB.js
 * @description Helper functions for storing and retrieving PDF blobs in IndexedDB for offline use.
 */

const DB_NAME = "SetlistSyncDB";
const STORE_NAME = "pdfs";
const DB_VERSION = 1;

/**
 * Opens the IndexedDB database, creating the object store if it doesn't exist.
 * @returns {Promise<IDBDatabase>}
 */
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
};

/**
 * Saves a PDF blob and its metadata to IndexedDB.
 * @param {string} key - The unique key for the file (e.g., "songId-filePath").
 * @param {Blob} blob - The PDF file blob.
 * @param {string} updated - The updated timestamp string from Firebase Storage metadata.
 * @returns {Promise<void>}
 */
export const savePdf = async (key, blob, updated) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ blob, updated }, key);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("Error saving PDF to IndexedDB:", error);
    throw error;
  }
};

/**
 * Retrieves a PDF blob and its metadata from IndexedDB.
 * @param {string} key - The unique key for the file.
 * @returns {Promise<{blob: Blob, updated: string} | undefined>}
 */
export const getPdf = async (key) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("Error retrieving PDF from IndexedDB:", error);
    throw error;
  }
};
