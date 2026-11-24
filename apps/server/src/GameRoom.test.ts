import { describe, expect, it } from "vitest";
import { sanitizeInput } from "./GameRoom.ts";

describe("sanitizeInput", () => {
  it("clamps and fills invalid fields", () => {
    expect(sanitizeInput({ moveX: 5, moveZ: Number.NaN, jump: "yes" })).toEqual({
      moveX: 1,
      moveZ: 0,
      jump: false,
    });
  });

  it("handles garbage", () => {
    expect(sanitizeInput(null)).toEqual({ moveX: 0, moveZ: 0, jump: false });
    expect(sanitizeInput("hack")).toEqual({ moveX: 0, moveZ: 0, jump: false });
  });
});
