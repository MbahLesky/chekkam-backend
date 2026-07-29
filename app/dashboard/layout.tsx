"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { useI18n } from "@/components/i18n-provider";
import { useSession } from "@/lib/hooks/useSession";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, configured } = useSession();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowser();
  const [role, setRole] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = [
    { href: "/dashboard/reports", label: t("reports") },
    { href: "/dashboard/documents", label: t("documents") },
    { href: "/dashboard/products", label: t("products") },
    { href: "/dashboard/enterprise/bulk", label: t("bulkVerification") },
    { href: "/dashboard/alerts", label: t("publicAlerts") },
    { href: "/dashboard/safety-alerts", label: t("safetyAlerts") },
    ...(role === "admin" || role === "super_admin"
      ? [{ href: "/dashboard/sources", label: "Verified sources" }]
      : []),
    ...(role === "admin" || role === "super_admin" || role === "analyst"
      ? [{ href: "/dashboard/demo-trust", label: "Demo Trust Kit" }]
      : []),
  ];

  const roleLabel: Record<string, string> = {
    citizen: t("citizen"),
    institution_officer: t("institutionOfficer"),
    analyst: t("analyst"),
    admin: t("admin"),
    super_admin: t("superAdmin"),
  };

  useEffect(() => {
    if (!supabase || !session) return;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setRole(data?.role ?? null));
  }, [supabase, session]);

  // Close the mobile nav automatically on navigation, so it never stays
  // open covering the new page after tapping a link.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of transient UI state on route change
    setMobileNavOpen(false);
  }, [pathname]);

  if (!configured) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-ink">{t("supabaseMissingBody")}</p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-muted">{t("loading")}</p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-ink">
          {t("signInRequired")}{" "}
          <Link href="/login" className="font-medium text-chekkam-primary underline">
            {t("signIn")}
          </Link>
        </p>
      </Shell>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      {/* Backdrop: mobile only, closes the drawer on tap outside it. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 sm:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed off-canvas drawer below the sm breakpoint (a mobile browser
          viewport is ~360-430px wide; a static 224px sidebar left ~150px
          for the whole page content, unusable — confirmed via a live
          tester's screenshot). At sm and up this becomes the original
          static, always-visible sidebar. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-shrink-0 flex-col bg-gradient-hero px-4 py-6 text-white transition-transform duration-200 sm:static sm:z-auto sm:w-56 sm:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2.5">
            {/* Light chip so the full-color mark keeps its contrast against
                the gradient sidebar (§2). */}
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white p-1">
              <Image src="/chekkam_icon.png" alt="Chekkam" width={96} height={111} className="h-full w-auto" />
            </span>
            <span className="font-[family-name:var(--font-heading)] text-base font-semibold">Chekkam</span>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label={t("close")}
            className="rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white sm:hidden"
          >
            ✕
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[var(--radius-chekkam-sm)] px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white/90"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 pt-3">
          <div className="px-3 py-1 text-xs text-white/50">
            {session.user.email}
            {role && <div className="mt-0.5 font-medium text-white/75">{roleLabel[role] ?? role}</div>}
          </div>
          <div className="mt-2 px-3">
            <LanguageToggle dark />
          </div>
          <button
            onClick={async () => {
              await supabase?.auth.signOut();
              router.push("/login");
            }}
            className="mt-2 w-full rounded-[var(--radius-chekkam-sm)] px-3 py-2 text-left text-sm font-medium text-white/50 transition hover:bg-white/8 hover:text-white/80"
          >
            {t("signOut")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile-only top bar with the hamburger toggle; hidden at sm and up
            where the sidebar is already always visible. */}
        <div className="flex items-center gap-3 border-b border-chekkam-border bg-chekkam-surface-raised px-4 py-3 sm:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label={t("openMenu")}
            className="rounded-[var(--radius-chekkam-sm)] p-2 text-chekkam-ink transition hover:bg-chekkam-tint"
          >
            ☰
          </button>
          <span className="font-[family-name:var(--font-heading)] text-sm font-semibold text-chekkam-ink">
            Chekkam
          </span>
        </div>
        <main className="flex-1 overflow-y-auto bg-chekkam-surface p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-surface px-4 py-16">
      <div className="max-w-md rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm">
        {children}
      </div>
    </div>
  );
}
