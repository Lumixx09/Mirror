import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { wsUrl, type MirrorEvent } from '../api';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'offline';

type Listener = (event: MirrorEvent) => void;

export interface EventStream {
  state: ConnectionState;
  subscribe: (fn: Listener) => () => void;
}

export const EventStreamContext = createContext<EventStream>({ state: 'offline', subscribe: () => () => undefined });

/**
 * One authenticated WebSocket per signed-in session. Events only trigger refetches: server state is
 * the source of truth, so a missed event is harmless and every reconnect refetches.
 */
export function useEventStreamConnection(enabled: boolean): EventStream {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>('connecting');
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    if (!enabled) {
      setState('offline');
      return;
    }
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let opened = false;

    // Events can arrive faster than a refetch completes. Batch invalidations into one flush and
    // never cancel an in-flight request, otherwise a busy run would never finish refetching.
    const pending = new Set<string>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (key: string) => {
      pending.add(key);
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        for (const k of pending) {
          const queryKey = k.startsWith('run:') ? ['run', k.slice(4)] : [k];
          void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
        }
        pending.clear();
      }, 600);
    };

    const connect = () => {
      socket = new WebSocket(wsUrl());
      socket.onopen = () => {
        setState('open');
        if (opened || retry > 0) void queryClient.invalidateQueries();
        opened = true;
        retry = 0;
      };
      socket.onmessage = (msg) => {
        let event: MirrorEvent;
        try {
          event = JSON.parse(msg.data as string) as MirrorEvent;
        } catch {
          return;
        }
        if (!event.runId) return;
        listeners.current.forEach((fn) => fn(event));
        schedule(`run:${event.runId}`);
        if (['experiment:completed', 'experiment:failed', 'experiment:started', 'finding:created'].includes(event.event)) {
          for (const key of ['overview', 'investigations', 'investigation', 'experiments', 'findings', 'evidence', 'notifications']) schedule(key);
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setState('reconnecting');
        retry++;
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry, 15000));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(flushTimer);
      socket?.close();
    };
  }, [enabled, queryClient]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);
  return useMemo(() => ({ state, subscribe }), [state, subscribe]);
}

export function useEventStream() {
  return useContext(EventStreamContext);
}

/** Subscribe to events for one run while a component is mounted. */
export function useRunEvents(runId: string, onEvent: Listener) {
  const { subscribe } = useEventStream();
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => subscribe((e) => e.runId === runId && handler.current(e)), [subscribe, runId]);
}
