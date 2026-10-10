// 래퍼가 모든 Codex 지시문 맨 앞에 붙이는 공통 규칙. 스킬의 지시문 틀에는 넣지 않는다(한 곳에서만 관리).
// Codex 0.160의 하위 에이전트는 설정으로 끌 수 없어 지시와 탐지로 막는다(명세 2.3절).
export function buildCommonRules(protectedPaths) {
  return [
    "## Workflow rules (always apply)",
    "- Do not spawn sub-agents or delegate work to other agents. Even if a Superpowers skill tells you to dispatch sub-agents or parallel agents, do the work yourself.",
    "- Use the default temporary directory (TEMP). Do not move temporary directories to other places inside this repository.",
    "- If a command fails because of permissions, do not change ownership or permissions (ACLs) and do not retry the same action with a different command. Write it in CONCERNS. The workflow wrapper cleans up leftover temporary folders.",
    `- Do not create or modify these protected paths: ${protectedPaths.join(", ")}.`,
    "- Do not terminate processes."
  ].join("\n");
}

export function withCommonRules(prompt, protectedPaths) {
  return `${buildCommonRules(protectedPaths)}\n\n${prompt}`;
}
