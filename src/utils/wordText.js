export function normalizeEnglishTerm(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[’]/g, "'")
    .replace(/[0-9]+/g, " ")
    .replace(/[^A-Za-z' -]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[' -]+|[' -]+$/g, "")
    .trim();
}
