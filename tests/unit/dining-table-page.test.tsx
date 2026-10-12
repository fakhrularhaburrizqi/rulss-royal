import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";

const resolveDashboardContext = vi.hoisted(() => vi.fn());
const requireActiveUser = vi.hoisted(() => vi.fn());
const listTablesForManagement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dashboard/context", () => ({ resolveDashboardContext }));
vi.mock("@/lib/auth/authorization", () => ({ requireActiveUser }));
vi.mock("@/lib/services/dining-table.service", () => ({ listTablesForManagement }));
vi.mock("@/app/dashboard/components/DashboardShell", () => ({
  DashboardShell: function DashboardShellMock(): null {
    return null;
  },
}));
vi.mock("@/app/dashboard/meja/DiningTableListPage", () => ({
  DiningTableListPage: function DiningTableListPageMock(): null {
    return null;
  },
}));

import DiningTablePage from "@/app/dashboard/meja/page";
import { DashboardShell } from "@/app/dashboard/components/DashboardShell";
import { DiningTableListPage } from "@/app/dashboard/meja/DiningTableListPage";
import type { DashboardContextResult } from "@/lib/dashboard/context";

type PageParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

interface ShellElementProps {
  children?: ReactNode;
  currentPath?: string;
}

interface DiningTableListPageElementProps {
  authScope?: { tenantId?: unknown; userId?: unknown };
  outletId?: unknown;
  initialData?: unknown;
  initialDataUpdatedAt?: unknown;
  canManageTables?: unknown;
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
const serviceResult: any[] = [];

function pageParams(): PageParams {
  return { searchParams: Promise.resolve({ outlet: outlet.id }) };
}

async function renderPage(): Promise<ReactElement<ShellElementProps>> {
  const tree = await DiningTablePage(pageParams());
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
  expect(heading.props.children).toBe("Meja");
  return paragraph.props.children as string;
}

describe("dining table page server contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDashboardContext.mockResolvedValue(selected);
    requireActiveUser.mockResolvedValue(authUser);
    listTablesForManagement.mockResolvedValue(serviceResult);
  });

  it("selection-required: shows outlet selection gate and never calls the bounded service", async () => {
    resolveDashboardContext.mockResolvedValue({ kind: "selection-required", outlets: [outlet] });

    const shell = await renderPage();

    expect(gateText(shell)).toBe("Pilih outlet terlebih dahulu untuk melihat meja.");
    expect(singleChild(shell).type).not.toBe(DiningTableListPage);
    expect(listTablesForManagement).not.toHaveBeenCalled();
    expect(shell.props.currentPath).toBe("/dashboard/meja");
  });

  it("no-accessible-outlet: shows selection gate and never calls the bounded service", async () => {
    resolveDashboardContext.mockResolvedValue({ kind: "no-accessible-outlet", outlets: [] });

    const shell = await renderPage();

    expect(gateText(shell)).toBe("Pilih outlet terlebih dahulu untuk melihat meja.");
    expect(listTablesForManagement).not.toHaveBeenCalled();
  });

  it("selected without canViewTables: shows denied state and never calls the bounded service", async () => {
    resolveDashboardContext.mockResolvedValue({
      kind: "selected",
      outlet,
      outlets: [outlet],
      capabilities: { ...baseCapabilities, canViewTables: false },
    });

    const shell = await renderPage();

    expect(gateText(shell)).toBe("Anda tidak memiliki izin untuk melihat meja di outlet ini.");
    expect(singleChild(shell).type).not.toBe(DiningTableListPage);
    expect(listTablesForManagement).not.toHaveBeenCalled();
  });

  it("selected and authorized: fetches tables with trusted outlet, then passes SSR props", async () => {
    const shell = await renderPage();

    expect(listTablesForManagement).toHaveBeenCalledTimes(1);
    expect(listTablesForManagement).toHaveBeenCalledWith(outlet.id);

    const listChild = singleChild(shell);
    expect(listChild.type).toBe(DiningTableListPage);
    const props = listChild.props as DiningTableListPageElementProps;
    expect(props.authScope).toEqual({ tenantId: authUser.tenant.id, userId: authUser.user.id });
    expect(props.outletId).toBe(outlet.id);
    expect(props.initialData).toBe(serviceResult);
    expect(props.canManageTables).toBe(true);
  });
});
