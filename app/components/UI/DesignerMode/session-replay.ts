import type { NavigationState } from '@react-navigation/native';
import NavigationService from '../../../core/NavigationService';

const SCREEN_NAME_MAX = 120;
const NAV_DEBOUNCE_MS = 600;

let lastSentScreen: string | null = null;
let lastSentAt = 0;

function getDeepRouteName(state?: NavigationState): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = typeof state.index === 'number' ? state.index : 0;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state) {
    return getDeepRouteName(route.state as NavigationState) ?? route.name;
  }
  return route.name;
}

/** Active screen name for session replay (route names only — no params). */
export function getActiveScreenName(): string | undefined {
  try {
    const state = NavigationService.navigation.getRootState();
    return getDeepRouteName(state);
  } catch {
    return undefined;
  }
}

export function sanitizeScreenName(name: string): string {
  const cleaned = name.replace(/[^\w./-]/g, '').slice(0, SCREEN_NAME_MAX);
  return cleaned || 'Unknown';
}

export async function sendNavigationEvent(
  relayUrl: string,
  screen: string,
): Promise<void> {
  const safeScreen = sanitizeScreenName(screen);
  const now = Date.now();
  if (safeScreen === lastSentScreen && now - lastSentAt < NAV_DEBOUNCE_MS) {
    return;
  }
  lastSentScreen = safeScreen;
  lastSentAt = now;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(`${relayUrl}/api/navigation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screen: safeScreen,
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
  } catch {
    /* relay offline — skip */
  } finally {
    clearTimeout(timer);
  }
}

/** Reset dedupe state (tests / hot reload). */
export function resetSessionReplayDedupe(): void {
  lastSentScreen = null;
  lastSentAt = 0;
}
