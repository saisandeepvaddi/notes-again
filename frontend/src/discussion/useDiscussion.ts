import { useCallback, useEffect, useRef, useState } from "react";
import {
  consumeDiscussion,
  CredentialsSchema,
  historyFor,
  type DiscussionBody,
  type Turn,
} from "./core";
import { credentialSnapshot } from "./credentials";

export type DiscussionTransport = (body: DiscussionBody, signal: AbortSignal) => Promise<Response>;

export function useDiscussion(transport: DiscussionTransport, beforeSend?: () => Promise<unknown>) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const stop = useCallback(() => {
    active.current?.abort();
  }, []);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );

  const send = async (text = question) => {
    if (active.current) return;
    const parsed = CredentialsSchema.safeParse(credentialSnapshot().config);
    if (!parsed.success) {
      setError("Set your provider, model and API key in Discuss settings first.");
      return;
    }
    if (!text.trim() || Array.from(text).length > 2_000) {
      setError("Ask a question of 1–2,000 characters.");
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setError(null);
    setRunning(true);
    const config = parsed.data;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const update = (change: Partial<Turn>) =>
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, ...change } : turn)),
      );
    let answer = "";
    let started = false;
    try {
      await beforeSend?.();
      if (controller.signal.aborted) return;
      const history = historyFor(turnsRef.current);
      setTurns((current) => [
        ...current.slice(-19),
        {
          id,
          question: text.trim(),
          answer: "",
          status: "streaming",
          provider: config.provider,
          model: config.model,
        },
      ]);
      started = true;
      setQuestion("");
      const response = await transport(
        {
          provider: config.provider,
          model: config.model,
          api_key: config.apiKey,
          question: text.trim(),
          history,
        },
        controller.signal,
      );
      await consumeDiscussion(response, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "delta") {
          answer += event.text;
          if (answer.length > 40_000) throw new Error("The response exceeded its size limit.");
          update({ answer });
        } else if (event.type === "context")
          update({ context: event.context, provider: event.provider, model: event.model });
        else if (event.type === "usage")
          update({ usage: { input: event.input_tokens, output: event.output_tokens } });
        else if (event.type === "limit") update({ notice: event.message });
      });
      if (!answer.trim())
        throw new Error(
          "The provider returned no answer text. Check the model and output limit before trying again.",
        );
      update({ status: controller.signal.aborted ? "stopped" : "done" });
    } catch (failure) {
      if (started) update({ status: controller.signal.aborted ? "stopped" : "error" });
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "The discussion failed. No automatic retry was made.",
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setRunning(false);
      }
    }
  };

  const clear = () => {
    if (!active.current) {
      setTurns([]);
      setError(null);
    }
  };
  return { turns, question, setQuestion, running, error, send, stop, clear };
}
