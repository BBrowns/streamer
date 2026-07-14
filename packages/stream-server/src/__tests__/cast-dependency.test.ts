import { describe, expect, it } from "vitest";

describe("cast dependency compatibility", () => {
  it("loads the cast client with the security-patched protobuf override", async () => {
    const cast = await import("castv2-client");

    expect(cast.Client).toBeTypeOf("function");
    expect(cast.DefaultMediaReceiver).toBeTypeOf("function");

    const client = new cast.Client();
    expect(client).toBeInstanceOf(cast.Client);
  });
});
