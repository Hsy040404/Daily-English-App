import Dexie from "dexie";
import { addDays, localDateKey } from "./utils/date";

export const db = new Dexie("dailyEnglishPersonal");

db.version(1).stores({
  words: "&id, &english, status, dueDate, order, createdAt",
  settings: "&key",
  assignments: "&date",
  speaking: "&date",
  readings: "&id",
  memos: "&date",
  reviewLogs: "++id, date, english"
});

db.version(2).stores({
  words: "&id, &english, status, dueDate, order, createdAt",
  settings: "&key",
  assignments: "&date",
  speaking: "&date",
  readings: "&id",
  memos: "&date",
  reviewLogs: "++id, date, english",
  studyLogs: "++id, &[date+wordId], date, wordId, rating"
});

db.version(3).stores({
  words: "&id, &english, status, dueDate, order, createdAt",
  settings: "&key",
  assignments: "&date",
  speaking: "&date",
  readings: "&id",
  memos: "&date",
  reviewLogs: "++id, date, english",
  studyLogs: "++id, &[date+wordId], date, wordId, rating",
  materials: "++id, &[module+fileName], module, importedAt"
});

db.version(4).stores({
  words: "&id, &english, status, dueDate, order, createdAt",
  settings: "&key",
  assignments: "&date",
  speaking: "&date",
  readings: "&id",
  memos: "&date",
  reviewLogs: "++id, date, english",
  studyLogs: "++id, &[date+wordId], date, wordId, rating",
  materials: "++id, &[module+fileName], module, importedAt",
  readingCompletions: "++id, &[date+articleId], date, articleId"
});

export const defaults = {
  wordTarget: 10,
  reviewTarget: 20,
  currentArticleId: "morning-routine"
};

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value, updatedAt: new Date().toISOString() });
}

export async function initializeSettings() {
  for (const [key, value] of Object.entries(defaults)) {
    if ((await db.settings.get(key)) === undefined) {
      await setSetting(key, value);
    }
  }
}

export function makeWordId(english) {
  return english.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

export async function saveWordPairs(pairs, sourceName = "手动导入") {
  const existing = await db.words.toArray();
  const existingMap = new Map(existing.map((word) => [word.id, word]));
  const baseOrder = existing.reduce(
    (highest, word) => Math.max(highest, word.order || 0),
    0
  );
  const pending = new Map();

  for (const pair of pairs) {
    const english = pair.english?.trim().replace(/\s+/g, " ");
    const chinese = pair.chinese?.trim().replace(/\s+/g, " ");
    if (!english || !chinese) continue;
    const id = makeWordId(english);
    if (!pending.has(id)) {
      pending.set(id, {
        id,
        english,
        chinese,
        sourceName,
        createdAt: new Date().toISOString()
      });
    }
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const rows = [];

  for (const word of pending.values()) {
    const current = existingMap.get(word.id);
    if (current) {
      if (current.chinese !== word.chinese) {
        rows.push({ ...current, chinese: word.chinese, updatedAt: new Date().toISOString() });
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    rows.push({
      ...word,
      status: "new",
      reviewStage: 0,
      dueDate: localDateKey(),
      note: "",
      lastStudiedDate: null,
      order: baseOrder + added + 1
    });
    added += 1;
  }

  if (rows.length) await db.words.bulkPut(rows);
  return { added, updated, skipped };
}

export async function ensureTodayAssignment() {
  const date = localDateKey();
  const existing = await db.assignments.get(date);
  if (existing) return existing;

  const target = Number(await getSetting("wordTarget", defaults.wordTarget));
  const assignments = await db.assignments.toArray();
  const assignedIds = new Set(assignments.flatMap((item) => item.wordIds));
  const words = await db.words.orderBy("order").toArray();
  const candidates = words.filter(
    (word) => !assignedIds.has(word.id) && word.status === "new"
  );
  const wordIds = candidates.slice(0, target).map((word) => word.id);
  const assignment = {
    date,
    wordIds,
    target,
    createdAt: new Date().toISOString()
  };
  await db.assignments.put(assignment);
  return assignment;
}

export async function getDueWords(date = localDateKey()) {
  return db.words
    .where("dueDate")
    .belowOrEqual(date)
    .and((word) => word.status !== "new")
    .toArray();
}

export async function markWordStudy(
  word,
  rating,
  note,
  studyDate = localDateKey()
) {
  const today = localDateKey();
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(studyDate)
    ? studyDate
    : today;
  const statusByRating = {
    again: "unfamiliar",
    hard: "learning",
    good: "known"
  };
  const dueByRating = {
    again: 1,
    hard: 2,
    good: 3
  };
  const existing = await db.words.get(word.id);
  const latestStudyDate =
    existing?.lastStudiedDate && existing.lastStudiedDate > selectedDate
      ? existing.lastStudiedDate
      : selectedDate;

  await db.transaction("rw", db.words, db.studyLogs, async () => {
    await db.words.update(word.id, {
      status: statusByRating[rating] || "learning",
      dueDate: addDays(selectedDate, dueByRating[rating] || 2),
      lastStudiedDate: latestStudyDate,
      note: typeof note === "string" ? note : word.note || "",
      updatedAt: new Date().toISOString()
    });
    const existingLog = await db.studyLogs
      .where("[date+wordId]")
      .equals([selectedDate, word.id])
      .first();
    const log = {
      date: selectedDate,
      wordId: word.id,
      english: word.english,
      chinese: word.chinese,
      rating,
      createdAt: new Date().toISOString()
    };
    if (existingLog) {
      await db.studyLogs.update(existingLog.id, log);
    } else {
      await db.studyLogs.add(log);
    }
  });
}

export async function updateTodayTarget(target) {
  const date = localDateKey();
  const parsedTarget = Number(target);
  const safeTarget = Number.isFinite(parsedTarget)
    ? Math.max(1, Math.floor(parsedTarget))
    : 1;
  await setSetting("wordTarget", safeTarget);
  const assignment = await ensureTodayAssignment();
  const words = await db.words.orderBy("order").toArray();
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const studied = assignment.wordIds.filter(
    (id) => wordMap.get(id)?.lastStudiedDate === date
  );
  const pending = assignment.wordIds.filter(
    (id) => wordMap.get(id)?.lastStudiedDate !== date
  );
  const keepCount = Math.max(0, safeTarget - studied.length);
  let wordIds = [...studied, ...pending.slice(0, keepCount)];

  if (wordIds.length < safeTarget) {
    const assignedIds = new Set(
      (await db.assignments.toArray()).flatMap((item) => item.wordIds)
    );
    const extra = words
      .filter((word) => !assignedIds.has(word.id) && word.status === "new")
      .slice(0, safeTarget - wordIds.length)
      .map((word) => word.id);
    wordIds = [...wordIds, ...extra];
  }

  await db.assignments.update(date, { wordIds, target: safeTarget });
}

export async function saveImportedMaterial({
  module,
  fileName,
  format,
  text
}) {
  if (!["speaking", "reading"].includes(module)) {
    throw new Error("未知的素材模块");
  }
  if (!text?.trim()) throw new Error("文件中没有可读取的文字");
  const existing = await db.materials
    .where("[module+fileName]")
    .equals([module, fileName])
    .first();
  const material = {
    module,
    fileName,
    format,
    text: text.trim(),
    importedAt: new Date().toISOString()
  };
  if (existing) {
    await db.materials.update(existing.id, material);
    return existing.id;
  }
  return db.materials.add(material);
}

export async function scheduleReview(word, rating) {
  const today = localDateKey();
  const stage = Number(word.reviewStage || 0);
  let nextStage = stage;
  let dueDate;
  let status = "learning";
  const intervals = [1, 3, 7, 14, 30, 60];

  if (rating === "again") {
    nextStage = 0;
    dueDate = addDays(today, 1);
    status = "unfamiliar";
  } else if (rating === "hard") {
    nextStage = Math.max(1, stage);
    dueDate = addDays(today, 2);
    status = "learning";
  } else {
    nextStage = Math.min(stage + 1, intervals.length - 1);
    dueDate = addDays(today, intervals[nextStage]);
    status = "known";
  }

  await db.words.update(word.id, {
    reviewStage: nextStage,
    dueDate,
    status,
    lastReviewedDate: today,
    updatedAt: new Date().toISOString()
  });
  await db.reviewLogs.add({
    date: today,
    english: word.english,
    rating,
    reviewedAt: new Date().toISOString()
  });
  return { dueDate, nextStage, status };
}

export async function resetLocalData() {
  await db.transaction(
    "rw",
    [
      db.words,
      db.settings,
      db.assignments,
      db.speaking,
      db.readings,
      db.memos,
      db.reviewLogs
    ],
    async () => {
      await Promise.all([
        db.words.clear(),
        db.settings.clear(),
        db.assignments.clear(),
        db.speaking.clear(),
        db.readings.clear(),
        db.memos.clear(),
        db.reviewLogs.clear()
      ]);
    }
  );
}
