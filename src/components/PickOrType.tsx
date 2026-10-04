"use client";
import { useState } from "react";
import { inputCls } from "./ui";

const NEW = "__new__";

/** Dropdown of existing values, with "+ New…" to type one (iOS ignores <datalist>). */
export default function PickOrType({
  id,
  name,
  options,
  defaultValue,
}: {
  id: string;
  name: string;
  options: string[];
  defaultValue: string;
}) {
  const [typing, setTyping] = useState(options.length === 0 || (!!defaultValue && !options.includes(defaultValue)));

  if (typing) {
    return (
      <div className="flex flex-col gap-1">
        <input id={id} name={name} required autoFocus={options.length > 0} defaultValue={defaultValue} className={inputCls} />
        {options.length > 0 && (
          <button type="button" onClick={() => setTyping(false)} className="self-start text-[12px] font-semibold text-brand">
            Choose existing
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      id={id}
      name={name}
      required
      defaultValue={options.includes(defaultValue) ? defaultValue : ""}
      onChange={(e) => e.target.value === NEW && setTyping(true)}
      className={inputCls}
    >
      <option value="" disabled>
        Select…
      </option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={NEW}>+ New…</option>
    </select>
  );
}
