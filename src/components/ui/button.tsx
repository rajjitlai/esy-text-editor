import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/cn";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost";
  size?: "default" | "sm";
  asChild?: boolean;
};

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "bg-foreground text-background hover:opacity-90",
        variant === "secondary" && "border border-border bg-card text-foreground hover:bg-secondary/70",
        variant === "ghost" && "text-foreground hover:bg-secondary/60",
        size === "default" && "h-10 px-4 py-2",
        size === "sm" && "h-8 px-3",
        className
      )}
      {...props}
    />
  );
}
