/**
 * The StreamCo account & billing portal — destination 3, the "no machine-readable checkout" pole.
 *
 * This renders as an ordinary consumer billing page: a plan, an amount due, a date, a card on file.
 * There is no discovery API and no checkout endpoint here on purpose — the agent's adapter has to
 * *scrape* the amount out of this markup, which is the whole contrast the capstone draws. The
 * "Amount due" label sits right beside the figure precisely so a page-reading agent can anchor to it;
 * `?glitch=1` renames that label, which is exactly the "the markup changed" failure the agent must
 * survive by reporting it cannot read the amount rather than guessing one.
 *
 * Honesty: StreamCo is fictional and simulated, and the footer says so plainly. It looks like a real
 * biller because the argument is a blind comparison against one — not because it is pretending to be.
 *
 * The continue-watching strip, plan-benefit chips, billing history and profile row below are all
 * decorative dressing that make the page read as a real streaming account rather than a bill in a
 * box: none of it is the scrape anchor, none of it carries a `$` near the words "Amount due", and
 * every real amount still goes through `formatMoney`.
 */
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMoney } from "@/lib/money";
import { getAccount } from "@/lib/streamco";
import {
  IconAudio,
  IconCalendar,
  IconCard,
  IconDownload,
  IconHelp,
  IconPlay,
  IconReceipt,
  IconScreens,
  IconSparkle,
} from "../streamco-icons";
import styles from "../streamco.module.css";

function formatDue(dueDate: string): string {
  return new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
  });
}

const BENEFITS = [
  { icon: IconScreens, label: "4 screens at once", detail: "Stream on phones, TVs and laptops" },
  { icon: IconSparkle, label: "Ultra HD & HDR", detail: "Up to 4K where available" },
  { icon: IconDownload, label: "Offline downloads", detail: "Take it with you, no signal needed" },
  { icon: IconAudio, label: "Spatial audio", detail: "Immersive sound on supported devices" },
];

const CONTINUE_WATCHING = [
  { title: "Nightfall Protocol", meta: "Limited series · S1", progress: 72, remaining: "14 min left", art: "posterArt1" },
  { title: "The Ember Line", meta: "Drama · S3 E6", progress: 35, remaining: "41 min left", art: "posterArt2" },
  { title: "Glass Horizon", meta: "Sci-Fi · S1 E2", progress: 88, remaining: "6 min left", art: "posterArt3" },
  { title: "Salt & Circuit", meta: "Documentary", progress: 20, remaining: "58 min left", art: "posterArt4" },
  { title: "Afterglow", meta: "Drama · S2 E9", progress: 55, remaining: "22 min left", art: "posterArt5" },
  { title: "Midnight Static", meta: "Thriller · S1 E4", progress: 12, remaining: "49 min left", art: "posterArt6" },
];

const PROFILES = [
  { initial: "A", label: "Arpita", active: true },
  { initial: "K", label: "Kids", active: false },
  { initial: "G", label: "Guest", active: false },
];

export default async function StreamCoAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ glitch?: string }>;
}) {
  const { account } = await params;
  const { glitch } = await searchParams;
  const data = await getAccount(account);
  if (!data) notFound();

  const paid = data.status === "paid";
  // The scrape anchor. `?glitch=1` renames it, simulating a markup change the agent must not paper over.
  const dueLabel = glitch === "1" ? "Statement balance" : "Amount due";

  // Fictional past statements for the billing-history rail — always this plan's price, always paid.
  const history = [3, 2, 1].map((monthsAgo) => {
    const d = new Date(`${data.dueDate}T00:00:00`);
    d.setMonth(d.getMonth() - monthsAgo);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className={styles.root}>
      <div className={styles.ambient} aria-hidden />
      <div className={styles.grain} aria-hidden />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden />
          <span className={styles.brandName}>StreamCo</span>
        </div>
        <nav className={styles.topnav} aria-label="Account">
          <span className={styles.topnavItem}>Watch</span>
          <span className={styles.topnavItem}>My List</span>
          <span aria-current="page" className={`${styles.topnavItem} ${styles.topnavActive}`}>
            Account
          </span>
          <span className={styles.avatar} aria-hidden>
            {data.holder.charAt(0)}
          </span>
        </nav>
      </header>

      <main className={styles.main}>
        <div className={styles.headingRow}>
          <div>
            <p className={styles.eyebrow}>Account &amp; billing</p>
            <h1 className={styles.title}>Membership</h1>
          </div>
          <span className={paid ? styles.statusPaid : styles.statusDue}>
            {paid ? "Paid" : "Payment due"}
          </span>
        </div>

        {/* Continue watching — cinematic dressing that fills the hero and sells the brand before
            the eye ever reaches the bill. Purely decorative: no interactive affordance, nothing
            here is a control, so it never competes with the real ones for focus order. */}
        <section className={styles.watching} aria-label="Continue watching">
          <div className={styles.watchingHead}>
            <h2 className={styles.watchingTitle}>Continue watching</h2>
            <ul className={styles.profiles} aria-label="Profiles on this account">
              {PROFILES.map((p) => (
                <li key={p.label} className={styles.profileItem}>
                  <span className={`${styles.profileAvatar} ${p.active ? styles.profileActive : ""}`}>
                    {p.initial}
                  </span>
                  <span className={styles.profileLabel}>{p.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className={styles.watchingRow}>
            {CONTINUE_WATCHING.map((item) => (
              <li key={item.title} className={styles.posterCard}>
                <div className={`${styles.posterArt} ${styles[item.art as keyof typeof styles]}`}>
                  <span className={styles.posterSheen} aria-hidden />
                  <span className={styles.posterPlay} aria-hidden>
                    <IconPlay />
                  </span>
                  <span className={styles.posterProgressTrack} aria-hidden>
                    <span className={styles.posterProgressFill} style={{ width: `${item.progress}%` }} />
                  </span>
                </div>
                <p className={styles.posterTitle}>{item.title}</p>
                <p className={styles.posterMeta}>
                  {item.meta} · {item.remaining}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className={styles.grid}>
          {/* The bill — the amount due is the most prominent thing on the page. */}
          <section className={styles.billCard} aria-labelledby="bill-heading">
            <div className={styles.planStrip}>
              <div>
                <p className={styles.planEyebrow}>Current plan</p>
                <p className={styles.planName}>{data.plan}</p>
                <p className={styles.planBlurb}>{data.planBlurb}</p>
              </div>
              <span className={styles.planPrice}>
                <span className="tnum">{formatMoney(data.planPriceMinor, data.currency)}</span>
                <span className={styles.per}>/mo</span>
              </span>
            </div>

            <div className={styles.divider} aria-hidden />

            {paid ? (
              <div className={styles.paidBlock}>
                <p className={styles.paidLede}>This month is settled.</p>
                <dl className={styles.receipt}>
                  {data.settlement && data.settlement.giftDrawnMinor > 0 && (
                    <div className={styles.receiptRow}>
                      <dt>Gift card</dt>
                      <dd className="tnum">{formatMoney(data.settlement.giftDrawnMinor, data.currency)}</dd>
                    </div>
                  )}
                  {data.settlement && (
                    <div className={styles.receiptRow}>
                      <dt>Card ending {data.cardOnFile.replace(/\D/g, "").slice(-4) || "4242"}</dt>
                      <dd className="tnum">{formatMoney(data.settlement.cardChargedMinor, data.currency)}</dd>
                    </div>
                  )}
                  <div className={`${styles.receiptRow} ${styles.receiptTotal}`}>
                    <dt id="bill-heading">Paid</dt>
                    <dd className="tnum">{formatMoney(data.amountDueMinor, data.currency)}</dd>
                  </div>
                </dl>
                {data.settlement && <p className={styles.ref}>Reference {data.settlement.handle}</p>}
              </div>
            ) : (
              <div className={styles.dueBlock}>
                <p className={styles.dueLabel} id="bill-heading">
                  {dueLabel}
                </p>
                <p className={styles.dueAmount}>
                  <span className="tnum">{formatMoney(data.amountDueMinor, data.currency)}</span>
                </p>
                <p className={styles.dueDate}>Due {formatDue(data.dueDate)}</p>
                <button className={styles.payButton} type="button">
                  Pay now
                </button>
                <p className={styles.autopay}>
                  <span className={styles.autopayDot} aria-hidden /> Autopay is handled by your
                  pay-agent
                </p>
              </div>
            )}

            <div className={styles.divider} aria-hidden />

            <div className={styles.benefits}>
              {BENEFITS.map(({ icon: Icon, label, detail }) => (
                <div className={styles.benefit} key={label}>
                  <span className={styles.benefitIcon}>
                    <Icon />
                  </span>
                  <span>
                    <span className={styles.benefitLabel}>{label}</span>
                    <span className={styles.benefitDetail}>{detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Membership details, billing history and help — the supporting rail, sized to match. */}
          <aside className={styles.rail} aria-label="Membership details">
            <section className={styles.detailsCard}>
              <h2 className={styles.railHeading}>Account details</h2>
              <dl className={styles.details}>
                <div className={styles.detailRow}>
                  <dt>Member</dt>
                  <dd>{data.holder}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>Since</dt>
                  <dd>{data.memberSince}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>
                    <IconCalendar className={styles.detailIcon} /> Billing cycle
                  </dt>
                  <dd>{data.cycleLabel}</dd>
                </div>
                <div className={styles.detailRow}>
                  <dt>
                    <IconCard className={styles.detailIcon} /> Payment method
                  </dt>
                  <dd className="tnum">{data.cardOnFile}</dd>
                </div>
              </dl>
              <Link className={styles.manageLink} href={`/streamco/${account}`}>
                Manage payment method
              </Link>
            </section>

            <section className={styles.historyCard}>
              <h2 className={styles.railHeading}>
                <IconReceipt className={styles.detailIcon} /> Billing history
              </h2>
              <ul className={styles.historyList}>
                {history.map((date) => (
                  <li className={styles.historyRow} key={date}>
                    <span className={styles.historyDate}>{formatShort(date)}</span>
                    <span className={styles.historyPlan}>{data.plan}</span>
                    <span className={styles.historyAmount}>
                      <span className="tnum">{formatMoney(data.planPriceMinor, data.currency)}</span>
                    </span>
                    <span className={styles.historyPaid}>Paid</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.helpCard}>
              <span className={styles.helpIcon}>
                <IconHelp />
              </span>
              <p className={styles.helpText}>
                Questions about a charge? The Help Center covers billing, plans and devices.
              </p>
            </section>
          </aside>
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.sim}>
          <span className={styles.simTag}>Simulation</span>
          StreamCo is a fictional biller built to demonstrate <strong>pay-agent</strong> paying a
          destination with no payment API. No real subscription exists and no real service is billed.
        </p>
      </footer>
    </div>
  );
}
