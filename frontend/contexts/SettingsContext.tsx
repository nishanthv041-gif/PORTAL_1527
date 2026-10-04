"use client";

import { createContext, useContext, ReactNode } from "react";

type SettingsMap = Record<string, string>;

const SettingsContext = createContext<SettingsMap>({});

export function SettingsProvider({ children, settings }: { children: ReactNode, settings: SettingsMap }) {
  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
