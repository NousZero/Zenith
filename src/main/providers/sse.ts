// Each non-empty line of a streamed response body, trimmed.
export async function* readLines(response: Response, signal?: AbortSignal): AsyncIterable<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response had no readable body.");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line !== "") yield line;
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* readSseLines(
  response: Response,
  signal?: AbortSignal,
): AsyncIterable<string> {
  for await (const line of readLines(response, signal)) {
    if (line.startsWith("data:")) yield line.slice(5).trim();
  }
}
