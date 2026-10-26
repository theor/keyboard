// Splits text into words the same way the keyboard does: an elision like
// "j'" is its own word, so "j'ai" is ["j'", "ai"].
// Plain TypeScript with no imports, so Node scripts can use it too.

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .split(/[^\p{L}'-]+/u)
    .flatMap((t) => t.match(/[^']+'|[^']+/g) ?? [])
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter(Boolean);
}

export function splitSentences(text: string): string[] {
  return text.split(/[.?!;:…]+/);
}
