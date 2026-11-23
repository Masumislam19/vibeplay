import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-950/40 hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-violet-800/40",
  ghost: "bg-white/5 text-zinc-200 border border-white/10 hover:bg-white/10 hover:border-white/20",
  outline:
    "bg-transparent text-violet-300 border border-violet-500/40 hover:bg-violet-500/10 hover:border-violet-400/60",
  danger: "bg-red-600/90 text-white hover:bg-red-500 border border-red-500/40",
  subtle: "bg-transparent text-zinc-400 hover:text-white hover:bg-white/5",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-6 py-3 text-base rounded-xl gap-2.5",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:opacity-50 disabled:pointer-events-none cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]}`;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return <button className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}
