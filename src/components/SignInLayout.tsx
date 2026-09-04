/**
 * The shell both sign-in pages share.
 *
 * There are two doors into this app — the shop counter and the owner — and they
 * are deliberately separate pages rather than one form with a toggle. A cashier
 * should never be shown an owner sign-in, and the owner's door should not be
 * something a stranger stumbles onto while poking at the till screen.
 */
import type { ReactNode } from "react";

export function SignInLayout({
  title,
  subtitle,
  children,
  footer,
  eyebrow,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: ReactNode;
  /** Setting up a business asks for more than a sign-in does. */
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 20% 20%, oklch(0.78 0.14 75 / 0.25), transparent 60%), radial-gradient(circle at 80% 80%, oklch(0.5 0.15 260 / 0.4), transparent 55%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-lg">
              A
            </div>
            <div>
              <div className="font-display font-bold text-xl">A-POS</div>
              <div className="text-xs text-sidebar-foreground/60">Retail Suite</div>
            </div>
          </div>
        </div>
        <div className="relative max-w-sm">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Every shop, every sale, one place.
          </h2>
          <p className="text-sidebar-foreground/70 mt-3 text-sm leading-relaxed">
            Stock, takings, customer accounts and supplier bills — kept together so the day adds up
            without anyone reaching for a calculator.
          </p>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">
          © {new Date().getFullYear()} A-POS · Built for retail
        </div>
      </div>

      <div className="flex items-center justify-center p-5 sm:p-6 md:p-12 px-safe">
        <div className={`w-full py-6 lg:py-0 ${wide ? "max-w-xl" : "max-w-md"}`}>
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              A
            </div>
            <div className="font-display font-bold text-xl">A-POS</div>
          </div>

          {eyebrow}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>

          {children}

          {footer && <div className="mt-8">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
