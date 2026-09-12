"use client";
import { useCallback, useRef, useState, type SetStateAction } from "react";
export function useUndoState<T>(initial: () => T) {
  const [value, update] = useState(initial);
  const current = useRef(value);
  const past = useRef<T[]>([]), future = useRef<T[]>([]);
  const set = useCallback((next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (old: T) => T)(current.current) : next;
    if (resolved === current.current) return;
    past.current = [...past.current.slice(-49), current.current]; future.current = [];
    current.current = resolved; update(resolved);
  }, []);
  const reset = useCallback((next: T) => { past.current = []; future.current = []; current.current = next; update(next); }, []);
  const undo = () => { const next = past.current.pop(); if (next === undefined) return; future.current.push(current.current); current.current = next; update(next); };
  const redo = () => { const next = future.current.pop(); if (next === undefined) return; past.current.push(current.current); current.current = next; update(next); };
  return { value, set, reset, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
