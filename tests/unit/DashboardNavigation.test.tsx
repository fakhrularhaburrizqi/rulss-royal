import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { DashboardNavigation } from "@/app/dashboard/components/DashboardNavigation";
import type { DashboardContextResult } from "@/lib/dashboard/context";

const outlet = { id: "outlet-1", name: "Outlet 1", code: "O1" };

function selectedResolution(capabilities: {
  canViewCatalog: boolean;
  canManageCatalog: boolean;
  canViewTables: boolean;
  canManageTables: boolean;
}): DashboardContextResult {
  return { kind: "selected", outlet, outlets: [outlet], capabilities };
}

const fullCapabilities = {
  canViewCatalog: true,
  canManageCatalog: true,
  canViewTables: true,
  canManageTables: true,
};

describe("DashboardNavigation menu readiness", () => {
  it("renders Menu, Kategori, and Meja as live outlet links while authorized", () => {
    render(
      <DashboardNavigation resolution={selectedResolution(fullCapabilities)} currentPath="/dashboard" />
    );

    const menuLink = screen.getByRole("link", { name: "Menu" });
    expect(menuLink).toHaveAttribute("href", "/dashboard/menu?outlet=outlet-1");

    const kategoriLink = screen.getByRole("link", { name: "Kategori" });
    expect(kategoriLink).toHaveAttribute("href", "/dashboard/kategori?outlet=outlet-1");

    const mejaLink = screen.getByRole("link", { name: "Meja" });
    expect(mejaLink).toHaveAttribute("href", "/dashboard/meja?outlet=outlet-1");

    expect(screen.queryByText("Segera tersedia")).not.toBeInTheDocument();
  });

  it("keeps Kategori, Menu, and Meja links free of the coming-soon badge", () => {
    render(
      <DashboardNavigation resolution={selectedResolution(fullCapabilities)} currentPath="/dashboard" />
    );

    const menuLi = screen.getByRole("link", { name: "Menu" }).closest("li") as HTMLElement;
    const kategoriLi = screen.getByRole("link", { name: "Kategori" }).closest("li") as HTMLElement;
    const mejaLi = screen.getByRole("link", { name: "Meja" }).closest("li") as HTMLElement;

    expect(within(menuLi).queryByText("Segera tersedia")).not.toBeInTheDocument();
    expect(within(kategoriLi).queryByText("Segera tersedia")).not.toBeInTheDocument();
    expect(within(mejaLi).queryByText("Segera tersedia")).not.toBeInTheDocument();
  });

  it("hides Menu and Kategori when canViewCatalog is false", () => {
    render(
      <DashboardNavigation
        resolution={selectedResolution({ ...fullCapabilities, canViewCatalog: false })}
        currentPath="/dashboard"
      />
    );

    expect(screen.queryByRole("link", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kategori" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Meja" })).toBeInTheDocument();
  });

  it("hides Meja when canViewTables is false", () => {
    render(
      <DashboardNavigation
        resolution={selectedResolution({ ...fullCapabilities, canViewTables: false })}
        currentPath="/dashboard"
      />
    );

    expect(screen.queryByRole("link", { name: "Meja" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Menu" })).toBeInTheDocument();
  });

  it("renders only Dashboard outside a selected context", () => {
    render(
      <DashboardNavigation
        resolution={{ kind: "selection-required", outlets: [outlet] }}
        currentPath="/dashboard"
      />
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Meja" })).not.toBeInTheDocument();
  });

  it("marks the Menu link with aria-current on the menu page", () => {
    render(
      <DashboardNavigation resolution={selectedResolution(fullCapabilities)} currentPath="/dashboard/menu" />
    );

    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kategori" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});
