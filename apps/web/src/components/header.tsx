"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useState } from "react";

const navLinks = [
  { href: "/learn", label: "My Playlist" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "Courses" },
];

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="font-bold text-lg tracking-tight">
          The Primer
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <SignedIn>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  pathname === link.href
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </SignedIn>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {menuOpen ? (
                  <path d="M4 4L16 16M16 4L4 16" />
                ) : (
                  <path d="M3 5h14M3 10h14M3 15h14" />
                )}
              </svg>
            </button>
          </SignedIn>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <SignedIn>
          <nav className="md:hidden border-t border-border px-4 py-3 space-y-2 bg-background">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block py-2 text-sm transition-colors ${
                  pathname === link.href
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </SignedIn>
      )}
    </header>
  );
}
