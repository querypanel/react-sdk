"use client";

import { useState, type CSSProperties } from "react";

const COUNTRY_CODE = /^[A-Za-z]{2}$/;

/** Settings-panel field to set a map's country (ISO 3166-1 alpha-2). `country` is the current code, if any. */
export function MapCountryField({
  country: currentCountry,
  disabled,
  onChange,
  sectionStyle,
  labelStyle,
  inputStyle,
}: {
  country?: string;
  disabled: boolean;
  onChange: (country: string) => void;
  sectionStyle: CSSProperties;
  labelStyle: CSSProperties;
  inputStyle: CSSProperties;
}) {
  const [country, setCountry] = useState(currentCountry?.toUpperCase() ?? "");
  const valid = COUNTRY_CODE.test(country);
  const changed = valid && country.toUpperCase() !== (currentCountry ?? "").toUpperCase();

  return (
    <div style={sectionStyle}>
      <span style={labelStyle}>Country</span>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <input
          type="text"
          value={country}
          maxLength={2}
          disabled={disabled}
          aria-label="Country code (ISO 3166-1 alpha-2)"
          data-testid="map-country"
          placeholder="HU"
          onChange={(e) => setCountry(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed) onChange(country);
          }}
          style={{ ...inputStyle, width: "3.5rem", textTransform: "uppercase" }}
        />
        <button
          type="button"
          disabled={disabled || !changed}
          data-testid="map-country-apply"
          onClick={() => onChange(country)}
          style={{
            ...inputStyle,
            width: "auto",
            cursor: disabled || !changed ? "not-allowed" : "pointer",
            opacity: disabled || !changed ? 0.5 : 1,
          }}
        >
          Set
        </button>
      </div>
    </div>
  );
}
