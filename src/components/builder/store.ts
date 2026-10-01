/**
 * Builder state.
 *
 * Three places hold a stack, each for a different reason:
 *   - the URL  (?s=...)      shareable, and the source of truth on load
 *   - localStorage           the person's own stacks, on their own device
 *   - this store             what the UI renders right now
 *
 * No account and no server is involved in any of it.
 */
import { create } from 'zustand';
import type { LayerId, Stack } from '../../engine/types';
import {
  cleanName,
  cloneStack,
  decodeStack,
  emptyStack,
  encodeStack,
  normalizeStack,
  stackHas,
  tool,
  toggleTool as toggleIn,
  withTool,
  withoutTool,
} from '../../engine';

const SAVED_KEY = 'sb-saved';
const CURRENT_KEY = 'sb-current';
const PERSIST_DELAY = 400;

export interface SavedStack {
  id: string;
  name: string;
  stack: Stack;
  at: number;
}

interface BuilderState {
  stack: Stack;
  name: string;
  /** Id of the saved stack being edited, or null for an unsaved one. */
  currentId: string | null;
  saved: SavedStack[];
  /** Layer that changed last, so its slab can animate. */
  lastSet: LayerId | null;
  /** The settle animation plays once per loaded stack, not on every render. */
  introPlayed: boolean;
  hydrated: boolean;

  hydrate: () => void;
  toggle: (id: string) => void;
  swapIn: (id: string) => void;
  remove: (id: string) => void;
  rename: (name: string) => void;
  load: (stack: Partial<Stack>, name: string, id?: string | null) => void;
  reset: () => void;
  save: () => void;
  destroy: (id: string) => void;
  shareQuery: () => string;
}

/* ------------------------------------------------------------------ *
 * Persistence helpers. Every read is defensive: localStorage can be
 * unavailable (private mode, blocked cookies) or hold stale shapes.
 * ------------------------------------------------------------------ */
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode. The app still works, it just will not remember.
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** The default stack a first-time visitor sees, so the report is never blank. */
const STARTER: Partial<Stack> = {
  frontend: 'nextjs',
  backend: 'node',
  database: 'postgres',
  hosting: 'vercel',
  devops: ['gha'],
};

export const useBuilder = create<BuilderState>((set, get) => {
  /** Mirrors the current stack into localStorage and the address bar. */
  const persist = () => {
    const { stack, name, currentId } = get();
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      writeJson(CURRENT_KEY, { stack, name, currentId });
    }, PERSIST_DELAY);

    // replaceState keeps the link shareable without adding history entries on
    // every click.
    try {
      const url = new URL(window.location.href);
      const encoded = encodeStack(stack);
      if (encoded) url.searchParams.set('s', encoded);
      else url.searchParams.delete('s');
      window.history.replaceState(null, '', url);
    } catch {
      // Non-browser or sandboxed; nothing to sync.
    }
  };

  const update = (stack: Stack, lastSet: LayerId | null = null) => {
    set({ stack, lastSet });
    persist();
  };

  return {
    stack: normalizeStack(STARTER),
    name: 'Recipe app',
    currentId: null,
    saved: [],
    lastSet: null,
    introPlayed: false,
    hydrated: false,

    /** Runs once on mount. A ?s= link always wins over saved state. */
    hydrate: () => {
      if (get().hydrated) return;

      const saved = readJson<SavedStack[]>(SAVED_KEY);
      const savedList = Array.isArray(saved)
        ? saved
            .filter((s) => s && typeof s.id === 'string')
            .map((s) => ({ ...s, stack: normalizeStack(s.stack) }))
        : [];

      const params = new URLSearchParams(window.location.search);
      const shared = params.get('s');

      if (shared) {
        set({
          stack: decodeStack(shared),
          name: cleanName(params.get('n')) || 'Shared stack',
          currentId: null,
          saved: savedList,
          hydrated: true,
          introPlayed: false,
        });
        return;
      }

      const current = readJson<{ stack: Partial<Stack>; name?: string; currentId?: string | null }>(
        CURRENT_KEY,
      );

      set({
        stack: current?.stack ? normalizeStack(current.stack) : normalizeStack(STARTER),
        name: current?.name ?? 'Recipe app',
        currentId: current?.currentId ?? null,
        saved: savedList,
        hydrated: true,
        introPlayed: false,
      });
    },

    toggle: (id) => {
      const { stack } = get();
      const next = toggleIn(stack, id);
      update(next, stackHas(next, id) ? (tool(id)?.layer ?? null) : null);
    },

    swapIn: (id) => update(withTool(get().stack, id), tool(id)?.layer ?? null),

    remove: (id) => update(withoutTool(get().stack, id)),

    rename: (name) => {
      set({ name: name.slice(0, 60) });
      persist();
    },

    load: (stack, name, id = null) => {
      set({
        stack: normalizeStack(stack),
        name,
        currentId: id,
        lastSet: null,
        introPlayed: false,
      });
      persist();
    },

    reset: () => get().load(emptyStack(), 'Untitled stack', null),

    save: () => {
      const { stack, name, currentId, saved } = get();
      const snapshot = {
        name: cleanName(name) || 'Untitled stack',
        stack: cloneStack(stack),
        at: Date.now(),
      };

      const existing = saved.find((s) => s.id === currentId);
      let nextSaved: SavedStack[];
      let nextId: string;

      if (existing) {
        nextId = existing.id;
        nextSaved = saved.map((s) => (s.id === currentId ? { ...s, ...snapshot } : s));
      } else {
        nextId = `s${Date.now().toString(36)}`;
        nextSaved = [{ id: nextId, ...snapshot }, ...saved];
      }

      set({ saved: nextSaved, currentId: nextId });
      writeJson(SAVED_KEY, nextSaved);
      writeJson(CURRENT_KEY, { stack, name, currentId: nextId });
    },

    destroy: (id) => {
      const { saved, currentId } = get();
      const nextSaved = saved.filter((s) => s.id !== id);
      set({ saved: nextSaved, currentId: currentId === id ? null : currentId });
      writeJson(SAVED_KEY, nextSaved);
    },

    shareQuery: () => encodeStack(get().stack),
  };
});

/** Marks the intro animation as spent, so it plays once per loaded stack. */
export const consumeIntro = (): boolean => {
  const played = useBuilder.getState().introPlayed;
  if (!played) useBuilder.setState({ introPlayed: true });
  return !played;
};
