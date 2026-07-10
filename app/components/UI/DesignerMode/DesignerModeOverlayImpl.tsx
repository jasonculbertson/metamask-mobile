import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { DesignerModeRN } from './DesignerModeRN';
import { getDefaultRelayUrl } from './relayUrl';
import { useSessionReplay } from './useSessionReplay';

// Codex-style annotate chrome — blue active state, sits clear of Expo Tools.
const TOGGLE_BG = 'rgb(255, 255, 255)';
const TOGGLE_BG_ACTIVE = 'rgb(37, 99, 235)';
const TOGGLE_BORDER = 'rgb(229, 231, 235)';
const TOGGLE_TEXT = 'rgb(17, 24, 39)';
const TOGGLE_TEXT_ACTIVE = 'rgb(255, 255, 255)';
const TOGGLE_SHADOW = 'rgb(0, 0, 0)';

/** How often to check Designer Setup for system-level overlay on/off. */
const OVERLAY_POLL_MS = 2000;

const styles = StyleSheet.create({
  toggle: {
    position: 'absolute',
    top: 88,
    right: 72,
    zIndex: 10000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: TOGGLE_BG,
    borderWidth: 1,
    borderColor: TOGGLE_BORDER,
    shadowColor: TOGGLE_SHADOW,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  } as ViewStyle,
  toggleActive: {
    backgroundColor: TOGGLE_BG_ACTIVE,
    borderColor: TOGGLE_BG_ACTIVE,
  } as ViewStyle,
  toggleIcon: {
    fontSize: 13,
    color: TOGGLE_TEXT,
    fontWeight: '700',
  } as TextStyle,
  toggleIconActive: {
    color: TOGGLE_TEXT_ACTIVE,
  } as TextStyle,
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TOGGLE_TEXT,
  } as TextStyle,
  toggleLabelActive: {
    color: TOGGLE_TEXT_ACTIVE,
  } as TextStyle,
});

/**
 * Designer Mode overlay: Codex-style Annotate / Annotating toggle plus
 * tap-to-pin comment UI. Only `require`d when `DESIGNER_MODE=true`.
 *
 * System on/off is controlled from MetaMask Designer Setup via the relay
 * (`overlayEnabled`). When off, this component renders nothing so the
 * simulator stays clean.
 */
const DesignerModeOverlayImpl: React.FC = () => {
  const [active, setActive] = useState(false);
  const [relayUrl] = useState(getDefaultRelayUrl);
  // Default on so annotate still works if the relay is an older build
  // without overlayEnabled, or briefly offline.
  const [systemEnabled, setSystemEnabled] = useState(true);

  const refreshOverlayPreference = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${relayUrl}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return;
      const data = (await res.json()) as { overlayEnabled?: boolean };
      // Older relays omit the field — treat as enabled.
      const enabled = data.overlayEnabled !== false;
      setSystemEnabled(enabled);
      if (!enabled) setActive(false);
    } catch {
      // Keep last known preference while relay is unreachable.
    }
  }, [relayUrl]);

  useEffect(() => {
    refreshOverlayPreference();
    const id = setInterval(refreshOverlayPreference, OVERLAY_POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshOverlayPreference();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refreshOverlayPreference]);

  useSessionReplay(relayUrl, systemEnabled);

  if (!systemEnabled) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <DesignerModeRN
        active={active}
        onClose={() => setActive(false)}
        relayUrl={relayUrl}
      />
      <Pressable
        onPress={() => setActive((current) => !current)}
        style={[styles.toggle, active && styles.toggleActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={active ? 'Turn off annotate' : 'Turn on annotate'}
      >
        <Text style={[styles.toggleIcon, active && styles.toggleIconActive]}>
          ✎
        </Text>
        <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
          {active ? 'Annotating' : 'Annotate'}
        </Text>
      </Pressable>
    </View>
  );
};

export default DesignerModeOverlayImpl;
