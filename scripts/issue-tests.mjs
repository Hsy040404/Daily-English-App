import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(currentDir, "..");
const distDir = path.join(projectDir, "dist");
const outputRoot =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\issue-tests";
const edgePath =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sourceDocx = "C:\\Users\\86152\\Desktop\\中考688词汇默写卷.docx";
const sourcePdf =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\docx-review\\source-preview.pdf";
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

const tests = {
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
    await page
      .getByRole("button", { name: /中考688词汇默写卷\.docx/ })
      .waitFor();
    await page
      .getByRole("button", { name: /中考688词汇默写卷\.docx/ })
      .click();
    assert(
      (await page.locator(".speaking-question").innerText()).includes("make"),
      "导入的口语 Word 素材没有显示正文"
    );

    await navigate(page, "英语阅读");
    await page.getByLabel("导入阅读文件").setInputFiles(sourcePdf);
    const importedTab = page
      .getByRole("button", { name: /source-preview/ })
      .first();
    await importedTab.waitFor({ timeout: 30_000 });
    await importedTab.click();
    assert(
      (await page.locator(".article-body").innerText()).includes("make"),
      "导入的 PDF 阅读材料没有显示正文"
    );

    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "口语练习");
    assert(
      (await page.getByRole("button", { name: /中考688词汇默写卷\.docx/ }).count()) > 0,
      "刷新后口语导入来源丢失"
    );
    await navigate(page, "英语阅读");
    assert(
      (await page.getByRole("button", { name: /source-preview/ }).count()) > 0,
      "刷新后阅读导入来源丢失"
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

    await navigate(page, "英语阅读");
    await page.getByRole("button", { name: /标记今天已读完/ }).click();
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
      (await detail.innerText()).includes("阅读"),
      "日历没有显示今天的阅读完成记录"
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
