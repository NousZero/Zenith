import { useCallback, useEffect, useRef, useState } from "react";

import { startRecording, type Recording } from "./recordSpeech";

// Push to talk for the composer: record, transcribe locally, and hand back the text. The button
// stays visible even when whisper is missing, so `problem` can explain what to install.
export function useDictation(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const current = useRef<Recording | undefined>(undefined);

  useEffect(() => {
    void window.zenith.voice
      .status()
      .then((status) => setProblem(status.available ? undefined : status.problem))
      .catch(() => setProblem("Speech to text is unavailable."));
  }, []);

  useEffect(() => {
    return () => current.current?.cancel();
  }, []);

  const toggle = useCallback(async () => {
    if (busy) return;
    if (!recording) {
      const status = await window.zenith.voice.status().catch(() => undefined);
      if (!status?.available) {
        setProblem(status?.problem ?? "Speech to text is unavailable.");
        return;
      }
      try {
        current.current = await startRecording();
        setProblem(undefined);
        setRecording(true);
      } catch {
        setProblem("Zenith could not use the microphone.");
      }
      return;
    }

    const session = current.current;
    current.current = undefined;
    setRecording(false);
    if (!session) return;
    setBusy(true);
    try {
      const audio = await session.stop();
      if (!audio) return;
      const text = await window.zenith.voice.transcribe(audio);
      if (text) onText(text);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Transcribing failed.");
    } finally {
      setBusy(false);
    }
  }, [busy, onText, recording]);

  return { recording, busy, problem, toggle };
}
