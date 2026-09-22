import type { LucideIcon, LucideProps } from 'lucide-react';

/** lucide icons at the house size: 16 px, stroke 1.75, decorative unless labelled. */
export function Icon({
  icon: I,
  size = 16,
  label,
  ...rest
}: { icon: LucideIcon; label?: string } & LucideProps) {
  return (
    <I
      size={size}
      strokeWidth={1.75}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable={false}
      {...rest}
    />
  );
}
