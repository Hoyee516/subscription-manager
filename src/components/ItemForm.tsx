"use client";
import { useState } from "react";
import { createItem, updateItem } from "@/app/actions/items";
import { ITEM_TYPES, type ItemTypeName } from "@/lib/billing";
import PickOrType from "./PickOrType";
import TermFields, { emptyTerm } from "./TermFields";
import { useAction } from "./useAction";
import { Card, Field, SectionLabel, btnPrimary, inputCls, labelCls } from "./ui";

export type ItemDefaults = {
  name: string;
  vendor: string;
  categoryGroup: string;
  category: string;
  type: ItemTypeName;
  autoRenew: boolean;
  autoCharge: boolean;
  isSavings: boolean;
  paymentMethodId: string;
  notes: string;
};

export default function ItemForm({
  itemId,
  d,
  methods,
  groups,
  categories,
}: {
  itemId?: string; // absent = new item (form also asks for the first term)
  d: ItemDefaults;
  methods: { id: string; label: string }[];
  groups: string[];
  categories: string[];
}) {
  const [type, setType] = useState<ItemTypeName>(d.type);
  const { pending, run } = useAction();
  const isNew = !itemId;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("type", type);
        run(() => (isNew ? createItem(fd) : updateItem(itemId, fd)), {
          success: isNew ? "Item added" : "Saved",
          goTo: (id) => `/bills/${id}`,
        });
      }}
    >
      <Card className="flex flex-col gap-3.5">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required defaultValue={d.name} className={inputCls} />
        </Field>
        <Field label="Vendor" htmlFor="vendor">
          <input id="vendor" name="vendor" required defaultValue={d.vendor} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Group" htmlFor="categoryGroup">
            <PickOrType id="categoryGroup" name="categoryGroup" options={groups} defaultValue={d.categoryGroup} />
          </Field>
          <Field label="Category" htmlFor="category">
            <PickOrType id="category" name="category" options={categories} defaultValue={d.category} />
          </Field>
        </div>
        <Field label="Charged to" htmlFor="paymentMethodId" hint="The card or account this is billed to. Prefills Log payment.">
          <select id="paymentMethodId" name="paymentMethodId" defaultValue={d.paymentMethodId} className={inputCls}>
            <option value="">Not set</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>Billing type</span>
          <div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[#ECEDE8] p-[3px]" role="radiogroup" aria-label="Billing type">
            {ITEM_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className={`min-h-10 rounded-lg text-[13px] font-bold ${type === t.value ? "bg-ink text-white" : "text-[#56606B]"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{ITEM_TYPES.find((t) => t.value === type)?.hint}</p>
        </div>

        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold">Auto-renews</span>
            <span className="text-xs text-muted">Charges again unless you cancel</span>
          </span>
          <input type="checkbox" name="autoRenew" defaultChecked={d.autoRenew} className="h-5 w-5 accent-[#0B5D52]" />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold">Charged automatically</span>
            <span className="text-xs text-muted">Paid by its card each cycle, no need to log payments</span>
          </span>
          <input type="checkbox" name="autoCharge" defaultChecked={d.autoCharge} className="h-5 w-5 accent-[#0B5D52]" />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold">Savings-type</span>
            <span className="text-xs text-muted">Shown as its own bar on the Overview (儲蓄, 年金)</span>
          </span>
          <input type="checkbox" name="isSavings" defaultChecked={d.isSavings} className="h-5 w-5 accent-[#0B5D52]" />
        </label>
      </Card>

      {isNew && (
        <Card className="flex flex-col gap-3.5">
          <SectionLabel>First term</SectionLabel>
          <TermFields d={emptyTerm} />
        </Card>
      )}

      <Card className="flex flex-col gap-3.5">
        <Field label="Notes" htmlFor="notes">
          <textarea id="notes" name="notes" rows={3} defaultValue={d.notes} className={`${inputCls} py-2.5`} />
        </Field>
      </Card>

      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : isNew ? "Add item" : "Save"}
      </button>
    </form>
  );
}
