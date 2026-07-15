import {
  DESTRUCTIVE_UNDO_MS,
  clearPendingUndoableActionsForTests,
  hasPendingUndoableAction,
  scheduleUndoableAction,
} from "../undoableAction";

describe("undoableAction", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clearPendingUndoableActionsForTests();
  });

  afterEach(() => {
    clearPendingUndoableActionsForTests();
    jest.useRealTimers();
  });

  it("commits once after the grace period", async () => {
    const commit = jest.fn();
    expect(DESTRUCTIVE_UNDO_MS).toBe(7_000);
    scheduleUndoableAction({ key: "one", commit });

    jest.advanceTimersByTime(6_999);
    expect(commit).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(hasPendingUndoableAction("one")).toBe(false);
  });

  it("cancels the commit when undone", () => {
    const commit = jest.fn();
    const action = scheduleUndoableAction({ key: "one", commit });

    expect(action.undo()).toBe(true);
    jest.runAllTimers();

    expect(commit).not.toHaveBeenCalled();
  });
});
