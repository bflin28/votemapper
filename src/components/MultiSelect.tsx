"use client";

import { useState, useRef, useEffect } from "react";

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  tagColor?: "blue" | "slate";
}

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Search...",
  disabled = false,
  tagColor = "blue",
}: MultiSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(
    (o) =>
      !selected.includes(o) &&
      o.toLowerCase().includes(query.toLowerCase())
  );

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(option: string) {
    onChange([...selected, option]);
    setQuery("");
    inputRef.current?.focus();
  }

  function handleRemove(option: string) {
    onChange(selected.filter((s) => s !== option));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        handleSelect(filtered[0]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (
      e.key === "Backspace" &&
      query === "" &&
      selected.length > 0
    ) {
      handleRemove(selected[selected.length - 1]);
    }
  }

  const tagBg = tagColor === "blue" ? "bg-blue-50" : "bg-slate-100";
  const tagText = tagColor === "blue" ? "text-blue-700" : "text-slate-700";
  const tagClose =
    tagColor === "blue"
      ? "text-blue-400 hover:text-blue-600"
      : "text-slate-400 hover:text-slate-600";

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`rounded-md border border-slate-200 bg-slate-50 px-3 py-2 transition-colors ${
          open ? "border-blue-500 ring-1 ring-blue-500" : ""
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
      >
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {selected.map((item) => (
              <span
                key={item}
                className={`inline-flex items-center gap-1 rounded-md ${tagBg} px-2 py-0.5 text-xs font-medium ${tagText}`}
              >
                {item}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(item);
                  }}
                  className={`ml-0.5 ${tagClose}`}
                >
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="3" y1="3" x2="9" y2="9" />
                    <line x1="9" y1="3" x2="3" y2="9" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length > 0 ? "Add more..." : placeholder}
          disabled={disabled}
          className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-300 outline-none"
        />
      </div>

      {/* Dropdown */}
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.slice(0, 100).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {option}
            </button>
          ))}
          {filtered.length > 100 && (
            <div className="px-3 py-1.5 text-xs text-slate-400">
              {filtered.length - 100} more — type to filter
            </div>
          )}
        </div>
      )}

      {open && !disabled && filtered.length === 0 && query && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 shadow-lg">
          <span className="text-sm text-slate-400">No matches</span>
        </div>
      )}
    </div>
  );
}
