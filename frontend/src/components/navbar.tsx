"use client";

import Link from "next/link";
import React, { useState } from "react";
import { Button } from "./ui/button";
import {
  Bookmark,
  BookOpenText,
  CircleUserRoundIcon,
  Compass,
  LogIn,
  Menu,
  Shield,
  ShieldCheck,
  SquarePen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppData } from "@/context/AppContext";
import NotificationBell from "./notification-bell";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { loading, isAuth, user } = useAppData();

  return (
    <nav className="sticky top-0 z-50 px-3 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 rounded-[22px] border border-ft-border bg-ft-card/90 px-4 py-3 shadow-ft-soft backdrop-blur-xl sm:px-5">
        <Link href="/blogs" className="group inline-flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-ft-border bg-ft-panel text-ft-text transition group-hover:-translate-y-0.5">
            <BookOpenText className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight text-ft-text">Blogify</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-ft-muted">Blogify Studio</p>
          </div>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/blogs" className="panze-pill inline-flex items-center gap-1.5">
            <Compass className="size-3.5" />
            Feed
          </Link>
          <Link href="/blog/new" className="panze-pill inline-flex items-center gap-1.5">
            <SquarePen className="size-3.5" />
            Write
          </Link>
          <Link href="/blog/saved" className="panze-pill inline-flex items-center gap-1.5">
            <Bookmark className="size-3.5" />
            Saved
          </Link>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <NotificationBell />
          {isAuth && user?.role === "admin" && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-ft-border bg-ft-panel px-3 py-1.5 text-sm font-medium text-ft-text transition hover:border-slate-400"
            >
              <Shield className="size-4" />
              Admin
            </Link>
          )}
          {!loading &&
            (isAuth ? (
              <Link
                href="/profile"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-[linear-gradient(120deg,rgba(16,185,129,0.25),rgba(14,116,144,0.35))] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_10px_25px_rgba(16,185,129,0.18)] transition hover:-translate-y-0.5 hover:border-emerald-300/60 hover:shadow-[0_16px_30px_rgba(16,185,129,0.25)]"
              >
                <CircleUserRoundIcon className="size-4" />
                Profile
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full border border-ft-border bg-ft-panel px-3 py-1.5 text-sm font-medium text-ft-text transition hover:border-slate-400"
              >
                <LogIn className="size-4" />
                Login
              </Link>
            ))}
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          <NotificationBell />
          <Link href="/blog/saved" className="panze-pill inline-flex items-center gap-1.5">
            <Bookmark className="size-3.5" />
            Saved
          </Link>
          <Button
            variant="ghost"
            onClick={() => setIsOpen(!isOpen)}
            className="size-10 rounded-full border border-ft-border bg-ft-panel text-ft-text"
          >
            {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "sm:hidden overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-72 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <ul className="premium-panel mt-3 grid gap-2 rounded-2xl p-3 text-sm text-ft-muted">
          <li>
            <Link href="/blogs" className="block rounded-lg px-3 py-2 hover:bg-ft-card hover:text-ft-text">
              <span className="inline-flex items-center gap-2">
                <Compass className="size-4" />
                Feed
              </span>
            </Link>
          </li>
          <li>
            <Link href="/blog/new" className="block rounded-lg px-3 py-2 hover:bg-ft-card hover:text-ft-text">
              <span className="inline-flex items-center gap-2">
                <SquarePen className="size-4" />
                Write
              </span>
            </Link>
          </li>
          <li>
            <Link href="/blog/saved" className="block rounded-lg px-3 py-2 hover:bg-ft-card hover:text-ft-text">
              <span className="inline-flex items-center gap-2">
                <Bookmark className="size-4" />
                Saved
              </span>
            </Link>
          </li>
          {isAuth && user?.role === "admin" && (
            <li>
              <Link href="/admin" className="block rounded-lg px-3 py-2 hover:bg-ft-card hover:text-ft-text">
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  Admin
                </span>
              </Link>
            </li>
          )}
          {!loading && (
            <li>
              {isAuth ? (
                <Link href="/profile" className="block rounded-lg px-3 py-2 hover:bg-ft-card hover:text-ft-text">
                  <span className="inline-flex items-center gap-2">
                    <CircleUserRoundIcon className="size-4" />
                    Profile
                  </span>
                </Link>
              ) : (
                <Link href="/login" className="block rounded-lg px-3 py-2 hover:bg-ft-card hover:text-ft-text">
                  <span className="inline-flex items-center gap-2">
                    <LogIn className="size-4" />
                    Login
                  </span>
                </Link>
              )}
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
