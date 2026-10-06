// Codex가 실행한 명령에서 네트워크를 쓰는 명령을 찾는다. Windows unelevated 샌드박스는 네트워크를 막지 못하므로 탐지만 한다.
const PATTERNS = [
  { name: "pip install", re: /\bpip3?(\.exe)?\s+install\b|\b-m\s+pip\s+install\b|\buv\s+(pip\s+install|add|sync)\b/i },
  { name: "npm/yarn/pnpm", re: /\b(npm|pnpm)(\.cmd)?\s+(install|i|ci|add|update)\b|\byarn\s+(add|install)\b|\bnpx\s/i },
  { name: "download", re: /\b(curl|wget)(\.exe)?\b|\bInvoke-(WebRequest|RestMethod)\b|\b(iwr|irm)\s|\bStart-BitsTransfer\b|\bcertutil\b[^\n]*-urlcache/i },
  { name: "git remote", re: /\bgit\s+(clone|fetch|pull|push|ls-remote)\b/i },
  { name: "system package", re: /\b(winget|choco|scoop)\s+install\b/i },
  { name: "other installer", re: /\bcargo\s+install\b|\bgo\s+(get|install)\b/i },
  { name: "url", re: /\bhttps?:\/\//i }
];

export function findNetworkCommands(commands) {
  const found = [];
  for (const raw of commands ?? []) {
    const text = String(raw ?? "");
    const matches = PATTERNS.filter((pattern) => pattern.re.test(text)).map((pattern) => pattern.name);
    if (matches.length > 0) found.push({ command: text.replace(/\s+/g, " ").trim().slice(0, 300), matches });
  }
  return found;
}
