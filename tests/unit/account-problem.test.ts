import { describe, expect, it } from "vitest";

import { isAccountProblem } from "../../src/shared/account-problem";

describe("isAccountProblem", () => {
  it.each([
    // Zenith's own messages.
    "No API key configured for anthropic.",
    "No credential configured for openai.",
    "Claude Code isn't signed in. Run `claude` in a terminal to sign in.",
    "Gemini CLI isn't signed in. Run `gemini` in a terminal once to sign in.",
    // Relayed from the tools and APIs.
    "Gemini API key is missing or not configured.",
    "This client is no longer supported for your account.",
    "You have exhausted your capacity on this model. Your quota will reset after 7h12m.",
    "Claude AI usage limit reached|1760000000",
    "You've hit your limit · resets 5pm",
    'Anthropic request failed: 429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}',
    'Anthropic request failed: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    "Anthropic request failed: 400 Your credit balance is too low to access the Anthropic API.",
    "OpenAI request failed: 429 You exceeded your current quota, please check your plan and billing details.",
    'OpenRouter request failed: 402 {"error":{"message":"Insufficient credits","code":402}}',
    "Please run /login · Invalid API key",
    "You are not authorized to use this Copilot feature.",
  ])("matches %s", (message) => {
    expect(isAccountProblem(message)).toBe(true);
  });

  it.each([
    "Claude Code exited with code 1.",
    "Gemini CLI exited with code unknown.",
    "Ollama isn't running.",
    "This connection can't read images. Remove the image, or switch to Claude Code, an API provider, Ollama, or LM Studio.",
    "Unsupported model id: bad model",
    "The conversation must end with a user message.",
    'Anthropic request failed: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
    "fetch failed",
    "Couldn't load this pane's agent: file not found",
  ])("does not match %s", (message) => {
    expect(isAccountProblem(message)).toBe(false);
  });
});
