import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteSaveQueue } from "../../mobile/src/utils/note-save-queue";

const initial = { name: "Original", content: "Original body" };

describe("mobile note save queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("flushes the latest writing before the debounce expires", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createNoteSaveQueue(initial, save, status);
    queue.update({ name: "Renamed" });
    queue.update({ content: "Latest body" });
    expect(save).not.toHaveBeenCalled();
    await queue.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith({ name: "Renamed", content: "Latest body" });
    expect(status).toHaveBeenLastCalledWith("saved");
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("coalesces edits into one debounced save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(initial, save, vi.fn());
    queue.update({ content: "First" });
    await vi.advanceTimersByTimeAsync(400);
    queue.update({ content: "Second" });
    await vi.advanceTimersByTimeAsync(799);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({ ...initial, content: "Second" });
  });

  it("serializes concurrent flushes and saves edits made during a request", async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(initial, save, vi.fn());
    queue.update({ content: "First" });
    const first = queue.flush();
    queue.update({ content: "Latest" });
    const second = queue.flush();
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ ...initial, content: "Latest" });
    await queue.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("rejects failed flushes so sharing and navigation can stop", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Save failed"))
      .mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createNoteSaveQueue(initial, save, status);
    queue.update({ content: "Keep this draft" });
    await expect(queue.flush()).rejects.toThrow("Save failed");
    expect(status).toHaveBeenLastCalledWith("error");
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({ ...initial, content: "Keep this draft" });
    expect(status).toHaveBeenLastCalledWith("saved");
  });

  it("handles background debounce failures without dropping pending writing", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue(undefined);
    const status = vi.fn();
    const queue = createNoteSaveQueue(initial, save, status);
    queue.update({ content: "Offline writing" });
    await vi.advanceTimersByTimeAsync(800);
    expect(status).toHaveBeenLastCalledWith("error");
    await queue.flush();
    expect(save).toHaveBeenLastCalledWith({ ...initial, content: "Offline writing" });
  });

  it("keeps the saved title when the title input is blank", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const queue = createNoteSaveQueue(initial, save, vi.fn());
    queue.update({ name: "   ", content: "New body" });
    await queue.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith({ ...initial, content: "New body" });
  });

  it("does not save untouched writing or writing reverted before debounce", async () => {
    const save = vi.fn();
    const status = vi.fn();
    const queue = createNoteSaveQueue(initial, save, status);
    await queue.flush();
    queue.update({ content: "Temporary" });
    queue.update({ content: initial.content });
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith("idle");
  });
});
