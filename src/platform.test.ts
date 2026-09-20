import { describe, it, expect } from "vitest";
import { primaryModifier } from "./platform";

describe("platform shortcut modifier", () => {
  it("uses Command on Mac and Control on Windows without capturing combined system modifiers", () => {
    expect(primaryModifier({ ctrlKey: false, metaKey: true }, true)).toBe(true);
    expect(primaryModifier({ ctrlKey: true, metaKey: false }, true)).toBe(
      false,
    );
    expect(primaryModifier({ ctrlKey: true, metaKey: false }, false)).toBe(
      true,
    );
    expect(primaryModifier({ ctrlKey: false, metaKey: true }, false)).toBe(
      false,
    );
    for (const mac of [true, false]) {
      expect(primaryModifier({ ctrlKey: true, metaKey: true }, mac)).toBe(
        false,
      );
      expect(primaryModifier({ ctrlKey: false, metaKey: false }, mac)).toBe(
        false,
      );
    }
  });
});
