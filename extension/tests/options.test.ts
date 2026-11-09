// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseConnectLink } from "../lib/connectLink";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), request: vi.fn() }));
vi.mock("wxt/browser", () => ({ browser: { permissions: { request: mocks.request } } }));
vi.mock("../lib/settings", () => ({
  DEFAULT_SETTINGS: { serverUrl: "http://localhost:8000" },
  DESKTOP_APP_URL: "http://127.0.0.1:47821",
  loadSettings: mocks.load,
  saveSettings: mocks.save,
}));
import { OptionsApp } from "../entrypoints/options/OptionsApp";

const link = "notesagain://connect?server=http%3A%2F%2F127.0.0.1%3A47821&token=nal_test_only";

beforeEach(() => {
  mocks.load.mockResolvedValue({ serverUrl: "http://localhost:8000", apiToken: "", appUrl: "" });
  mocks.save.mockReset();
  mocks.request.mockResolvedValue(true);
});
afterEach(cleanup);

it("recognizes a connection link pasted into the server field instead of rejecting its scheme", async () => {
  const user = userEvent.setup();
  render(createElement(OptionsApp));
  const server = await screen.findByLabelText("Server URL");
  await user.clear(server);
  await user.paste(link);
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      serverUrl: "http://127.0.0.1:47821",
      apiToken: "nal_test_only",
      appUrl: "",
    }),
  );
  expect(screen.queryByText("Only http:// and https:// URLs are supported.")).toBeNull();
});

it("shows one masked desktop-link field without the manual server fields", async () => {
  const user = userEvent.setup();
  render(createElement(OptionsApp));
  await screen.findByLabelText("Server URL");
  await user.click(screen.getByRole("button", { name: "Use the desktop app" }));
  const field = screen.getByLabelText("Desktop connection link");
  expect(field.getAttribute("type")).toBe("password");
  expect(document.activeElement).toBe(field);
  expect(screen.queryByLabelText("Server URL")).toBeNull();
  expect(screen.queryByLabelText("API token")).toBeNull();
  expect(screen.queryByLabelText("App URL (optional)")).toBeNull();
  await user.paste(link);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved. Keep Notes Again running when capturing pages.");
  expect(mocks.save).toHaveBeenCalledWith({
    serverUrl: "http://127.0.0.1:47821",
    apiToken: "nal_test_only",
    appUrl: "",
    connectionMode: "desktop",
  });
  expect(document.body.textContent).not.toContain("nal_test_only");
});

it("keeps connection-link pasting in the legacy token field working", async () => {
  const user = userEvent.setup();
  render(createElement(OptionsApp));
  const token = await screen.findByLabelText("API token");
  await user.click(token);
  await user.paste(link);
  expect(screen.getByLabelText("Desktop connection link")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({ apiToken: "nal_test_only", connectionMode: "desktop" }),
  );
});

it("explains incomplete links without saving or showing their token", async () => {
  const user = userEvent.setup();
  render(createElement(OptionsApp));
  await user.click(await screen.findByLabelText("Server URL"));
  await user.clear(screen.getByLabelText("Server URL"));
  await user.paste("notesagain://connect?token=nal_test_only");
  expect(screen.getByLabelText("Desktop connection link").getAttribute("type")).toBe("password");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert").textContent).toContain("Paste the full connection link");
  expect(screen.getByRole("alert").textContent).not.toContain("nal_test_only");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("rejects unsafe linked server addresses without exposing credentials", async () => {
  const user = userEvent.setup();
  render(createElement(OptionsApp));
  await screen.findByLabelText("Server URL");
  await user.click(screen.getByRole("button", { name: "Use the desktop app" }));
  await user.paste(
    "notesagain://connect?server=http%3A%2F%2Fpublic.example.com&token=nal_test_only",
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert").textContent).toContain("unsupported server address");
  expect(document.body.textContent).not.toContain("nal_test_only");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("preserves manual self-hosted connection settings", async () => {
  const user = userEvent.setup();
  mocks.load.mockResolvedValue({
    serverUrl: "https://notes.example.com",
    apiToken: "nal_server_test",
    appUrl: "https://app.example.com",
    connectionMode: "server",
  });
  render(createElement(OptionsApp));
  await screen.findByLabelText("Server URL");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(mocks.save).toHaveBeenCalledWith({
    serverUrl: "https://notes.example.com",
    apiToken: "nal_server_test",
    appUrl: "https://app.example.com",
    connectionMode: "server",
  });
});

it("restores the desktop form for existing desktop connections", async () => {
  mocks.load.mockResolvedValue({
    serverUrl: "http://127.0.0.1:47821",
    apiToken: "nal_existing_test",
    appUrl: "",
  });
  render(createElement(OptionsApp));
  const input = (await screen.findByLabelText("Desktop connection link")) as HTMLInputElement;
  expect(parseConnectLink(input.value)).toEqual({
    server: "http://127.0.0.1:47821",
    token: "nal_existing_test",
  });
  expect(screen.queryByLabelText("Server URL")).toBeNull();
});
