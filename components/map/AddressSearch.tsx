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
  /** "map": top-left card over the map, max 440px. "landing": centred, up to 640px. Position it from the parent. */
  variant?: "map" | "landing";
  className?: string;
}

// The same box /api/solar/building validates against, so every suggestion is a lookup the API accepts.
const BC_BOX: google.maps.LatLngBoundsLiteral = {
  south: BC_BOUNDS.latMin,
  west: BC_BOUNDS.lngMin,
  north: BC_BOUNDS.latMax,
  east: BC_BOUNDS.lngMax,
};
const MAX_ROWS = 5;
const MIN_CHARS = 3;
const DEBOUNCE_MS = 200;

interface Suggestion {
  row: SuggestionRow;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Daylight AddressSearch: a Spotlight-style frosted card with a 26px field and our own result list,
 * fed by Places API (New) autocomplete (docs/SOLAR_API.md, Gotcha 8). Canada only, inside BC's box;
 * distances are from the map's centre when there is a map. Must sit inside <MapsProvider>.
 */
export function AddressSearch({ onSelect, placeholder = "Enter your address", variant = "map", className }: Props) {
  const places = useMapsLibrary("places");
  const map = useMap();
  const listId = useId();
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!places || query.trim().length < MIN_CHARS) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // One session per search (typing + the pick's details call), so Google bills it as one session.
        session.current ??= new places.AutocompleteSessionToken();
        const origin = map?.getCenter()?.toJSON();
        const { suggestions: found } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: session.current,
          includedRegionCodes: ["ca"],
          locationRestriction: BC_BOX,
          ...(origin && { origin }),
        });
        if (cancelled) return;
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

  const width = variant === "map" ? "w-full max-w-[440px]" : "mx-auto w-full max-w-[640px]";
  const showList = open && suggestions.length > 0;

  if (!MAPS_API_KEY) {
    return (
      <div className={`${width} ${className ?? ""}`}>
        <div className="rounded-xl glass px-5 py-4">
          <div className="flex items-center gap-3">
            <SearchIcon />
            <input
              disabled
              placeholder={placeholder}
              aria-label="Address"
              className="w-full bg-transparent text-[26px] leading-8 text-ink-tertiary outline-none placeholder:text-ink-tertiary"
            />
          </div>
          <p className="mt-2 text-footnote text-ink-tertiary">
            {process.env.NODE_ENV === "production"
              ? "Address search isn't available right now."
              : "Address search needs NEXT_PUBLIC_MAPS_API_KEY (Maps JavaScript API + Places API (New)) in .env.local."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${width} ${className ?? ""}`}>
      <div className="overflow-hidden rounded-xl glass">
        {/* Focus shows as a 2px focus-ring underline inside the card (Daylight README). */}
        <div className="mx-5 flex items-center gap-3 border-b-2 border-transparent py-4 focus-within:border-focus-ring">
          <SearchIcon />
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
              setQuery(v);
              if (v.trim().length < MIN_CHARS) {
                setSuggestions([]);
                setOpen(false);
              }
            }}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="w-full bg-transparent text-[26px] leading-8 text-ink outline-none placeholder:text-ink-tertiary"
          />
        </div>
        {showList && (
          <ul id={listId} role="listbox" aria-label="Addresses" className="grid gap-0.5 p-2">
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
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${isActive ? "bg-fill-selected" : ""}`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-sm ${
                      isActive ? "bg-sky-600 text-on-sky-600" : "bg-fill-quiet text-ink-secondary"
                    }`}
                  >
                    <PinIcon />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-headline text-ink">{s.row.title}</span>
                    {s.row.subtitle && <span className="block truncate text-callout text-ink-secondary">{s.row.subtitle}</span>}
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

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0 text-ink-secondary" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
