import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatePage } from "@/components/state-page";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The root 404.
 *
 * Without this file Next renders its own stock "404 · This page could not be found" in
 * Times — *inside* our header, which makes it look worse than an unbranded error page would.
 * `app/product/not-found.tsx` had the right voice for a missing product; this is the same
 * voice for a missing anything.
 *
 * It wears the shop chrome explicitly, because an unmatched URL resolves *outside* both route
 * groups and so inherits neither frame. A 404 is the one page most likely to be someone's
 * first — arriving on a stale link — and stranding them on a page with no navigation is how
 * a 404 becomes a dead end instead of a detour.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader themeToggle={<ThemeToggle />} />
      <main>
        <StatePage
          eyebrow="Not found"
          title="That path doesn’t lead anywhere"
          body="The link may have a typo in it, or it may point at something we've since retired. The shop, the wallet and the checkout are all reachable from the header."
          action={{ href: "/", label: "Browse the shop" }}
          art={
            <svg viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* an empty trellis — structure with nothing grown on it */}
              <path d="M24 84V30M48 84V22M72 84V30" opacity="0.55" />
              <path d="M18 46h60M18 62h60" opacity="0.3" />
              <path d="M48 22c0-7-5-13-13-14 0 8 5 14 13 14Zm0 0c0-6 4-11 11-12 0 7-5 12-11 12Z" />
            </svg>
          }
        />
      </main>
      <SiteFooter />
    </>
  );
}
