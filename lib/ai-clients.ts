export type AiClientId = "claude" | "claude-code" | "cursor" | "codex";

export const AI_CLIENTS: {
  id: AiClientId;
  label: string;
  logo: string;
  bg: string;
}[] = [
  { id: "claude", label: "Claude", logo: "/assets/ai/claude.png?v=2", bg: "#d97e5b" },
  { id: "claude-code", label: "Claude Code", logo: "/assets/ai/claude-code.png?v=2", bg: "#000" },
  { id: "cursor", label: "Cursor", logo: "/assets/ai/cursor.png?v=2", bg: "#000" },
  { id: "codex", label: "Codex", logo: "/assets/ai/codex.png?v=2", bg: "#fff" },
];
