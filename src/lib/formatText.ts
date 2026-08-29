export function extractMentions(text: string): string[] {
  const matches = text.match(/@(\w+)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

export function formatPostText(text: string): string {
  // For basic formatting (links, etc.) you might want to use a library like `react-native-parsed-text`
  // We'll keep it simple for now.
  return text;
}