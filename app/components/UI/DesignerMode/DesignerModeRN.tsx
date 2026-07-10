import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import {
  View,
  Text,
  TouchableWithoutFeedback,
  StyleSheet,
  TextInput,
  Pressable,
  Animated,
  Platform,
  Dimensions,
  Keyboard,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import type { RNComponentInfo, DesignerModeRNOptions } from './types';
import { hitTestFromFiberTree } from './fiber';
import {
  buildAgentPrompt,
  sendToRelay,
  pollForResponse,
  checkRelayHealth,
} from './relay-client';

/** Codex-style annotation chrome — pin + floating comment pill. */
const C = {
  accent: 'rgb(37, 99, 235)',
  accentDim: 'rgba(37, 99, 235, 0.14)',
  text: 'rgb(17, 24, 39)',
  textSecondary: 'rgb(107, 114, 128)',
  textTertiary: 'rgb(156, 163, 175)',
  border: 'rgb(229, 231, 235)',
  pill: 'rgb(255, 255, 255)',
  success: 'rgb(22, 163, 74)',
  error: 'rgb(220, 38, 38)',
  pin: 'rgb(37, 99, 235)',
  pinRing: 'rgb(255, 255, 255)',
  darkBadge: 'rgba(17, 24, 39, 0.72)',
  white: 'rgb(255, 255, 255)',
  shadow: 'rgb(0, 0, 0)',
  transparent: 'rgba(0, 0, 0, 0)',
};

const PILL_WIDTH = 240;
const PILL_HEIGHT = 48;
const PIN_SIZE = 22;
const SCREEN_PAD = 12;
const PILL_GAP = 14;
const PIN_CLEARANCE = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rectsOverlap(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  return !(
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  );
}

/**
 * Place the comment pill without covering the annotated spot.
 * On a phone, dock it to the bottom (above the keyboard) so the pin and
 * target stay fully visible — side placement rarely fits.
 */
function pillPosition(
  pinX: number,
  pinY: number,
  target?: {
    pageX: number;
    pageY: number;
    width: number;
    height: number;
  } | null,
  keyboardHeight = 0,
): { left: number; top: number } {
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const minLeft = SCREEN_PAD;
  const maxLeft = screenW - PILL_WIDTH - SCREEN_PAD;
  const minTop = SCREEN_PAD + 100;
  const dockTop = screenH - PILL_HEIGHT - Math.max(24, keyboardHeight + 12);

  const rawTarget = target
    ? {
        left: target.pageX,
        top: target.pageY,
        width: Math.max(target.width, 1),
        height: Math.max(target.height, 1),
      }
    : {
        left: pinX - PIN_CLEARANCE,
        top: pinY - PIN_CLEARANCE,
        width: PIN_CLEARANCE * 2,
        height: PIN_CLEARANCE * 2,
      };

  const targetIsHuge =
    rawTarget.width * rawTarget.height > screenW * screenH * 0.35;
  const avoidTarget = targetIsHuge
    ? {
        left: pinX - PIN_CLEARANCE,
        top: pinY - PIN_CLEARANCE,
        width: PIN_CLEARANCE * 2,
        height: PIN_CLEARANCE * 2,
      }
    : rawTarget;

  const centeredLeft = clamp(pinX - PILL_WIDTH / 2, minLeft, maxLeft);

  const overlapsTarget = (top: number) =>
    rectsOverlap(
      { left: centeredLeft, top, width: PILL_WIDTH, height: PILL_HEIGHT },
      avoidTarget,
    );

  // 1) Docked bottom — default, keeps the annotated UI fully visible.
  if (!overlapsTarget(dockTop)) {
    return { left: centeredLeft, top: dockTop };
  }

  // 2) Just below the target, if that still leaves the pin clear.
  const belowTop = Math.max(
    avoidTarget.top + avoidTarget.height + PILL_GAP,
    pinY + PIN_CLEARANCE,
  );
  if (belowTop <= dockTop && !overlapsTarget(belowTop)) {
    return { left: centeredLeft, top: belowTop };
  }

  // 3) Just above the target.
  const aboveTop = Math.min(
    avoidTarget.top - PILL_HEIGHT - PILL_GAP,
    pinY - PIN_CLEARANCE - PILL_HEIGHT,
  );
  if (aboveTop >= minTop && !overlapsTarget(aboveTop)) {
    return { left: centeredLeft, top: aboveTop };
  }

  // 4) Last resort: docked bottom anyway (pin remains on-content).
  return { left: centeredLeft, top: clamp(dockTop, minTop, dockTop) };
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: C.transparent,
    zIndex: 9998,
  } as ViewStyle,
  inspectHint: {
    position: 'absolute',
    top: 140,
    alignSelf: 'center',
    backgroundColor: C.darkBadge,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  } as ViewStyle,
  inspectHintText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  } as TextStyle,
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    borderColor: C.pinRing,
    backgroundColor: C.pin,
    marginLeft: -(PIN_SIZE / 2),
    marginTop: -(PIN_SIZE / 2),
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 6,
  } as ViewStyle,
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: C.accent,
    backgroundColor: C.accentDim,
    borderRadius: 6,
  } as ViewStyle,
  pill: {
    position: 'absolute',
    width: PILL_WIDTH,
    minHeight: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: C.pill,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 10,
  } as ViewStyle,
  pillInput: {
    flex: 1,
    fontSize: 15,
    color: C.text,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    maxHeight: 88,
  } as TextStyle,
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  sendBtnDisabled: {
    opacity: 0.35,
  } as ViewStyle,
  sendBtnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  } as TextStyle,
  statusChip: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 36,
    alignSelf: 'center',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.darkBadge,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  } as ViewStyle,
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  } as ViewStyle,
  statusText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  } as TextStyle,
  dismissHit: {
    ...StyleSheet.absoluteFill,
  } as ViewStyle,
});

interface Props extends DesignerModeRNOptions {
  active: boolean;
  onClose: () => void;
}

type RelayStatus = 'connected' | 'disconnected' | 'checking';

export function DesignerModeRN({ active, relayUrl }: Props) {
  const [selected, setSelected] = useState<RNComponentInfo | null>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [comment, setComment] = useState('');
  const [agentWorking, setAgentWorking] = useState(false);
  const [agentReply, setAgentReply] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('checking');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const touchSeqRef = useRef(0);
  const ringScale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      setSelected(null);
      setPin(null);
      setComment('');
      setAgentWorking(false);
      setAgentReply(null);
    } else {
      abortRef.current?.abort();
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const check = async () => {
      const ok = await checkRelayHealth(relayUrl);
      if (!cancelled) setRelayStatus(ok ? 'connected' : 'disconnected');
    };
    check();
    const interval = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, relayUrl]);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const animatePin = useCallback(
    (x: number, y: number) => {
      setPin({ x, y });
      ringScale.setValue(0.4);
      ringOpacity.setValue(1);
      Animated.parallel([
        Animated.spring(ringScale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
        }),
        Animated.timing(ringOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [ringOpacity, ringScale],
  );

  const handleTouch = useCallback(
    async (touchX: number, touchY: number) => {
      const seq = ++touchSeqRef.current;
      animatePin(touchX, touchY);

      const info = await hitTestFromFiberTree(touchX, touchY);
      if (seq !== touchSeqRef.current) return;
      if (!info) return;

      setSelected(info);
      setComment('');
      setAgentReply(null);
      setAgentWorking(false);
    },
    [animatePin],
  );

  const dismissAnnotation = useCallback(() => {
    abortRef.current?.abort();
    setSelected(null);
    setPin(null);
    setComment('');
    setAgentReply(null);
    setAgentWorking(false);
  }, []);

  const sendAnnotation = useCallback(async () => {
    if (!selected) return;
    const msg = comment.trim();
    if (!msg) return;

    setAgentWorking(true);
    setAgentReply(null);

    const myRequestId = ++requestIdRef.current;
    const isCurrent = () => myRequestId === requestIdRef.current;

    const prompt = buildAgentPrompt(selected, [], msg);
    try {
      abortRef.current?.abort();
      await fetch(`${relayUrl}/api/flush`, { method: 'POST' }).catch(() => {
        /* best-effort */
      });
      await sendToRelay(relayUrl, prompt);
      abortRef.current = new AbortController();
      const response = await pollForResponse(relayUrl, abortRef.current.signal);
      if (response && isCurrent()) {
        setAgentReply(response);
      } else if (isCurrent()) {
        setAgentReply('Sent. Waiting for the agent…');
      }
    } catch (err) {
      if (isCurrent()) {
        const message =
          err instanceof Error ? err.message : 'Failed to reach the agent';
        setAgentReply(message);
      }
    } finally {
      if (isCurrent()) setAgentWorking(false);
    }
  }, [selected, comment, relayUrl]);

  const highlightStyle = useMemo(() => {
    if (!selected?.layout) return null;
    const { pageX, pageY, width, height } = selected.layout;
    return {
      left: pageX,
      top: pageY,
      width,
      height,
    };
  }, [selected]);

  const canSend = comment.trim().length > 0 && !agentWorking;
  const relayColor =
    relayStatus === 'connected'
      ? C.success
      : relayStatus === 'disconnected'
        ? C.error
        : C.textTertiary;

  const pillPos = pin
    ? pillPosition(pin.x, pin.y, selected?.layout, keyboardHeight)
    : null;

  if (!active) return null;

  return (
    <View style={s.overlay} pointerEvents="box-none">
      {/* Inspect layer — tap anything to drop a pin */}
      {!selected && (
        <TouchableWithoutFeedback
          onPress={(e) => handleTouch(e.nativeEvent.pageX, e.nativeEvent.pageY)}
        >
          <View style={s.overlay}>
            <View style={s.inspectHint} pointerEvents="none">
              <Text style={s.inspectHintText}>Tap anything to annotate</Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}

      {/* Soft dismiss while commenting — tap empty space clears the pin */}
      {selected && (
        <Pressable style={s.dismissHit} onPress={dismissAnnotation} />
      )}

      {highlightStyle ? (
        <View pointerEvents="none" style={[s.highlight, highlightStyle]} />
      ) : null}

      {pin ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.pin,
            {
              left: pin.x,
              top: pin.y,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      ) : null}

      {/* Codex-style floating comment pill — offset so it never covers the target */}
      {selected && pin && pillPos ? (
        <View style={[s.pill, { left: pillPos.left, top: pillPos.top }]}>
          <TextInput
            style={s.pillInput}
            placeholder="Add a comment…"
            placeholderTextColor={C.textTertiary}
            value={comment}
            onChangeText={setComment}
            multiline
            autoFocus
            editable={!agentWorking}
            returnKeyType="send"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => {
              if (canSend) sendAnnotation();
            }}
          />
          <Pressable
            onPress={sendAnnotation}
            disabled={!canSend}
            style={[s.sendBtn, !canSend && s.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Send annotation"
          >
            {agentWorking ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Text style={s.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {(agentWorking || agentReply || relayStatus === 'disconnected') && (
        <View style={s.statusChip} pointerEvents="none">
          <View style={[s.statusDot, { backgroundColor: relayColor }]} />
          <Text style={s.statusText} numberOfLines={3}>
            {agentWorking
              ? 'Sending to agent…'
              : agentReply || 'Relay offline — start Designer Setup'}
          </Text>
        </View>
      )}
    </View>
  );
}
