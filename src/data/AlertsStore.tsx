import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { initialRules } from './mock';
import type { AlertRule } from './types';

type AlertsContextValue = {
  rules: AlertRule[];
  addRule: (rule: Omit<AlertRule, 'id'>) => AlertRule;
  setRuleEnabled: (id: string, enabled: boolean) => void;
};

const AlertsContext = createContext<AlertsContextValue | null>(null);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<AlertRule[]>(initialRules);

  const value = useMemo<AlertsContextValue>(
    () => ({
      rules,
      addRule: (input) => {
        const rule = { ...input, id: `r-${Date.now()}` };
        setRules((prev) => [...prev, rule]);
        return rule;
      },
      setRuleEnabled: (id, enabled) => setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r))),
    }),
    [rules],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error('useAlerts must be used inside AlertsProvider');
  return ctx;
}
