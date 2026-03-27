import { useState, useCallback } from 'react';

export function useUndoRedo<T>(initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const undo = useCallback(() => {
    if (!canUndo) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    setPast(newPast);
    setFuture([state, ...future]);
    setState(previous);
  }, [canUndo, past, state, future]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    const next = future[0];
    const newFuture = future.slice(1);

    setPast([...past, state]);
    setFuture(newFuture);
    setState(next);
  }, [canRedo, future, past, state]);

  const set = useCallback((newS: T) => {
    if (JSON.stringify(newS) === JSON.stringify(state)) return;
    setPast([...past, state]);
    setState(newS);
    setFuture([]);
  }, [past, state]);

  return { state, set, undo, redo, canUndo, canRedo };
}
