"use client";

/**
 * Optional adapter for the Branch Admin shared toolbar.
 * Modules can progressively register their own REAL search, filter, print and
 * more handlers. Until they do, the navigation can focus an existing action.
 * Registration is scoped to a route key and cleaned up on unmount.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type BranchToolbarAction = "search" | "filter" | "print" | "more";

export type BranchToolbarHandlers = {
  search?: (query: string) => void;
  filter?: () => void;
  print?: () => void;
  more?: () => void;
};

type Registry = Record<string, BranchToolbarHandlers>;
type ToolbarContext = {
  handlers: Registry;
  register: (key: string, value: BranchToolbarHandlers) => () => void;
};

const Context = createContext<ToolbarContext | null>(null);

export function BranchWorkspaceToolbarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [handlers, setHandlers] = useState<Registry>({});

  const register = useCallback((key: string, value: BranchToolbarHandlers) => {
    setHandlers((current) => ({ ...current, [key]: value }));
    return () => {
      setHandlers((current) => {
        if (current[key] !== value) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    };
  }, []);

  return <Context.Provider value={{ handlers, register }}>{children}</Context.Provider>;
}

export function useBranchWorkspaceToolbar() {
  return useContext(Context);
}

/**
 * Call this from a rebuilt module once its own buttons are relocated.
 * Handlers may change without triggering repeated registrations.
 */
export function useRegisterBranchWorkspaceToolbar(
  routeKey: string,
  handlers: BranchToolbarHandlers,
) {
  const context = useBranchWorkspaceToolbar();
  const register = context?.register;
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!register) return;
    return register(routeKey, {
      search: (value) => latest.current.search?.(value),
      filter: () => latest.current.filter?.(),
      print: () => latest.current.print?.(),
      more: () => latest.current.more?.(),
    });
  }, [register, routeKey]);
}

/**
 * Transitional compatibility helper: focuses/clicks an existing module action
 * by its accessible label. Does not delete or fake the module's functionality.
 * Once modules register actual handlers, this fallback is no longer used.
 */
export function openExistingModuleAction(action: BranchToolbarAction): boolean {
  if (typeof document === "undefined") return false;
  const root = document.querySelector(
    ".role-shell.branch-workspace-layout .app-content",
  );
  if (!root) return false;

  const matching = (text: string) => {
    const label = text.trim().toLowerCase();
    const candidates: Record<BranchToolbarAction, RegExp> = {
      search: /\b(search|find)\b/,
      filter: /\b(filter|refine)\b/,
      print: /\b(print|printing)\b/,
      more: /\b(more|additional actions|options)\b/,
    };
    return candidates[action].test(label);
  };

  const candidates = Array.from(
    root.querySelectorAll<HTMLButtonElement>(
      'button:not([disabled]), [role="button"][aria-label], [role="button"][title]',
    ),
  );
  // Never select an arbitrary row-level action when multiple buttons match.
  // Prefer a deliberately marked action, then a uniquely accessible-labelled
  // control. Text-only fallback is allowed only when it matches exactly once.
  const explicit = candidates.filter((button) =>
    button.getAttribute("data-branch-action")?.toLowerCase() === action,
  );
  const accessible = candidates.filter((button) =>
    matching([
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
    ].join(" ")),
  );
  const textOnly = candidates.filter((button) =>
    button.textContent?.trim().toLowerCase() === action,
  );
  const found =
    explicit.length === 1 ? explicit[0] :
    accessible.length === 1 ? accessible[0] :
    textOnly.length === 1 ? textOnly[0] : null;

  if (found instanceof HTMLElement) {
    found.click();
    return true;
  }

  if (action === "search") {
    const search = root.querySelector<HTMLInputElement>(
      'input[type="search"], input[aria-label*="Search" i], input[placeholder*="Search" i]',
    );
    if (search) {
      search.focus();
      return true;
    }
  }

  return false;
}
