import { useState } from "react";
import { useCombobox } from "downshift";
import { KernSelect } from "@kern-ux-annex/kern-react-kit";
import type { ConstructionSite } from "../types/index.ts";
import { suggestStreets, type StreetSuggestion } from "../lib/street-names.ts";
import "./AddressSearch.css";

interface StreetSearchProps {
  constructionSites: readonly ConstructionSite[];
  street: string;
  municipality: string;
  municipalities: readonly string[];
  onChange: (street: string, municipality: string) => void;
}

/**
 * Pick a street by name. Suggestions come from the current data and never
 * leave the device; any other street can be typed in full, because the point
 * is to hear about works that are not announced yet.
 */
export function StreetSearch({
  constructionSites,
  street,
  municipality,
  municipalities,
  onChange,
}: StreetSearchProps) {
  const [isSelected, setIsSelected] = useState(street.length > 0);
  const suggestions = isSelected ? [] : suggestStreets(constructionSites, street);

  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } =
    useCombobox<StreetSuggestion>({
      items: suggestions,
      inputValue: street,
      itemToString: (suggestion) => suggestion?.street ?? "",
      onInputValueChange: ({ inputValue, type }) => {
        if (type === useCombobox.stateChangeTypes.InputChange) {
          setIsSelected(false);
          onChange(inputValue, municipality);
        }
      },
      onSelectedItemChange: ({ selectedItem }) => {
        if (!selectedItem) return;
        setIsSelected(true);
        onChange(selectedItem.street, selectedItem.municipality);
      },
      getA11yStatusMessage: () => "",
    });

  return (
    <div className="address-search">
      <label className="kern-label" {...getLabelProps()}>Straße</label>
      <input
        className="kern-form-input__input"
        type="search"
        maxLength={100}
        spellCheck={false}
        placeholder="z. B. Kaiserstraße"
        {...getInputProps({
          onKeyDown: (event) => {
            if (event.key === "Escape" && isOpen) event.stopPropagation();
          },
        })}
      />
      <p role="status" className="address-search__status">
        {!isSelected && suggestions.length > 0 &&
          `${suggestions.length} Straßen mit Baustellen. Wählen Sie mit den Pfeiltasten oder tippen Sie weiter.`}
      </p>
      <ul
        className="address-search__results"
        hidden={!isOpen || suggestions.length === 0}
        {...getMenuProps()}
      >
        {isOpen &&
          suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.street}|${suggestion.municipality}`}
              data-highlighted={highlightedIndex === index}
              {...getItemProps({ item: suggestion, index })}
            >
              {suggestion.street}, {suggestion.municipality}
              <span className="address-search__meta">
                {suggestion.constructionSiteCount} Baustellen
              </span>
            </li>
          ))}
      </ul>
      <KernSelect
        id="street-municipality"
        label="Gemeinde"
        required
        value={municipality}
        onChange={(event) => onChange(street, event.currentTarget.value)}
      >
        {municipalities.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </KernSelect>
    </div>
  );
}
