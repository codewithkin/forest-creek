/**
 * One set of button styles for the whole app. The public site uses the lodge's
 * rounded pill CTAs; the dashboard uses squarer controls that read as a tool.
 * Before this, every screen hand-rolled its own padding, radius and hover, and
 * no two buttons matched.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";
type Shape = "pill" | "control";

const base =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground hover:bg-accent/90",
  secondary:
    "border border-border bg-transparent text-foreground hover:border-accent/60 hover:text-accent",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
  danger: "border border-destructive/40 text-destructive hover:bg-destructive/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-7 text-base",
};

const shapes: Record<Shape, string> = {
  pill: "rounded-full",
  control: "rounded-lg",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  shape = "control",
  className = "",
}: {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  className?: string;
} = {}): string {
  return [base, variants[variant], sizes[size], shapes[shape], className]
    .filter(Boolean)
    .join(" ");
}
