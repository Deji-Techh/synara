export function DeviceFrame({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
export function DeviceScreen({ children, className }: { children?: React.ReactNode; className?: string; kind?: string; pixelWidth?: number; pixelHeight?: number; landscape?: boolean }) {
  return <div className={className}>{children}</div>;
}
