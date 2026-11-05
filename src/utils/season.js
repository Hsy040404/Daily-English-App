export const seasons = {
  spring: { label: "春季", months: [3, 4, 5] },
  summer: { label: "夏季", months: [6, 7, 8] },
  autumn: { label: "秋季", months: [9, 10, 11] },
  winter: { label: "冬季", months: [12, 1, 2] }
};

export function getSeasonForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  return (
    Object.entries(seasons).find(([, season]) =>
      season.months.includes(month)
    )?.[0] || "spring"
  );
}

export function getSeasonLabel(season) {
  return seasons[season]?.label || seasons.spring.label;
}
