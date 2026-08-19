import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type Key,
  type ReactNode,
} from "react";
import { clsx } from "clsx";

export type CaideMotionIntensity = "restrained" | "balanced" | "expressive";

type MotionContextValue = {
  reduced: boolean;
  intensity: CaideMotionIntensity;
};

const MotionContext = createContext<MotionContextValue>({
  reduced: false,
  intensity: "balanced",
});

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function CaideMotionProvider({
  children,
  intensity = "balanced",
  reducedMotion = "user",
}: {
  children: ReactNode;
  intensity?: CaideMotionIntensity;
  reducedMotion?: "user" | "always" | "never";
}) {
  const systemReduced = useSystemReducedMotion();
  const reduced =
    reducedMotion === "always" || (reducedMotion === "user" && systemReduced);
  const value = useMemo(() => ({ reduced, intensity }), [reduced, intensity]);

  useEffect(() => {
    document.documentElement.dataset.caideMotion = reduced
      ? "reduced"
      : intensity;
    return () => {
      delete document.documentElement.dataset.caideMotion;
    };
  }, [intensity, reduced]);

  return (
    <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
  );
}

export function useCaideMotion() {
  return useContext(MotionContext);
}

export function useCaideAnimate<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const animations = useRef(new Set<Animation>());
  const { reduced } = useCaideMotion();

  useEffect(
    () => () => {
      for (const animation of animations.current) animation.cancel();
      animations.current.clear();
    },
    [],
  );

  const applyReducedFrame = (
    element: T,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
  ) => {
    const frame: Record<string, unknown> = {};
    if (Array.isArray(keyframes)) {
      const finalFrame = keyframes.at(-1) ?? {};
      for (const [property, value] of Object.entries(finalFrame)) {
        if (!["offset", "easing", "composite"].includes(property))
          frame[property] = value;
      }
    } else {
      for (const [property, value] of Object.entries(keyframes)) {
        if (["offset", "easing", "composite"].includes(property)) continue;
        frame[property] = Array.isArray(value) ? value.at(-1) : value;
      }
    }
    Object.assign(element.style, frame);
  };

  const animate = (
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options: KeyframeAnimationOptions,
  ) => {
    const element = ref.current;
    if (!element) return null;
    if (reduced) {
      applyReducedFrame(element, keyframes);
      return null;
    }
    const animation = element.animate(keyframes, {
      fill: "both",
      ...options,
    });
    animations.current.add(animation);
    animation.finished
      .finally(() => animations.current.delete(animation))
      .catch(() => {});
    return animation;
  };

  return { ref, animate, reduced };
}

export const CaidePressable = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    motionId?: string;
    auditSafe?: boolean;
  }
>(function CaidePressable(
  {
    className,
    children,
    motionId = "pressable",
    auditSafe = false,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-caide-motion-trigger={motionId}
      data-caide-audit-safe={auditSafe || undefined}
      className={clsx("caide-motion-pressable", className)}
      {...props}
    >
      {children}
    </button>
  );
});

export function CaideAnimatedScreen({
  className,
  children,
  transitionId = "screen-enter",
  durationMs = 300,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  transitionId?: string;
  durationMs?: number;
}) {
  return (
    <div
      data-caide-motion-region={transitionId}
      data-caide-motion-duration={durationMs}
      className={clsx("caide-motion-screen", className)}
      style={{ "--caide-region-duration": `${durationMs}ms` } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export function CaideStaggerGroup({
  className,
  children,
  gapMs = 45,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  gapMs?: number;
}) {
  return (
    <div
      data-caide-motion-region="stagger-group"
      className={clsx("caide-motion-stagger", className)}
      style={{ "--caide-stagger-gap": `${gapMs}ms` } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export function CaideStaggerItem({
  className,
  children,
  index,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  index: number;
}) {
  return (
    <div
      className={clsx("caide-motion-stagger-item", className)}
      style={{ "--caide-stagger-index": index } as CSSProperties}
      {...props}
    >
      {children}
    </div>
  );
}

export function CaidePresence({
  present,
  children,
  className,
  durationMs = 220,
}: {
  present: boolean;
  children: ReactNode;
  className?: string;
  durationMs?: number;
}) {
  const { reduced } = useCaideMotion();
  const [rendered, setRendered] = useState(present);

  useEffect(() => {
    if (present) {
      setRendered(true);
      return;
    }
    if (reduced) {
      setRendered(false);
      return;
    }
    const timeout = window.setTimeout(() => setRendered(false), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, present, reduced]);

  if (!rendered) return null;
  return (
    <div
      data-state={present ? "open" : "closed"}
      data-caide-motion-region="presence"
      data-caide-motion-duration={durationMs}
      className={clsx("caide-motion-presence", className)}
      style={{ "--caide-region-duration": `${durationMs}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function CaideAnimatedList<T>({
  items,
  itemKey,
  renderItem,
  className,
}: {
  items: readonly T[];
  itemKey: (item: T) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  return (
    <CaideStaggerGroup className={className} role="list">
      {items.map((item, index) => (
        <CaideStaggerItem key={itemKey(item)} index={index} role="listitem">
          {renderItem(item, index)}
        </CaideStaggerItem>
      ))}
    </CaideStaggerGroup>
  );
}

export function CaideSuccessTransition({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-caide-motion-region="success"
      className={clsx("caide-motion-success", className)}
    >
      <span aria-hidden="true" className="caide-motion-success-mark">
        ✓
      </span>
      <span>{label}</span>
    </div>
  );
}
