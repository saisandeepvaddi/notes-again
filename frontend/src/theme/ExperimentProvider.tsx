import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import {
  applyExperiment,
  getStoredExperiment,
  storeExperiment,
  type ExperimentId,
} from "@/lib/experiments";

interface ExperimentState {
  experiment: ExperimentId;
  setExperiment: (id: ExperimentId) => void;
}

const ExperimentContext = createContext<ExperimentState | null>(null);

export function ExperimentProvider({ children }: { children: ReactNode }) {
  // Same fixed-then-corrected pattern as ThemeProvider, for the same reason:
  // reading localStorage inside useState's initializer runs during the
  // client's hydration-compared render and would mismatch the server, which
  // always renders "default".
  const [experiment, setExperiment] = useState<ExperimentId>("default");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExperiment(getStoredExperiment());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    applyExperiment(experiment);
    storeExperiment(experiment);
  }, [experiment, hydrated]);

  return (
    <ExperimentContext.Provider value={{ experiment, setExperiment }}>
      {children}
    </ExperimentContext.Provider>
  );
}

export function useExperiment() {
  const ctx = useContext(ExperimentContext);
  if (!ctx) {
    throw new Error("useExperiment must be used within an ExperimentProvider");
  }
  return ctx;
}
