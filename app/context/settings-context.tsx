"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { db } from "../lib/db";

const SettingsContext = createContext<any>(null);

export const SettingsProvider = ({ children }: any) => {
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const s = await db.settings.toArray();
    setSettings(s[0] || null);
  };

  const updateSettings = async (data: any) => {
    const existing = await db.settings.toArray();

    if (existing[0]) {
      await db.settings.update(existing[0].id!, data);
    } else {
      await db.settings.add({
        ...data,
        updatedAt: Date.now(),
        version: 1,
        deviceId: "local",
        synced: "pending",
      });
    }

    await load();
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);