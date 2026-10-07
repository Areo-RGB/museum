import { openDB } from 'idb';

const DB_NAME = 'media-gallery';
const DB_VERSION = 1;
const STORE = 'slots';
let dbPromise;

function db() {
  dbPromise ||= openDB(DB_NAME, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'slotId' });
    },
  });
  return dbPromise;
}

export async function saveSlotMedia(record) {
  const database = await db();
  await database.put(STORE, { ...record, updatedAt: Date.now() });
}

export async function getSlotMedia(slotId) {
  const database = await db();
  return database.get(STORE, slotId);
}

export async function deleteSlotMedia(slotId) {
  const database = await db();
  return database.delete(STORE, slotId);
}