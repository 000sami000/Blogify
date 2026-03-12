"use client";
import React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar";
import { Input } from "./ui/input";
import {
  BookOpenCheck,
  Clapperboard,
  Cpu,
  GraduationCap,
  HeartPulse,
  Landmark,
  Plane,
  Search,
  Sparkles,
} from "lucide-react";
import { blogCategories, useAppData } from "@/context/AppContext";

const categoryIconMeta: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    accentClass: string;
  }
> = {
  techonlogy: {
    icon: Cpu,
    accentClass: "border-sky-200 bg-sky-100 text-sky-700",
  },
  health: {
    icon: HeartPulse,
    accentClass: "border-emerald-200 bg-emerald-100 text-emerald-700",
  },
  finance: {
    icon: Landmark,
    accentClass: "border-amber-200 bg-amber-100 text-amber-700",
  },
  travel: {
    icon: Plane,
    accentClass: "border-indigo-200 bg-indigo-100 text-indigo-700",
  },
  education: {
    icon: GraduationCap,
    accentClass: "border-violet-200 bg-violet-100 text-violet-700",
  },
  entertainment: {
    icon: Clapperboard,
    accentClass: "border-rose-200 bg-rose-100 text-rose-700",
  },
  study: {
    icon: BookOpenCheck,
    accentClass: "border-cyan-200 bg-cyan-100 text-cyan-700",
  },
};

const getCategoryMeta = (category: string) => {
  const key = category.trim().toLowerCase();
  return (
    categoryIconMeta[key] ?? {
      icon: Sparkles,
      accentClass: "border-slate-200 bg-slate-100 text-slate-700",
    }
  );
};

const SideBar = () => {
  const { searchQuery, setSearchQuery, setCategory, category } = useAppData();
  return (
    <Sidebar className="border-r border-ft-border/70 bg-ft-panel/50">
      <SidebarContent className="mt-15 bg-transparent px-3 pb-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] uppercase tracking-[0.16em] text-ft-muted">
            Discover
          </SidebarGroupLabel>
          <div className="premium-panel-soft relative p-2">
            <Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-ft-muted" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Title or summary"
              className="h-11 rounded-xl border-ft-border bg-ft-card pl-9 text-ft-text placeholder:text-ft-muted"
            />
          </div>

          <SidebarGroupLabel className="mt-4 text-[11px] uppercase tracking-[0.16em] text-ft-muted">
            Categories
          </SidebarGroupLabel>
          <SidebarMenu className="space-y-1.5">
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setCategory("")}
                isActive={category === ""}
                className="mb-2 h-10 rounded-xl border border-ft-border bg-ft-card text-ft-text hover:border-ft-accent/35 hover:bg-ft-panel data-[active=true]:border-ft-accent/60 data-[active=true]:bg-ft-accent data-[active=true]:text-ft-bg"
              >
                <span className="inline-flex size-6 items-center justify-center rounded-lg border border-amber-200 bg-amber-100 text-amber-700">
                  <Sparkles className="size-3.5" />
                </span>
                <span>All</span>
              </SidebarMenuButton>
              {blogCategories?.map((e, i) => {
                const meta = getCategoryMeta(e);
                const Icon = meta.icon;
                const isActive = category === e;
                return (
                  <SidebarMenuButton
                    key={i}
                    onClick={() => setCategory(e)}
                    isActive={isActive}
                    className="mb-2 h-10 rounded-xl border border-ft-border bg-ft-card text-ft-text hover:border-ft-accent/35 hover:bg-ft-panel data-[active=true]:border-ft-accent/60 data-[active=true]:bg-ft-accent data-[active=true]:text-ft-bg"
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-lg border ${
                        isActive ? "border-ft-bg/20 bg-ft-bg/20 text-ft-bg" : meta.accentClass
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span>{e}</span>
                  </SidebarMenuButton>
                );
              })}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export default SideBar;
