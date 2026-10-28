import { describe, expect, it } from "vitest";
import { buildConnectLink, parseConnectLink } from "../src/settings/api-tokens/connectLink";

describe("connect links", () => {
  it("round-trips servers and tokens that need escaping", () => {
    const link = { server: "https://notes.example.com:8443/sub path?x=1&y=2", token: "nal_a+b/c=" };
    expect(parseConnectLink(buildConnectLink(link))).toEqual(link);
  });

  it("ignores surrounding whitespace from scanners and pastes", () => {
    const link = buildConnectLink({ server: "http://10.0.0.2:8000", token: "nal_abc" });
    expect(parseConnectLink(`  ${link}\n`)).toEqual({
      server: "http://10.0.0.2:8000",
      token: "nal_abc",
    });
  });

  it.each([
    ["another scheme", "https://connect?server=x&token=nal_abc"],
    ["a missing token", "notesagain://connect?server=http%3A%2F%2Fx"],
    ["a missing server", "notesagain://connect?token=nal_abc"],
    ["a token that isn't an API token", "notesagain://connect?server=x&token=abc"],
    ["broken percent-encoding", "notesagain://connect?server=%E0%A4%A&token=nal_abc"],
    ["a blank server", "notesagain://connect?server=%20&token=nal_abc"],
  ])("rejects %s", (_reason, text) => {
    expect(parseConnectLink(text)).toBeNull();
  });
});
