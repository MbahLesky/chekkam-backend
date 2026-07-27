"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * FR-060: role-aware landing. Institution officers land on their document
 * cockpit (sign/certificate/revoke — the actions they actually take);
 * everyone else (analyst/admin/super_admin) lands on the review queue,
 * matching prior behavior. Bare /dashboard has no content of its own.
 */
export default function DashboardIndexPage() {
  const { session, loading, configured } = useSession();
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    if (!configured || loading) return;
    if (!session) {
      router.replace("/dashboard/reports"); // layout shows the sign-in prompt
      return;
    }
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        router.replace(data?.role === "institution_officer" ? "/dashboard/documents" : "/dashboard/reports");
      });
  }, [configured, loading, session, supabase, router]);

  return null;
}
