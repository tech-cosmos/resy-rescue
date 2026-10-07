import OpenAI from "openai";

// OpenRouter exposes an OpenAI-compatible API, so the openai SDK works with a baseURL swap.
export const MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.8-flash";

export const llm = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: { "X-Title": "Resy Rescue" },
    })
  : null;

export function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}
