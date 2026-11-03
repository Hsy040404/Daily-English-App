import { useMemo, useState } from "react";
import {
  ArrowRight,
  Brain,
  Check,
  Eye,
  Flame,
  RotateCcw,
  Sparkles,
  Target,
  X
} from "lucide-react";
import { scheduleReview } from "../db";
import { PageHeading, ProgressRing } from "../components/ui";

const ratings = [
  {
    id: "again",
    label: "忘记了",
    hint: "明天再复习",
    className: "again",
    icon: X
  },
  {
    id: "hard",
    label: "有点模糊",
    hint: "两天后复习",
    className: "hard",
    icon: Brain
  },
  {
    id: "good",
    label: "记得很稳",
    hint: "延长复习间隔",
    className: "good",
    icon: Check
  }
];

export default function Review({ data, refresh, showToast, navigate }) {
  const [session, setSession] = useState(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState({ again: 0, hard: 0, good: 0 });
  const [saving, setSaving] = useState(false);

  const candidates = useMemo(
    () =>
      data.dueWords.length
        ? data.dueWords.slice(0, data.reviewTarget)
        : data.todayWords,
    [data.dueWords, data.reviewTarget, data.todayWords]
  );
  const current = session?.[index];
  const direction = index % 2 === 0 ? "en" : "cn";
  const completed = session && index >= session.length;
  const progress = session?.length ? (index / session.length) * 100 : 0;

  function start(fallback = false) {
    const words = fallback ? data.todayWords : data.dueWords.slice(0, data.reviewTarget);
    setSession(words);
    setIndex(0);
    setAnswer("");
    setRevealed(false);
    setResults({ again: 0, hard: 0, good: 0 });
  }

  async function rate(rating) {
    if (!current || saving) return;
    setSaving(true);
    await scheduleReview(current, rating);
    setResults((value) => ({ ...value, [rating]: value[rating] + 1 }));
    setIndex((value) => value + 1);
    setAnswer("");
    setRevealed(false);
    setSaving(false);
    await refresh({ light: true });
    if (index + 1 >= session.length) {
      showToast("本轮复习完成");
    }
  }

  return (
    <div className="page review-page">
      <PageHeading
        eyebrow="REVIEW"
        title="复习"
        description="让复习时间跟随记忆状态变化：忘记的词早点回来，熟悉的词慢慢拉开间隔。"
        actions={
          <button
            className="secondary-button"
            onClick={() => navigate("words")}
          >
            前往词库
          </button>
        }
      />

      {!session ? (
        <>
          <section className="review-overview">
            <div className="review-main-card">
              <div className="review-main-card__copy">
                <span className="eyebrow">SPACED REVIEW</span>
                <h2>{data.dueCount ? "今天的记忆在等你" : "今天的记忆任务很轻"}</h2>
                <p>
                  {data.dueCount
                    ? `有 ${data.dueCount} 个词已经到达适合再次复习的时间。`
                    : "没有到期单词。你也可以主动复习今天的新词，加深第一遍印象。"}
                </p>
                <button
                  className="primary-button"
                  onClick={() => start(!data.dueCount && data.todayWords.length > 0)}
                  disabled={!candidates.length}
                >
                  {data.dueCount ? "开始今日复习" : "复习今日单词"}
                  <ArrowRight size={17} />
                </button>
              </div>
              <ProgressRing
                value={
                  data.todayReviewCount
                    ? Math.min(100, (data.todayReviewCount / Math.max(1, data.reviewTarget)) * 100)
                    : 0
                }
                size={126}
                stroke={10}
                label={`${data.todayReviewCount} 次`}
              />
            </div>
            <div className="review-metric">
              <Target size={20} />
              <span>今日待复习</span>
              <strong>{data.dueCount}</strong>
            </div>
            <div className="review-metric">
              <Flame size={20} />
              <span>今日已完成</span>
              <strong>{data.todayReviewCount}</strong>
            </div>
            <div className="review-metric">
              <Sparkles size={20} />
              <span>已掌握</span>
              <strong>{data.knownCount}</strong>
            </div>
          </section>

          <section className="panel review-preview">
            <div className="section-heading">
              <div>
                <span className="eyebrow">UP NEXT</span>
                <h2>接下来会复习的词</h2>
              </div>
              <span className="quiet-label">最多 {data.reviewTarget} 个</span>
            </div>
            {candidates.length ? (
              <div className="due-word-grid">
                {candidates.slice(0, 12).map((word, wordIndex) => (
                  <div key={`${word.id}-${wordIndex}`}>
                    <span>{word.english}</span>
                    <small>
                      {word.status === "unfamiliar"
                        ? "待加强"
                        : word.status === "learning"
                          ? "正在学习"
                          : "已掌握"}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="review-empty">
                <Check size={22} />
                <p>导入一些词并完成第一次学习后，复习队列会自动出现。</p>
              </div>
            )}
          </section>
        </>
      ) : completed ? (
        <section className="review-complete panel">
          <div className="complete-mark">
            <Check size={30} />
          </div>
          <span className="eyebrow">SESSION COMPLETE</span>
          <h2>这一轮复习完成了</h2>
          <p>
            记住 {results.good} 个，模糊 {results.hard} 个，忘记 {results.again} 个。
            忘记的词会在明天回来。
          </p>
          <div className="complete-stats">
            <div><strong>{results.good}</strong><span>记得稳</span></div>
            <div><strong>{results.hard}</strong><span>要再看</span></div>
            <div><strong>{results.again}</strong><span>重新记忆</span></div>
          </div>
          <div className="complete-actions">
            <button className="secondary-button" onClick={() => setSession(null)}>
              返回复习首页
            </button>
            {data.todayWords.length ? (
              <button className="primary-button" onClick={() => start(true)}>
                再复习今日单词
              </button>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="review-session">
          <div className="review-session__top">
            <button className="text-button" onClick={() => setSession(null)}>
              <RotateCcw size={15} /> 暂停
            </button>
            <span>{index + 1} / {session.length}</span>
            <div className="session-progress"><span style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="review-card panel">
            <span className="eyebrow">
              {direction === "en" ? "说出或写出中文意思" : "写出对应的英文单词"}
            </span>
            <h2 className={direction === "cn" ? "is-chinese" : ""}>
              {direction === "en" ? current.english : current.chinese}
            </h2>
            <label className="review-answer">
              <span>你的答案</span>
              <input
                autoFocus
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="先在脑中回忆，也可以写下来"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !revealed) setRevealed(true);
                }}
              />
            </label>
            {!revealed ? (
              <button className="primary-button" onClick={() => setRevealed(true)}>
                <Eye size={17} /> 查看答案
              </button>
            ) : (
              <div className="review-reveal">
                <span>正确答案</span>
                <strong>{direction === "en" ? current.chinese : current.english}</strong>
                {current.note ? <p>{current.note}</p> : null}
              </div>
            )}

            {revealed ? (
              <div className="review-ratings">
                <p>这次回忆得怎么样？</p>
                <div>
                  {ratings.map((rating) => {
                    const Icon = rating.icon;
                    return (
                      <button
                        className={`review-rating review-rating--${rating.className}`}
                        key={rating.id}
                        onClick={() => rate(rating.id)}
                        disabled={saving}
                      >
                        <Icon size={19} />
                        <strong>{rating.label}</strong>
                        <span>{rating.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
