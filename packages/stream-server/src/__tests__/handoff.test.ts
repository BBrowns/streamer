import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { legacyHandoffRequest } from "../handoff.js";

function responseDouble() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe("Handoff API", () => {
  it("returns 400 if magnet is missing", () => {
    const response = responseDouble();

    legacyHandoffRequest({ body: {} } as Request, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: "Magnet link is required",
    });
  });

  it("retires legacy magnet handoff without claiming false success", () => {
    const magnet = "magnet:?xt=urn:btih:sensitive";
    const response = responseDouble();

    legacyHandoffRequest(
      {
        body: { magnet, title: "Test Movie", position: 120 },
      } as Request,
      response,
    );

    expect(response.status).toHaveBeenCalledWith(410);
    const body = response.json.mock.calls[0]?.[0];
    expect(body).toEqual({
      protocolVersion: 1,
      error: {
        code: "PROTOCOL_UNSUPPORTED",
        message:
          "Legacy playback handoff is retired. Create a bridge v1 job instead.",
        retryable: false,
      },
    });
    expect(JSON.stringify(body)).not.toContain(magnet);
  });
});
