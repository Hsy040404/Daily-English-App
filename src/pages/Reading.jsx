import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookmarkCheck,
  Check,
  ChevronRight,
  CircleHelp,
  FileUp,
  Highlighter,
  Languages,
  NotebookPen,
  Plus,
  Save
} from "lucide-react";
import {
  db,
  saveImportedMaterial,
  saveWordPairs,
  setSetting
} from "../db";
import { readings } from "../data/content";
import { readingMaterialsToArticles } from "../utils/materials";
import { localDateKey } from "../utils/date";
import { PageHeading } from "../components/ui";

function ClickableParagraph({ text, onSelectWord }) {
  const pieces = text.split(/(\b[A-Za-z][A-Za-z'-]*\b)/g);
  return (
    <p>
      {pieces.map((piece, index) => {
        if (!/^[A-Za-z][A-Za-z'-]*$/.test(piece)) return piece;
        return (
          <button
            className="reading-word"
            key={`${piece}-${index}`}
            onClick={() => onSelectWord(piece)}
            title={`添加 “${piece}” 到生词本`}
          >
            {piece}
          </button>
        );
      })}
    </p>
  );
}

export default function Reading({ data, refresh, showToast }) {
  const [articleId, setArticleId] = useState(data.currentArticleId);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef(null);
  const allArticles = useMemo(
    () => [...readings, ...readingMaterialsToArticles(data.materials)],
    [data.materials]
  );
  const article =
    allArticles.find((item) => item.id === articleId) || allArticles[0];
  const record = data.readingRecords.find((item) => item.id === article.id);
  const [notes, setNotes] = useState(record?.notes || "");
  const [keySentence, setKeySentence] = useState(record?.keySentence || "");
  const [selectedWord, setSelectedWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState(
    Number.isInteger(record?.questionAnswer) ? record.questionAnswer : null
  );
  const [savedState, setSavedState] = useState("已保存");

  const completedCount = data.readingRecords.filter((item) => item.completedDate).length;
  const completedToday = record?.completedDate === localDateKey();
  const completion = (completedCount / allArticles.length) * 100;

  useEffect(() => {
    const nextRecord = data.readingRecords.find((item) => item.id === article.id);
    setNotes(nextRecord?.notes || "");
    setKeySentence(nextRecord?.keySentence || "");
    setSelectedAnswer(
      Number.isInteger(nextRecord?.questionAnswer)
        ? nextRecord.questionAnswer
        : null
    );
    setSavedState("已保存");
  }, [article.id]);

  const wordLookup = useMemo(
    () => new Map(data.words.map((word) => [word.id, word])),
    [data.words]
  );

  async function changeArticle(id) {
    setArticleId(id);
    setSelectedWord("");
    setDefinition("");
    await setSetting("currentArticleId", id);
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { extractPlainTextFromFile } = await import("../utils/importWords");
      const extracted = await extractPlainTextFromFile(file);
      const id = await saveImportedMaterial({
        module: "reading",
        fileName: file.name,
        format: extracted.format,
        text: extracted.text
      });
      const nextArticleId = `material-${id}`;
      await setSetting("currentArticleId", nextArticleId);
      setArticleId(nextArticleId);
      await refresh();
      showToast(`阅读材料“${file.name}”已导入`);
    } catch (error) {
      console.error(error);
      showToast(`导入阅读材料失败：${error.message}`, "error");
    } finally {
      setImporting(false);
    }
  }

  async function persist(patch, message) {
    const previous = await db.readings.get(article.id);
    await db.readings.put({
      ...previous,
      id: article.id,
      notes,
      keySentence,
      questionAnswer: selectedAnswer,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    await refresh({ light: true });
    if (message) showToast(message);
  }

  async function saveNotes() {
    setSavedState("保存中");
    await persist({}, "阅读笔记已保存");
    setSavedState("已保存");
  }

  async function markComplete() {
    const today = localDateKey();
    const existingCompletion = await db.readingCompletions
      .where("[date+articleId]")
      .equals([today, article.id])
      .first();
    if (!existingCompletion) {
      await db.readingCompletions.add({
        date: today,
        articleId: article.id,
        title: article.title,
        completedAt: new Date().toISOString()
      });
    }
    await persist(
      {
        completedDate: today,
        completedCount:
          (record?.completedCount || 0) + (existingCompletion ? 0 : 1)
      },
      "今天的阅读已完成"
    );
  }

  function selectAnswer(index) {
    setSelectedAnswer(index);
    const previous = data.readingRecords.find((item) => item.id === article.id);
    db.readings.put({
      ...previous,
      id: article.id,
      notes,
      keySentence,
      questionAnswer: index,
      updatedAt: new Date().toISOString()
    });
    refresh({ light: true });
  }

  async function addSelectedWord() {
    if (!selectedWord || !definition.trim()) {
      showToast("请填写这个词的中文意思", "error");
      return;
    }
    const result = await saveWordPairs(
      [{ english: selectedWord, chinese: definition }],
      `阅读 · ${article.title}`
    );
    const existing = wordLookup.get(selectedWord.toLocaleLowerCase("en"));
    if (existing) {
      await db.words.update(existing.id, {
        status: "unfamiliar",
        note: `来自阅读：${article.title}`,
        updatedAt: new Date().toISOString()
      });
    }
    setSelectedWord("");
    setDefinition("");
    await refresh();
    showToast(
      result.added
        ? `“${selectedWord}” 已加入词库`
        : `“${selectedWord}” 已在词库中，并标记为待加强`
    );
  }

  return (
    <div className="page reading-page">
      <PageHeading
        eyebrow="READING"
        title="英语阅读"
        description="读完整意思，而不是逐字翻译。点按单词可加入生词本。"
        actions={
          <>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              aria-label="导入阅读文件"
              onChange={handleImport}
            />
            <button
              className="secondary-button"
              onClick={() => fileInput.current?.click()}
              disabled={importing}
            >
              <FileUp size={17} /> {importing ? "正在导入" : "导入 Word / PDF"}
            </button>
            <div className="reading-progress">
              <span>{completedCount}/{allArticles.length} 篇完成</span>
              <div><span style={{ width: `${completion}%` }} /></div>
            </div>
          </>
        }
      />

      <div className="article-tabs">
        {allArticles.map((item, index) => {
          const articleRecord = data.readingRecords.find(
            (row) => row.id === item.id
          );
          return (
            <button
              className={item.id === article.id ? "is-active" : ""}
              key={item.id}
              onClick={() => changeArticle(item.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.minutes} 分钟 · {item.difficulty}
                  {item.imported ? " · 导入" : ""}
                </small>
              </div>
              {articleRecord?.completedDate ? (
                <Check className="article-tab-check" size={17} />
              ) : (
                <ChevronRight size={17} />
              )}
            </button>
          );
        })}
      </div>

      <div className="reading-layout">
        <article className="reading-sheet panel">
          <header>
            <div>
              <span className="eyebrow">ARTICLE · {article.difficulty}</span>
              <h2>{article.title}</h2>
              <p>{article.subtitle}</p>
              {article.imported ? (
                <span className="article-source">来源：{article.sourceName}</span>
              ) : null}
            </div>
            <span className="reading-time">{article.minutes} MIN</span>
          </header>
          <div className="article-body">
            {article.paragraphs.map((paragraph, index) => (
              <div className="article-paragraph" key={paragraph}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <ClickableParagraph
                  text={paragraph}
                  onSelectWord={(word) => {
                    setSelectedWord(word);
                    setDefinition("");
                  }}
                />
              </div>
            ))}
          </div>

          {article.question ? (
            <section className="comprehension">
              <div className="comprehension-title">
                <CircleHelp size={19} />
                <span>理解检查</span>
              </div>
              <h3>{article.question.prompt}</h3>
              <div className="answer-options">
                {article.question.options.map((option, index) => {
                  const answered = selectedAnswer !== null;
                  const isCorrect = index === article.question.answer;
                  const isSelected = selectedAnswer === index;
                  return (
                    <button
                      key={option}
                      className={`${isSelected ? "is-selected" : ""} ${
                        answered && isSelected
                          ? isCorrect
                            ? "is-correct"
                            : "is-wrong"
                          : ""
                      }`}
                      onClick={() => selectAnswer(index)}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>
                      {option}
                      {answered && isSelected ? (
                        <strong>{isCorrect ? "正确" : "再读一遍"}</strong>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="imported-reading-note">
              导入材料不包含预设理解题，可继续使用点词查义和阅读笔记。
            </div>
          )}

          <footer className="article-footer">
            <button className="primary-button" onClick={markComplete}>
              <BookmarkCheck size={18} />
              {completedToday ? "今天已完成阅读" : "标记今天已读完"}
            </button>
            <span>点击文中任意英文单词即可加入生词本</span>
          </footer>
        </article>

        <aside className="reading-tools">
          <section className={`word-capture panel ${selectedWord ? "is-ready" : ""}`}>
            <div className="tool-heading">
              <Languages size={19} />
              <div>
                <span className="eyebrow">QUICK DICTIONARY</span>
                <h3>阅读生词</h3>
              </div>
            </div>
            {selectedWord ? (
              <>
                <strong className="captured-word">{selectedWord}</strong>
                <label>
                  <span>中文意思</span>
                  <input
                    value={definition}
                    onChange={(event) => setDefinition(event.target.value)}
                    placeholder="填写释义后加入词库"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addSelectedWord();
                    }}
                  />
                </label>
                <button className="secondary-button" onClick={addSelectedWord}>
                  <Plus size={17} /> 加入每日单词
                </button>
              </>
            ) : (
              <p className="tool-placeholder">
                点按文章中的英文单词，在这里补充释义并加入词库。
              </p>
            )}
          </section>

          <section className="reading-note panel">
            <div className="tool-heading">
              <NotebookPen size={19} />
              <div>
                <span className="eyebrow">YOUR NOTES</span>
                <h3>重点记录</h3>
              </div>
            </div>
            <label>
              <span><Highlighter size={15} /> 一句重点</span>
              <textarea
                value={keySentence}
                onChange={(event) => setKeySentence(event.target.value)}
                placeholder="摘录最值得记住的一句英文"
                className="key-sentence-input"
              />
            </label>
            <label>
              <span><NotebookPen size={15} /> 阅读想法</span>
              <textarea
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setSavedState("未保存");
                }}
                placeholder="写下文章给你带来的启发，或没有读懂的地方……"
              />
            </label>
            <div className="reading-note__footer">
              <span>{savedState}</span>
              <button className="text-button" onClick={saveNotes}>
                <Save size={15} /> 保存笔记
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
