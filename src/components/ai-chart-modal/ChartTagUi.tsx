"use client";

import { XIcon } from "lucide-react";

export interface ChartTagOption {
  chartId: string;
  label: string;
}

/** Picker shown above the composer while the user types `@`. */
export function ChartTagPicker({
  options,
  activeIndex,
  onSelect,
}: {
  options: ChartTagOption[];
  activeIndex: number;
  onSelect: (option: ChartTagOption) => void;
}) {
  return (
    <div className="qp-ai-tag-picker" role="listbox" aria-label="Tag a chart">
      {options.length === 0 ? (
        <div className="qp-ai-tag-picker-empty">No matching charts</div>
      ) : (
        options.map((option, index) => (
          <button
            key={option.chartId}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className="qp-ai-tag-picker-item"
            data-active={index === activeIndex ? "true" : undefined}
            // mousedown keeps focus in the prompt input
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(option);
            }}
          >
            @{option.label}
          </button>
        ))
      )}
    </div>
  );
}

/** A tagged chart. Clicking scrolls to the block; `dead` chips (chart removed) are inert. */
export function ChartChip({
  label,
  dead = false,
  onClick,
  onRemove,
}: {
  label: string;
  dead?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <span className="qp-ai-tag-chip" data-dead={dead ? "true" : undefined}>
      <button
        type="button"
        className="qp-ai-tag-chip-label"
        disabled={dead || !onClick}
        onClick={onClick}
        title={dead ? "This chart is no longer on the Dashboard" : "Show on the Dashboard"}
      >
        @{label}
      </button>
      {onRemove && (
        <button type="button" className="qp-ai-tag-chip-remove" onClick={onRemove} aria-label={`Remove ${label}`}>
          <XIcon size={12} />
        </button>
      )}
    </span>
  );
}
