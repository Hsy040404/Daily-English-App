import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(currentDir, "..");
const distDir = path.join(projectDir, "dist");
const outputRoot =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\issue-tests";
const edgePath =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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
    await page.getByRole("button", { name: /还不熟/ }).click();
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
