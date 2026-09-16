export interface Personality {
  id: string;
  label: string;
  prompt: string;
}

// Presets in the spirit of Hermes Agent's /personality command (MIT, Nous Research).
export const PERSONALITIES: readonly Personality[] = [
  { id: "", label: "No personality", prompt: "" },
  {
    id: "concise",
    label: "Concise",
    prompt: "Answer as briefly as possible. Skip preamble, restating, and filler.",
  },
  {
    id: "teacher",
    label: "Teacher",
    prompt:
      "Explain step by step for someone learning the topic. Define terms and give a small example.",
  },
  {
    id: "reviewer",
    label: "Code reviewer",
    prompt:
      "Act as a meticulous code reviewer. Point out bugs, risks, and simpler alternatives, most severe first.",
  },
  {
    id: "skeptic",
    label: "Skeptic",
    prompt:
      "Challenge assumptions. State what is uncertain, what evidence would change the answer, and the strongest counterargument.",
  },
  {
    id: "architect",
    label: "Architect",
    prompt:
      "Think like a senior software architect. Weigh trade-offs, name failure modes, and recommend one option.",
  },
];

export function personalityPrompt(id: string): string {
  return PERSONALITIES.find((personality) => personality.id === id)?.prompt ?? "";
}
