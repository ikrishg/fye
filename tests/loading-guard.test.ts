import { describe, expect, it } from "vitest";
import { withLoadingFlag } from "@/lib/loading";

describe("loading guard", () => {
  it("clears loading when the wrapped work throws", async () => {
    const states: boolean[] = [];
    const setLoading = (value: boolean) => {
      states.push(value);
    };

    await expect(
      withLoadingFlag(setLoading, async () => {
        throw new Error("network failure");
      }),
    ).rejects.toThrow("network failure");

    expect(states).toEqual([true, false]);
  });
});
