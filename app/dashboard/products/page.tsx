"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useI18n, type I18nKey } from "@/components/i18n-provider";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, StatusBadge, LoadingState, EmptyState, ErrorState, Card } from "@/components/ui";

type RegisterResult = {
  id: string;
  product_code: string;
  qr_payload: string;
  qr_image: string;
  status: string;
};

type Product = {
  id: string;
  institution_id: string;
  institution_name: string | null;
  product_code: string;
  product_name: string;
  category: string;
  batch_number: string | null;
  manufactured_at: string | null;
  expiry_date: string | null;
  product_hash: string;
  signature: string;
  qr_payload: string;
  status: "active" | "recalled" | "stolen";
  status_reason: string | null;
  status_changed_at: string | null;
  created_at: string;
};

const CATEGORIES = [
  "medicine",
  "food",
  "agriculture",
  "electronics",
  "construction_materials",
  "automotive_parts",
  "engine_oil",
  "cosmetics",
  "luxury",
  "alcohol",
  "beverages",
  "retail",
  "other",
] as const;

const CATEGORY_KEYS: Record<(typeof CATEGORIES)[number], I18nKey> = {
  medicine: "categoryMedicine",
  food: "categoryFood",
  agriculture: "categoryAgriculture",
  electronics: "categoryElectronics",
  construction_materials: "categoryConstructionMaterials",
  automotive_parts: "categoryAutomotiveParts",
  engine_oil: "categoryEngineOil",
  cosmetics: "categoryCosmetics",
  luxury: "categoryLuxury",
  alcohol: "categoryAlcohol",
  beverages: "categoryBeverages",
  retail: "categoryRetail",
  other: "categoryOther",
};

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

export default function ProductsDashboardPage() {
  const { lang, t } = useI18n();
  const supabase = getSupabaseBrowser();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      "Accept-Language": lang,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, [supabase, lang]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/products?lang=${lang}`, { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setProducts(body.products as Product[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, lang, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/language-change
    load();
  }, [load]);

  async function updateStatus(id: string, action: "recall" | "mark_stolen" | "reactivate", reason?: string) {
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/products/${id}?lang=${lang}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action, reason }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("somethingWrong"));
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
            {t("productRegistry")}
          </div>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
            {t("products")}
          </h1>
          <p className="mt-1 text-sm text-chekkam-muted">{t("productsIntro")}</p>
        </div>
        <RegisterProductPanel
          authHeaders={authHeaders}
          onRegistered={(result) => {
            setRegisterResult(result);
            load();
          }}
        />
      </div>

      {error && <ErrorState message={error} />}
      {loading && <LoadingState message={t("loading")} />}

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-chekkam-tint text-xs font-semibold uppercase tracking-wide text-chekkam-faint">
            <tr>
              <th className="px-4 py-3">{t("institution")}</th>
              <th className="px-4 py-3">{t("productName")}</th>
              <th className="px-4 py-3">{t("category")}</th>
              <th className="px-4 py-3">{t("batchNumber")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3 text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr
                key={product.id}
                className="cursor-pointer border-t border-chekkam-border hover:bg-chekkam-tint/60"
                onClick={() => setSelected(product)}
              >
                <td className="px-4 py-3 text-chekkam-ink">{product.institution_name ?? "-"}</td>
                <td className="px-4 py-3 text-chekkam-ink">{product.product_name}</td>
                <td className="px-4 py-3 text-chekkam-muted">
                  {t(CATEGORY_KEYS[product.category as (typeof CATEGORIES)[number]] ?? "categoryOther")}
                </td>
                <td className="px-4 py-3 text-chekkam-muted">{product.batch_number ?? "-"}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    tone={product.status === "active" ? "success" : product.status === "recalled" ? "warning" : "danger"}
                    label={
                      product.status === "active"
                        ? t("statusActive")
                        : product.status === "recalled"
                          ? t("statusRecalled")
                          : t("statusStolen")
                    }
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(product);
                    }}
                    className="text-xs font-semibold text-chekkam-primary hover:underline"
                  >
                    {t("viewDetails")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && products.length === 0 && <EmptyState message={t("noProducts")} />}
      </Card>

      {registerResult && (
        <RegisterResultModal result={registerResult} onClose={() => setRegisterResult(null)} />
      )}
      {selected && (
        <ProductDetailModal product={selected} onClose={() => setSelected(null)} onUpdateStatus={updateStatus} />
      )}
    </div>
  );
}

function RegisterProductPanel({
  authHeaders,
  onRegistered,
}: {
  authHeaders: () => Promise<Record<string, string>>;
  onRegistered: (result: RegisterResult) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [institutionId, setInstitutionId] = useState("");
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("other");
  const [batchNumber, setBatchNumber] = useState("");
  const [manufacturedAt, setManufacturedAt] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const headers = await authHeaders();
      const res = await fetch("/api/products", {
        method: "POST",
        headers,
        body: JSON.stringify({
          institution_id: institutionId,
          product_name: productName,
          category,
          batch_number: batchNumber || undefined,
          manufactured_at: manufacturedAt || undefined,
          expiry_date: expiryDate || undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? t("failedRegisterProduct"));
      onRegistered(body as RegisterResult);
      setOpen(false);
      setInstitutionId("");
      setProductName("");
      setCategory("other");
      setBatchNumber("");
      setManufacturedAt("");
      setExpiryDate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("somethingWrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shrink-0">
      <Button onClick={() => setOpen((v) => !v)}>{open ? t("cancel") : t("registerNewProduct")}</Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-8 z-10 mt-3 flex w-96 flex-col gap-3 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-lg"
        >
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("institutionId")}</span>
            <input required value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} placeholder="a1c2d3e4-...." className={`${inputClass} mt-1 font-[family-name:var(--font-data)]`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("productName")}</span>
            <input required value={productName} onChange={(e) => setProductName(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("category")}</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
              className={`${inputClass} mt-1`}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_KEYS[c])}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("batchNumberOptional")}</span>
            <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("manufacturedOptional")}</span>
            <input type="date" value={manufacturedAt} onChange={(e) => setManufacturedAt(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("expiryDateOptional")}</span>
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          {error && <ErrorState message={error} />}
          <Button type="submit" variant="solid" loading={loading} loadingText={t("registering")}>
            {t("registerProduct")}
          </Button>
        </form>
      )}
    </div>
  );
}

function ModalShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-7 shadow-chekkam-lg">
        {children}
      </div>
    </div>
  );
}

function RegisterResultModal({ result, onClose }: { result: RegisterResult; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-status-success">
        {t("registered")}
      </div>
      <div className="flex flex-col items-start gap-5 rounded-[var(--radius-chekkam)] bg-gradient-seal p-6 text-white sm:flex-row sm:items-center">
        <Image src={result.qr_image} alt={t("productCode")} width={140} height={140} unoptimized className="h-32 w-32 rounded-[var(--radius-chekkam-sm)] bg-white p-2 shadow-chekkam-sm" />
        <dl className="text-sm">
          <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">{t("productCode")}</dt>
          <dd className="font-[family-name:var(--font-data)] text-base font-medium">{result.product_code}</dd>
        </dl>
      </div>
      <Button onClick={onClose} variant="ghost" className="mt-5 w-full">
        {t("done")}
      </Button>
    </ModalShell>
  );
}

function ProductDetailModal({
  product,
  onClose,
  onUpdateStatus,
}: {
  product: Product;
  onClose: () => void;
  onUpdateStatus: (id: string, action: "recall" | "mark_stolen" | "reactivate", reason?: string) => void;
}) {
  const { lang, t } = useI18n();
  const [reason, setReason] = useState("");
  const locale = lang === "fr" ? "fr-FR" : "en-US";

  return (
    <ModalShell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-chekkam-ink">
          {product.product_name}
        </h2>
        <StatusBadge
          tone={product.status === "active" ? "success" : product.status === "recalled" ? "warning" : "danger"}
          label={
            product.status === "active"
              ? t("statusActive")
              : product.status === "recalled"
                ? t("statusRecalled")
                : t("statusStolen")
          }
        />
      </div>

      <dl className="flex flex-col gap-2 text-sm">
        <Row label={t("institution")} value={product.institution_name ?? "-"} />
        <Row label={t("category")} value={t(CATEGORY_KEYS[product.category as (typeof CATEGORIES)[number]] ?? "categoryOther")} />
        <Row label={t("productCode")} value={product.product_code} mono />
        {product.batch_number && <Row label={t("batchNumber")} value={product.batch_number} />}
        <Row label={t("fileHash")} value={product.product_hash} mono breakAll />
        <Row label={t("signature")} value={product.signature} mono breakAll />
        {product.manufactured_at && (
          <Row label={t("manufacturedOn")} value={new Date(product.manufactured_at).toLocaleDateString(locale)} />
        )}
        {product.expiry_date && (
          <Row label={t("expiresOn")} value={new Date(product.expiry_date).toLocaleDateString(locale)} />
        )}
        {product.status_reason && <Row label={t("reason")} value={product.status_reason} />}
      </dl>

      {product.status === "active" ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-chekkam-border pt-5">
          <label className="block">
            <span className="text-xs font-medium text-chekkam-muted">{t("reasonForRecall")}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <div className="flex gap-3">
            <Button onClick={() => onUpdateStatus(product.id, "recall", reason)} disabled={!reason.trim()} variant="danger">
              {t("recall")}
            </Button>
            <Button onClick={() => onUpdateStatus(product.id, "mark_stolen", reason)} disabled={!reason.trim()} variant="danger">
              {t("markStolen")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 border-t border-chekkam-border pt-5">
          <Button onClick={() => onUpdateStatus(product.id, "reactivate")} variant="success">
            {t("reactivate")}
          </Button>
        </div>
      )}

      <Button onClick={onClose} variant="ghost" className="mt-5 w-full">
        {t("close")}
      </Button>
    </ModalShell>
  );
}

function Row({
  label,
  value,
  mono,
  breakAll,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-chekkam-faint">{label}</dt>
      <dd className={`text-chekkam-ink ${mono ? "font-[family-name:var(--font-data)] text-xs" : "text-sm"} ${breakAll ? "break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
