import { useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mic2,
  RotateCcw
} from "lucide-react";
import { localDateKey } from "../utils/date";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function monthLabel(year, month) {
  return `${year}年${month + 1}月`;
}

export default function ActivityCalendar({ activityByDate, today }) {
  const current = new Date();
  const [cursor, setCursor] = useState(
    new Date(current.getFullYear(), current.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, index) =>
      localDateKey(new Date(year, month, index + 1))
    )
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedActivity = activityByDate[selectedDate] || {
    words: 0,
    reviews: 0,
    speaking: 0
  };

  function moveMonth(offset) {
    setCursor(new Date(year, month + offset, 1));
  }

  return (
    <section className="activity-calendar panel">
      <div className="calendar-main">
        <div className="calendar-heading">
          <div>
            <span className="eyebrow">DAILY PROGRESS</span>
            <h2>学习日期表</h2>
          </div>
          <div className="calendar-navigation">
            <button onClick={() => moveMonth(-1)} aria-label="上个月">
              <ChevronLeft size={17} />
            </button>
            <strong>{monthLabel(year, month)}</strong>
            <button onClick={() => moveMonth(1)} aria-label="下个月">
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
        <div className="calendar-weekdays">
          {weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
        <div className="calendar-grid">
          {cells.map((date, index) => {
            if (!date) return <span className="calendar-blank" key={`blank-${index}`} />;
            const activity = activityByDate[date];
            const completedKinds = activity
              ? ["words", "reviews", "speaking"].filter(
                  (key) => activity[key] > 0
                ).length
              : 0;
            return (
              <button
                key={date}
                data-date={date}
                className={[
                  "calendar-day",
                  date === selectedDate ? "is-selected" : "",
                  date === today ? "is-today" : "",
                  activity ? "has-activity" : ""
                ].join(" ")}
                onClick={() => setSelectedDate(date)}
                aria-label={`${date}，完成 ${completedKinds} 项`}
              >
                <span>{Number(date.slice(-2))}</span>
                <i>
                  {activity?.words > 0 ? <b className="dot-words" /> : null}
                  {activity?.reviews > 0 ? <b className="dot-reviews" /> : null}
                  {activity?.speaking > 0 ? <b className="dot-speaking" /> : null}
                </i>
              </button>
            );
          })}
        </div>
      </div>

      <aside className="calendar-detail">
        <div className="calendar-detail__date">
          <CalendarDays size={19} />
          <div>
            <span>当日进度</span>
            <strong>{selectedDate}</strong>
          </div>
        </div>
        <div className="calendar-metrics">
          <div>
            <BookOpen size={16} />
            <span>单词</span>
            <strong>{selectedActivity.words}</strong>
          </div>
          <div>
            <RotateCcw size={16} />
            <span>复习</span>
            <strong>{selectedActivity.reviews}</strong>
          </div>
          <div>
            <Mic2 size={16} />
            <span>口语</span>
            <strong>{selectedActivity.speaking}</strong>
          </div>
        </div>
        <p>
          {Object.values(selectedActivity).some((value) => value > 0)
            ? "圆点代表当天完成的模块，点击其他日期查看记录。"
            : "这一天还没有完成记录。"}
        </p>
      </aside>
    </section>
  );
}
