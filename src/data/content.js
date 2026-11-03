export const speakingPrompts = [
  {
    title: "A small win",
    prompt:
      "Describe a small win from this week. What happened, why did it matter, and what did you learn from it?",
    tips: ["用过去时讲清经过", "加入一个具体细节", "最后说出你的感受"]
  },
  {
    title: "Your ideal study day",
    prompt:
      "What would your ideal study day look like? Talk about when, where, and how you would learn English.",
    tips: ["使用 would 描述设想", "按时间顺序组织内容", "目标控制在 60 至 90 秒"]
  },
  {
    title: "A useful habit",
    prompt:
      "Introduce one habit that helps you learn. Explain how you started it and why you want to keep it.",
    tips: ["先给结论", "用 because 说明原因", "补充一个真实例子"]
  },
  {
    title: "Something you changed your mind about",
    prompt:
      "Talk about an idea or opinion you changed your mind about. What made you see it differently?",
    tips: ["先讲过去的看法", "用 however 或 but 转折", "说明改变后的认识"]
  },
  {
    title: "Your favourite place",
    prompt:
      "Describe a place where you feel calm or focused. Help the listener picture it clearly.",
    tips: ["先说整体印象", "加入声音、光线或气味", "说明它对你的意义"]
  },
  {
    title: "A problem you solved",
    prompt:
      "Describe a problem you solved recently. What options did you consider, and what was the result?",
    tips: ["交代问题背景", "使用 first、then、finally", "总结解决方法的得失"]
  },
  {
    title: "One thing to improve",
    prompt:
      "Choose one English skill you want to improve. Explain your reason and your next practical step.",
    tips: ["具体到听、说、读或写", "避免空泛目标", "给出可执行的一步"]
  }
];

export const readings = [
  {
    id: "morning-routine",
    title: "The Power of a Small Morning Routine",
    subtitle: "A short reading about starting the day with intention",
    difficulty: "中考",
    minutes: 4,
    paragraphs: [
      "Many people believe that a good morning must begin with a perfect plan. In fact, a routine becomes useful when it is simple enough to repeat. Ten quiet minutes can make more difference than an ambitious schedule that lasts only one day.",
      "A useful routine might include reviewing a few new words, reading one short paragraph aloud, or writing down the most important task of the day. The exact activity matters less than the decision to begin without checking messages or videos.",
      "The goal is not to control every minute. It is to create a calm starting point. When the first part of the day feels clear, it is easier to return to your study plan even after something unexpected happens."
    ],
    question: {
      prompt: "According to the passage, what makes a morning routine useful?",
      options: [
        "It is ambitious and unusual.",
        "It is simple enough to repeat.",
        "It controls every minute of the day.",
        "It begins with checking messages."
      ],
      answer: 1
    }
  },
  {
    id: "learning-from-mistakes",
    title: "Learning from a Difficult Sentence",
    subtitle: "Why confusion can be a useful part of reading",
    difficulty: "中考",
    minutes: 5,
    paragraphs: [
      "When a sentence is difficult, many readers stop at once. They may decide that the text is too hard and look for something easier. However, difficulty often shows exactly where new learning can begin.",
      "Instead of translating every word, first find the subject and the main verb. Then look at the words that connect ideas, such as because, although, or however. These small clues can turn a confusing sentence into a clear one.",
      "It is also helpful to explain the sentence in your own words. A perfect translation is not always necessary. If you can say what the writer means and why the sentence matters, you have done useful reading work."
    ],
    question: {
      prompt: "What should a reader do first when a sentence is difficult?",
      options: [
        "Translate every new word.",
        "Stop reading immediately.",
        "Find the subject and main verb.",
        "Look for a different article."
      ],
      answer: 2
    }
  },
  {
    id: "speaking-with-purpose",
    title: "Speak Before You Feel Ready",
    subtitle: "A practical way to build speaking confidence",
    difficulty: "中考",
    minutes: 4,
    paragraphs: [
      "Many learners wait until their grammar is perfect before they speak. This is understandable, but waiting can delay the most important kind of progress. Speaking is a skill, and skills develop through practice.",
      "A useful exercise is to answer one question for sixty seconds. You can record the answer, listen once, and notice one thing to improve. Perhaps your sentences were too short, or perhaps you paused too often. Changing one habit at a time makes practice manageable.",
      "Your first recording does not need to sound impressive. It only needs to give you useful information about what to practise next."
    ],
    question: {
      prompt: "What is the main advice in the passage?",
      options: [
        "Wait until your grammar is perfect.",
        "Practise speaking before you feel fully ready.",
        "Always speak for at least ten minutes.",
        "Avoid listening to your recordings."
      ],
      answer: 1
    }
  }
];
