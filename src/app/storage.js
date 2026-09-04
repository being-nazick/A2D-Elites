import { useCallback, useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";

export function useCapacitorStorage(key, initialValue) {
  const [state, setState] = useState(initialValue);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadStoredValue = async () => {
      try {
        const { value } = await Preferences.get({ key });
        if (value !== null && isMounted) setState(JSON.parse(value));
      } catch (error) {
        console.error(`Error reading key "${key}":`, error);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    };
    loadStoredValue();
    return () => { isMounted = false; };
  }, [key]);

  const setPersistentState = useCallback((newValue) => {
    setState((previousState) => {
      const updated = typeof newValue === "function" ? newValue(previousState) : newValue;
      Preferences.set({ key, value: JSON.stringify(updated) }).catch((error) => {
        console.error(`Error saving key "${key}":`, error);
      });
      return updated;
    });
  }, [key]);

  return [state, setPersistentState, isLoaded];
}
