import { db } from "../db";
import { localDateKey } from "./date";

const BACKUP_FORMAT = "daily-english-personal-backup";
const BACKUP_TABLES = [
  "words",
  "settings",
  "assignments",
  "speaking",
  "readings",
  "memos",
  "reviewLogs",
  "studyLogs",
  "materials",
  "readingCompletions"
];

let backupInProgress = null;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function serializeValue(value) {
  if (value instanceof Blob) {
    return {
      __dailyEnglishBlob: true,
      type: value.type,
      data: await blobToDataUrl(value)
    };
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(serializeValue));
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = await serializeValue(item);
    }
    return output;
  }
  return value;
}

function deserializeValue(value) {
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === "object") {
    if (value.__dailyEnglishBlob && value.data) {
      const base64 = value.data.split(",")[1] || "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: value.type || "application/octet-stream" });
    }
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = deserializeValue(item);
    }
    return output;
  }
  return value;
}

export async function exportDatabaseSnapshot() {
  const tables = {};
  for (const name of BACKUP_TABLES) {
    tables[name] = await serializeValue(await db.table(name).toArray());
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    tables
  };
}

export async function createDailyBackup() {
  if (backupInProgress) return backupInProgress;
  backupInProgress = (async () => {
    const snapshot = await exportDatabaseSnapshot();
    const data = JSON.stringify(snapshot);
    const now = new Date().toISOString();
    const backup = {
      date: localDateKey(),
      createdAt: now,
      updatedAt: now,
      bytes: new Blob([data]).size,
      data
    };
    await db.backups.put(backup);

    const rows = await db.backups.orderBy("date").toArray();
    const expired = rows.slice(0, Math.max(0, rows.length - 14));
    if (expired.length) {
      await db.backups.bulkDelete(expired.map((row) => row.date));
    }
    return {
      date: backup.date,
      createdAt: backup.createdAt,
      updatedAt: backup.updatedAt,
      bytes: backup.bytes
    };
  })();
  try {
    return await backupInProgress;
  } finally {
    backupInProgress = null;
  }
}

export function backupToJson(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

export async function restoreDatabaseSnapshot(input) {
  const snapshot = typeof input === "string" ? JSON.parse(input) : input;
  if (snapshot?.format !== BACKUP_FORMAT || !snapshot.tables) {
    throw new Error("不是有效的每日英语备份文件");
  }
  const tableObjects = BACKUP_TABLES.map((name) => db.table(name));
  await db.transaction("rw", tableObjects, async () => {
    for (const name of BACKUP_TABLES) {
      await db.table(name).clear();
      const rows = deserializeValue(snapshot.tables[name] || []);
      if (rows.length) await db.table(name).bulkPut(rows);
    }
  });
  return snapshot.exportedAt;
}
