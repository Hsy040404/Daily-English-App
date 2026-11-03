export function importedMaterialToArticle(material) {
  const paragraphs = String(material.text || "")
    .split(/\n{2,}|\r?\n(?=\S)/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const wordCount = String(material.text || "")
    .split(/\s+/)
    .filter(Boolean).length;
  const title = material.fileName.replace(/\.(docx|pdf)$/i, "");

  return {
    id: `material-${material.id}`,
    materialId: material.id,
    title,
    subtitle: `导入自 ${material.format} · ${new Date(material.importedAt).toLocaleDateString("zh-CN")}`,
    difficulty: "导入素材",
    minutes: Math.max(1, Math.ceil(wordCount / 180)),
    paragraphs,
    question: null,
    sourceName: material.fileName,
    imported: true
  };
}

export function readingMaterialsToArticles(materials) {
  return materials
    .filter((material) => material.module === "reading")
    .map(importedMaterialToArticle);
}
