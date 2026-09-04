/**
 * A password box you can look at.
 *
 * Typing a password blind on a phone, at a counter, at the start of a shift is
 * where most failed sign-ins come from — and a cashier who mistypes three times
 * ends up asking the owner to reset a password that was never wrong. The eye
 * costs nothing and removes that entirely.
 */
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  value,
  onChange,
  id,
  autoComplete = "current-password",
  placeholder,
  required,
  minLength,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const fallbackId = useId();

  return (
    <div className="relative">
      <Input
        id={id ?? fallbackId}
        // Not `type={shown ? "text" : "password"}` on a field that stays
        // mounted: some password managers re-fill on a type change. It is the
        // same element either way, which they cope with.
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        // tabIndex -1: tabbing from the password box should reach the sign-in
        // button, not a toggle nobody navigates to by keyboard.
        tabIndex={-1}
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
