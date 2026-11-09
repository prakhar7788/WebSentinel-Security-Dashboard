/**
 * Workspace store — each workspace has its own name and isolated scan history.
 * Persisted to localStorage. Scan history key is namespaced per workspace:
 *   ws_scan_history_{workspaceId}
 *
 * The ScanStoreProvider in scans.tsx uses the active workspace ID from this
 * context to namespace its localStorage key.
 */

import {
  createContext, useContext, useState, useCallback, type ReactNode,
} from 'react';

export interface Workspace {
  id: string;        // unique slug e.g. "ws_01"
  name: string;      // display name e.g. "My Company"
  createdAt: string; // ISO date
}

interface WorkspaceStoreValue {
  workspaces: Workspace[];
  activeId: string;
  active: Workspace;
  setActive: (id: string) => void;
  createWorkspace: (name: string) => Workspace;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
}

const WORKSPACES_KEY = 'ws_workspaces';
const ACTIVE_KEY = 'ws_active_workspace';

function uid(): string {
  return 'ws_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

const DEFAULT_WORKSPACE: Workspace = {
  id: 'ws_default',
  name: 'My Workspace',
  createdAt: new Date().toISOString(),
};

function loadWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    const parsed = raw ? (JSON.parse(raw) as Workspace[]) : [];
    return parsed.length > 0 ? parsed : [DEFAULT_WORKSPACE];
  } catch {
    return [DEFAULT_WORKSPACE];
  }
}

function saveWorkspaces(w: Workspace[]) {
  try { localStorage.setItem(WORKSPACES_KEY, JSON.stringify(w)); } catch {}
}

function loadActiveId(workspaces: Workspace[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (stored && workspaces.find(w => w.id === stored)) return stored;
  } catch {}
  return workspaces[0]?.id ?? 'ws_default';
}

const WorkspaceContext = createContext<WorkspaceStoreValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(loadWorkspaces);
  const [activeId, setActiveIdState] = useState<string>(() => loadActiveId(loadWorkspaces()));

  const active = workspaces.find(w => w.id === activeId) ?? workspaces[0] ?? DEFAULT_WORKSPACE;

  const setActive = useCallback((id: string) => {
    setActiveIdState(id);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
  }, []);

  const createWorkspace = useCallback((name: string): Workspace => {
    const workspace: Workspace = { id: uid(), name: name.trim() || 'New workspace', createdAt: new Date().toISOString() };
    setWorkspaces(prev => {
      const next = [...prev, workspace];
      saveWorkspaces(next);
      return next;
    });
    setActive(workspace.id);
    return workspace;
  }, [setActive]);

  const renameWorkspace = useCallback((id: string, name: string) => {
    setWorkspaces(prev => {
      const next = prev.map(w => w.id === id ? { ...w, name: name.trim() || w.name } : w);
      saveWorkspaces(next);
      return next;
    });
  }, []);

  const deleteWorkspace = useCallback((id: string) => {
    setWorkspaces(prev => {
      if (prev.length <= 1) return prev; // always keep at least one
      const next = prev.filter(w => w.id !== id);
      saveWorkspaces(next);
      // Remove that workspace's scans too
      try { localStorage.removeItem(`ws_scan_history_${id}`); } catch {}
      return next;
    });
    // If deleted workspace was active, switch to first available
    setActiveIdState(prev => {
      if (prev !== id) return prev;
      const remaining = loadWorkspaces().filter(w => w.id !== id);
      const next = remaining[0]?.id ?? 'ws_default';
      try { localStorage.setItem(ACTIVE_KEY, next); } catch {}
      return next;
    });
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeId, active, setActive, createWorkspace, renameWorkspace, deleteWorkspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
