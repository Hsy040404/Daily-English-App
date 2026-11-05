import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow
} from "docx";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(currentDir, "..");
const distDir = path.join(projectDir, "dist");
const outputRoot =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\issue-tests";
const edgePath =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sourceDocx = "C:\\Users\\86152\\Desktop\\中考688词汇默写卷.docx";
const issue = String(process.argv[2] || "");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf"
};

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let requested = decodeURIComponent(url.pathname);
      if (requested === "/") requested = "/index.html";
      const filePath = path.join(distDir, requested.replace(/^\/+/, ""));
      let body;
      let finalPath = filePath;
      try {
        body = await fs.readFile(filePath);
      } catch {
        finalPath = path.join(distDir, "index.html");
        body = await fs.readFile(finalPath);
      }
      response.writeHead(200, {
        "Content-Type":
          mimeTypes[path.extname(finalPath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(body);
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseColor(value) {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const number = Number.parseInt(hex[1], 16);
    return {
      r: (number >> 16) & 255,
      g: (number >> 8) & 255,
      b: number & 255,
      a: 1
    };
  }
  const rgba = value.match(/rgba?\(([^)]+)\)/);
  if (!rgba) throw new Error(`Unsupported color: ${value}`);
  const parts = rgba[1].split(",").map((part) => Number(part.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function relativeLuminance(color) {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastAgainstSurface(foreground, surface) {
  const alpha = foreground.a ?? 1;
  const blended = {
    r: foreground.r * alpha + surface.r * (1 - alpha),
    g: foreground.g * alpha + surface.g * (1 - alpha),
    b: foreground.b * alpha + surface.b * (1 - alpha)
  };
  const foregroundLuminance = relativeLuminance(blended);
  const backgroundLuminance = relativeLuminance(surface);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function openApp() {
  await fs.mkdir(outputRoot, { recursive: true });
  const server = createServer();
  await new Promise((resolve) => server.listen(4190, "127.0.0.1", resolve));
  const profileDir = path.join(
    outputRoot,
    `issue-${issue || "all"}-${Date.now()}`
  );
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: edgePath,
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    permissions: ["microphone"],
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto("http://127.0.0.1:4190", { waitUntil: "networkidle" });
  await page.getByLabel("今日快速备忘").waitFor();
  return {
    page,
    context,
    server,
    profileDir,
    errors,
    async close() {
      if (errors.length) {
        throw new Error(`Browser errors:\n${errors.join("\n")}`);
      }
      await context.close();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function navigate(page, label) {
  await page.locator(".main-nav button").filter({ hasText: label }).click();
  await page.waitForTimeout(250);
}

async function readIndexedDb(page, storeName) {
  return page.evaluate(
    (targetStore) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("dailyEnglishPersonal");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(targetStore, "readonly");
          const getAll = transaction.objectStore(targetStore).getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            database.close();
            resolve(getAll.result);
          };
        };
      }),
    storeName
  );
}

async function putIndexedDb(page, storeName, value) {
  return page.evaluate(
    ({ targetStore, record }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("dailyEnglishPersonal");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(targetStore, "readwrite");
          const put = transaction.objectStore(targetStore).put(record);
          put.onerror = () => reject(put.error);
          put.onsuccess = () => {
            database.close();
            resolve(true);
          };
        };
      }),
    { targetStore: storeName, record: value }
  );
}

async function writeWordFixture(fileName, rows) {
  const fixturePath = path.join(outputRoot, fileName);
  const fixture = new Document({
    sections: [
      {
        children: [
          new Table({
            rows: [
              new TableRow({
                children: ["英文", "中文"].map(
                  (text) =>
                    new TableCell({ children: [new Paragraph(text)] })
                )
              }),
              ...rows.map(
                ([english, chinese]) =>
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph(english)] }),
                      new TableCell({ children: [new Paragraph(chinese)] })
                    ]
                  })
              )
            ]
          })
        ]
      }
    ]
  });
  await fs.writeFile(fixturePath, await Packer.toBuffer(fixture));
  return fixturePath;
}

const tests = {
  n2: async ({ page }) => {
    await putIndexedDb(page, "words", {
      id: "100 light",
      english: "100 light",
      chinese: "光；轻的",
      status: "known",
      reviewStage: 2,
      dueDate: "2026-12-01",
      order: 300,
      note: "旧版本导入记录",
      lastStudiedDate: null,
      createdAt: new Date().toISOString(),
      sourceName: "旧词表.pdf"
    });
    await page.reload({ waitUntil: "networkidle" });

    await navigate(page, "每日单词");
    const focusWord = page.locator(".word-display h2");
    assert(
      (await focusWord.innerText()).trim() === "make",
      "主学习卡片不应显示序号或数字"
    );
    assert(
      (await page.locator(".word-display .word-order").count()) === 0,
      "主学习卡片混入了列表序号"
    );
    assert(
      (await page.locator(".mini-word-list .word-order").first().innerText()).trim() ===
        "1",
      "今日词单没有在单词前显示序号"
    );
    const focusFontFamily = await focusWord.evaluate(
      (element) => getComputedStyle(element).fontFamily
    );

    const fixturePath = path.join(outputRoot, "issue-n2-numbered.docx");
    const fixture = new Document({
      sections: [
        {
          children: [
            new Table({
              rows: [
                new TableRow({
                  children: ["英文", "中文"].map(
                    (text) =>
                      new TableCell({ children: [new Paragraph(text)] })
                  )
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("1. alpha")] }),
                    new TableCell({ children: [new Paragraph("甲")] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("2) beta")] }),
                    new TableCell({ children: [new Paragraph("乙")] })
                  ]
                })
              ]
            })
          ]
        }
      ]
    });
    await fs.writeFile(fixturePath, await Packer.toBuffer(fixture));

    await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
    await page.getByRole("heading", { name: "识别到 2 组词对" }).waitFor();
    const preview = await page.locator(".preview-table").innerText();
    assert(preview.includes("alpha") && preview.includes("beta"), "清洗后缺少单词");
    assert(!/\d/.test(preview), "导入预览中仍然包含数字");
    await page.getByRole("button", { name: /加入词库/ }).click();
    await page.getByRole("tab", { name: /全部词库/ }).click();
    await page.getByLabel("搜索词库").fill("light");
    const migratedRow = page.locator(".word-bank-row").first();
    await migratedRow.waitFor();
    assert(
      (await migratedRow.locator("strong").innerText()).trim() === "light",
      "已有词库中的旧编号没有迁移清除"
    );
    assert(
      /^\d+$/.test(
        (await migratedRow.locator(".word-bank-order").innerText()).trim()
      ),
      "完整词库没有在单词前显示独立的数字序号"
    );
    assert(
      (await migratedRow.innerText()).includes("已经认识"),
      "迁移后没有保留原有点击状态"
    );
    await page.getByLabel("搜索词库").fill("alpha");
    const row = page.locator(".word-bank-row").first();
    await row.waitFor();
    assert(!/\d/.test(await row.locator("strong").innerText()), "入库单词仍包含数字");
    const fontFamily = await row
      .locator("strong")
      .evaluate((element) => getComputedStyle(element).fontFamily);
    assert(
      Boolean(fontFamily) && focusFontFamily === fontFamily,
      "词库与主学习卡片的英文字体不统一"
    );
    const words = await readIndexedDb(page, "words");
    assert(
      words.some((word) => word.english === "alpha") &&
        words.some((word) => word.english === "beta"),
      "清洗后的新单词没有写入词库"
    );

    const assignments = await readIndexedDb(page, "assignments");
    const todayAssignment = assignments.at(-1);
    const highOrderWords = [...words]
      .sort((left, right) => left.order - right.order)
      .slice(-10);
    await putIndexedDb(page, "assignments", {
      ...todayAssignment,
      wordIds: highOrderWords.map((word) => word.id)
    });
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "每日单词");
    const dailyOrdinals = await page
      .locator(".mini-word-list .word-order")
      .allTextContents();
    assert(
      dailyOrdinals.join(",") === "1,2,3,4,5,6,7,8,9,10",
      "今日词单序号没有从 1 开始连续排列"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-n2.png"),
      fullPage: true
    });
  },
  n3: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.getByRole("button", { name: "生成默写卷" }).click();
    const wordsPerDay = page.getByLabel("每天单词数量");
    const daysPerPage = page.getByLabel("每页天数");
    await wordsPerDay.fill("12abc");
    await daysPerPage.fill("2天");
    assert(
      (await wordsPerDay.inputValue()) === "12" &&
        (await daysPerPage.inputValue()) === "2",
      "自定义数量输入框没有过滤非数字字符"
    );
    assert(
      (await wordsPerDay.getAttribute("inputmode")) === "numeric" &&
        (await daysPerPage.getAttribute("inputmode")) === "numeric",
      "自定义数量输入框不是数字输入模式"
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /生成并下载/ }).click();
    const download = await downloadPromise;
    const outputPath = path.join(outputRoot, "issue-n3-custom.docx");
    await download.saveAs(outputPath);
    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    const documentXml = await zip.file("word/document.xml").async("string");
    assert(
      documentXml.includes("different") && documentXml.includes("little"),
      "自定义每天 12 词时文档丢失了第 11、12 个单词"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-n3.png"),
      fullPage: true
    });
  },
  n4: async ({ page }) => {
    assert(
      (await page.locator(".main-nav button").filter({ hasText: "英语阅读" }).count()) === 0,
      "侧边栏仍然存在英语阅读入口"
    );
    assert(
      !(await page.locator(".home-page").innerText()).includes("英语阅读"),
      "首页仍然包含英语阅读任务"
    );
    assert(
      (await page.locator(".summary-card").count()) === 3,
      "删除阅读后首页摘要数量不正确"
    );
    assert(
      (await page.locator(".plan-row").count()) === 3,
      "删除阅读后今日计划数量不正确"
    );
    await navigate(page, "每日单词");
    await navigate(page, "口语练习");
    await navigate(page, "间隔复习");
    await page.screenshot({
      path: path.join(outputRoot, "issue-n4.png"),
      fullPage: true
    });
  },
  n5: async ({ page }) => {
    const fixturePath = await writeWordFixture("issue-n5-source.docx", [
      ["gamma", "伽马"],
      ["delta", "德尔塔"]
    ]);
    await navigate(page, "每日单词");
    await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
    await page.getByRole("heading", { name: "识别到 2 组词对" }).waitFor();
    await page.getByRole("button", { name: /加入词库/ }).click();
    await page.getByRole("tab", { name: /导入来源/ }).click();
    await page
      .getByRole("button", { name: "删除来源 issue-n5-source.docx" })
      .waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "删除来源 issue-n5-source.docx" })
      .click();
    await page.waitForTimeout(400);
    assert(
      (await page.getByRole("button", { name: "删除来源 issue-n5-source.docx" }).count()) === 0,
      "导入来源删除后仍然存在"
    );
    const words = await readIndexedDb(page, "words");
    assert(
      !words.some((word) => word.english === "gamma" || word.english === "delta"),
      "删除来源后对应单词仍保留在词库"
    );
    await page.getByRole("tab", { name: /全部词库/ }).click();
    await page.getByLabel("搜索词库").fill("gamma");
    assert(
      (await page.locator(".word-bank-row").count()) === 0,
      "删除来源后仍能搜索到对应单词"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-n5.png"),
      fullPage: true
    });
  },
  n6: async ({ page }) => {
    await navigate(page, "口语练习");
    await page.getByLabel("导入口语文件").setInputFiles(sourceDocx);
    const deleteButton = page.getByRole("button", {
      name: "删除口语素材 中考688词汇默写卷.docx"
    });
    await deleteButton.waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await deleteButton.click();
    await page.waitForTimeout(350);
    assert((await deleteButton.count()) === 0, "删除后口语素材仍然存在");
    let materials = await readIndexedDb(page, "materials");
    assert(
      !materials.some((material) => material.module === "speaking"),
      "删除后口语素材仍保存在数据库中"
    );
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "口语练习");
    assert(
      (await page.getByRole("button", { name: /中考688词汇默写卷\.docx/ }).count()) === 0,
      "刷新后已删除的口语素材重新出现"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-n6.png"),
      fullPage: true
    });
  },
  n7: async ({ page }) => {
    assert(
      (await page.getByRole("heading", { name: "今日三项" }).count()) === 1,
      "首页没有呈现调整后的今日三项结构"
    );
    assert(
      (await page.locator(".main-nav button").count()) === 4,
      "删除阅读后导航数量不正确"
    );
    assert(
      (await page.locator(".summary-card").count()) === 3,
      "首页摘要卡片数量不正确"
    );
    const columns = await page
      .locator(".summary-grid")
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    assert(columns.split(" ").length === 3, "三张摘要卡没有排成同一行");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    assert(!overflow, "调整后的首页出现横向溢出");
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(250);
    const compactOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    assert(!compactOverflow, "较窄桌面宽度下首页出现横向溢出");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(outputRoot, "issue-n7.png"),
      fullPage: true
    });
  },
  v1: async ({ page }) => {
    const dates = await page.evaluate(() => {
      const pad = (value) => String(value).padStart(2, "0");
      const key = (date) =>
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { today: key(today), yesterday: key(yesterday) };
    });
    const words = await readIndexedDb(page, "words");
    await putIndexedDb(page, "words", {
      ...words[0],
      status: "known",
      reviewStage: 1,
      dueDate: dates.today
    });
    await putIndexedDb(page, "settings", {
      key: "wordTarget",
      value: 999,
      updatedAt: new Date().toISOString()
    });
    await page.evaluate(
      ({ yesterday, today, wordIds }) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("dailyEnglishPersonal");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              "assignments",
              "readwrite"
            );
            const store = transaction.objectStore("assignments");
            store.clear();
            store.put({
              date: yesterday,
              wordIds,
              target: 999,
              createdAt: new Date().toISOString()
            });
            store.put({
              date: today,
              wordIds: [],
              target: 999,
              createdAt: new Date().toISOString()
            });
            transaction.oncomplete = () => {
              database.close();
              resolve(true);
            };
            transaction.onerror = () => reject(transaction.error);
          };
        }),
      {
        yesterday: dates.yesterday,
        today: dates.today,
        wordIds: words.map((word) => word.id)
      }
    );
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "每日单词");
    assert(
      (await page.locator(".word-focus").count()) === 1,
      "未完成的昨日单词没有进入今天的学习计划"
    );
    assert(
      (await page.locator(".word-focus__top .quiet-label").innerText()).trim() ===
        "1 / 119",
      "今天的单词计划没有按实际未完成数量生成"
    );
    assert(
      (await page.locator(".mini-word-list button").count()) === 119,
      "未完成单词的延续数量不正确"
    );
    const assignments = await readIndexedDb(page, "assignments");
    const todayAssignment = assignments.find(
      (assignment) => assignment.date === dates.today
    );
    assert(
      todayAssignment?.wordIds.length === 119,
      "今天实际分配数量没有限制为可学习单词数"
    );
    await navigate(page, "今日总览");
    assert(
      (await page.locator(".summary-card").first().innerText()).includes("0/119"),
      "首页错误地把未完成单词显示为已完成"
    );
    assert(
      !(await page.locator(".plan-row").first().getAttribute("class")).includes(
        "is-done"
      ),
      "首页把未完成的单词计划标记成完成"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-v1.png"),
      fullPage: true
    });
  },
  q1: async ({ page }) => {
    await navigate(page, "每日单词");
    const wordBank = await readIndexedDb(page, "words");

    for (let index = 0; index < 10; index += 1) {
      await page.locator(".word-navigation .study-choice--good").click();
      if (index < 9) {
        await page
          .locator(".word-focus__top .quiet-label")
          .filter({ hasText: `${index + 2} / 10` })
          .waitFor();
      }
    }
    await page
      .getByRole("heading", { name: /单词测试已解锁/ })
      .waitFor();

    const targetInput = page.locator(".target-control input");
    await targetInput.fill("15");
    await page.locator(".target-control button").click();
    await page
      .getByText("请先完成当前单词测试，再增加今日单词")
      .waitFor();
    assert(
      (await page.locator(".mini-word-list button").count()) === 10,
      "测试未完成时错误地增加了今日单词"
    );

    async function answerOne({ wrong = false } = {}) {
      const english = (await page.locator(".quiz-word").innerText()).trim();
      const word = wordBank.find((item) => item.english === english);
      assert(word, `测试中出现了未知单词 ${english}`);
      const options = page.locator(".daily-test-option");
      assert((await options.count()) === 4, "每题必须显示 4 个中文选项");
      const texts = await options.allTextContents();
      assert(
        new Set(texts.map((text) => text.trim())).size === 4,
        "测试选项存在重复"
      );
      const correctIndex = texts.findIndex((text) => text.includes(word.chinese));
      const answerIndex = wrong
        ? texts.findIndex((text) => !text.includes(word.chinese))
        : correctIndex;
      assert(correctIndex >= 0 && answerIndex >= 0, "没有找到测试答案");
      await options.nth(answerIndex).click();
      await page.locator(".quiz-feedback").waitFor();
      return { english, correct: word.chinese };
    }

    await page.getByRole("button", { name: /开始单词测试/ }).click();
    for (let index = 0; index < 10; index += 1) {
      await answerOne();
      await page
        .getByRole("button", {
          name: index === 9 ? /查看结果/ : /下一题/
        })
        .click();
    }
    await page.getByText("今天全部答对").waitFor();
    await page.getByRole("button", { name: "完成" }).click();
    await page.getByText("今日单词测试已通过").waitFor();

    const today = await page.evaluate(() => {
      const date = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    const firstAssignment = (
      await readIndexedDb(page, "assignments")
    ).find((item) => item.date === today);
    const firstBatchIds = new Set(firstAssignment.wordIds);
    await page
      .locator(".mini-word-list button")
      .filter({ hasText: "make" })
      .click();
    await page.locator(".word-navigation .study-choice--hard").click();
    await page.waitForTimeout(300);
    const preservedWord = (
      await readIndexedDb(page, "words")
    ).find((word) => word.english === "make");
    assert(
      preservedWord.dailyQuizPassedDate === today,
      "重新查看已通过单词时丢失了测试通过状态"
    );

    await targetInput.fill("15");
    await page.locator(".target-control button").click();
    await page.waitForTimeout(500);
    assert(
      (await page.locator(".mini-word-list button").count()) === 15,
      "测试通过后没有成功增加今日单词"
    );

    const refreshedWords = await readIndexedDb(page, "words");
    const assignments = await readIndexedDb(page, "assignments");
    const todayAssignment = assignments.find((item) => item.date === today);
    const wordMap = new Map(refreshedWords.map((word) => [word.id, word]));
    const newWords = todayAssignment.wordIds
      .map((id) => wordMap.get(id))
      .filter((word) => word && word.lastStudiedDate !== today);
    assert(newWords.length === 5, "新增的五个今日单词状态不正确");
    const focusedAfterIncrease = (
      await page.locator(".word-display h2").innerText()
    ).trim();
    assert(
      !firstBatchIds.has(
        refreshedWords.find((word) => word.english === focusedAfterIncrease)?.id
      ),
      "增加单词后仍停留在已经通过测试的旧单词"
    );
    for (let index = 0; index < newWords.length; index += 1) {
      const focused = (
        await page.locator(".word-display h2").innerText()
      ).trim();
      assert(
        newWords.some((word) => word.english === focused),
        "学习导航没有跳到下一个未学习的新单词"
      );
      await page.locator(".word-navigation .study-choice--good").click();
      await page.waitForTimeout(260);
    }
    await page
      .getByRole("button", { name: /开始单词测试|继续测试/ })
      .click();
    await page.locator(".quiz-word").waitFor();
    assert(
      (await page.locator(".modal__header .eyebrow").innerText()).trim().endsWith("/5"),
      "扩容后的测试错误地包含了已经通过的旧单词"
    );

    const wrongAnswer = await answerOne({ wrong: true });
    await page.getByRole("button", { name: /下一题/ }).click();
    for (let index = 1; index < 5; index += 1) {
      await answerOne();
      await page
        .getByRole("button", {
          name: index === 4 ? /查看结果/ : /下一题/
        })
        .click();
    }
    await page.getByText("有单词还需要继续学习").waitFor();
    assert(
      (await page.locator(".quiz-result--failed").innerText()).includes(
        wrongAnswer.english
      ),
      "答错的单词没有出现在未通过结果中"
    );
    await page.getByRole("button", { name: "完成" }).click();
    const failedWord = (
      await readIndexedDb(page, "words")
    ).find((word) => word.english === wrongAnswer.english);
    assert(
      failedWord.status === "unfamiliar" &&
        failedWord.lastStudiedDate !== today,
      "答错后单词仍然被错误标记为完成"
    );

    await targetInput.fill("20");
    await page.locator(".target-control button").click();
    await page
      .getByText("请先完成当前单词测试，再增加今日单词")
      .waitFor();

    await page
      .locator(".mini-word-list button")
      .filter({ hasText: wrongAnswer.english })
      .click();
    await page.locator(".word-navigation .study-choice--good").click();
    await page.waitForTimeout(300);
    await page
      .getByRole("button", { name: /开始单词测试|继续测试/ })
      .click();
    await page.locator(".daily-test-option").first().waitFor();
    assert(
      (await page.locator(".daily-test-option").count()) === 4,
      "补学后重测没有生成四个选项"
    );
    assert(
      (await page.locator(".modal__header .eyebrow").innerText()).trim().endsWith("/1"),
      "补学后的重测没有只包含未通过单词"
    );
    await answerOne();
    await page.getByRole("button", { name: /查看结果/ }).click();
    await page.getByText("今天全部答对").waitFor();
    await page.getByRole("button", { name: "完成" }).click();

    await targetInput.fill("20");
    await page.locator(".target-control button").click();
    await page.waitForTimeout(500);
    assert(
      (await page.locator(".mini-word-list button").count()) === 20,
      "最终通过测试后仍不能增加今日单词"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-q1.png"),
      fullPage: true
    });
  },
  q2: async ({ page }) => {
    await navigate(page, "每日单词");
    const wordBank = await readIndexedDb(page, "words");
    for (let index = 0; index < 10; index += 1) {
      await page.locator(".word-navigation .study-choice--good").click();
      if (index < 9) {
        await page
          .locator(".word-focus__top .quiet-label")
          .filter({ hasText: `${index + 2} / 10` })
          .waitFor();
      }
    }
    await page.getByRole("button", { name: /开始单词测试/ }).click();
    await page.locator(".quiz-word").waitFor();
    await page.getByRole("button", { name: /退出并保留进度/ }).click();
    const continueButton = page.getByRole("button", { name: /继续测试/ });
    await continueButton.waitFor();
    assert(await continueButton.isEnabled(), "关闭测试后“继续测试”按钮不可用");
    await continueButton.click();
    await page.locator(".quiz-word").waitFor();

    const english = (await page.locator(".quiz-word").innerText()).trim();
    const word = wordBank.find((item) => item.english === english);
    const options = page.locator(".daily-test-option");
    const optionTexts = await options.allTextContents();
    const correctIndex = optionTexts.findIndex((text) =>
      text.includes(word.chinese)
    );
    await options.nth(correctIndex).click();
    await page.locator(".quiz-feedback").waitFor();
    await page.locator('.modal button[aria-label="关闭"]').click();
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "每日单词");
    const resumedButton = page.getByRole("button", { name: /继续测试/ });
    await resumedButton.waitFor();
    await resumedButton.click();
    await page.locator(".quiz-word").waitFor();
    assert(
      (await page.locator(".modal__header .eyebrow").innerText()).trim().endsWith("/9"),
      "刷新后继续测试没有跳过已经答对的单词"
    );
    const remainingEnglish = (
      await page.locator(".quiz-word").innerText()
    ).trim();
    const remainingWord = wordBank.find(
      (item) => item.english === remainingEnglish
    );
    const remainingOptions = page.locator(".daily-test-option");
    const remainingTexts = await remainingOptions.allTextContents();
    const wrongIndex = remainingTexts.findIndex(
      (text) => !text.includes(remainingWord.chinese)
    );
    await remainingOptions.nth(wrongIndex).click();
    await page.locator(".quiz-feedback").waitFor();
    await page.getByRole("button", { name: /退出并保留进度/ }).click();
    await page
      .getByRole("heading", { name: /还有 1 个单词需要补学/ })
      .waitFor();
    const recoverButton = page.getByRole("button", {
      name: /补学未通过单词/
    });
    assert(await recoverButton.isEnabled(), "没有提供补学未通过单词的入口");
    await recoverButton.click();
    assert(
      (await page.locator(".word-display h2").innerText()).trim() ===
        remainingEnglish,
      "补学入口没有定位到答错的单词"
    );
    await page.locator(".word-navigation .study-choice--good").click();
    await page.waitForTimeout(350);
    const canContinue = page.getByRole("button", { name: /继续测试/ });
    await canContinue.waitFor();
    assert(await canContinue.isEnabled(), "补学后测试入口仍然不可用");
    await canContinue.click();
    await page.locator(".daily-test-option").first().waitFor();
    assert(
      (await page.locator(".daily-test-option").count()) === 4,
      "重新进入测试后没有生成题目"
    );
    await page.getByRole("button", { name: /退出并保留进度/ }).click();
    await page.screenshot({
      path: path.join(outputRoot, "issue-q2.png"),
      fullPage: true
    });
  },
  ui1: async ({ page }) => {
    const shell = page.locator(".app-shell");
    const expectedSeason = await page.evaluate(() => {
      const month = new Date().getMonth() + 1;
      if ([3, 4, 5].includes(month)) return "spring";
      if ([6, 7, 8].includes(month)) return "summer";
      if ([9, 10, 11].includes(month)) return "autumn";
      return "winter";
    });
    assert(
      (await shell.getAttribute("data-theme")) === expectedSeason,
      "页面没有根据当前季节设置背景"
    );
    assert(
      (await page.locator(".sidebar .season-indicator").innerText()).includes("季"),
      "界面没有显示当前季节"
    );

    const gradients = await shell.evaluate((element) => {
      const previousTheme = element.dataset.theme;
      const previousTransition = element.style.transition;
      element.style.transition = "none";
      const result = {};
      for (const season of ["spring", "summer", "autumn", "winter"]) {
        element.dataset.theme = season;
        result[season] = getComputedStyle(element).backgroundImage;
      }
      element.dataset.theme = previousTheme;
      element.style.transition = previousTransition;
      return result;
    });
    assert(
      new Set(Object.values(gradients)).size === 4,
      "四个季节使用了相同或缺失的背景渐变"
    );

    const cardStyle = await page.locator(".summary-card").first().evaluate(
      (element) => {
        const style = getComputedStyle(element);
        return {
          radius: parseFloat(style.borderRadius),
          borderWidth: style.borderTopWidth,
          blur: style.backdropFilter,
          color: style.color
        };
      }
    );
    assert(cardStyle.radius >= 22, "信息卡片圆角不足 22px");
    assert(
      cardStyle.borderWidth === "0px",
      "信息卡片仍然存在实体边框"
    );
    assert(cardStyle.blur.includes("blur"), "信息卡片没有启用背景模糊");
    assert(cardStyle.color.includes("255"), "卡片文字不是白色系");
    assert(
      !(await page.locator(".app-shell").innerText()).match(
        /温度|湿度|风速|气压|紫外线|降水概率/
      ),
      "英语应用中出现天气内容"
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(outputRoot, "issue-ui-desktop.png")
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    assert(
      (await page.locator(".sidebar").evaluate(
        (element) => getComputedStyle(element).display
      )) === "none",
      "移动端没有隐藏桌面侧边栏"
    );
    assert(
      (await page.locator(".bottom-nav").evaluate(
        (element) => getComputedStyle(element).display
      )) === "grid",
      "移动端没有显示底部导航"
    );
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      )),
      "移动端页面出现横向溢出"
    );
    await page.getByRole("button", { name: "每日单词" }).last().click();
    await page.locator(".word-focus").waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(outputRoot, "issue-ui-mobile.png")
    });
  },
  ui2: async ({ page }) => {
    const contrastResults = await page
      .locator(".app-shell")
      .evaluate((element) => {
        const previousTheme = element.dataset.theme;
        const result = {};
        for (const season of ["spring", "summer", "autumn", "winter"]) {
          element.dataset.theme = season;
          const style = getComputedStyle(element);
          result[season] = {
            surface: style.getPropertyValue("--readability-surface").trim(),
            primary: style.getPropertyValue("--text-primary").trim(),
            muted: style.getPropertyValue("--text-muted").trim(),
            background: style.backgroundImage
          };
        }
        element.dataset.theme = previousTheme;
        return result;
      });

    for (const [season, values] of Object.entries(contrastResults)) {
      const surface = parseColor(values.surface);
      const primaryRatio = contrastAgainstSurface(
        parseColor(values.primary),
        surface
      );
      const mutedRatio = contrastAgainstSurface(
        parseColor(values.muted),
        surface
      );
      assert(primaryRatio >= 4.5, `${season} 主文字对比度不足`);
      assert(mutedRatio >= 3, `${season} 辅助文字对比度不足`);
      assert(values.background !== "none", `${season} 背景渐变缺失`);
    }
    const textShadow = await page
      .locator(".home-hero h1")
      .evaluate((element) => getComputedStyle(element).textShadow);
    assert(textShadow !== "none", "主要文字缺少可读性阴影");
    await page.screenshot({
      path: path.join(outputRoot, "issue-ui-contrast.png")
    });
  },
  fix1: async ({ page }) => {
    const previousButton = page.getByRole("button", { name: "上个月" });
    const nextButton = page.getByRole("button", { name: "下个月" });
    await previousButton.scrollIntoViewIfNeeded();
    const styles = await previousButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color,
        borderWidth: style.borderTopWidth
      };
    });
    assert(styles.background !== "rgb(255, 255, 255)", "月份按钮仍是白色实底");
    assert(styles.color.includes("255"), "月份切换箭头不是白色系");
    assert(styles.borderWidth === "0px", "月份切换按钮仍带实体边框");
    const monthBefore = await page.locator(".calendar-navigation strong").innerText();
    await nextButton.click();
    const monthAfter = await page.locator(".calendar-navigation strong").innerText();
    assert(monthBefore !== monthAfter, "月份切换按钮没有实际功能");
    await page.locator(".activity-calendar").screenshot({
      path: path.join(outputRoot, "issue-fix1-calendar.png")
    });
  },
  fix2: async ({ page }) => {
    await navigate(page, "每日单词");
    const tabs = page.locator(".word-view-tabs");
    const styles = await tabs.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        padding: style.padding,
        radius: style.borderRadius,
        shadow: style.boxShadow
      };
    });
    assert(styles.background === "rgba(0, 0, 0, 0)", "切换按钮外层仍有背景");
    assert(styles.padding === "0px", "切换按钮外层仍保留胶囊内边距");
    assert(styles.radius === "0px", "切换按钮外层仍有圆角轮廓");
    assert(styles.shadow === "none", "切换按钮外层仍有阴影");
    assert(
      (await tabs.getByRole("tab").count()) === 3,
      "三个独立切换按钮数量不正确"
    );
    await tabs.screenshot({
      path: path.join(outputRoot, "issue-fix2-tabs.png")
    });
  },
  fix3: async ({ page }) => {
    const yesterday = await page.evaluate(() => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    const words = (await readIndexedDb(page, "words")).slice(0, 12);
    for (const word of words) {
      await putIndexedDb(page, "words", {
        ...word,
        status: "learning",
        dueDate: yesterday,
        lastStudiedDate: yesterday
      });
    }
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "间隔复习");
    const cards = page.locator(".due-word-grid > div");
    await cards.first().waitFor();
    assert((await cards.count()) >= 12, "复习词卡没有正常生成");
    const cardStyle = await cards.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        color: style.color
      };
    });
    assert(
      cardStyle.background !== "rgb(255, 255, 255)",
      "复习词卡仍然是白色实底"
    );
    assert(cardStyle.color.includes("255"), "复习词卡文字不是清晰白色");
    const firstWord = await cards.first().locator("span").innerText();
    assert(firstWord.trim().length > 0, "复习词卡内没有显示单词");
    await page.locator(".review-preview").screenshot({
      path: path.join(outputRoot, "issue-fix3-review-words.png")
    });
  },
  fix4: async ({ page }) => {
    await navigate(page, "口语练习");
    const selectors = [
      ".speaking-question",
      ".prompt-tips p",
      ".prompt-tips > div > span",
      ".reflection-heading p",
      ".reflection-footer > span"
    ];
    for (const selector of selectors) {
      const color = await page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).color);
      const channels = color.match(/\d+/g)?.slice(0, 3).map(Number) || [];
      assert(
        channels.length === 3 && channels.every((channel) => channel >= 200),
        `${selector} 仍使用难以辨认的深色`
      );
    }
    await page.locator(".speaking-prompt").screenshot({
      path: path.join(outputRoot, "issue-fix4-text.png")
    });
  },
  u0: async ({ page }) => {
    await page.goto("http://127.0.0.1:4190/?loading-preview=1", {
      waitUntil: "networkidle"
    });
    const glass = page.locator(".loading-glass");
    await glass.waitFor();
    const loadingSeason = await page
      .locator(".loading-screen")
      .getAttribute("data-theme");
    assert(
      ["spring", "summer", "autumn", "winter"].includes(loadingSeason),
      "启动页没有使用季节背景"
    );
    const styles = await glass.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        radius: parseFloat(style.borderRadius),
        blur: style.backdropFilter,
        color: style.color
      };
    });
    assert(styles.radius >= 22, "启动界面容器圆角不足");
    assert(styles.blur.includes("blur"), "启动界面没有玻璃模糊效果");
    assert(styles.color.includes("255"), "启动界面文字不是白色系");
    await page.screenshot({
      path: path.join(outputRoot, "issue-u0-loading.png")
    });
  },
  2: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.getByRole("tab", { name: /全部词库/ }).click();
    await page.locator(".word-bank-row").first().waitFor();
    assert(
      (await page.locator(".word-bank-row").count()) === 120,
      "全部词库应显示 120 个词"
    );
    await page.getByLabel("搜索词库").fill("because");
    assert(
      (await page.locator(".word-bank-row").count()) === 1,
      "词库搜索应只显示匹配单词"
    );
    assert(
      (await page.locator(".word-bank-row").innerText()).includes("因为"),
      "词库应显示对应中文释义"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-2.png"),
      fullPage: true
    });
  },
  3: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.getByRole("tab", { name: /全部词库/ }).click();
    const yesterday = await page.evaluate(() => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    await page.getByLabel("补记学习日期").fill(yesterday);
    await page.getByLabel("搜索词库").fill("because");
    await page.locator(".word-bank-row").click();
    await page.locator(".modal .study-choice--again").click();
    await page.waitForTimeout(300);
    const studyLogs = await readIndexedDb(page, "studyLogs");
    assert(
      studyLogs.some(
        (log) => log.english === "because" && log.date === yesterday
      ),
      "没有写入昨天对应单词的学习历史"
    );
    await navigate(page, "间隔复习");
    assert(
      (await page.locator("body").innerText()).includes("今天的记忆在等你"),
      "昨天标记为不熟的单词没有进入今日复习队列"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-3.png"),
      fullPage: true
    });
  },
  4: async ({ page }) => {
    await navigate(page, "每日单词");
    const targetInput = page.locator(".target-control input");
    await targetInput.fill("1000");
    await page.locator(".target-control button").click();
    await page.waitForTimeout(400);
    assert(
      (await targetInput.inputValue()) === "1000",
      "今日目标不应被限制为 50"
    );
    assert(
      (await page.locator(".word-focus__top .quiet-label").innerText()).trim() ===
        "1 / 120",
      "扩大今日目标后没有排入全部可用单词"
    );
    const settings = await readIndexedDb(page, "settings");
    const target = settings.find((item) => item.key === "wordTarget");
    assert(target?.value === 1000, "无限目标没有保存在本地设置中");
    await page.screenshot({
      path: path.join(outputRoot, "issue-4.png"),
      fullPage: true
    });
  },
  5: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.locator(".word-navigation .study-choice--again").click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /有印象/ }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: /已经认识/ }).click();
    await page.waitForTimeout(300);
    await page.getByRole("tab", { name: /全部词库/ }).click();

    const categoryExpectations = [
      ["还不熟", "unfamiliar", "make"],
      ["有印象", "learning", "should"],
      ["已经认识", "known", "because"]
    ];
    for (const [categoryIndex, [label, status, word]] of categoryExpectations.entries()) {
      const categoryButton = page
        .locator(".bank-status-tabs button")
        .nth(categoryIndex + 1);
      await categoryButton.click();
      await page
        .locator('.bank-status-tabs button[aria-pressed="true"]')
        .filter({ hasText: label })
        .waitFor();
      const rows = page.locator(".word-bank-row");
      assert((await rows.count()) === 1, `${label}分类数量不正确`);
      assert(
        (await rows.first().innerText()).includes(word),
        `${label}分类中没有刚标记的单词`
      );
      const settings = await readIndexedDb(page, "words");
      assert(
        settings.some((item) => item.english === word && item.status === status),
        `${label}按钮没有写入对应掌握状态`
      );
    }

    await navigate(page, "间隔复习");
    assert(
      (await page.locator(".review-category-grid").innerText()).includes("还不熟"),
      "复习页没有按掌握状态分类"
    );
    await page
      .locator(".review-category-grid button")
      .filter({ hasText: "还不熟" })
      .click();
    assert(
      (await page.locator(".review-card h2").innerText()).trim() === "make",
      "按“还不熟”分类没有启动对应单词的复习"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-5.png"),
      fullPage: true
    });
  },
  6: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.getByRole("button", { name: "生成默写卷" }).click();
    await page.getByLabel("选择单词").check();
    await page.getByLabel("搜索导出单词").fill("make");
    await page.getByLabel("选择 make").check();
    await page.getByLabel("搜索导出单词").fill("should");
    await page.getByLabel("选择 should").check();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /生成并下载/ }).click();
    const download = await downloadPromise;
    const outputPath = path.join(outputRoot, "issue-6-selected.docx");
    await download.saveAs(outputPath);
    const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
    const documentXml = await zip.file("word/document.xml").async("string");
    assert(documentXml.includes("make"), "选择导出的 Word 缺少 make");
    assert(documentXml.includes("should"), "选择导出的 Word 缺少 should");
    assert(!documentXml.includes("because"), "选择导出的 Word 混入了未选单词");
    await page.screenshot({
      path: path.join(outputRoot, "issue-6.png"),
      fullPage: true
    });
  },
  7: async ({ page }) => {
    await navigate(page, "口语练习");
    await page.getByLabel("导入口语文件").setInputFiles(sourceDocx);
    const importedSpeaking = page
      .locator(".material-select")
      .filter({ hasText: "中考688词汇默写卷.docx" });
    await importedSpeaking.waitFor();
    await importedSpeaking.click();
    assert(
      (await page.locator(".speaking-question").innerText()).includes("make"),
      "导入的口语 Word 素材没有显示正文"
    );

    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "口语练习");
    assert(
      (await page.locator(".material-select").filter({
        hasText: "中考688词汇默写卷.docx"
      }).count()) > 0,
      "刷新后口语导入来源丢失"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-7.png"),
      fullPage: true
    });
  },
  8: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.getByRole("tab", { name: /全部词库/ }).click();
    const yesterday = await page.evaluate(() => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    const today = await page.evaluate(() => {
      const date = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    });
    await page.getByLabel("补记学习日期").fill(yesterday);
    await page.getByLabel("搜索词库").fill("because");
    await page.locator(".word-bank-row").click();
    await page.locator(".modal .study-choice--again").click();

    await page.getByRole("tab", { name: /今日学习/ }).click();
    await page.locator(".word-navigation .study-choice--hard").click();
    await page.waitForTimeout(300);

    await navigate(page, "今日总览");
    const yesterdayCell = page.locator(`[data-date="${yesterday}"]`);
    await yesterdayCell.click();
    const detail = page.locator(".calendar-detail");
    assert(
      (await detail.innerText()).includes("单词") &&
        (await detail.innerText()).includes("1"),
      "日历没有显示昨天完成的单词学习"
    );
    await page.locator(`[data-date="${today}"]`).click();
    assert(
      (await detail.innerText()).includes("单词"),
      "日历没有显示今天完成的单词学习"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-8.png"),
      fullPage: true
    });
  },
  9: async ({ page }) => {
    const memo = page.getByLabel("今日快速备忘");
    await memo.fill("备份前的内容");
    await page.waitForTimeout(1200);
    const backups = await readIndexedDb(page, "backups");
    assert(backups.length > 0, "没有生成每日自动备份");
    assert(
      backups.at(-1).data.includes("备份前的内容"),
      "自动备份没有包含当前备忘内容"
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /下载完整备份/ }).click();
    const download = await downloadPromise;
    const backupPath = path.join(outputRoot, "issue-9-backup.json");
    await download.saveAs(backupPath);
    const backupJson = JSON.parse(await fs.readFile(backupPath, "utf8"));
    assert(
      JSON.stringify(backupJson).includes("备份前的内容"),
      "下载的完整备份没有包含学习数据"
    );

    await memo.fill("备份后被修改的内容");
    await page.waitForTimeout(1000);
    page.once("dialog", (dialog) => dialog.accept());
    const reloadPromise = page.waitForEvent("load", { timeout: 20_000 });
    await page.getByLabel("选择备份文件").setInputFiles(backupPath);
    await reloadPromise;
    await page.getByLabel("今日快速备忘").waitFor();
    await page.waitForTimeout(450);
    assert(
      (await page.getByLabel("今日快速备忘").inputValue()) === "备份前的内容",
      "恢复备份后数据没有回到备份时状态"
    );
    await page.screenshot({
      path: path.join(outputRoot, "issue-9.png"),
      fullPage: true
    });
  },
  10: async ({ page }) => {
    await navigate(page, "每日单词");
    await page.getByRole("tab", { name: /导入来源/ }).click();
    const wordSource = page.locator(".source-card");
    await wordSource.waitFor();
    assert(
      (await wordSource.count()) === 1,
      "每日单词没有显示导入来源"
    );
    assert(
      (await wordSource.innerText()).includes("内置示例词库") &&
        (await wordSource.innerText()).includes("120"),
      "单词导入来源没有显示文件名和单词数量"
    );

    await navigate(page, "口语练习");
    await page.getByLabel("导入口语文件").setInputFiles(sourceDocx);
    const speakingSource = page
      .locator(".material-strip__list button")
      .filter({ hasText: "中考688词汇默写卷.docx" });
    await speakingSource.waitFor();
    assert(
      (await speakingSource.innerText()).includes("DOCX"),
      "口语导入来源没有显示文件格式"
    );

    await page.screenshot({
      path: path.join(outputRoot, "issue-10.png"),
      fullPage: true
    });
  }
};

if (!tests[issue]) {
  console.error(`No test registered for issue ${issue || "(empty)"}`);
  process.exit(1);
}

const app = await openApp();
try {
  await tests[issue](app);
  console.log(
    JSON.stringify({
      ok: true,
      issue,
      test: `scripts/issue-tests.mjs ${issue}`
    })
  );
} finally {
  await app.close().catch(async (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
