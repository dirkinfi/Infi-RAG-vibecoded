import type { VectorChunk } from '../types';

const DB_NAME = 'InfiRagVectorStore';
const STORE_NAME = 'vectorData';
const DB_VERSION = 2; // Bump version for schema change

export interface StoredVectorStore {
  id: number; // Using timestamp as ID
  fileName: string;
  content: VectorChunk[];
}

let db: IDBDatabase | null = null;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject('Error opening IndexedDB.');
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      // If upgrading from a version that had the old schema, remove it.
      if (event.oldVersion < 2) {
        if (dbInstance.objectStoreNames.contains(STORE_NAME)) {
            dbInstance.deleteObjectStore(STORE_NAME);
        }
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveVectorData = async (fileName: string, content: VectorChunk[]): Promise<number> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const id = Date.now();
    const dataToStore: StoredVectorStore = { id, fileName, content };
    const request = store.add(dataToStore);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject('Failed to save data to IndexedDB.');
  });
};

export const getAllVectorStoresMeta = async (): Promise<{id: number, fileName: string}[]> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const result = (request.result || []) as StoredVectorStore[];
            const meta = result.map(({ id, fileName }) => ({ id, fileName })).sort((a, b) => b.id - a.id);
            resolve(meta);
        };
        request.onerror = () => reject('Failed to retrieve store metadata from IndexedDB.');
    });
};

export const getVectorStore = async (id: number): Promise<StoredVectorStore | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
        resolve(request.result || null);
    };
    request.onerror = () => reject('Failed to retrieve data from IndexedDB.');
  });
};

export const deleteVectorStore = async (id: number): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject('Failed to delete data from IndexedDB.');
  });
};
