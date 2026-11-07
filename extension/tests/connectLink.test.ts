import { describe, expect, it } from "vitest";
import { parseConnectLink } from "../lib/connectLink";

describe("connect links pasted into the options page", () => {
  it("reads the server and token from a desktop link", () => {
    expect(
      parseConnectLink("notesagain://connect?server=http%3A%2F%2F127.0.0.1%3A47821&token=nal_abc"),
    ).toEqual({ server: "http://127.0.0.1:47821", token: "nal_abc" });
  });

  it("leaves plain tokens alone", () => {
    expect(parseConnectLink("nal_abc")).toBeNull();
  });
});
