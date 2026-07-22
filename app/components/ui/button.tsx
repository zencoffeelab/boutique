import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "icon";
};

export function Button({ asChild, className, variant = "default", size = "default", ...props }: Props) {
  const Component = asChild ? Slot.Root : "button";
  return <Component className={cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)} {...props} />;
}
