"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { trpc } from "@/utils/trpc";

const STORAGE_KEY = "forest-creek-dashboard-property";

export type StaffProperty = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
};

type PropertyContextValue = {
  properties: StaffProperty[];
  /** undefined means "all properties", only offered when more than one is in scope. */
  selectedId: string | undefined;
  selected: StaffProperty | undefined;
  select: (id: string | undefined) => void;
  isLoading: boolean;
  canSeeAll: boolean;
};

const PropertyContext = createContext<PropertyContextValue | undefined>(undefined);

export function PropertyProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [restored, setRestored] = useState(false);

  const query = useQuery(trpc.properties.mine.queryOptions());
  const properties = useMemo<StaffProperty[]>(
    () =>
      (query.data ?? []).map((property) => ({
        id: property.id,
        name: property.name,
        slug: property.slug,
        active: property.active,
      })),
    [query.data],
  );

  useEffect(() => {
    if (restored || properties.length === 0) return;
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? undefined;
    // A stored id that is no longer in scope must not silently pin an empty view.
    if (stored && properties.some((property) => property.id === stored)) {
      setSelectedId(stored);
    } else if (properties.length === 1) {
      setSelectedId(properties[0]!.id);
    }
    setRestored(true);
  }, [properties, restored]);

  const select = useCallback((id: string | undefined) => {
    setSelectedId(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<PropertyContextValue>(
    () => ({
      properties,
      selectedId,
      selected: properties.find((property) => property.id === selectedId),
      select,
      isLoading: query.isPending,
      canSeeAll: properties.length > 1,
    }),
    [properties, selectedId, select, query.isPending],
  );

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>;
}

export function useProperties(): PropertyContextValue {
  const value = useContext(PropertyContext);
  if (!value) throw new Error("useProperties must be used inside PropertyProvider");
  return value;
}
