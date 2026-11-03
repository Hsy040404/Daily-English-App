import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const CELL_BORDER = "AEB8B3";
const HEADER_FILL = "F1F4F2";
const ENGLISH_FONT = "Times New Roman";

function textRun(text, options = {}) {
  return new TextRun({
    text,
    font: options.font || "Arial",
    size: options.size || 21,
    bold: options.bold || false,
    color: options.color || "17231E",
    ...options
  });
}

function paragraph(text, options = {}) {
  return new Paragraph({
    alignment: options.alignment,
    spacing: options.spacing || { before: 0, after: 80 },
    keepNext: options.keepNext,
    children: [
      textRun(text, {
        font: options.font,
        size: options.size,
        bold: options.bold,
        color: options.color
      })
    ]
  });
}

function cell(text, options = {}) {
  return new TableCell({
    width: { size: options.width || 25, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    shading: options.header
      ? { type: ShadingType.CLEAR, fill: HEADER_FILL, color: "auto" }
      : undefined,
    margins: { top: 48, bottom: 48, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: options.keepNext,
        spacing: { before: 0, after: 0 },
        children: [
          textRun(text, {
            font: options.chinese ? "SimSun" : ENGLISH_FONT,
            size: options.header ? 21 : 20,
            bold: Boolean(options.header)
          })
        ]
      })
    ]
  });
}

function buildTable(words, direction) {
  const englishToChinese = direction === "en";
  const headers = englishToChinese
    ? ["英文", "中文默写", "英文", "中文默写"]
    : ["中文", "英文默写", "中文", "英文默写"];
  const padded = [...words];
  if (padded.length % 2 !== 0) padded.push(null);
  const rows = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      height: { value: 340, rule: HeightRule.ATLEAST },
      children: headers.map((header, index) =>
        cell(header, { header: true, chinese: index % 2 === 0, keepNext: true })
      )
    })
  ];

  for (let offset = 0; offset < padded.length; offset += 2) {
    const left = padded[offset];
    const right = padded[offset + 1];
    const leftPrompt = left ? (englishToChinese ? left.english : left.chinese) : "";
    const rightPrompt = right
      ? englishToChinese
        ? right.english
        : right.chinese
      : "";
    rows.push(
      new TableRow({
        cantSplit: true,
        height: { value: 520, rule: HeightRule.ATLEAST },
        children: [
          cell(leftPrompt, {
            chinese: !englishToChinese,
            keepNext: offset < padded.length - 2
          }),
          cell("", { keepNext: offset < padded.length - 2 }),
          cell(rightPrompt, {
            chinese: !englishToChinese,
            keepNext: offset < padded.length - 2
          }),
          cell("", { keepNext: offset < padded.length - 2 })
        ]
      })
    );
  }

  return rows;
}

function createQuizTable(words, direction) {
  const table = buildTable(words, direction);
  return new Table({
    rows: table,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
      left: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
      right: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D6DCD9" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D6DCD9" }
    }
  });
}

function sectionHeading(pageNumber, direction, dayStart, dayEnd) {
  const directionText = direction === "en" ? "英译中" : "中译英";
  const week = Math.floor((dayStart - 1) / 6) + 1;
  const endWeek = Math.floor((dayEnd - 1) / 6) + 1;
  const weekStart = ((dayStart - 1) % 6) + 1;
  const weekEnd = ((dayEnd - 1) % 6) + 1;
  let rangeLabel;
  if (week !== endWeek) {
    rangeLabel = `第${week}周 Day${weekStart}-第${endWeek}周 Day${weekEnd}`;
  } else {
    rangeLabel =
      weekStart === weekEnd
        ? `第${week}周 Day${weekStart}`
        : `第${week}周 Day${weekStart}-Day${weekEnd}`;
  }
  return [
    paragraph(`P${pageNumber}  ${directionText}  |  ${rangeLabel}`, {
      size: 28,
      bold: true,
      font: "Microsoft YaHei",
      spacing: { before: 0, after: 120 },
      keepNext: true
    })
  ];
}

function dayHeading(day, words) {
  const start = words[0]?.globalIndex || 1;
  const end = words.at(-1)?.globalIndex || start + 9;
  return paragraph(`Day${day}（词汇${start}-${end}）`, {
    size: 22,
    bold: true,
    font: "Microsoft YaHei",
    spacing: { before: 70, after: 55 },
    keepNext: true
  });
}

function answerKey(words) {
  const header = new TableRow({
    tableHeader: true,
    children: ["序号", "英文", "中文"].map((text, index) =>
      cell(text, {
        header: true,
        chinese: text !== "英文",
        width: [10, 42, 48][index]
      })
    )
  });
  const rows = words.map(
    (word, index) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell(String(index + 1), { width: 10 }),
          cell(word.english, { width: 42 }),
          cell(word.chinese, { chinese: true, width: 48 })
        ]
      })
  );

  return [
    new Paragraph({
      children: [new PageBreak()]
    }),
    paragraph("默写答案", {
      size: 28,
      bold: true,
      font: "Microsoft YaHei",
      spacing: { before: 0, after: 160 }
    }),
    new Table({
      rows: [header, ...rows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
        bottom: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
        left: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
        right: { style: BorderStyle.SINGLE, size: 6, color: CELL_BORDER },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D6DCD9" },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D6DCD9" }
      }
    })
  ];
}

export async function exportQuizDocx(words, options = {}) {
  const parsedWordsPerDay = Math.floor(Number(options.wordsPerDay));
  const parsedDaysPerPage = Math.floor(Number(options.daysPerPage));
  const wordsPerDay =
    Number.isFinite(parsedWordsPerDay) && parsedWordsPerDay > 0
      ? parsedWordsPerDay
      : 10;
  const daysPerPage =
    Number.isFinite(parsedDaysPerPage) && parsedDaysPerPage > 0
      ? parsedDaysPerPage
      : 3;
  const days = [];
  const prepared = [...words]
    .filter((word) => word.english && word.chinese)
    .map((word, index) => ({ ...word, globalIndex: index + 1 }));

  for (let index = 0; index < prepared.length; index += wordsPerDay) {
    days.push(prepared.slice(index, index + wordsPerDay));
  }

  const children = [];
  let pageNumber = 1;
  const chunks = [];
  for (let index = 0; index < days.length; index += daysPerPage) {
    chunks.push(days.slice(index, index + daysPerPage));
  }

  chunks.forEach((chunk, chunkIndex) => {
    for (const direction of ["en", "cn"]) {
      if (children.length) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }
      const firstDay = chunkIndex * daysPerPage + 1;
      const lastDay = Math.min(
        firstDay + chunk.length - 1,
        Math.ceil(prepared.length / wordsPerDay)
      );
      children.push(...sectionHeading(pageNumber, direction, firstDay, lastDay));
      pageNumber += 1;

      chunk.forEach((dayWords, localIndex) => {
        const displayDay = ((firstDay + localIndex - 1) % 6) + 1;
        children.push(dayHeading(displayDay, dayWords));
        for (let offset = 0; offset < dayWords.length; offset += 10) {
          children.push(
            createQuizTable(dayWords.slice(offset, offset + 10), direction)
          );
        }
      });
    }
  });

  if (options.includeAnswers) {
    children.push(...answerKey(prepared));
  }

  const document = new Document({
    creator: "每日英语",
    title: "中考英语词汇默写卷",
    description: "个人英语学习默写练习",
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: 720, right: 820, bottom: 680, left: 820 }
          }
        },
        children
      }
    ]
  });

  return Packer.toBlob(document);
}

export function quizPageCount(wordCount, wordsPerDay = 10, daysPerPage = 3) {
  const perDay = Math.max(1, Number(wordsPerDay) || 1);
  const perPage = Math.max(1, Number(daysPerPage) || 1);
  const days = Math.ceil(wordCount / perDay);
  const chunks = Math.ceil(days / perPage);
  return chunks * 2;
}
