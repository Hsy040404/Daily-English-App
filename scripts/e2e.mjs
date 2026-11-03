import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "http://127.0.0.1:4173";
const edgePath =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const outputDir =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\app-e2e";
const sourcePdf =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\docx-review\\source-preview.pdf";
const sourceDocx = "C:\\Users\\86152\\Desktop\\中考688词汇默写卷.docx";

await fs.mkdir(outputDir, { recursive: true });
const profileDir = path.join(outputDir, `profile-${Date.now()}`);
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
let restartContext = null;

const page = context.pages()[0] || (await context.newPage());
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function shot(name) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true
  });
}

async function navigate(label) {
  await page.locator(".main-nav button").filter({ hasText: label }).click();
  await page.waitForTimeout(250);
}

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /今天继续积累/ }).waitFor();
  assert(
    (await page.locator("body").innerText()).includes("词库共 120 词"),
    "内置示例词库没有导入 120 个词"
  );
  await page.getByLabel("今日快速备忘").fill("今天重点复习不规则动词。");
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "networkidle" });
  assert(
    (await page.getByLabel("今日快速备忘").inputValue()) ===
      "今天重点复习不规则动词。",
    "刷新后快速备忘没有保留"
  );
  await shot("01-home");

  await navigate("每日单词");
  assert((await page.locator(".word-focus").count()) > 0, "未能切换到每日单词页面");
  await page.getByRole("button", { name: /显示中文释义/ }).click();
  assert(
    (await page.locator(".meaning-area").innerText()).includes("制造"),
    "单词释义没有显示"
  );
  await page.getByRole("button", { name: /还不熟/ }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  await navigate("每日单词");
  assert((await page.locator(".word-focus").count()) > 0, "刷新后无法返回单词页面");
  assert(
    (await page.locator(".word-list .quiet-label").innerText()).trim() === "1/10",
    "单词学习进度没有持久化"
  );
  await shot("02-words");

  await page.locator('input[type="file"]').setInputFiles(sourceDocx);
  await page.getByRole("heading", { name: "识别到 120 组词对" }).waitFor();
  await page.getByRole("button", { name: "取消" }).click();

  await page.locator('input[type="file"]').setInputFiles(sourcePdf);
  await page.getByRole("heading", { name: "识别到 120 组词对" }).waitFor({
    timeout: 30_000
  });
  await shot("03-pdf-import-preview");
  await page.getByRole("button", { name: "取消" }).click();

  await page.getByRole("button", { name: "生成默写卷" }).click();
  await page.getByRole("heading", { name: "生成默写卷" }).waitFor();
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "生成并下载" }).click();
  const download = await downloadPromise;
  const generatedPath = path.join(outputDir, "generated-quiz.docx");
  await download.saveAs(generatedPath);
  assert((await fs.stat(generatedPath)).size > 10_000, "生成的 Word 文件异常");

  await navigate("口语练习");
  await page.locator(".recording-panel").waitFor();
  await page.getByRole("button", { name: "开始录音" }).click();
  await page.getByRole("button", { name: "停止并保存" }).waitFor();
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "停止并保存" }).click();
  await page.locator("audio").waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "4" }).click();
  await page.getByRole("button", { name: /保存练习记录/ }).click();
  await shot("04-speaking");

  await navigate("英语阅读");
  await page.locator(".reading-sheet").waitFor();
  await page.locator(".reading-word").first().click();
  await page
    .getByPlaceholder("填写释义后加入词库")
    .fill("许多；很多");
  await page.getByRole("button", { name: /加入每日单词/ }).click();
  await page.getByPlaceholder("摘录最值得记住的一句英文").fill(
    "A routine becomes useful when it is simple enough to repeat."
  );
  await page.getByRole("button", { name: /保存笔记/ }).click();
  await page.getByRole("button", { name: /标记今天已读完/ }).click();
  await shot("05-reading");

  await navigate("间隔复习");
  await page.locator(".review-overview").waitFor();
  await page.getByRole("button", { name: /复习今日单词/ }).click();
  await page.getByRole("button", { name: /查看答案/ }).click();
  await page.getByRole("button", { name: /有点模糊/ }).click();
  await page.waitForTimeout(300);
  await shot("06-review");

  await navigate("今日总览");
  await page.waitForTimeout(500);
  await shot("07-home-after");
  assert(errors.length === 0, `浏览器运行错误:\n${errors.join("\n")}`);

  await context.close();
  restartContext = await chromium.launchPersistentContext(profileDir, {
    executablePath: edgePath,
    headless: true,
    viewport: { width: 1440, height: 1000 }
  });
  const restartPage =
    restartContext.pages()[0] || (await restartContext.newPage());
  restartPage.on("pageerror", (error) =>
    errors.push(`restart pageerror: ${error.message}`)
  );
  restartPage.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`restart console: ${message.text()}`);
    }
  });
  await restartPage.goto(baseUrl, { waitUntil: "networkidle" });
  await restartPage.getByLabel("今日快速备忘").waitFor();
  assert(
    (await restartPage.getByLabel("今日快速备忘").inputValue()) ===
      "今天重点复习不规则动词。",
    "关闭并重新打开浏览器后备忘没有保留"
  );
  assert(
    (await restartPage.locator("body").innerText()).includes("词库共 121 词"),
    "关闭并重新打开浏览器后词库没有保留"
  );
  await restartPage.screenshot({
    path: path.join(outputDir, "08-restart-persistence.png"),
    fullPage: true
  });
  assert(errors.length === 0, `重启后浏览器运行错误:\n${errors.join("\n")}`);

  const result = {
    ok: true,
    wordCount: 120,
    restartPersistence: true,
    generatedDocx: generatedPath,
    generatedBytes: (await fs.stat(generatedPath)).size,
    screenshots: [
      "01-home.png",
      "02-words.png",
      "03-pdf-import-preview.png",
      "04-speaking.png",
      "05-reading.png",
      "06-review.png",
      "07-home-after.png",
      "08-restart-persistence.png"
    ],
    consoleErrors: errors
  };
  await fs.writeFile(
    path.join(outputDir, "result.json"),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("E2E_FAILED", error);
  console.error("BROWSER_ERRORS", errors);
  throw error;
} finally {
  await context.close().catch(() => {});
  await restartContext?.close();
}
