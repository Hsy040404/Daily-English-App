import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(projectDir, "dist");

function run(label, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectDir,
      stdio: "inherit",
      env: { ...process.env, ...env }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}`));
        return;
      }
      console.log(`${label}: passed (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
      resolve();
    });
  });
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf"
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    let requested = decodeURIComponent(url.pathname);
    if (requested === "/") requested = "/index.html";
    let filePath = path.join(distDir, requested.replace(/^\/+/, ""));
    let body;
    try {
      body = await fs.readFile(filePath);
    } catch {
      filePath = path.join(distDir, "index.html");
      body = await fs.readFile(filePath);
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});

await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
try {
  for (let issue = 2; issue <= 10; issue += 1) {
    await run(`Issue ${issue}`, ["scripts/issue-tests.mjs", String(issue)]);
  }
  for (let issue = 2; issue <= 7; issue += 1) {
    await run(`New issue ${issue}`, ["scripts/issue-tests.mjs", `n${issue}`]);
  }
  await run("Oversized unfinished plan", ["scripts/issue-tests.mjs", "v1"]);
  await run("Daily word test gate", ["scripts/issue-tests.mjs", "q1"]);
  await run("Daily quiz resume", ["scripts/issue-tests.mjs", "q2"]);
  await run("Liquid glass visual layer", ["scripts/issue-tests.mjs", "ui1"]);
  await run("Seasonal text contrast", ["scripts/issue-tests.mjs", "ui2"]);
  await run("Calendar navigation visibility", ["scripts/issue-tests.mjs", "fix1"]);
  await run("Word tabs outer background", ["scripts/issue-tests.mjs", "fix2"]);
  await run("Review word card contrast", ["scripts/issue-tests.mjs", "fix3"]);
  await run("Text color readability", ["scripts/issue-tests.mjs", "fix4"]);
  await run("Completed state readability", ["scripts/issue-tests.mjs", "fix5"]);
  await run("Manual season switching", ["scripts/issue-tests.mjs", "fix6"]);
  await run("Liquid glass loading screen", ["scripts/issue-tests.mjs", "u0"]);
  await run("Seasonal background mapping", ["scripts/test-season.mjs"]);
  await run("Answer page export", ["scripts/test-answer-export.mjs"]);
  await run("Full end-to-end workflow", ["scripts/e2e.mjs"], {
    BASE_URL: "http://127.0.0.1:4173"
  });
  console.log("\nAll automated tests passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
