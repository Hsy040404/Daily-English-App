import fs from "node:fs/promises";
import { exportQuizDocx } from "../src/utils/exportQuizDocx.js";

const words = [
  ["make", "制造；做"],
  ["should", "应该"],
  ["because", "因为"],
  ["most", "最；最多的"],
  ["other", "其他的"],
  ["play", "玩；游戏"],
  ["know", "知道；认识"],
  ["need", "需要"],
  ["learn", "学习；学会"],
  ["just", "正好；仅仅"]
].map(([english, chinese]) => ({ english, chinese }));

const blob = await exportQuizDocx(words, {
  wordsPerDay: 10,
  daysPerPage: 3,
  includeAnswers: true
});
const output =
  "C:\\Users\\86152\\.codex\\visualizations\\2026\\11\\02\\01a19cca-5312-7ea3-9772-54051b508846\\app-e2e\\generated-with-answers.docx";
await fs.writeFile(output, Buffer.from(await blob.arrayBuffer()));
console.log(JSON.stringify({ output, bytes: blob.size }, null, 2));
