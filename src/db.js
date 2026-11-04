import Dexie from "dexie";
import { addDays, localDateKey } from "./utils/date";
import { normalizeEnglishTerm } from "./utils/wordText";

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

db.version(5).stores({
  words: "&id, &english, status, dueDate, order, createdAt",
  settings: "&key",
  assignments: "&date",
  speaking: "&date",
  readings: "&id",
  memos: "&date",
  reviewLogs: "++id, date, english",
  studyLogs: "++id, &[date+wordId], date, wordId, rating",
  materials: "++id, &[module+fileName], module, importedAt",
  readingCompletions: "++id, &[date+articleId], date, articleId",
  backups: "&date"
});

export const defaults = {
  wordTarget: 10,
  reviewTarget: 20
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
    const english = normalizeEnglishTerm(pair.english);
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

export async function normalizeStoredWords() {
  const words = await db.words.toArray();
  if (!words.length) return { updated: 0, merged: 0 };

  const groups = new Map();
  let needsMigration = false;
  for (const word of words) {
    const english = normalizeEnglishTerm(word.english);
    const id = makeWordId(english);
    if (!english) {
      needsMigration = true;
      continue;
    }
    if (id !== word.id || english !== word.english) needsMigration = true;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ ...word, id, english });
  }
  if (!needsMigration) return { updated: 0, merged: 0 };

  const rank = { new: 0, unfamiliar: 1, learning: 2, known: 3 };
  const mergedWords = [];
  const oldToNew = new Map();
  const englishMap = new Map();

  for (const [id, group] of groups.entries()) {
    const sorted = [...group].sort(
      (left, right) =>
        (rank[right.status] || 0) - (rank[left.status] || 0) ||
        String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
    );
    const representative = sorted[0];
    const latestNote =
      sorted.find((word) => word.note?.trim())?.note || "";
    const dueDate =
      group
        .map((word) => word.dueDate)
        .filter(Boolean)
        .sort()[0] || representative.dueDate;
    const lastStudiedDate =
      group
        .map((word) => word.lastStudiedDate)
        .filter(Boolean)
        .sort()
        .at(-1) || null;
    const createdAt =
      group
        .map((word) => word.createdAt)
        .filter(Boolean)
        .sort()[0] || new Date().toISOString();
    const order = Math.min(...group.map((word) => Number(word.order) || Infinity));
    const merged = {
      ...representative,
      id,
      english: representative.english,
      chinese:
        sorted.find((word) => word.chinese?.trim())?.chinese ||
        representative.chinese,
      status: representative.status || "new",
      reviewStage: Math.max(...group.map((word) => Number(word.reviewStage) || 0)),
      dueDate,
      lastStudiedDate,
      note: latestNote,
      order: Number.isFinite(order) ? order : mergedWords.length + 1,
      createdAt,
      updatedAt: new Date().toISOString()
    };
    mergedWords.push(merged);
    for (const word of group) {
      oldToNew.set(word.id, id);
      englishMap.set(word.english, merged.english);
    }
  }

  mergedWords.sort((left, right) => left.order - right.order);
  await db.transaction(
    "rw",
    [db.words, db.assignments, db.studyLogs, db.reviewLogs],
    async () => {
      await db.words.clear();
      await db.words.bulkPut(mergedWords);

      const assignments = await db.assignments.toArray();
      await db.assignments.bulkPut(
        assignments.map((assignment) => ({
          ...assignment,
          wordIds: [
            ...new Set(
              assignment.wordIds
                .map((id) => oldToNew.get(id) || id)
                .filter((id) => groups.has(id))
            )
          ]
        }))
      );

      const studyLogs = await db.studyLogs.toArray();
      const uniqueLogs = new Map();
      for (const log of studyLogs) {
        const wordId = oldToNew.get(log.wordId) || log.wordId;
        if (!groups.has(wordId)) continue;
        uniqueLogs.set(`${log.date}|${wordId}`, {
          ...log,
          wordId,
          english: groups.get(wordId)?.[0]?.english || log.english
        });
      }
      await db.studyLogs.clear();
      if (uniqueLogs.size) await db.studyLogs.bulkPut([...uniqueLogs.values()]);

      const reviewLogs = await db.reviewLogs.toArray();
      await db.reviewLogs.bulkPut(
        reviewLogs
          .filter((log) => englishMap.has(log.english))
          .map((log) => ({ ...log, english: englishMap.get(log.english) }))
      );
    }
  );
  return {
    updated: mergedWords.length,
    merged: words.length - mergedWords.length
  };
}

export async function ensureTodayAssignment() {
  const date = localDateKey();
  const existing = await db.assignments.get(date);

  const target = Number(await getSetting("wordTarget", defaults.wordTarget));
  const assignments = await db.assignments.toArray();
  const words = await db.words.orderBy("order").toArray();
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const previousIds = [
    ...new Set(
      assignments
        .filter((item) => item.date < date)
        .sort((left, right) => right.date.localeCompare(left.date))
        .flatMap((item) => item.wordIds)
    )
  ];
  const carryover = previousIds
    .map((id) => wordMap.get(id))
    .filter((word) => word?.status === "new");
  const carryoverIds = new Set(carryover.map((word) => word.id));
  const remainingNew = words.filter(
    (word) => word.status === "new" && !carryoverIds.has(word.id)
  );
  const candidates = [...carryover, ...remainingNew];

  if (existing) {
    const validIds = existing.wordIds.filter((id) => wordMap.has(id));
    if (existing.wordIds.length === 0) {
      const repaired = {
        ...existing,
        wordIds: candidates.slice(0, target).map((word) => word.id),
        target,
        repairedAt: new Date().toISOString()
      };
      await db.assignments.put(repaired);
      return repaired;
    }
    return { ...existing, wordIds: validIds };
  }

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

  await db.transaction("rw", db.words, db.studyLogs, db.assignments, async () => {
    await db.words.update(word.id, {
      status: statusByRating[rating] || "learning",
      dueDate: addDays(selectedDate, dueByRating[rating] || 2),
      lastStudiedDate: latestStudyDate,
      note: typeof note === "string" ? note : word.note || "",
      dailyQuizPassedDate:
        selectedDate === today
          ? null
          : existing?.dailyQuizPassedDate || null,
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
    if (selectedDate === today) {
      await db.assignments.update(today, {
        testStartedAt: null,
        testCompletedAt: null
      });
    }
  });
}

export async function updateTodayTarget(target) {
  const date = localDateKey();
  const parsedTarget = Number(target);
  const safeTarget = Number.isFinite(parsedTarget)
    ? Math.max(1, Math.floor(parsedTarget))
    : 1;
  const assignment = await ensureTodayAssignment();
  const words = await db.words.orderBy("order").toArray();
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const isIncreasing = safeTarget > assignment.wordIds.length;
  const testPassedToday = assignment.testCompletedAt?.startsWith(date);
  const allCurrentWordsStudied =
    assignment.wordIds.length > 0 &&
    assignment.wordIds.every(
      (id) => wordMap.get(id)?.lastStudiedDate === date
    );
  if (
    isIncreasing &&
    ((allCurrentWordsStudied && !testPassedToday) ||
      (assignment.testStartedAt && !testPassedToday))
  ) {
    throw new Error("请先完成当前单词测试，再增加今日单词");
  }

  await setSetting("wordTarget", safeTarget);
  const studied = assignment.wordIds.filter(
    (id) => wordMap.get(id)?.lastStudiedDate === date
  );
  const pending = assignment.wordIds.filter(
    (id) => wordMap.get(id)?.lastStudiedDate !== date
  );
  const keepCount = Math.max(0, safeTarget - studied.length);
  let wordIds = [...studied, ...pending.slice(0, keepCount)];

  if (wordIds.length < safeTarget) {
    const extra = words
      .filter(
        (word) =>
          word.status === "new" && !wordIds.includes(word.id)
      )
      .slice(0, safeTarget - wordIds.length)
      .map((word) => word.id);
    wordIds = [...wordIds, ...extra];
  }

  const testingNeedsReset = wordIds.length > assignment.wordIds.length;
  await db.assignments.update(date, {
    wordIds,
    target: safeTarget,
    ...(testingNeedsReset
      ? { testStartedAt: null, testCompletedAt: null }
      : {})
  });
}

export async function recordDailyQuizAnswer(word, isCorrect) {
  const date = localDateKey();
  if (isCorrect) {
    await db.words.update(word.id, {
      dailyQuizPassedDate: date,
      lastStudiedDate: date,
      status: word.status === "unfamiliar" ? "learning" : word.status,
      updatedAt: new Date().toISOString()
    });
  } else {
    await db.words.update(word.id, {
      dailyQuizPassedDate: null,
      lastStudiedDate: null,
      status: "unfamiliar",
      dueDate: addDays(date, 1),
      updatedAt: new Date().toISOString()
    });
  }
}

export async function startDailyQuiz(date = localDateKey()) {
  const assignment = await db.assignments.get(date);
  if (!assignment) return null;
  const next = {
    ...assignment,
    testStartedAt: assignment.testStartedAt || new Date().toISOString(),
    testCompletedAt: null
  };
  await db.assignments.put(next);
  return next;
}

export async function completeDailyQuiz(date = localDateKey()) {
  const completedAt = new Date().toISOString();
  const assignment = await db.assignments.get(date);
  if (!assignment) return null;
  const next = {
    ...assignment,
    testStartedAt: assignment.testStartedAt || completedAt,
    testCompletedAt: completedAt
  };
  await db.assignments.put(next);
  return next;
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

export async function deleteWordSource(sourceName) {
  const allWords = await db.words.toArray();
  const sourceWords = allWords.filter(
    (word) => (word.sourceName || "个人词库") === sourceName
  );
  if (!sourceWords.length) return { deletedWords: 0, deletedLogs: 0 };

  const wordIds = sourceWords.map((word) => word.id);
  const wordIdSet = new Set(wordIds);
  const englishSet = new Set(sourceWords.map((word) => word.english));
  const assignments = await db.assignments.toArray();
  const logs = await db.studyLogs.toArray();
  const reviewLogs = await db.reviewLogs.toArray();
  const sourceLogs = logs.filter((log) => wordIdSet.has(log.wordId));
  const sourceReviewLogs = reviewLogs.filter((log) => englishSet.has(log.english));

  await db.transaction(
    "rw",
    [db.words, db.assignments, db.studyLogs, db.reviewLogs],
    async () => {
      await db.words.bulkDelete(wordIds);
      await db.assignments.bulkPut(
        assignments.map((assignment) => ({
          ...assignment,
          wordIds: assignment.wordIds.filter((id) => !wordIdSet.has(id))
        }))
      );
      await db.studyLogs.bulkDelete(sourceLogs.map((log) => log.id));
      await db.reviewLogs.bulkDelete(sourceReviewLogs.map((log) => log.id));
    }
  );

  return {
    deletedWords: sourceWords.length,
    deletedLogs: sourceLogs.length + sourceReviewLogs.length
  };
}

export async function deleteImportedMaterial(id) {
  const material = await db.materials.get(Number(id));
  if (!material) return false;
  await db.materials.delete(material.id);
  return true;
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
