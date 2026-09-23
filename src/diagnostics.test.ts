import { expect, test, vi } from "vitest";
import { describeFailure, diagnosticSummary } from "./diagnostics";
vi.mock("./build-info", () => ({
  buildSummary: "RHINE ARCHIVE\n版本：test\n构建：test-build",
}));

test("classifies full storage and permission errors with recovery actions", () => {
  expect(
    describeFailure("save", new DOMException("Full", "QuotaExceededError"))
      .code,
  ).toBe("STORAGE_FULL");
  expect(describeFailure("save", "Permission denied (os error 13)").code).toBe(
    "ACCESS_DENIED",
  );
  expect(describeFailure("save", "database is locked").code).toBe(
    "STORAGE_BUSY",
  );
  expect(
    describeFailure("load", new SyntaxError("Unexpected token in JSON")).code,
  ).toBe("INVALID_DATA");
});

test("diagnostic copy excludes arbitrary exception payloads and document paths", () => {
  const privateText = 'C:\\Users\\Alice\\秘密教材.pdf {"note":"私人笔记"}';
  const failure = describeFailure(
    "restore",
    new Error(`Invalid JSON: ${privateText}`),
  );
  expect(failure.details).toContain(privateText);
  const summary = diagnosticSummary(failure);
  expect(summary).toContain("INVALID_DATA");
  expect(summary).toContain("RHINE ARCHIVE");
  expect(summary).not.toMatch(/Alice|秘密教材|私人笔记|Users/);
});
