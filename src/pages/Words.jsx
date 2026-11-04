import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FileUp,
  FileText,
  Headphones,
  Library,
  LockKeyhole,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  X
} from "lucide-react";
import {
  completeDailyQuiz,
  db,
  deleteWordSource,
  markWordStudy,
  recordDailyQuizAnswer,
  saveWordPairs,
  startDailyQuiz,
  updateTodayTarget
} from "../db";
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

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createDailyTestQuestions(words, wordBank) {
  const uniqueMeanings = [
    ...new Map(
      wordBank
        .filter((word) => word.chinese?.trim())
        .map((word) => [word.chinese, word])
    ).values()
  ];

  return shuffled(words).map((word) => {
    const distractors = shuffled(
      uniqueMeanings.filter(
        (candidate) =>
          candidate.id !== word.id && candidate.chinese !== word.chinese
      )
    ).slice(0, 3);
    if (distractors.length < 3) {
      throw new Error("词库中不同的中文释义不足 4 个，暂时无法生成测试");
    }
    return {
      word,
      options: shuffled([
        word.chinese,
        ...distractors.map((candidate) => candidate.chinese)
      ])
    };
  });
}

export default function Words({ data, refresh, showToast }) {
  const [index, setIndex] = useState(0);
  const [activeView, setActiveView] = useState("today");
  const [bankQuery, setBankQuery] = useState("");
  const [bankStatusFilter, setBankStatusFilter] = useState("all");
  const [bankStudyDate, setBankStudyDate] = useState(data.today);
  const [bankSelectedWord, setBankSelectedWord] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [note, setNote] = useState("");
  const [busyImport, setBusyImport] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportScope, setExportScope] = useState("all");
  const [exportSelectedIds, setExportSelectedIds] = useState([]);
  const [exportQuery, setExportQuery] = useState("");
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizSelected, setQuizSelected] = useState("");
  const [quizAnswers, setQuizAnswers] = useState([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quizSaving, setQuizSaving] = useState(false);
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
  const studySignature = todayWords
    .map((word) => `${word.id}:${word.lastStudiedDate || ""}`)
    .join("|");

  useEffect(() => {
    setIndex((value) => {
      const safeValue = Math.min(value, Math.max(todayWords.length - 1, 0));
      if (todayWords[safeValue]?.lastStudiedDate === data.today) {
        const firstPending = todayWords.findIndex(
          (word) => word.lastStudiedDate !== data.today
        );
        if (firstPending >= 0) return firstPending;
      }
      return safeValue;
    });
    setRevealed(false);
    if (currentWord) setNote(currentWord.note || "");
  }, [currentWord?.id, studySignature, todayWords.length]);

  useEffect(() => {
    setTargetDraft(data.wordTarget);
  }, [data.wordTarget]);

  const wordSources = useMemo(() => {
    const names = new Map();
    for (const word of data.words) {
      const sourceName = word.sourceName || "个人词库";
      names.set(sourceName, (names.get(sourceName) || 0) + 1);
    }
    return [...names.entries()].map(([name, count]) => ({ name, count }));
  }, [data.words]);
  const sourceSummary = wordSources.slice(0, 3).map(({ name }) => [name]);
  const filteredBankWords = useMemo(() => {
    const query = bankQuery.trim().toLocaleLowerCase("en");
    return data.words.filter(
      (word) =>
        (bankStatusFilter === "all" || word.status === bankStatusFilter) &&
        (!query ||
          word.english.toLocaleLowerCase("en").includes(query) ||
          word.chinese.includes(bankQuery.trim()))
    );
  }, [bankQuery, bankStatusFilter, data.words]);
  const exportWords = useMemo(
    () =>
      exportScope === "all"
        ? data.words
        : data.words.filter((word) => exportSelectedIds.includes(word.id)),
    [data.words, exportScope, exportSelectedIds]
  );
  const filteredExportWords = useMemo(() => {
    const query = exportQuery.trim().toLocaleLowerCase("en");
    if (!query) return data.words;
    return data.words.filter(
      (word) =>
        word.english.toLocaleLowerCase("en").includes(query) ||
        word.chinese.includes(exportQuery.trim())
    );
  }, [data.words, exportQuery]);
  const exportSettingsValid =
    Number(exportOptions.wordsPerDay) >= 1 &&
    Number(exportOptions.daysPerPage) >= 1;

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
    const updated = await refresh();
    const pendingIndex = updated.todayWords.findIndex(
      (word) => word.lastStudiedDate !== updated.today
    );
    if (pendingIndex >= 0) {
      setIndex(pendingIndex);
      setRevealed(false);
    } else {
      showToast("今日待学习单词已经完成，可以进行单词测试");
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

  async function removeSource(source) {
    if (
      !window.confirm(
        `确定删除来源“${source.name}”吗？该来源带来的 ${source.count} 个单词及相关学习记录也会删除。`
      )
    ) {
      return;
    }
    const result = await deleteWordSource(source.name);
    await refresh();
    showToast(`来源已删除，同时移除了 ${result.deletedWords} 个单词`);
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
    if (!exportWords.length) {
      showToast("请至少选择一个单词", "error");
      return;
    }
    setExporting(true);
    try {
      const blob = await exportQuizDocx(exportWords, exportOptions);
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
    try {
      await updateTodayTarget(targetDraft);
      await refresh();
      showToast(`今日单词目标已调整为 ${targetDraft} 个`);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function toggleExportWord(wordId) {
    setExportSelectedIds((current) =>
      current.includes(wordId)
        ? current.filter((id) => id !== wordId)
        : [...current, wordId]
    );
  }

  async function startQuiz() {
    const pendingWords = data.todayWords.filter(
      (word) => word.dailyQuizPassedDate !== data.today
    );
    if (!pendingWords.length) {
      showToast("今天的单词测试已经全部通过");
      return;
    }
    try {
      const questions = createDailyTestQuestions(pendingWords, data.words);
      await startDailyQuiz(data.today);
      await refresh({ light: true });
      setQuizQuestions(questions);
      setQuizIndex(0);
      setQuizSelected("");
      setQuizAnswers([]);
      setQuizFinished(false);
      setQuizOpen(true);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function chooseQuizOption(option) {
    if (quizSelected || quizSaving) return;
    const question = quizQuestions[quizIndex];
    const isCorrect = option === question.word.chinese;
    setQuizSaving(true);
    setQuizSelected(option);
    setQuizAnswers((answers) => {
      const next = [...answers];
      next[quizIndex] = {
        word: question.word,
        selected: option,
        isCorrect
      };
      return next;
    });
    await recordDailyQuizAnswer(question.word, isCorrect);
    await refresh({ light: true });
    setQuizSaving(false);
  }

  async function nextQuizQuestion() {
    if (quizIndex < quizQuestions.length - 1) {
      setQuizIndex((index) => index + 1);
      setQuizSelected("");
      return;
    }

    const failed = quizAnswers.filter((answer) => answer && !answer.isCorrect);
    if (!failed.length) {
      await completeDailyQuiz(data.today);
      await refresh();
      setQuizFinished("passed");
    } else {
      await refresh();
      setQuizFinished("failed");
    }
  }

  function closeQuiz() {
    setQuizOpen(false);
    setQuizSelected("");
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
        <button
          className={activeView === "sources" ? "is-active" : ""}
          onClick={() => setActiveView("sources")}
          role="tab"
          aria-selected={activeView === "sources"}
        >
          <FileText size={16} /> 导入来源
          <span>{wordSources.length}</span>
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
            <strong>{wordSources.length}</strong>
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
              value={targetDraft}
              onChange={(event) => setTargetDraft(Number(event.target.value))}
            />
            <button onClick={applyTarget}>应用</button>
          </div>
        </div>
      </section>

      {activeView === "today" && todayWords.length ? (
        <section
          className={`daily-test-unlock ${
            data.todayTestPassed
              ? "is-passed"
              : data.todayTestUnlocked
                ? "is-ready"
                : "is-locked"
          }`}
        >
          <span className="daily-test-unlock__icon">
            {data.todayTestPassed ? (
              <Check size={20} />
            ) : data.todayTestUnlocked ? (
              <Play size={19} />
            ) : (
              <LockKeyhole size={18} />
            )}
          </span>
          <div className="daily-test-unlock__copy">
            <span className="eyebrow">DAILY CHECK</span>
            <h3>
              {data.todayTestPassed
                ? "今日单词测试已通过"
                : data.todayTestUnlocked
                  ? "今日目标完成，单词测试已解锁"
                  : data.todayTestStarted
                    ? "继续完成未通过测试的单词"
                    : "完成今日目标后解锁单词测试"}
            </h3>
            <p>
              {data.todayTestPassed
                ? "现在可以增加今日单词；新增单词完成学习后需要再次测试。"
                : data.todayTestUnlocked
                  ? "每个单词选择正确的中文意思，答错会重新进入学习。"
                  : "完成当前词单后才能检查今天的掌握情况。"}
            </p>
          </div>
          <div className="daily-test-unlock__progress">
            <span>{data.todayQuizPassedCount}/{todayWords.length} 已通过</span>
            {!data.todayTestPassed ? (
              <button
                className="primary-button"
                onClick={startQuiz}
                disabled={!data.todayTestUnlocked}
              >
                <Play size={16} />
                {data.todayTestStarted ? "继续测试" : "开始单词测试"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeView === "sources" ? (
        <section className="source-library panel">
          <div className="source-library__heading">
            <span className="eyebrow">IMPORT SOURCES</span>
            <h2>单词导入来源</h2>
            <p>这里列出当前词库中的来源文件和对应单词数量。</p>
          </div>
          <div className="source-library__grid">
            {wordSources.map((source) => (
              <div className="source-card" key={source.name}>
                <span><FileText size={19} /></span>
                <div>
                  <strong>{source.name}</strong>
                  <small>每日单词 · 本地导入</small>
                </div>
                <b>{source.count}<small>词</small></b>
                <button
                  className="source-delete"
                  onClick={() => removeSource(source)}
                  aria-label={`删除来源 ${source.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : activeView === "bank" ? (
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
          <div className="bank-status-tabs" aria-label="按掌握状态筛选">
            {[
              ["all", "全部", data.words.length],
              ["unfamiliar", "还不熟", data.statusCounts.unfamiliar],
              ["learning", "有印象", data.statusCounts.learning],
              ["known", "已经认识", data.statusCounts.known]
            ].map(([status, label, count]) => (
              <button
                key={status}
                className={bankStatusFilter === status ? "is-active" : ""}
                onClick={() => setBankStatusFilter(status)}
                aria-pressed={bankStatusFilter === status}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
          <div className="word-bank-list">
            {filteredBankWords.map((word) => (
              <button
                className="word-bank-row"
                key={word.id}
                onClick={() => setBankSelectedWord(word)}
              >
                <span className="word-bank-order">{word.order}</span>
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
                    <span className="mini-word-main">
                      <span className="word-order">{wordIndex + 1}</span>
                      <span className="mini-word-text">{word.english}</span>
                    </span>
                    {studied ? <Check size={15} /> : null}
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
            title="当前没有待学习的新词"
            description="词库里的单词都已经完成第一次学习。你可以导入新的词表，或前往复习模块继续巩固。"
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

      {quizOpen ? (
        <Modal
          title={
            quizFinished === "passed"
              ? "测试通过"
              : quizFinished === "failed"
                ? "测试未完成"
                : "今日单词测试"
          }
          eyebrow={
            quizFinished
              ? "DAILY CHECK RESULT"
              : `DAILY CHECK · ${Math.min(quizIndex + 1, quizQuestions.length)}/${quizQuestions.length}`
          }
          onClose={closeQuiz}
          wide
          footer={
            quizFinished ? (
              <button className="primary-button" onClick={closeQuiz}>
                完成
              </button>
            ) : quizSelected ? (
              <button
                className="primary-button"
                onClick={nextQuizQuestion}
                disabled={quizSaving}
              >
                {quizIndex === quizQuestions.length - 1 ? "查看结果" : "下一题"}
                <ArrowRight size={16} />
              </button>
            ) : null
          }
        >
          {quizFinished === "passed" ? (
            <div className="quiz-result">
              <span className="quiz-result__icon"><Check size={28} /></span>
              <h3>今天全部答对</h3>
              <p>这些单词已通过今天的掌握检查，现在可以增加今日单词。</p>
            </div>
          ) : quizFinished === "failed" ? (
            <div className="quiz-result quiz-result--failed">
              <span className="quiz-result__icon"><X size={28} /></span>
              <h3>有单词还需要继续学习</h3>
              <p>
                {quizAnswers
                  .filter((answer) => answer && !answer.isCorrect)
                  .map((answer) => answer.word.english)
                  .join("、")}
              </p>
              <small>答错的单词已经撤销今日完成状态，请重新学习后再测试。</small>
            </div>
          ) : (
            <div className="daily-test-question">
              <span className="quiz-word">
                {quizQuestions[quizIndex]?.word.english}
              </span>
              <h3>选择正确的中文意思</h3>
              <div className="daily-test-options">
                {quizQuestions[quizIndex]?.options.map((option, index) => {
                  const correct =
                    option === quizQuestions[quizIndex].word.chinese;
                  const selected = option === quizSelected;
                  return (
                    <button
                      key={`${option}-${index}`}
                      className={[
                        "daily-test-option",
                        selected ? "is-selected" : "",
                        quizSelected && correct ? "is-correct" : "",
                        quizSelected && selected && !correct ? "is-wrong" : ""
                      ].join(" ")}
                      onClick={() => chooseQuizOption(option)}
                      disabled={Boolean(quizSelected) || quizSaving}
                    >
                      <span>{String.fromCharCode(65 + index)}</span>
                      <strong>{option}</strong>
                      {quizSelected && correct ? <Check size={17} /> : null}
                      {quizSelected && selected && !correct ? <X size={17} /> : null}
                    </button>
                  );
                })}
              </div>
              {quizSelected ? (
                <div
                  className={`quiz-feedback ${
                    quizSelected === quizQuestions[quizIndex].word.chinese
                      ? "is-correct"
                      : "is-wrong"
                  }`}
                >
                  {quizSelected === quizQuestions[quizIndex].word.chinese
                    ? "回答正确，这个单词今日已完成。"
                    : `回答错误。正确释义：${quizQuestions[quizIndex].word.chinese}`}
                </div>
              ) : null}
            </div>
          )}
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
                disabled={exporting || !exportWords.length || !exportSettingsValid}
              >
                {exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}
                {exporting ? "正在生成" : "生成并下载"}
              </button>
            </>
          }
        >
          <p className="modal-intro">
            当前将使用 {exportWords.length} 个词，生成英译中和中译英两份练习。
          </p>
          <div className="export-scope">
            <label className={exportScope === "all" ? "is-active" : ""}>
              <input
                type="radio"
                name="export-scope"
                value="all"
                checked={exportScope === "all"}
                onChange={() => setExportScope("all")}
              />
              <span>
                <strong>全部词库</strong>
                <small>使用全部 {data.wordCount} 个词生成</small>
              </span>
            </label>
            <label className={exportScope === "selected" ? "is-active" : ""}>
              <input
                type="radio"
                name="export-scope"
                value="selected"
                checked={exportScope === "selected"}
                onChange={() => setExportScope("selected")}
              />
              <span>
                <strong>选择单词</strong>
                <small>只生成指定单词，已选 {exportSelectedIds.length} 个</small>
              </span>
            </label>
          </div>
          {exportScope === "selected" ? (
            <div className="export-word-picker">
              <div className="export-word-picker__tools">
                <label>
                  <Search size={15} />
                  <input
                    value={exportQuery}
                    onChange={(event) => setExportQuery(event.target.value)}
                    placeholder="搜索要生成的单词"
                    aria-label="搜索导出单词"
                  />
                </label>
                <button
                  className="text-button"
                  onClick={() =>
                    setExportSelectedIds((current) => [
                      ...new Set([
                        ...current,
                        ...filteredExportWords.map((word) => word.id)
                      ])
                    ])
                  }
                >
                  全选当前
                </button>
                <button
                  className="text-button"
                  onClick={() => setExportSelectedIds([])}
                >
                  清空
                </button>
              </div>
              <div className="export-word-list">
                {filteredExportWords.map((word) => (
                  <label key={word.id}>
                    <input
                      type="checkbox"
                      checked={exportSelectedIds.includes(word.id)}
                      onChange={() => toggleExportWord(word.id)}
                      aria-label={`选择 ${word.english}`}
                    />
                    <span>{word.english}</span>
                    <small>{word.chinese}</small>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="form-grid">
            <label>
              <span>每天单词数量</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={exportOptions.wordsPerDay}
                onChange={(event) =>
                  setExportOptions((value) => ({
                    ...value,
                    wordsPerDay: event.target.value.replace(/\D/g, "")
                  }))
                }
                aria-label="每天单词数量"
              />
            </label>
            <label>
              <span>每页天数</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={exportOptions.daysPerPage}
                onChange={(event) =>
                  setExportOptions((value) => ({
                    ...value,
                    daysPerPage: event.target.value.replace(/\D/g, "")
                  }))
                }
                aria-label="每页天数"
              />
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
              预计生成 {quizPageCount(exportWords.length, exportOptions.wordsPerDay, exportOptions.daysPerPage)}
              页练习{exportOptions.includeAnswers ? "，另附答案页" : ""}
            </span>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
