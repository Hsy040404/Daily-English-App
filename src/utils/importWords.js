import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const chinesePattern = /[\u3400-\u9fff]/;
const englishPattern = /[A-Za-z]/;
const ignoredTextPattern =
  /^(p\s*\d+|day\s*\d+|第\s*[一二三四五六七八九十\d]+\s*周|英译中|中译英|英文默写|中文默写|英文|中文|词汇\s*\d+\s*[-—–至]\s*\d+)/i;

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isIgnored(text) {
  return !text || ignoredTextPattern.test(text) || /词汇\s*\d+/.test(text);
}

function isEnglishPrompt(text) {
  const value = cleanText(text);
  return (
    value.length > 0 &&
    value.length <= 80 &&
    englishPattern.test(value) &&
    !chinesePattern.test(value) &&
    !isIgnored(value)
  );
}

function isChinesePrompt(text) {
  const value = cleanText(text);
  return (
    value.length > 0 &&
    value.length <= 100 &&
    chinesePattern.test(value) &&
    !isIgnored(value)
  );
}

function dedupePairs(pairs) {
  const seen = new Map();
  for (const pair of pairs) {
    const english = cleanText(pair.english);
    const chinese = cleanText(pair.chinese);
    if (!isEnglishPrompt(english) || !isChinesePrompt(chinese)) continue;
    const id = english.toLocaleLowerCase("en");
    if (!seen.has(id)) seen.set(id, { english, chinese });
  }
  return [...seen.values()];
}

function extractPairsFromLines(text) {
  const pairs = [];
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);

  for (const line of lines) {
    const tabParts = line.split(/\t+/).map(cleanText).filter(Boolean);
    if (tabParts.length >= 2) {
      const englishPart = tabParts.find(
        (part) => englishPattern.test(part) && !chinesePattern.test(part)
      );
      const chinesePart = tabParts.find((part) => chinesePattern.test(part));
      if (englishPart && chinesePart) {
        pairs.push({ english: englishPart, chinese: chinesePart });
        continue;
      }
    }

    const englishFirst = line.match(
      /^([A-Za-z][A-Za-z0-9'’.\- ]{0,60}?)\s{2,}([\u3400-\u9fff][\u3400-\u9fff；;，,、：:（）()…\s]{0,80})$/
    );
    if (englishFirst) {
      pairs.push({ english: englishFirst[1], chinese: englishFirst[2] });
      continue;
    }

    const chineseFirst = line.match(
      /^([\u3400-\u9fff][\u3400-\u9fff；;，,、：:（）()…\s]{0,80}?)\s{2,}([A-Za-z][A-Za-z0-9'’.\- ]{0,60})$/
    );
    if (chineseFirst) {
      pairs.push({ english: chineseFirst[2], chinese: chineseFirst[1] });
    }
  }
  return pairs;
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  const document = new DOMParser().parseFromString(htmlResult.value, "text/html");
  const paired = [];
  const englishPrompts = [];
  const chinesePrompts = [];

  for (const table of document.querySelectorAll("table")) {
    for (const row of table.querySelectorAll("tr")) {
      const cells = [...row.querySelectorAll("td, th")].map((cell) =>
        cleanText(cell.textContent)
      );
      if (!cells.length) continue;

      const englishCells = cells.filter(
        (cell) => isEnglishPrompt(cell) && !chinesePattern.test(cell)
      );
      const chineseCells = cells.filter(isChinesePrompt);

      if (englishCells.length && chineseCells.length) {
        const count = Math.min(englishCells.length, chineseCells.length);
        for (let index = 0; index < count; index += 1) {
          paired.push({
            english: englishCells[index],
            chinese: chineseCells[index]
          });
        }
      } else if (englishCells.length) {
        englishPrompts.push(...englishCells);
      } else if (chineseCells.length) {
        chinesePrompts.push(...chineseCells);
      }
    }
  }

  const alignedCount = Math.min(englishPrompts.length, chinesePrompts.length);
  for (let index = 0; index < alignedCount; index += 1) {
    paired.push({
      english: englishPrompts[index],
      chinese: chinesePrompts[index]
    });
  }

  if (!paired.length) {
    const rawResult = await mammoth.extractRawText({ arrayBuffer });
    paired.push(...extractPairsFromLines(rawResult.value));
  }

  return {
    pairs: dedupePairs(paired),
    warnings: htmlResult.messages?.map((message) => message.message) || []
  };
}

function groupPdfRows(items) {
  const rows = [];
  const sorted = [...items]
    .filter((item) => cleanText(item.str))
    .sort((a, b) => b.transform[5] - a.transform[5]);

  for (const item of sorted) {
    const y = item.transform[5];
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ y, items: [item] });
    }
  }

  return rows.map((row) => {
    const sortedItems = row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    const clusters = [];
    for (const item of sortedItems) {
      const text = cleanText(item.str);
      if (!text) continue;
      const x = item.transform[4];
      const previous = clusters.at(-1);
      if (previous && x - previous.end <= 20) {
        previous.text = cleanText(`${previous.text} ${text}`);
        previous.end = Math.max(previous.end, x + (item.width || 0));
      } else {
        clusters.push({
          text,
          start: x,
          end: x + (item.width || 0)
        });
      }
    }
    return clusters.map((cluster) => cluster.text);
  });
}

async function parsePdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const paired = [];
  const englishPrompts = [];
  const chinesePrompts = [];
  const warnings = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const rows = groupPdfRows(textContent.items);

    for (const row of rows) {
      const englishCells = row.filter(
        (cell) => isEnglishPrompt(cell) && !chinesePattern.test(cell)
      );
      const chineseCells = row.filter(isChinesePrompt);

      if (englishCells.length && chineseCells.length) {
        const count = Math.min(englishCells.length, chineseCells.length);
        for (let index = 0; index < count; index += 1) {
          paired.push({
            english: englishCells[index],
            chinese: chineseCells[index]
          });
        }
      } else if (englishCells.length) {
        englishPrompts.push(...englishCells);
      } else if (chineseCells.length) {
        chinesePrompts.push(...chineseCells);
      }
    }
  }

  const alignedCount = Math.min(englishPrompts.length, chinesePrompts.length);
  if (alignedCount) {
    for (let index = 0; index < alignedCount; index += 1) {
      paired.push({
        english: englishPrompts[index],
        chinese: chinesePrompts[index]
      });
    }
  }

  if (englishPrompts.length !== chinesePrompts.length) {
    warnings.push(
      `PDF 中识别到 ${englishPrompts.length} 个英文提示、${chinesePrompts.length} 个中文提示，已按相同顺序配对。`
    );
  }

  return { pairs: dedupePairs(paired), warnings };
}

export async function parseWordFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "docx") return parseDocx(file);
  if (extension === "pdf") return parsePdf(file);
  throw new Error("目前只支持 .docx 和文字型 .pdf 文件");
}
