import { useEffect } from 'react';
import { AppState } from 'react-native';
import { getActiveScreenName, sendNavigationEvent } from './session-replay';

const POLL_MS = 900;

/** Log screen transitions to the MetaMask UAT relay for session replay. */
export function useSessionReplay(relayUrl: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const screen = getActiveScreenName();
      if (screen) {
        sendNavigationEvent(relayUrl, screen);
      }
    };

    tick();
    const intervalId = setInterval(tick, POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [relayUrl, enabled]);
}
