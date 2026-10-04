"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { pickedPlace, type PickedPlace } from "@/lib/geo/place";
import { suggestionRow, type SuggestionRow } from "@/lib/geo/suggestions";
import { BC_BOUNDS } from "@/src/config/bc";
import { MAPS_API_KEY } from "./MapsProvider";

interface Props {
  /** Called with the picked address's location (full precision; round it for URLs). */
  onSelect: (place: PickedPlace) => void;
  placeholder?: string;
  /** "map": compact top-left pill over the map, max 360px. "landing": centred, up to 640px. "bar": a slim
   *  pill that fills its parent (the report's top bar). Position it from the parent. */
  variant?: "map" | "landing" | "bar";
  /** A key hint shown in the empty, unfocused field (the parent listens for the key). Hidden on touch screens. */
  shortcut?: string;
  className?: string;
}

// The same box /api/solar/building validates against, so every suggestion is a lookup the API accepts.
const BC_BOX: google.maps.LatLngBoundsLiteral = {
  south: BC_BOUNDS.latMin,
  west: BC_BOUNDS.lngMin,
  north: BC_BOUNDS.latMax,
  east: BC_BOUNDS.lngMax,
};
// Distances are measured from the map's centre; before there is a map (the landing page) they're from
// central Vancouver, where most users and every live demo roof are (#71). Places (New) takes either a
// locationRestriction or a locationBias, not both, and we keep the BC box so every pick is a valid lookup.
const DEFAULT_ORIGIN: google.maps.LatLngLiteral = { lat: 49.25, lng: -123.1 };
const MAX_ROWS = 5;
const MIN_CHARS = 3;
const DEBOUNCE_MS = 200;

interface Suggestion {
  row: SuggestionRow;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Daylight AddressSearch: a Spotlight-style frosted card and our own result list (a compact 17px field
 * over the map, the 26px field on the landing),
 * fed by Places API (New) autocomplete (docs/SOLAR_API.md, Gotcha 8). Canada only, inside BC's box;
 * distances are from the map's centre, or central Vancouver before there is a map. Must sit inside <MapsProvider>.
 */
export function AddressSearch({ onSelect, placeholder = "Enter your address", variant = "map", shortcut, className }: Props) {
  const places = useMapsLibrary("places");
  const map = useMap();
  const listId = useId();
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // The text a pick put in the field. It isn't typing, so it mustn't search again (a billed request under a
  // fresh session) or reopen the list. Typing clears it.
  const picked = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!places || query.trim().length < MIN_CHARS) return;
    let cancelled = false;
    // Checked before and after the wait: a pick can land mid-debounce or mid-request without changing the query.
    const stale = () => cancelled || query === picked.current;
    if (stale()) return;
    const timer = setTimeout(async () => {
      if (stale()) return;
      try {
        // One session per search (typing + the pick's details call), so Google bills it as one session.
        session.current ??= new places.AutocompleteSessionToken();
        const origin = map?.getCenter()?.toJSON() ?? DEFAULT_ORIGIN;
        const { suggestions: found } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: session.current,
          includedRegionCodes: ["ca"],
          locationRestriction: BC_BOX,
          origin,
        });
        if (stale()) return;
        const rows = found
          .flatMap((s) => (s.placePrediction ? [{ row: suggestionRow(s.placePrediction), prediction: s.placePrediction }] : []))
          .slice(0, MAX_ROWS);
        setSuggestions(rows);
        setActive(0);
        setOpen(true);
        setProblem(null);
      } catch (e) {
        if (cancelled) return;
        console.error("AddressSearch: autocomplete failed", e);
        setProblem("Address search isn't available right now.");
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [places, map, query]);

  const pick = async (index: number) => {
    const choice = suggestions[index];
    if (!choice) return;
    picked.current = choice.row.title;
    setQuery(choice.row.title);
    setOpen(false);
    try {
      const place = choice.prediction.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress", "addressComponents"] });
      session.current = null; // the details call closes the session
      const picked = pickedPlace(place);
      if (!picked) {
        setProblem("That result has no location. Try a street address.");
        return;
      }
      setProblem(null);
      onSelect(picked);
    } catch (e) {
      console.error("AddressSearch: couldn't fetch the picked place", e);
      setProblem("Couldn't look up that address. Try again.");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && open && suggestions.length) {
      e.preventDefault();
      void pick(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const compact = variant !== "landing";
  const bar = variant === "bar";
  const width = bar ? "w-full" : compact ? "w-full max-w-[360px]" : "mx-auto w-full max-w-[640px]";
  const field = bar ? "text-body" : compact ? "text-headline font-normal" : "text-[26px] leading-8";
  const row = bar ? "mx-4 h-11 gap-2.5" : compact ? "mx-4 gap-2.5 py-2.5" : "mx-5 gap-3 py-4";
  // The bar is a pill (radius = half its 44px height) that keeps its rounding as the list opens below.
  const shape = bar ? "rounded-[22px] shadow-control" : "rounded-xl";
  const showList = open && suggestions.length > 0;

  if (!MAPS_API_KEY) {
    return (
      <div data-map-inset={variant === "map" ? "top" : undefined} className={`${width} ${className ?? ""}`}>
        <div className={`${shape} glass ${bar ? "px-4 py-3" : compact ? "px-4 py-2.5" : "px-5 py-4"}`}>
          <div className={`flex items-center ${compact ? "gap-2.5" : "gap-3"}`}>
            <SearchIcon size={bar ? 17 : compact ? 18 : 22} />
            <input
              disabled
              placeholder={placeholder}
              aria-label="Address"
              className={`w-full bg-transparent ${field} text-ink-tertiary outline-none placeholder:text-ink-tertiary`}
            />
          </div>
          <p className="mt-1 text-footnote text-ink-tertiary">
            {process.env.NODE_ENV === "production"
              ? "Address search isn't available right now."
              : "Address search needs NEXT_PUBLIC_MAPS_API_KEY (Maps JavaScript API + Places API (New)) in .env.local."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-map-inset={variant === "map" ? "top" : undefined} className={`${width} ${className ?? ""}`}>
      {/* Focus brightens the frost and edges the card in a neutral ring, not a blue bar: the caret and the
          open list already say where you are, and the bar read as an error over aerial imagery. The ring is an
          outline, not Tailwind's ring-*: that is a box-shadow and would replace glass's float shadow. */}
      <div className={`group overflow-hidden ${shape} glass outline-1 outline-transparent transition-[background-color,outline-color] focus-within:bg-white/95 focus-within:outline-ink/25 dark:focus-within:bg-glass dark:focus-within:outline-white/25`}>
        <div className={`flex items-center ${row}`}>
          <SearchIcon size={bar ? 17 : compact ? 18 : 22} />
          <input
            role="combobox"
            aria-label="Address"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              const v = e.target.value;
              picked.current = null;
              setQuery(v);
              if (v.trim().length < MIN_CHARS) {
                setSuggestions([]);
                setOpen(false);
              }
            }}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className={`w-full bg-transparent ${field} text-ink outline-none placeholder:text-ink-tertiary`}
          />
          {shortcut && !query && (
            <kbd
              aria-hidden="true"
              className="grid h-6 min-w-6 shrink-0 place-items-center rounded-[7px] border border-separator bg-fill-quiet px-1.5 font-sans text-footnote text-ink-tertiary group-focus-within:hidden pointer-coarse:hidden"
            >
              {shortcut}
            </kbd>
          )}
        </div>
        {showList && (
          <ul id={listId} role="listbox" aria-label="Addresses" className={`grid gap-0.5 border-t border-separator ${bar ? "p-1.5" : "p-2"}`}>
            {suggestions.map((s, i) => {
              const isActive = i === active;
              return (
                <li
                  key={s.prediction.placeId}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isActive}
                  // mousedown, not click: picking must happen before the input's blur closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void pick(i);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-md ${bar ? "px-2.5 py-1.5" : "px-3 py-2"} ${isActive ? "bg-fill-selected" : ""}`}
                >
                  <span
                    className={`grid ${bar ? "size-7" : "size-8"} shrink-0 place-items-center rounded-sm ${
                      isActive ? "bg-sky-600 text-on-sky-600" : "bg-fill-quiet text-ink-secondary"
                    }`}
                  >
                    <PinIcon />
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate text-ink ${bar ? "text-body font-medium" : "text-headline"}`}>{s.row.title}</span>
                    {s.row.subtitle && (
                      <span className={`block truncate text-ink-secondary ${bar ? "text-footnote" : "text-callout"}`}>{s.row.subtitle}</span>
                    )}
                  </span>
                </li>
              );
            })}
            <li role="presentation" className="px-3 pt-1 text-right text-footnote text-ink-tertiary">
              Powered by Google
            </li>
          </ul>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-2 rounded-md glass-thin px-3 py-1.5 text-callout text-poor-ink">
          {problem}
        </p>
      )}
    </div>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" className="shrink-0 text-ink-secondary" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
