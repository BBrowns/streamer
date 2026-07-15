export const DESTRUCTIVE_UNDO_MS = 7_000;

type UndoableActionOptions = {
  key: string;
  commit: () => void | Promise<void>;
  delayMs?: number;
  onError?: (error: unknown) => void;
};

const pendingActions = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleUndoableAction({
  key,
  commit,
  delayMs = DESTRUCTIVE_UNDO_MS,
  onError,
}: UndoableActionOptions) {
  cancelUndoableAction(key);

  const timer = setTimeout(() => {
    pendingActions.delete(key);
    Promise.resolve(commit()).catch((error) => onError?.(error));
  }, delayMs);
  pendingActions.set(key, timer);

  return {
    undo: () => cancelUndoableAction(key),
  };
}

export function cancelUndoableAction(key: string) {
  const timer = pendingActions.get(key);
  if (!timer) return false;
  clearTimeout(timer);
  pendingActions.delete(key);
  return true;
}

export function hasPendingUndoableAction(key: string) {
  return pendingActions.has(key);
}

export function clearPendingUndoableActionsForTests() {
  for (const timer of pendingActions.values()) clearTimeout(timer);
  pendingActions.clear();
}
