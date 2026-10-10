import { useId, useState } from "react";
import { useCombobox } from "downshift";
import { useAddressSearch } from "../hooks/useAddressSearch.ts";
import type { AddressSearchResult } from "../lib/address-search.ts";
import type { MunicipalitySuggestion } from "../lib/street-names.ts";
import "./AddressSearch.css";

/**
 * Either a geocoded address or a whole municipality from the local data. The
 * municipality entries come first: they answer "Ettlingen" better than any
 * single point in it, and they never leave the device.
 */
type AddressSearchItem =
  | { kind: "address"; result: AddressSearchResult }
  | { kind: "municipality"; suggestion: MunicipalitySuggestion };

interface AddressSearchProps {
  label?: string;
  placeholder?: string;
  onAddressSelect: (result: AddressSearchResult) => void;
  /** Offers whole municipalities matching the query, when given. */
  suggestMunicipalities?: (query: string) => MunicipalitySuggestion[];
  onMunicipalitySelect?: (municipality: string) => void;
  /** The provider credit, shown once when several fields share a screen. */
  showAttribution?: boolean;
  /** For a field that appears because the visitor asked to search. */
  autoFocus?: boolean;
}

const itemToString = (item: AddressSearchItem | null): string => {
  if (!item) return "";
  return item.kind === "address"
    ? item.result.label
    : `Ganz ${item.suggestion.municipality}`;
};

export function AddressSearch({
  label = "Adresse suchen",
  placeholder = "Straße, Hausnummer, Ort",
  onAddressSelect,
  suggestMunicipalities,
  onMunicipalitySelect,
  showAttribution = true,
  autoFocus = false,
}: AddressSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const isSearching = selectedLabel !== query;
  const { status, results } = useAddressSearch(isSearching ? query : "");
  const municipalityItems: AddressSearchItem[] =
    isSearching && suggestMunicipalities && onMunicipalitySelect
      ? suggestMunicipalities(query).map((suggestion) => ({
          kind: "municipality",
          suggestion,
        }))
      : [];
  const items: AddressSearchItem[] = [
    ...municipalityItems,
    ...results.map((result): AddressSearchItem => ({ kind: "address", result })),
  ];

  const selectItem = (item: AddressSearchItem) => {
    if (item.kind === "address") onAddressSelect(item.result);
    else onMunicipalitySelect?.(item.suggestion.municipality);
    setSelectedLabel(itemToString(item));
    setQuery(itemToString(item));
  };

  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } = useCombobox({
    items,
    inputValue: query,
    itemToString,
    onInputValueChange: ({ inputValue }) => setQuery(inputValue),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) selectItem(selectedItem);
    },
    // German announcements are provided by the status region below.
    getA11yStatusMessage: () => "",
  });

  return (
    <div className="address-search">
      <label className="kern-label" {...getLabelProps()}>{label}</label>
      <input
        className="kern-form-input__input"
        type="search"
        maxLength={200}
        spellCheck={false}
        placeholder={placeholder}
        autoFocus={autoFocus}
        {...getInputProps({
          "aria-describedby": showAttribution ? `${inputId}-hint` : undefined,
          onChange: () => setSelectedLabel(""),
          onKeyDown: (event) => {
            // Dismiss suggestions before Escape can close the parent dialog.
            if (event.key === "Escape" && isOpen) event.stopPropagation();
          },
        })}
      />
      {showAttribution && (
        <p id={`${inputId}-hint`} className="address-search__hint">
          Ab 3 Zeichen wird Ihre Eingabe an Photon (komoot) gesendet.
        </p>
      )}
      <p role="status" className="address-search__status">
        {status === "loading" && "Adresse wird gesucht …"}
        {status === "ready" && (items.length ? `${items.length} Treffer. Wählen Sie mit den Pfeiltasten und Enter oder tippen Sie auf einen Treffer.` : "Keine Adresse gefunden. Ergänzen Sie den Ort oder wählen Sie auf der Karte.")}
        {status === "error" && "Adresssuche nicht verfügbar. Ändern Sie Ihre Eingabe oder wählen Sie auf der Karte."}
        {status === "idle" && selectedLabel && `Gewählt: ${selectedLabel}`}
      </p>
      <ul
        className="address-search__results"
        hidden={!isOpen || items.length === 0}
        {...getMenuProps()}
      >
        {isOpen && items.map((item, index) => (
          <li
            key={item.kind === "address" ? JSON.stringify([item.result.label, item.result.point]) : `municipality:${item.suggestion.municipality}`}
            data-highlighted={highlightedIndex === index}
            {...getItemProps({ item, index })}
          >
            {item.kind === "address" ? (
              item.result.label
            ) : (
              <>
                <strong>Ganz {item.suggestion.municipality}</strong>
                <span className="address-search__meta">
                  {item.suggestion.constructionSiteCount} Baustellen
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      {showAttribution && (
        <p className="address-search__hint">
          Suche: <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a>
          {" · © "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-Mitwirkende</a>
        </p>
      )}
    </div>
  );
}
