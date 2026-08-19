export type CaideMotionEngine =
  | "native-css-waapi"
  | "motion-react"
  | "dotlottie"
  | "rive"
  | "gsap"
  | "three";

export const CAIDE_MOTION_CAPABILITIES: Readonly<
  Record<
    CaideMotionEngine,
    {
      packages: readonly string[];
      useFor: readonly string[];
      avoidFor: readonly string[];
    }
  >
> = {
  "native-css-waapi": {
    packages: [],
    useFor: ["press feedback", "simple reveal", "small state transitions"],
    avoidFor: ["shared layout", "complex gestures", "interactive illustration"],
  },
  "motion-react": {
    packages: ["motion"],
    useFor: [
      "layout transitions",
      "shared elements",
      "gestures",
      "springs",
      "orchestration",
    ],
    avoidFor: ["linear illustration assets", "cinematic SVG timelines"],
  },
  dotlottie: {
    packages: ["@lottiefiles/dotlottie-react"],
    useFor: ["linear onboarding", "empty states", "success illustration"],
    avoidFor: ["state-machine interaction", "ordinary buttons"],
  },
  rive: {
    packages: ["@rive-app/react-webgl2"],
    useFor: [
      "state-driven illustration",
      "mascots",
      "interactive branded feedback",
    ],
    avoidFor: ["large repeated lists", "ordinary route transitions"],
  },
  gsap: {
    packages: ["gsap", "@gsap/react"],
    useFor: ["complex SVG timelines", "motion paths", "cinematic choreography"],
    avoidFor: ["routine application navigation", "basic component states"],
  },
  three: {
    packages: ["three", "@react-three/fiber", "@react-three/drei"],
    useFor: ["product-specific 3D interaction", "spatial visualisation"],
    avoidFor: ["decorative background 3D", "ordinary mobile applications"],
  },
};

export function caideMotionPackages(engines: readonly CaideMotionEngine[]) {
  return [
    ...new Set(
      engines.flatMap((engine) => CAIDE_MOTION_CAPABILITIES[engine].packages),
    ),
  ];
}
