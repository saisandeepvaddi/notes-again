import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

interface ComboboxProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
}

interface Item {
  name: string;
  create: boolean;
}

const MAX_SHOWN = 8;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function rank(name: string, query: string): number {
  const n = name.toLowerCase();
  if (n === query) return 0;
  return n.startsWith(query) ? 1 : 2;
}

export function Combobox({ label, options, value, onChange, multiple = false, placeholder }: ComboboxProps) {
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const trimmed = query.trim();
  const items = useMemo<Item[]>(() => {
    const q = trimmed.toLowerCase();
    const matches = options
      .filter((o) => !value.some((v) => same(v, o)) && o.toLowerCase().includes(q))
      .sort((a, b) => rank(a, q) - rank(b, q) || a.localeCompare(b))
      .slice(0, MAX_SHOWN)
      .map((name) => ({ name, create: false }));
    const exists = [...options, ...value].some((o) => same(o, trimmed));
    return trimmed && !exists ? [...matches, { name: trimmed, create: true }] : matches;
  }, [options, value, trimmed]);

  const choose = (name: string) => {
    const canonical = options.find((o) => same(o, name)) ?? name;
    if (!value.some((v) => same(v, canonical))) {
      onChange(multiple ? [...value, canonical] : [canonical]);
    }
    setQuery("");
    setActive(0);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActive((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        if (trimmed) {
          e.preventDefault();
          e.stopPropagation();
          choose(open && items[active] ? items[active].name : trimmed);
        }
        break;
      case ",":
        if (multiple && trimmed) {
          e.preventDefault();
          choose(trimmed);
        }
        break;
      case "Backspace":
        if (!query && value.length) {
          onChange(value.slice(0, -1));
        }
        break;
      case "Escape":
        if (open) {
          e.stopPropagation();
          setOpen(false);
        }
        break;
    }
  };

  const showInput = multiple || value.length === 0;

  return (
    <div className="nl-field">
      <label className="nl-label" htmlFor={`${uid}-input`}>
        {label}
      </label>
      <div className="nl-combo" onClick={() => inputRef.current?.focus()}>
        {value.map((v) => {
          const isNew = !options.some((o) => same(o, v));
          return (
            <span key={v} className={isNew ? "nl-chip is-new" : "nl-chip"}>
              {v}
              {isNew && <span className="nl-chip-badge">new</span>}
              <button
                type="button"
                className="nl-chip-remove"
                aria-label={`Remove ${v}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
              >
                ×
              </button>
            </span>
          );
        })}
        {showInput && (
          <input
            id={`${uid}-input`}
            ref={inputRef}
            className="nl-combo-input"
            role="combobox"
            aria-expanded={open && items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && items[active] ? `${uid}-opt-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={value.length === 0 ? placeholder : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => (trimmed ? choose(trimmed) : setOpen(false))}
            onKeyDown={onKeyDown}
          />
        )}
      </div>
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="nl-list">
          {items.map((item, i) => (
            <li
              key={`${item.create ? "new:" : ""}${item.name}`}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "nl-option is-active" : "nl-option"}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item.name);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {item.create ? (
                <>
                  Create <strong>“{item.name}”</strong>
                </>
              ) : (
                item.name
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
