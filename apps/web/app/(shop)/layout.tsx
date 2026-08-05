/** Provides the shared storefront chrome around browsing and wallet routes. */

import { ThemeToggle } from "@/components/theme-toggle";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/**
 * The shop's frame: full navigation, a cart count, a theme toggle, and a footer that
 * explains the project.
 *
 * Everything a browsing customer might want to reach lives here — which is exactly why
 * `(pay)` does not share it.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader themeToggle={<ThemeToggle />} />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
