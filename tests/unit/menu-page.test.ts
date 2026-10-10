import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";

const resolveDashboardContext = vi.hoisted(() => vi.fn());
const requireActiveUser = vi.hoisted(() => vi.fn());
const listMenuItemsPaginated = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dashboard/context", () => ({ resolveDashboardContext }));
vi.mock("@/lib/auth/authorization", () => ({ requireActiveUser }));
vi.mock("@/lib/services/menu-item-query.service", () => ({ listMenuItemsPaginated }));
vi.mock("@/app/dashboard/components/DashboardShell", () => ({
  DashboardShell: function DashboardShellMock(): null {
    return null;
  },
}));
vi.mock("@/app/dashboard/menu/MenuListPage", () => ({
  MenuListPage: function MenuListPageMock(): null {
    return null;
  },
}));

import MenuPage from "@/app/dashboard/menu/page";
import { DashboardShell } from "@/app/dashboard/components/DashboardShell";
import { MenuListPage } from "@/app/dashboard/menu/MenuListPage";
import type { DashboardContextResult } from "@/lib/dashboard/context";

type PageParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

interface ShellElementProps {
  children?: ReactNode;
  currentPath?: string;
}

interface MenuListPageElementProps {
  authScope?: { tenantId?: unknown; userId?: unknown };
  outletId?: unknown;
  initialData?: unknown;
  initialDataUpdatedAt?: unknown;
}

const outlet = { id: "outlet-9", name: "Outlet 9", code: "O9" };
const baseCapabilities = {
  canViewCatalog: true,
  canManageCatalog: true,
  canViewTables: true,
  canManageTables: true,
};
const selected: DashboardContextResult = {
  kind: "selected",
  outlet,
  outlets: [outlet],
  capabilities: baseCapabilities,
};
const authUser = {
  user: { id: "user-1", name: "Budi" },
  tenant: { id: "tenant-1", name: "Warung UAS", code: "WRGUAS" },
};
const serviceResult = { data: [], nextCursor: null, hasMore: false };

function pageParams(): PageParams {
  return { searchParams: Promise.resolve({ outlet: outlet.id }) };
}

async function renderPage(): Promise<ReactElement<ShellElementProps>> {
  const tree = await MenuPage(pageParams());
  const shell = tree as ReactElement<ShellElementProps>;
  expect(shell.type).toBe(DashboardShell);
  return shell;
}

type ElementProps = { children?: ReactNode };

function singleChild(shell: ReactElement<ShellElementProps>): ReactElement<ElementProps> {
  const child = shell.props.children;
  expect(Array.isArray(child)).toBe(false);
  return child as ReactElement<ElementProps>;
}

function gateText(shell: ReactElement<ShellElementProps>): string {
  const gate = singleChild(shell);
  expect(gate.type).toBe("div");
  const gateChildren = gate.props.children as ReactElement<ElementProps>[];
  expect(gateChildren).toHaveLength(2);
  const heading = gateChildren[0];
  const paragraph = gateChildren[1];
  expect(heading.props.children).toBe("Menu");
  return paragraph.props.children as string;
}

describe("menu page server contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDashboardContext.mockResolvedValue(selected);
    requireActiveUser.mockResolvedValue(authUser);
    listMenuItemsPaginated.mockResolvedValue(serviceResult);
  });

  it("selection-required: shows outlet selection gate and never calls the bounded service", async () => {
    resolveDashboardContext.mockResolvedValue({ kind: "selection-required", outlets: [outlet] });

    const shell = await renderPage();

    expect(gateText(shell)).toBe("Pilih outlet terlebih dahulu untuk melihat menu.");
    expect(singleChild(shell).type).not.toBe(MenuListPage);
    expect(listMenuItemsPaginated).not.toHaveBeenCalled();
    expect(shell.props.currentPath).toBe("/dashboard/menu");
  });

  it("no-accessible-outlet: shows selection gate and never calls the bounded service", async () => {
    resolveDashboardContext.mockResolvedValue({ kind: "no-accessible-outlet", outlets: [] });

    const shell = await renderPage();

    expect(gateText(shell)).toBe("Pilih outlet terlebih dahulu untuk melihat menu.");
    expect(listMenuItemsPaginated).not.toHaveBeenCalled();
  });

  it("selected without canViewCatalog: shows denied state and never calls the bounded service", async () => {
    resolveDashboardContext.mockResolvedValue({
      kind: "selected",
      outlet,
      outlets: [outlet],
      capabilities: { ...baseCapabilities, canViewCatalog: false },
    });

    const shell = await renderPage();

    expect(gateText(shell)).toBe("Anda tidak memiliki izin untuk melihat menu di outlet ini.");
    expect(singleChild(shell).type).not.toBe(MenuListPage);
    expect(listMenuItemsPaginated).not.toHaveBeenCalled();
  });

  it("selected and authorized: fetches page-1 with trusted outlet, default 50 and all filter, then passes SSR props", async () => {
    const shell = await renderPage();

    expect(listMenuItemsPaginated).toHaveBeenCalledTimes(1);
    expect(listMenuItemsPaginated).toHaveBeenCalledWith({
      outletId: outlet.id,
      limit: 50,
      filter: "all",
      search: undefined,
      cursor: undefined,
    });

    const listChild = singleChild(shell);
    expect(listChild.type).toBe(MenuListPage);
    const props = listChild.props as MenuListPageElementProps;
    expect(props.authScope).toEqual({ tenantId: authUser.tenant.id, userId: authUser.user.id });
    expect(props.outletId).toBe(outlet.id);
    expect(props.initialData).toBe(serviceResult);
    expect(typeof props.initialDataUpdatedAt).toBe("number");
  });

  it("service failure: initialData stays undefined instead of an empty success payload", async () => {
    listMenuItemsPaginated.mockRejectedValue(new Error("database down"));

    const shell = await renderPage();

    const listChild = singleChild(shell);
    expect(listChild.type).toBe(MenuListPage);
    const props = listChild.props as MenuListPageElementProps;
    expect(props.initialData).toBeUndefined();
    expect(props.initialData).not.toEqual({ data: [], nextCursor: null, hasMore: false });
    expect(typeof props.initialDataUpdatedAt).toBe("number");
  });

  it("unauthenticated: auth failure propagates instead of being rewritten as an outlet-selection gate", async () => {
    requireActiveUser.mockRejectedValue(new Error("session missing"));

    await expect(MenuPage(pageParams())).rejects.toThrow("session missing");
    expect(listMenuItemsPaginated).not.toHaveBeenCalled();
  });
});
