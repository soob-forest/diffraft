import { describe, expect, it } from "vitest";
import { DraftStore } from "../src/drafts/store";
import { validCommentDraft } from "../src/review/comment-draft";

describe("session drafts", () => {
  it("retains drafts after unsubscribe, isolates contexts and app sessions", () => {
    const store = new DraftStore();
    const key = JSON.stringify(["request", "doc1", "task1"]);
    const unsubscribe = store.subscribe(() => {});
    store.write(key, "unsent");
    unsubscribe();
    expect(store.read(key, "")).toBe("unsent");
    expect(store.read(JSON.stringify(["request", "doc2", "task1"]), "")).toBe(
      "",
    );
    expect(new DraftStore().read(key, "")).toBe("");
  });
  it("late saves cannot clear a newer draft and explicit clear affects only its key", () => {
    const store = new DraftStore();
    const sent = { text: "sent" };
    store.write("a", sent);
    store.write("b", "other");
    store.write("a", { text: "new" });
    store.replace("a", sent, { text: "" });
    expect(store.read("a", sent).text).toBe("new");
    store.write("a", { text: "" });
    expect(store.read("b", "")).toBe("other");
  });
  it("requires reconfirmation after revision or quote changes", () => {
    const draft = {
      id: "id",
      text: "fix",
      revision: 1,
      target: { fromUtf16: 0, toUtf16: 2, quote: "한글" },
    };
    expect(validCommentDraft(draft, 1, "한글 원문")).toBe(true);
    expect(validCommentDraft(draft, 2, "한글 원문")).toBe(false);
    expect(validCommentDraft(draft, 1, "변경 원문")).toBe(false);
  });
});
