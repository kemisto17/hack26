"use client";

import { useId } from "react";
import type { LineSelection } from "../contracts";

export type ProductOption = { id: string; name: string; variants: { id: string; name: string }[] };
export type PlanOption = { id: string; name: string; product_id: string };

export function LineEditor({ value, onChange, products }: { value: LineSelection[]; onChange: (lines: LineSelection[]) => void; products: ProductOption[] }) {
  const prefix = useId();
  function update(index: number, change: Partial<LineSelection>) {
    onChange(value.map((line, position) => position === index ? { ...line, ...change } : line));
  }
  return <fieldset className="space-y-4 rounded border p-4">
    <legend>Product and variant lines</legend>
    {value.map((line, index) => {
      const product = products.find(item => item.id === line.product_id);
      return <fieldset key={`${prefix}-${index}`} className="flex flex-wrap items-end gap-3 rounded border p-3">
        <legend>Line {index + 1}</legend>
        <label className="grid gap-1">Product
          <select required value={line.product_id} onChange={event => { const { variant_id: _variant, ...rest } = line; void _variant; onChange(value.map((item, position) => position === index ? { ...rest, product_id: event.target.value } : item)); }}>
            <option value="">Choose a product</option>
            {products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Variant
          <select value={line.variant_id ?? ""} onChange={event => { const { variant_id: _variant, ...rest } = line; void _variant; onChange(value.map((item, position) => position === index ? { ...rest, ...(event.target.value ? { variant_id: event.target.value } : {}) } : item)); }}>
            <option value="">No variant</option>
            {product?.variants.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Quantity
          <input required type="number" min={1} max={1000000} step={1} value={line.quantity} onChange={event => update(index, { quantity: event.target.valueAsNumber })} />
        </label>
        <label><input type="radio" name={`${prefix}-primary`} checked={line.is_primary} onChange={() => onChange(value.map((item, position) => ({ ...item, is_primary: position === index })))} /> Primary plan line</label>
        <button type="button" disabled={value.length === 1} onClick={() => onChange(value.filter((_, position) => position !== index))}>Remove line {index + 1}</button>
      </fieldset>;
    })}
    <button type="button" onClick={() => onChange([...value, { product_id: "", quantity: 1, is_primary: value.length === 0 }])}>Add product line</button>
    <p className="text-sm">Choose exactly one primary line matching the selected plan. Prices come from the catalog when quoted.</p>
  </fieldset>;
}
