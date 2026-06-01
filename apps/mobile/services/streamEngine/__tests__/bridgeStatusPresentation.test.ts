import { getBridgeStatusPresentation } from "../bridgeStatusPresentation";

describe("getBridgeStatusPresentation", () => {
  it("keeps unsupported bridge copy user-facing and actionable", () => {
    const copy = getBridgeStatusPresentation("unsupported");

    expect(copy.title).toBe("Bridge needs repair");
    expect(copy.badge).toBe("Repair needed");
    expect(copy.detail).not.toMatch(/cpu mismatch/i);
    expect(copy.tone).toBe("error");
  });

  it("explains native architecture diagnostics without exposing raw dlopen output", () => {
    const copy = getBridgeStatusPresentation("unsupported", {
      reason: "native-architecture-mismatch",
      message:
        "dlopen(node_datachannel.node): mach-o file, but is an incompatible architecture",
    });

    expect(copy.detail).toContain("different processor architecture");
    expect(copy.detail).not.toContain("dlopen");
  });

  it("labels unreachable bridges as a connection setup issue", () => {
    const copy = getBridgeStatusPresentation("unreachable");

    expect(copy.title).toBe("Bridge not connected");
    expect(copy.badge).toBe("Needs bridge");
    expect(copy.tone).toBe("warning");
  });
});
