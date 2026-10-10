import { describe, expect, it } from "vitest";

// 実行環境の疎通確認だけを行う。正本由来のテストではない。
describe("test runner", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });
});
