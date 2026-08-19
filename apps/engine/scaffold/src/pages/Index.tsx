import {
  CaideAnimatedScreen,
  CaideScreen,
  CaideSection,
  CaideStack,
  CaideStaggerGroup,
  CaideStaggerItem,
  CaideSurface,
} from "@/caide-ui";

const Index = () => {
  return (
    <CaideScreen className="flex items-center">
      <CaideAnimatedScreen className="w-full" transitionId="starter-screen">
        <CaideSection className="max-w-2xl">
          <CaideSurface level="raised">
            <CaideStaggerGroup>
              <CaideStack gap="3">
                <CaideStaggerItem index={0}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--caide-accent)]">
                    Project ready
                  </p>
                </CaideStaggerItem>
                <CaideStaggerItem index={1}>
                  <h1 className="text-3xl font-bold tracking-[-0.03em]">
                    Build the first screen
                  </h1>
                </CaideStaggerItem>
                <CaideStaggerItem index={2}>
                  <p className="max-w-[60ch] text-base leading-7 text-[var(--caide-text-secondary)]">
                    Describe the product, primary user, core workflow, platform,
                    visual direction, and motion character. CAIDE will approve
                    the design and motion specifications before implementation.
                  </p>
                </CaideStaggerItem>
              </CaideStack>
            </CaideStaggerGroup>
          </CaideSurface>
        </CaideSection>
      </CaideAnimatedScreen>
    </CaideScreen>
  );
};

export default Index;
