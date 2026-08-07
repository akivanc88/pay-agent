/** Provides the shared storefront chrome around the consent dashboard, matching every other
 *  surface in the app — the activity console is not a separate product wearing a separate frame. */

import { ThemeToggle } from "@/components/theme-toggle";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader themeToggle={<ThemeToggle />} />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
