import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Circle,
  Mic2,
  PenLine,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { db } from "../db";
import { formatChineseDate, greeting, localDateKey } from "../utils/date";
import { ProgressRing } from "../components/ui";
import ActivityCalendar from "../components/ActivityCalendar";
import BackupPanel from "../components/BackupPanel";

export default function Home({ data, navigate, refresh, showToast }) {
  const [memo, setMemo] = useState(data.memo?.text || "");
  const [saveState, setSaveState] = useState("已保存");
  const timer = useRef(null);

  useEffect(() => {
    setMemo(data.memo?.text || "");
  }, [data.memo?.date]);

  function updateMemo(value) {
    setMemo(value);
    setSaveState("保存中");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await db.memos.put({
        date: localDateKey(),
        text: value,
        updatedAt: new Date().toISOString()
      });
      setSaveState("已保存");
      refresh({ light: true });
    }, 450);
  }

  const speakingDone = Boolean(
    data.todaySpeaking?.blob || data.todaySpeaking?.duration > 0
  );
  const readingRecord = data.readingRecords.find(
    (record) => record.id === data.currentArticleId
  );
  const readingDone = readingRecord?.completedDate === localDateKey();
  const reviewDone = data.todayReviewCount > 0;
  const plan = [
    {
      id: "words",
      title: "今天的单词",
      detail:
        data.todayWordDone >= data.todayWords.length
          ? "今日单词已学完"
          : `还剩 ${Math.max(0, data.todayWords.length - data.todayWordDone)} 个词`,
      done: data.todayWords.length > 0 && data.todayWordDone >= data.todayWords.length,
      icon: BookOpen
    },
    {
      id: "speaking",
      title: "口语练习",
      detail: speakingDone ? "今天已经留下录音" : "选择一个话题，开口 60 秒",
      done: speakingDone,
      icon: Mic2
    },
    {
      id: "reading",
      title: "英语阅读",
      detail: readingDone ? "今天的阅读已经完成" : data.articleTitle,
      done: readingDone,
      icon: PenLine
    },
    {
      id: "review",
      title: "到期复习",
      detail: reviewDone
        ? `今天已复习 ${data.todayReviewCount} 次`
        : data.dueCount
          ? `${data.dueCount} 个词等待复习`
          : "今天没有到期内容",
      done: reviewDone || data.dueCount === 0,
      icon: RotateCcw
    }
  ];
  const doneCount = plan.filter((item) => item.done).length;
  const progress = (doneCount / plan.length) * 100;

  const summaries = [
    {
      id: "words",
      label: "每日单词",
      value: `${data.todayWordDone}/${data.todayWords.length || data.wordTarget}`,
      unit: "今日完成",
      note: `词库共 ${data.wordCount} 词`,
      accent: "sage",
      icon: BookOpen
    },
    {
      id: "speaking",
      label: "口语",
      value: data.todaySpeaking?.duration
        ? `${Math.round(data.todaySpeaking.duration)}`
        : "0",
      unit: "秒录音",
      note: speakingDone ? "录音已保存在本机" : "今天还没有录音",
      accent: "ochre",
      icon: Mic2
    },
    {
      id: "reading",
      label: "阅读",
      value: data.articleMinutes || 4,
      unit: "分钟",
      note: readingDone ? "今日阅读已完成" : data.articleTitle,
      accent: "clay",
      icon: PenLine
    },
    {
      id: "review",
      label: "复习",
      value: data.dueCount,
      unit: "待复习",
      note: `今天完成 ${data.todayReviewCount} 次`,
      accent: "ink",
      icon: RotateCcw
    }
  ];

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div className="home-hero__main">
          <span className="eyebrow">{formatChineseDate()}</span>
          <h1>
            {greeting()}，<br />
            今天继续积累。
          </h1>
          <p>
            不追求一次记住所有内容。完成今天的一小组，让学习在明天仍有回声。
          </p>
          <button className="primary-button" onClick={() => navigate("words")}>
            开始今日单词 <ArrowRight size={17} />
          </button>
        </div>
        <div className="home-hero__progress">
          <ProgressRing value={progress} label={`${doneCount}/4 完成`} />
          <span>{progress === 100 ? "今日计划已完成" : "今日计划"}</span>
        </div>
      </section>

      <section className="summary-grid">
        {summaries.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`summary-card summary-card--${item.accent}`}
              key={item.id}
              onClick={() => navigate(item.id)}
            >
              <span className="summary-card__icon">
                <Icon size={19} />
              </span>
              <span className="summary-card__label">{item.label}</span>
              <strong>{item.value}</strong>
              <span className="summary-card__unit">{item.unit}</span>
              <span className="summary-card__note">{item.note}</span>
            </button>
          );
        })}
      </section>

      <div className="home-columns">
        <section className="panel plan-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">TODAY'S PLAN</span>
              <h2>今日计划</h2>
            </div>
            <span className="quiet-label">{doneCount} / {plan.length}</span>
          </div>
          <div className="plan-list">
            {plan.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`plan-row ${item.done ? "is-done" : ""}`}
                  key={item.id}
                  onClick={() => navigate(item.id)}
                >
                  <span className="plan-row__check">
                    {item.done ? <Check size={15} /> : <Circle size={14} />}
                  </span>
                  <span className="plan-row__icon">
                    <Icon size={18} />
                  </span>
                  <span className="plan-row__text">
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <ArrowRight size={17} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel memo-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">QUICK NOTE</span>
              <h2>快速备忘</h2>
            </div>
            <span className={`save-state ${saveState === "保存中" ? "is-saving" : ""}`}>
              {saveState}
            </span>
          </div>
          <textarea
            value={memo}
            onChange={(event) => updateMemo(event.target.value)}
            placeholder="记下一个新词、一个疑问，或今天最想完成的一件事……"
            aria-label="今日快速备忘"
          />
          <div className="memo-footer">
            <Sparkles size={16} />
            <span>内容只保存在这台电脑的浏览器中</span>
          </div>
        </section>
      </div>

      <ActivityCalendar
        activityByDate={data.activityByDate}
        today={data.today}
      />
      <BackupPanel
        latestBackup={data.latestBackup}
        today={data.today}
        refresh={refresh}
        showToast={showToast}
      />
    </div>
  );
}
