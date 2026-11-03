import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CircleUserRound,
  Database,
  Home as HomeIcon,
  Library,
  Mic2,
  RotateCcw,
  Sparkles
} from "lucide-react";
import {
  db,
  defaults,
  ensureTodayAssignment,
  getDueWords,
  getSetting,
  initializeSettings,
  saveWordPairs
} from "./db";
import { readings } from "./data/content";
import { readingMaterialsToArticles } from "./utils/materials";
import { localDateKey } from "./utils/date";
import { Toast } from "./components/ui";
import Home from "./pages/Home";
import Words from "./pages/Words";
import Speaking from "./pages/Speaking";
import Reading from "./pages/Reading";
import Review from "./pages/Review";

const navigation = [
  { id: "home", label: "今日总览", icon: HomeIcon },
  { id: "words", label: "每日单词", icon: BookOpen },
  { id: "speaking", label: "口语练习", icon: Mic2 },
  { id: "reading", label: "英语阅读", icon: Library },
  { id: "review", label: "间隔复习", icon: RotateCcw }
];

const pageTitles = {
  home: "今日总览",
  words: "每日单词",
  speaking: "口语练习",
  reading: "英语阅读",
  review: "间隔复习"
};

async function seedFromAttachedWordFile() {
  if ((await db.words.count()) > 0) return;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}seed-vocabulary.docx`);
    if (!response.ok) return;
    const blob = await response.blob();
    const file = new File([blob], "中考词汇示例.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    const { parseWordFile } = await import("./utils/importWords");
    const parsed = await parseWordFile(file);
    if (parsed.pairs.length) {
      await saveWordPairs(parsed.pairs, "内置示例词库");
    }
  } catch (error) {
    console.error("示例词库加载失败", error);
  }
}

async function loadSnapshot() {
  const today = localDateKey();
  await initializeSettings();
  await seedFromAttachedWordFile();
  const assignment = await ensureTodayAssignment();
  const [
    words,
    dueWords,
    wordTarget,
    reviewTarget,
    todaySpeaking,
    readingRecords,
    currentArticleId,
    memo,
    todayReviewCount,
    knownCount,
    materials
  ] = await Promise.all([
    db.words.orderBy("order").toArray(),
    getDueWords(today),
    getSetting("wordTarget", defaults.wordTarget),
    getSetting("reviewTarget", defaults.reviewTarget),
    db.speaking.get(today),
    db.readings.toArray(),
    getSetting("currentArticleId", defaults.currentArticleId),
    db.memos.get(today),
    db.reviewLogs.where("date").equals(today).count(),
    db.words.where("status").equals("known").count(),
    db.materials.toArray()
  ]);
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const todayWords = assignment.wordIds
    .map((id) => wordMap.get(id))
    .filter(Boolean);
  const readingArticles = [
    ...readings,
    ...readingMaterialsToArticles(materials)
  ];
  const article =
    readingArticles.find((item) => item.id === currentArticleId) ||
    readingArticles[0];
  const statusCounts = {
    unfamiliar: words.filter((word) => word.status === "unfamiliar").length,
    learning: words.filter((word) => word.status === "learning").length,
    known: words.filter((word) => word.status === "known").length,
    new: words.filter((word) => word.status === "new").length
  };

  return {
    today,
    words,
    todayWords,
    wordCount: words.length,
    wordTarget: Number(wordTarget),
    reviewTarget: Number(reviewTarget),
    todayWordDone: todayWords.filter(
      (word) => word.lastStudiedDate === today
    ).length,
    dueWords,
    dueCount: dueWords.length,
    todayReviewCount,
    knownCount,
    statusCounts,
    todaySpeaking: todaySpeaking || null,
    readingRecords,
    materials,
    currentArticleId: article.id,
    articleTitle: article.title,
    articleMinutes: article.minutes,
    memo: memo || null
  };
}

export default function App() {
  const [page, setPage] = useState("home");
  const [data, setData] = useState(null);
  const [fatalError, setFatalError] = useState("");
  const [toast, setToast] = useState(null);
  const initStarted = useRef(false);

  const refresh = useCallback(async () => {
    const snapshot = await loadSnapshot();
    setData(snapshot);
    return snapshot;
  }, []);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    loadSnapshot()
      .then(setData)
      .catch((error) => {
        console.error(error);
        setFatalError(error.message || "本地数据加载失败");
      });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.title = `${pageTitles[page]} · 每日英语`;
  }, [page]);

  function navigate(nextPage) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message, tone = "success") {
    setToast({ message, tone, id: Date.now() });
  }

  if (fatalError) {
    return (
      <main className="fatal-screen">
        <Database size={30} />
        <h1>无法读取本地学习数据</h1>
        <p>{fatalError}</p>
        <button onClick={() => window.location.reload()}>重新加载</button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">E.</div>
        <div className="loading-line"><span /></div>
        <p>正在打开你的本地英语空间</p>
      </main>
    );
  }

  const pageProps = { data, refresh, showToast, navigate };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">E.</div>
          <div>
            <strong>每日英语</strong>
            <span>YOUR PRIVATE SPACE</span>
          </div>
        </div>

        <nav className="main-nav" aria-label="主要功能">
          <span className="nav-label">LEARN</span>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={page === item.id ? "is-active" : ""}
                onClick={() => navigate(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.id === "review" && data.dueCount ? (
                  <strong>{data.dueCount}</strong>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <Sparkles size={17} />
          <p>每天一点，积累会在不经意的某天连成线。</p>
        </div>

        <div className="sidebar-footer">
          <div className="local-badge">
            <Database size={16} />
            <div>
              <strong>仅存储在本机</strong>
              <span>无账号 · 无云端同步</span>
            </div>
          </div>
          <div className="user-mark">
            <CircleUserRound size={20} />
            <span>个人学习空间</span>
          </div>
        </div>
      </aside>

      <header className="mobile-header">
        <div className="brand">
          <div className="brand-mark">E.</div>
          <strong>每日英语</strong>
        </div>
        <div className="mobile-date">{data.today}</div>
      </header>

      <main className="main-content">
        {page === "home" ? <Home {...pageProps} /> : null}
        {page === "words" ? <Words {...pageProps} /> : null}
        {page === "speaking" ? <Speaking {...pageProps} /> : null}
        {page === "reading" ? <Reading {...pageProps} /> : null}
        {page === "review" ? <Review {...pageProps} /> : null}
      </main>

      <nav className="bottom-nav" aria-label="移动端功能">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={page === item.id ? "is-active" : ""}
              onClick={() => navigate(item.id)}
            >
              <Icon size={19} />
              <span>{item.label.replace("练习", "").replace("今日", "")}</span>
            </button>
          );
        })}
      </nav>

      <Toast
        message={toast?.message}
        tone={toast?.tone}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
