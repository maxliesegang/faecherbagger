import { useId, useState } from "react";
import { useCombobox } from "downshift";
import { useAddressSearch } from "../hooks/useAddressSearch.ts";
import type { AddressSearchResult } from "../lib/address-search.ts";
import type { LngLat } from "../types/index.ts";
import "./AddressSearch.css";

interface AddressSearchProps {
  onCenterChange: (center: LngLat) => void;
}

export function AddressSearch({ onCenterChange }: AddressSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const { status, results } = useAddressSearch(selectedLabel === query ? "" : query);

  const selectAddress = (result: AddressSearchResult) => {
    onCenterChange(result.point);
    setSelectedLabel(result.label);
    setQuery(result.label);
  };

  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } = useCombobox({
    items: results,
    inputValue: query,
    itemToString: (result) => result?.label ?? "",
    onInputValueChange: ({ inputValue }) => setQuery(inputValue),
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) selectAddress(selectedItem);
    },
    // German announcements are provided by the status region below.
    getA11yStatusMessage: () => "",
  });

  return (
    <div className="address-search">
      <label className="kern-label" {...getLabelProps()}>Adresse suchen</label>
      <input
        className="kern-form-input__input"
        type="search"
        maxLength={200}
        spellCheck={false}
        placeholder="Straße, Hausnummer, Ort"
        {...getInputProps({
          "aria-describedby": `${inputId}-hint`,
          onChange: () => setSelectedLabel(""),
          onKeyDown: (event) => {
            // Dismiss suggestions before Escape can close the parent dialog.
            if (event.key === "Escape" && isOpen) event.stopPropagation();
          },
        })}
      />
      <p id={`${inputId}-hint`} className="address-search__hint">
        Ab 3 Zeichen wird Ihre Eingabe an Photon (komoot) gesendet.
      </p>
      <p role="status">
        {status === "loading" && "Adresse wird gesucht …"}
        {status === "ready" && (results.length ? `${results.length} Treffer. Wählen Sie mit den Pfeiltasten und Enter oder tippen Sie auf eine Adresse.` : "Keine Adresse gefunden. Ergänzen Sie den Ort oder wählen Sie auf der Karte.")}
        {status === "error" && "Adresssuche nicht verfügbar. Ändern Sie Ihre Eingabe oder wählen Sie auf der Karte."}
        {status === "idle" && selectedLabel && `Mittelpunkt gewählt: ${selectedLabel}`}
      </p>
      <ul
        className="address-search__results"
        hidden={!isOpen || results.length === 0}
        {...getMenuProps()}
      >
        {isOpen && results.map((result, index) => (
          <li
            key={JSON.stringify([result.label, result.point])}
            data-highlighted={highlightedIndex === index}
            {...getItemProps({ item: result, index })}
          >
            {result.label}
          </li>
        ))}
      </ul>
      <p className="address-search__hint">
        Suche: <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a>
        {" · © "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-Mitwirkende</a>
      </p>
    </div>
  );
}
