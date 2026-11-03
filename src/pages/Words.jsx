import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FileUp,
  Headphones,
  Library,
  LoaderCircle,
  Plus,
  Search,
  Sparkles,
  Volume2
} from "lucide-react";
import { db, markWordStudy, saveWordPairs, updateTodayTarget } from "../db";
import {
  EmptyState,
  Modal,
  PageHeading,
  ProgressRing
} from "../components/ui";
import {
  exportQuizDocx,
  quizPageCount
} from "../utils/exportQuizDocx";

const studyChoices = [
  { id: "again", label: "还不熟", hint: "明天再见" },
  { id: "hard", label: "有印象", hint: "两天后复习" },
  { id: "good", label: "已经认识", hint: "三天后复习" }
];

export default function Words({ data, refresh, showToast }) {
  const [index, setIndex] = useState(0);
  const [activeView, setActiveView] = useState("today");
  const [bankQuery, setBankQuery] = useState("");
  const [bankStudyDate, setBankStudyDate] = useState(data.today);
  const [bankSelectedWord, setBankSelectedWord] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState("");
  const [busyImport, setBusyImport] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    wordsPerDay: data.wordTarget,
    daysPerPage: 3,
    includeAnswers: false
  });
  const [targetDraft, setTargetDraft] = useState(data.wordTarget);
  const fileInput = useRef(null);

  const todayWords = data.todayWords;
  const currentWord = todayWords[Math.min(index, Math.max(todayWords.length - 1, 0))];
  const done = todayWords.filter(
    (word) => word.lastStudiedDate === data.today
  ).length;
  const progress = todayWords.length ? (done / todayWords.length) * 100 : 0;

  useEffect(() => {
    setIndex((value) => Math.min(value, Math.max(todayWords.length - 1, 0)));
    setRevealed(false);
    if (currentWord) setNote(currentWord.note || "");
  }, [currentWord?.id, todayWords.length]);

  useEffect(() => {
    setTargetDraft(data.wordTarget);
  }, [data.wordTarget]);

  const sourceSummary = useMemo(() => {
    const names = new Map();
    for (const word of data.words) {
      names.set(word.sourceName || "词库", (names.get(word.sourceName || "词库") || 0) + 1);
    }
    return [...names.entries()].slice(0, 3);
  }, [data.words]);
  const filteredBankWords = useMemo(() => {
    const query = bankQuery.trim().toLocaleLowerCase("en");
    if (!query) return data.words;
    return data.words.filter(
      (word) =>
        word.english.toLocaleLowerCase("en").includes(query) ||
        word.chinese.includes(bankQuery.trim())
    );
  }, [bankQuery, data.words]);

  function selectWord(nextIndex) {
    if (!todayWords.length) return;
    setIndex((nextIndex + todayWords.length) % todayWords.length);
    setRevealed(false);
  }

  function speak(word) {
    if (!("speechSynthesis" in window)) {
      showToast("当前浏览器没有可用的朗读功能", "error");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
  }

  async function mark(rating) {
    if (!currentWord) return;
    await markWordStudy(currentWord, rating, note);
    await refresh();
    if (index < todayWords.length - 1) {
      selectWord(index + 1);
    } else {
      showToast("今天的单词已经全部过了一遍");
    }
  }

  async function saveNote() {
    if (!currentWord) return;
    await db.words.update(currentWord.id, {
      note,
      updatedAt: new Date().toISOString()
    });
    showToast("词语笔记已保存");
    refresh();
  }

  async function markFromBank(rating) {
    if (!bankSelectedWord) return;
    const selected = bankSelectedWord;
    await markWordStudy(
      selected,
      rating,
      selected.note,
      bankStudyDate
    );
    await refresh();
    setBankSelectedWord(null);
    showToast(
      `${selected.english} 已记录为 ${
        rating === "again"
          ? "还不熟"
          : rating === "hard"
            ? "有印象"
            : "已经认识"
      }（${bankStudyDate}）`
    );
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusyImport(true);
    setImportError("");
    try {
      const { parseWordFile } = await import("../utils/importWords");
      const result = await parseWordFile(file);
      if (!result.pairs.length) {
        throw new Error("没有识别到英文与中文词对。请确认表格中有可复制的文字。");
      }
      setImportPreview({
        ...result,
        fileName: file.name,
        format: file.name.split(".").pop()?.toUpperCase()
      });
    } catch (error) {
      setImportError(error.message || "文件读取失败");
    } finally {
      setBusyImport(false);
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    const result = await saveWordPairs(importPreview.pairs, importPreview.fileName);
    setImportPreview(null);
    await refresh();
    showToast(
      `导入完成：新增 ${result.added} 组，跳过 ${result.skipped} 组，更新 ${result.updated} 组`
    );
  }

  async function handleExport() {
    if (!data.words.length) {
      showToast("词库为空，无法生成默写卷", "error");
      return;
    }
    setExporting(true);
    try {
      const blob = await exportQuizDocx(data.words, exportOptions);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `每日英语默写卷_${data.today}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setExportOpen(false);
      showToast("Word 默写卷已生成并下载");
    } catch (error) {
      console.error(error);
      showToast(`生成 Word 失败：${error.message}`, "error");
    } finally {
      setExporting(false);
    }
  }

  async function applyTarget() {
    await updateTodayTarget(targetDraft);
    await refresh();
    showToast(`今日单词目标已调整为 ${targetDraft} 个`);
  }

  return (
    <div className="page">
      <PageHeading
        eyebrow="VOCABULARY"
        title="每日单词"
        description="导入自己的词表，按今天的节奏学习，再把词库生成默写卷。"
        actions={
          <>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFile}
            />
            <button
              className="secondary-button"
              onClick={() => fileInput.current?.click()}
              disabled={busyImport}
            >
              {busyImport ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <FileUp size={17} />
              )}
              {busyImport ? "正在读取" : "导入 Word / PDF"}
            </button>
            <button className="primary-button" onClick={() => setExportOpen(true)}>
              <Download size={17} /> 生成默写卷
            </button>
          </>
        }
      />

      {importError ? (
        <div className="inline-error">
          <span>{importError}</span>
          <button onClick={() => setImportError("")}>关闭</button>
        </div>
      ) : null}

      <div className="word-view-tabs" role="tablist" aria-label="单词视图">
        <button
          className={activeView === "today" ? "is-active" : ""}
          onClick={() => setActiveView("today")}
          role="tab"
          aria-selected={activeView === "today"}
        >
          <BookOpen size={16} /> 今日学习
        </button>
        <button
          className={activeView === "bank" ? "is-active" : ""}
          onClick={() => setActiveView("bank")}
          role="tab"
          aria-selected={activeView === "bank"}
        >
          <Library size={16} /> 全部词库
          <span>{data.wordCount}</span>
        </button>
      </div>

      <section className="word-stats">
        <div className="word-stat">
          <BookOpen size={18} />
          <div>
            <strong>{data.wordCount}</strong>
            <span>词库总量</span>
          </div>
        </div>
        <div className="word-stat">
          <Check size={18} />
          <div>
            <strong>{done}</strong>
            <span>今天已学</span>
          </div>
        </div>
        <div className="word-stat word-stat--sources">
          <Sparkles size={18} />
          <div>
            <strong>{sourceSummary.length}</strong>
            <span>导入来源</span>
          </div>
          <div className="source-dots">
            {sourceSummary.map(([name]) => (
              <span key={name} title={name} />
            ))}
          </div>
        </div>
        <div className="target-control">
          <span>今日目标</span>
          <div>
            <input
              type="number"
              min="1"
              max="50"
              value={targetDraft}
              onChange={(event) => setTargetDraft(Number(event.target.value))}
            />
            <button onClick={applyTarget}>应用</button>
          </div>
        </div>
      </section>

      {activeView === "bank" ? (
        <section className="word-bank panel">
          <div className="word-bank__header">
            <div>
              <span className="eyebrow">WORD LIBRARY</span>
              <h2>全部词库</h2>
              <p>查看已经导入的单词、释义、学习状态和来源。</p>
            </div>
            <div className="word-bank__tools">
              <label className="bank-date">
                <span>补记学习日期</span>
                <input
                  type="date"
                  value={bankStudyDate}
                  max={data.today}
                  onChange={(event) => setBankStudyDate(event.target.value)}
                  aria-label="补记学习日期"
                />
              </label>
              <label className="word-search">
                <Search size={16} />
                <input
                  value={bankQuery}
                  onChange={(event) => setBankQuery(event.target.value)}
                  placeholder="搜索英文或中文"
                  aria-label="搜索词库"
                />
              </label>
            </div>
          </div>
          <div className="word-bank__meta">
            <span>显示 {filteredBankWords.length} / {data.words.length} 个词</span>
            <span>英文 · 中文释义 · 状态 · 来源</span>
          </div>
          <div className="word-bank-list">
            {filteredBankWords.map((word) => (
              <button
                className="word-bank-row"
                key={word.id}
                onClick={() => setBankSelectedWord(word)}
              >
                <strong>{word.english}</strong>
                <span className="word-bank-row__meaning">{word.chinese}</span>
                <span className={`status-pill status-pill--${word.status}`}>
                  {word.status === "unfamiliar"
                    ? "还不熟"
                    : word.status === "learning"
                      ? "有印象"
                      : word.status === "known"
                        ? "已经认识"
                        : "未学习"}
                </span>
                <small>{word.sourceName || "个人词库"}</small>
              </button>
            ))}
          </div>
          {!filteredBankWords.length ? (
            <div className="word-bank-empty">没有找到匹配的单词。</div>
          ) : null}
        </section>
      ) : todayWords.length ? (
        <div className="word-workspace">
          <section className="word-focus panel">
            <div className="word-focus__top">
              <span className="quiet-label">
                {index + 1} / {todayWords.length}
              </span>
              <ProgressRing value={progress} size={62} stroke={6} />
            </div>

            <div className="word-display">
              <span className="word-display__source">
                {currentWord.sourceName || "个人词库"}
              </span>
              <h2>{currentWord.english}</h2>
              <button
                className="sound-button"
                onClick={() => speak(currentWord.english)}
                aria-label="朗读单词"
              >
                <Volume2 size={18} /> 听发音
              </button>
            </div>

            <div className={`meaning-area ${revealed ? "is-revealed" : ""}`}>
              {revealed ? (
                <>
                  <span className="eyebrow">中文释义</span>
                  <strong>{currentWord.chinese}</strong>
                </>
              ) : (
                <button onClick={() => setRevealed(true)}>
                  <ChevronDown size={18} /> 显示中文释义
                </button>
              )}
            </div>

            <div className="word-note-editor">
              <label htmlFor="word-note">我的词语笔记</label>
              <textarea
                id="word-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="可以补一句例句、搭配或容易混淆的地方……"
              />
              <button className="text-button" onClick={saveNote}>
                保存笔记
              </button>
            </div>

            <div className="word-navigation">
              <button className="icon-button" onClick={() => selectWord(index - 1)}>
                <ArrowLeft size={18} />
              </button>
              <div className="study-actions">
                {studyChoices.map((choice) => (
                  <button
                    className={`study-choice study-choice--${choice.id}`}
                    key={choice.id}
                    onClick={() => mark(choice.id)}
                  >
                    <strong>{choice.label}</strong>
                    <span>{choice.hint}</span>
                  </button>
                ))}
              </div>
              <button className="icon-button" onClick={() => selectWord(index + 1)}>
                <ArrowRight size={18} />
              </button>
            </div>
          </section>

          <aside className="word-list panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">TODAY</span>
                <h2>今日词单</h2>
              </div>
              <span className="quiet-label">{done}/{todayWords.length}</span>
            </div>
            <div className="mini-word-list">
              {todayWords.map((word, wordIndex) => {
                const studied = word.lastStudiedDate === data.today;
                return (
                  <button
                    className={`${wordIndex === index ? "is-active" : ""} ${studied ? "is-studied" : ""}`}
                    key={word.id}
                    onClick={() => selectWord(wordIndex)}
                  >
                    <span>{word.english}</span>
                    {studied ? <Check size={15} /> : <span>{wordIndex + 1}</span>}
                  </button>
                );
              })}
            </div>
            <div className="word-list__hint">
              <Headphones size={16} />
              朗读使用电脑浏览器自带的英文语音，不连接线上词典。
            </div>
          </aside>
        </div>
      ) : (
        <section className="panel">
          <EmptyState
            icon={<BookOpen size={28} />}
            title="今天没有新的单词安排"
            description="词库中的词已经全部排入学习计划。你仍然可以导入新的词表，或前往复习模块继续巩固。"
            action={
              <button className="secondary-button" onClick={() => fileInput.current?.click()}>
                <Plus size={17} /> 导入新词表
              </button>
            }
          />
        </section>
      )}

      {bankSelectedWord ? (
        <Modal
          title={bankSelectedWord.english}
          eyebrow={`学习日期 · ${bankStudyDate}`}
          onClose={() => setBankSelectedWord(null)}
        >
          <div className="bank-word-dialog">
            <strong>{bankSelectedWord.chinese}</strong>
            <p>来源：{bankSelectedWord.sourceName || "个人词库"}</p>
            <div className="study-actions">
              {studyChoices.map((choice) => (
                <button
                  className={`study-choice study-choice--${choice.id}`}
                  key={choice.id}
                  onClick={() => markFromBank(choice.id)}
                >
                  <strong>{choice.label}</strong>
                  <span>{choice.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}

      {importPreview ? (
        <Modal
          title={`识别到 ${importPreview.pairs.length} 组词对`}
          eyebrow={`${importPreview.format} · ${importPreview.fileName}`}
          onClose={() => setImportPreview(null)}
          wide
          footer={
            <>
              <button
                className="secondary-button"
                onClick={() => setImportPreview(null)}
              >
                取消
              </button>
              <button className="primary-button" onClick={confirmImport}>
                <Plus size={17} /> 加入词库
              </button>
            </>
          }
        >
          <p className="modal-intro">
            已按文件中的顺序匹配英文与中文。导入时会自动忽略重复单词。
          </p>
          {importPreview.warnings?.length ? (
            <div className="notice-box">
              {importPreview.warnings.slice(0, 2).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="preview-table">
            {importPreview.pairs.slice(0, 12).map((pair, pairIndex) => (
              <div key={`${pair.english}-${pairIndex}`}>
                <span>{pair.english}</span>
                <span>{pair.chinese}</span>
              </div>
            ))}
          </div>
          {importPreview.pairs.length > 12 ? (
            <p className="preview-more">
              还有 {importPreview.pairs.length - 12} 组未在预览中展示
            </p>
          ) : null}
        </Modal>
      ) : null}

      {exportOpen ? (
        <Modal
          title="生成默写卷"
          eyebrow="WORD EXPORT"
          onClose={() => setExportOpen(false)}
          footer={
            <>
              <button className="secondary-button" onClick={() => setExportOpen(false)}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                {exporting ? "正在生成" : "生成并下载"}
              </button>
            </>
          }
        >
          <p className="modal-intro">
            将使用当前词库的全部 {data.wordCount} 个词，生成英译中和中译英两份练习。
          </p>
          <div className="form-grid">
            <label>
              <span>每天单词数</span>
              <select
                value={exportOptions.wordsPerDay}
                onChange={(event) =>
                  setExportOptions((value) => ({
                    ...value,
                    wordsPerDay: Number(event.target.value)
                  }))
                }
              >
                {[5, 10].map((value) => (
                  <option key={value} value={value}>{value} 个</option>
                ))}
              </select>
            </label>
            <label>
              <span>每页天数</span>
              <select
                value={exportOptions.daysPerPage}
                onChange={(event) =>
                  setExportOptions((value) => ({
                    ...value,
                    daysPerPage: Number(event.target.value)
                  }))
                }
              >
                {[2, 3].map((value) => (
                  <option key={value} value={value}>{value} 天</option>
                ))}
              </select>
            </label>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={exportOptions.includeAnswers}
              onChange={(event) =>
                setExportOptions((value) => ({
                  ...value,
                  includeAnswers: event.target.checked
                }))
              }
            />
            <span>
              <strong>附加答案页</strong>
              <small>在练习后追加完整英文与中文对照表</small>
            </span>
          </label>
          <div className="export-estimate">
            <FileUp size={18} />
            <span>
              预计生成 {quizPageCount(data.wordCount, exportOptions.wordsPerDay, exportOptions.daysPerPage)}
              页练习{exportOptions.includeAnswers ? "，另附答案页" : ""}
            </span>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
