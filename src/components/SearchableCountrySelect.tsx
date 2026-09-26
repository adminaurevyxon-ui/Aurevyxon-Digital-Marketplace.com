import React, { useState, useEffect, useMemo, useRef } from 'react';
import { safeJson } from '@/lib/utils';
import { Search, ChevronDown, Check, Globe } from 'lucide-react';
import { ALL_COUNTRIES_DATA, CountryItem } from '@/lib/countriesData';

export type { CountryItem };
export const FALLBACK_COUNTRIES: CountryItem[] = ALL_COUNTRIES_DATA;

interface SearchableCountrySelectProps {
  value?: string;
  onChange: (country: CountryItem) => void;
  mode?: 'name' | 'phone' | 'iso';
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableCountrySelect({
  value,
  onChange,
  mode = 'name',
  placeholder = 'Select Country...',
  className = '',
  disabled = false
}: SearchableCountrySelectProps) {
  const [countries, setCountries] = useState<CountryItem[]>(FALLBACK_COUNTRIES);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/countries')
      .then(res => safeJson(res, { success: false, countries: [] }))
      .then(data => {
        if (data && data.success && Array.isArray(data.countries) && data.countries.length > 0) {
          const seen = new Set<string>();
          const uniqueCountries: CountryItem[] = [];
          for (const c of data.countries) {
            if (!c || !c.iso_code) continue;
            const code = c.iso_code.toUpperCase().trim();
            if (!seen.has(code)) {
              seen.add(code);
              uniqueCountries.push(c);
            }
          }
          if (uniqueCountries.length > 0) {
            setCountries(uniqueCountries);
          }
        }
      })
      .catch(err => {
        console.warn("Using fallback countries list:", err);
      });
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCountry = useMemo(() => {
    if (!value) return null;
    const valLower = value.trim().toLowerCase();
    if (mode === 'phone') {
      return countries.find(c => c.phone_code.toLowerCase() === valLower) ||
             countries.find(c => c.name.toLowerCase() === valLower);
    }
    if (mode === 'iso') {
      return countries.find(c => c.iso_code.toLowerCase() === valLower) ||
             countries.find(c => c.name.toLowerCase() === valLower);
    }
    return countries.find(c => c.name.toLowerCase() === valLower) ||
           countries.find(c => c.iso_code.toLowerCase() === valLower) ||
           countries.find(c => c.phone_code.toLowerCase() === valLower);
  }, [value, countries, mode]);

  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countries;
    const q = searchQuery.toLowerCase().trim();
    return countries.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.iso_code.toLowerCase().includes(q) ||
      c.phone_code.toLowerCase().includes(q)
    );
  }, [countries, searchQuery]);

  const handleSelect = (country: CountryItem) => {
    onChange(country);
    setIsOpen(false);
    setSearchQuery('');
  };

  const displayLabel = useMemo(() => {
    if (selectedCountry) {
      if (mode === 'phone') return `${selectedCountry.phone_code} (${selectedCountry.iso_code})`;
      if (mode === 'iso') return `${selectedCountry.name} (${selectedCountry.iso_code})`;
      return selectedCountry.name;
    }
    return value || placeholder;
  }, [selectedCountry, value, mode, placeholder]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-11 px-3.5 py-2 bg-slate-900/80 border border-slate-700/60 hover:border-indigo-500/50 rounded-xl text-slate-200 text-sm flex items-center justify-between shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <span className="flex items-center gap-2 truncate font-medium">
          <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[260px] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in-50 zoom-in-95">
          {/* Search Bar */}
          <div className="p-2.5 border-b border-slate-800 bg-slate-950/60">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                autoFocus
                placeholder="Search by country or +dial code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-slate-900/90 border border-slate-800 focus:border-indigo-500 rounded-lg text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5 px-1 flex justify-between">
              <span>Showing {filteredCountries.length} countries</span>
              <span className="text-indigo-400">Type to search</span>
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {filteredCountries.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                No country found for "{searchQuery}"
              </div>
            ) : (
              filteredCountries.map((country, idx) => {
                const isSelected = selectedCountry?.iso_code === country.iso_code;
                return (
                  <button
                    key={`${country.iso_code}-${country.id || idx}`}
                    type="button"
                    onClick={() => handleSelect(country)}
                    className={`w-full px-3 py-2 text-left text-xs rounded-lg flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-indigo-600/20 text-indigo-300 font-semibold border border-indigo-500/30'
                        : 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-slate-300 font-semibold">
                        {country.iso_code}
                      </span>
                      <span className="truncate">{country.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono text-[11px] text-emerald-400 font-medium">
                        {country.phone_code}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
