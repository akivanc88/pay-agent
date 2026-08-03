"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge, Button, Container, Money, Panel, SectionLabel } from "@/components/ui";
import { StatePage } from "@/components/state-page";
import { useCart } from "@/lib/cart";
import { minorFromDisplay } from "@/lib/money";

import { FundingPlanRows } from "./funding-plan";
import styles from "./page.module.css";
import {
  TEST_CARDS,
  buildInstruments,
  buildPlan,
  createSession,
  fetchFundingCards,
  fulfillmentIsComplete,
  matchGiftCard,
  optionAmount,
  pay,
  planFallsShort,
  selectDestination,
  selectShippingOption,
  shippingGroupOf,
  shippingMethodOf,
  subtotalOf,
  totalOf,
  type Destination,
  type FundingCard,
  type Session,
  type StoreError,
} from "./session";

/**
 * Checkout.
 *
 * The merchant is authoritative throughout: the cart proposes line items, and every number
 * on this page after that comes back from the checkout session. Nothing here adds up a
 * total locally, and nothing here decides what a gift card is worth — the store draws, and
 * this surface reports what it drew.
 *
 * The flow follows the store's own preconditions rather than inventing its own: a
 * destination unlocks delivery quotes, a delivery choice settles the total, and only a
 * complete fulfillment enables payment. The pay button is disabled for exactly the reasons
 * `completeCheckout` would have refused, so the UI never asks for a rejection.
 */

const DEMO_EMAIL = "john.doe@example.com";

type Phase = "loading" | "ready" | "paying" | "paid" | "failed";

export default function CheckoutPage() {
  const { lines, ready: cartReady, clear } = useCart();

  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [failure, setFailure] = useState<StoreError | null>(null);

  const [cards, setCards] = useState<FundingCard[]>([]);
  const [giftCode, setGiftCode] = useState("");
  const [giftPin, setGiftPin] = useState("");
  const [cardToken, setCardToken] = useState<string>(TEST_CARDS[0]?.token ?? "");

  /* A choice has to register the instant it is clicked, but the store owns the truth and is
     a round trip away. These hold what the buyer just picked so the control reflects it
     immediately; when the response lands they are dropped and the session takes over. If
     the call failed, dropping them is exactly right — the UI falls back to what the store
     actually has rather than showing a selection that never took. */
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const [pendingOption, setPendingOption] = useState<string | null>(null);

  // The cart is read once, at the moment the session opens. Re-reading it afterwards would
  // let the two disagree — the session is the thing being paid for, not the cart.
  const opened = useRef(false);

  useEffect(() => {
    if (!cartReady || opened.current) return;
    if (lines.length === 0) {
      setPhase("ready");
      return;
    }
    opened.current = true;

    (async () => {
      try {
        const [created, funding] = await Promise.all([
          createSession(lines, DEMO_EMAIL),
          fetchFundingCards().catch(() => [] as FundingCard[]),
        ]);
        setSession(created);
        setCards(funding);
        setPhase("ready");
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "The checkout could not be opened.");
        setPhase("ready");
      }
    })();
  }, [cartReady, lines]);

  /* ── mutations ──────────────────────────────────────────────────────── */

  const mutate = useCallback(
    async (fn: (s: Session) => Promise<Session>) => {
      if (!session) return;
      setBusy(true);
      setFatal(null);
      try {
        setSession(await fn(session));
      } catch (err) {
        setFatal(err instanceof Error ? err.message : "That change could not be saved.");
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const chooseDestination = async (destination: Destination) => {
    setPendingDestination(destination.id);
    // Changing the address invalidates the delivery quote that was priced against the old
    // one, so any pending option is dropped with it rather than left pointing at a stale row.
    setPendingOption(null);
    await mutate((s) => selectDestination(s, DEMO_EMAIL, destination));
    setPendingDestination(null);
  };

  const chooseOption = async (optionId: string) => {
    setPendingOption(optionId);
    await mutate((s) => selectShippingOption(s, DEMO_EMAIL, optionId));
    setPendingOption(null);
  };

  /* ── the plan ───────────────────────────────────────────────────────── */

  const method = session ? shippingMethodOf(session) : undefined;
  const group = session ? shippingGroupOf(session) : undefined;
  const due = session ? totalOf(session) : 0;

  // What the controls render as selected: the buyer's latest click if one is in flight,
  // otherwise whatever the store has confirmed.
  const selectedDestinationId = pendingDestination ?? method?.selected_destination_id ?? null;
  const selectedOptionId = pendingOption ?? group?.selected_option_id ?? null;

  const matchedGift = useMemo(
    () => (giftCode.trim() ? matchGiftCard(giftCode, cards) : null),
    [giftCode, cards],
  );

  const hasGift = giftCode.trim().length > 0 && giftPin.trim().length > 0;
  const hasCard = cardToken.length > 0;

  /*
   * A balance only feeds the projected split when the ledger currently vouches for it. An
   * unverified or stale figure is a claim, not a fact, and `buildPlan` already knows how to
   * say "not yet known" — so the honest move is to withhold the number rather than let a
   * claim harden into the `−$20.00` the buyer reads as settled. Today every closed-loop
   * card comes back verified, so this changes nothing on screen; it is here so that the day
   * one doesn't, the UI degrades instead of lying.
   */
  const giftBalanceTrusted =
    matchedGift && matchedGift.balance_verified && !matchedGift.balance_stale;

  const plan = useMemo(
    () =>
      buildPlan({
        due,
        giftBalance: giftBalanceTrusted ? minorFromDisplay(matchedGift.balance_display) : null,
        hasGift,
        hasCard,
      }),
    [due, matchedGift, giftBalanceTrusted, hasGift, hasCard],
  );

  const fulfilled = session ? fulfillmentIsComplete(session) : false;
  const canPay =
    Boolean(session) && fulfilled && !busy && (hasGift || hasCard) && !planFallsShort(plan);

  const onPay = async () => {
    if (!session || !canPay) return;
    setPhase("paying");
    setFailure(null);

    const instruments = buildInstruments(
      hasGift ? { code: giftCode.trim(), pin: giftPin.trim() } : null,
      hasCard ? cardToken : null,
    );

    const result = await pay(session, instruments);
    if (result.ok) {
      setSession(result.session);
      setPhase("paid");
      clear();
    } else {
      setFailure(result.error);
      setPhase("failed");
      // A decline releases every draw, so the balances on screen are now stale.
      fetchFundingCards()
        .then(setCards)
        .catch(() => undefined);
    }
  };

  /* ── terminal states ────────────────────────────────────────────────── */

  if (phase === "paid" && session) {
    return <Paid session={session} />;
  }

  if (cartReady && lines.length === 0 && !session) {
    return (
      <StatePage
        eyebrow="Checkout"
        title="Nothing to pay for yet."
        body="A checkout session is opened from a cart, so there is nothing for the store to quote until something is in one."
        action={{ href: "/", label: "Browse the shop" }}
        /* The two rails, drawn: a gift card drawn first and a card behind it for the rest.
           An empty checkout is the one place worth showing what this checkout is *for*. */
        art={
          <svg viewBox="0 0 96 96" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect
              x="26" y="26" width="58" height="37" rx="6"
              fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="2"
            />
            <path d="M26 38h58" stroke="var(--line-strong)" strokeWidth="2" />
            <rect
              x="12" y="38" width="58" height="37" rx="6"
              fill="var(--brand-tint)" stroke="currentColor" strokeWidth="2"
            />
            <path d="M12 50h58" stroke="currentColor" strokeWidth="2" />
            <rect x="20" y="58" width="14" height="9" rx="2" fill="var(--foil-mid)" opacity="0.85" />
          </svg>
        }
      />
    );
  }

  if (!session) {
    return (
      <Container narrow>
        <div className={styles.standalone} aria-live="polite">
          <SectionLabel>Checkout</SectionLabel>
          {fatal ? (
            <>
              <h1 className={styles.emptyTitle}>The checkout couldn&rsquo;t be opened.</h1>
              <p className={styles.emptyBody}>{fatal}</p>
              <p className={styles.emptyBody}>
                Nothing was charged — no payment was attempted.
              </p>
              <Button href="/cart" size="lg" variant="secondary">
                Back to the cart
              </Button>
            </>
          ) : (
            <>
              <h1 className={styles.emptyTitle}>Opening your checkout…</h1>
              <p className={styles.emptyBody}>
                Asking the store to quote these items. Prices are the merchant&rsquo;s, not the
                cart&rsquo;s.
              </p>
              <SkeletonSummary />
            </>
          )}
        </div>
      </Container>
    );
  }

  /* ── the flow ───────────────────────────────────────────────────────── */

  const options = group?.options ?? [];

  return (
    <Container>
      <div className={styles.head}>
        <SectionLabel>Checkout</SectionLabel>
        <h1 className={styles.title}>Where it goes, and how it&rsquo;s paid.</h1>
      </div>

      {/*
        On a phone the summary rail becomes the last block on a ~2,200px page, so the amount
        due sits nearly six screens below the fold while the buyer works through address and
        delivery. This bar carries it at the top of the flow instead. It is hidden at desktop
        widths, where the sticky rail already keeps the total in view.
      */}
      <div className={styles.mobileTotal} aria-hidden>
        <span className={styles.mobileTotalLabel}>Amount due</span>
        <Money minor={due} className={styles.mobileTotalValue} />
      </div>

      <div className={styles.layout}>
        <div className={styles.steps}>
          {fatal && (
            <Panel className={styles.inlineError} role="alert">
              <p className={styles.inlineErrorTitle}>That change didn&rsquo;t save</p>
              <p className={styles.inlineErrorBody}>{fatal}</p>
            </Panel>
          )}

          {/* ── 1. destination ── */}
          <Step index={1} title="Deliver to" done={Boolean(selectedDestinationId)}>
            <fieldset className={styles.fieldset} disabled={busy}>
              <legend className={styles.srOnly}>Delivery address</legend>
              {(method?.destinations ?? []).map((d) => {
                const selected = d.id === selectedDestinationId;
                return (
                  <label key={d.id} className={styles.choice} data-selected={selected || undefined}>
                    <input
                      type="radio"
                      name="destination"
                      value={d.id}
                      checked={selected}
                      onChange={() => chooseDestination(d)}
                      className={styles.radio}
                    />
                    {/* The address leads, not the name. Every saved destination here belongs
                        to the same person, so the name is the repeated part and the street is
                        the part that tells two rows apart — whichever distinguishes gets the
                        primary line. */}
                    <span className={styles.choiceBody}>
                      <span className={styles.choiceTitle}>
                        {d.street_address}, {d.address_locality}
                      </span>
                      <span className={styles.choiceNote}>
                        {d.first_name} {d.last_name} &middot; {d.address_region} {d.postal_code},{" "}
                        {d.address_country}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </Step>

          {/* ── 2. delivery speed ── */}
          <Step
            index={2}
            title="Delivery"
            done={Boolean(selectedOptionId)}
            muted={!selectedDestinationId}
          >
            {!selectedDestinationId ? (
              <p className={styles.stepHint}>
                Delivery is quoted per destination, so options appear once an address is
                chosen.
              </p>
            ) : options.length === 0 ? (
              <p className={styles.stepHint}>
                No delivery options came back for this address.
              </p>
            ) : (
              <fieldset className={styles.fieldset} disabled={busy}>
                <legend className={styles.srOnly}>Delivery speed</legend>
                {options.map((o) => {
                  const selected = o.id === selectedOptionId;
                  return (
                    <label
                      key={o.id}
                      className={styles.choice}
                      data-selected={selected || undefined}
                    >
                      <input
                        type="radio"
                        name="shipping"
                        value={o.id}
                        checked={selected}
                        onChange={() => chooseOption(o.id)}
                        className={styles.radio}
                      />
                      <span className={styles.choiceBody}>
                        <span className={styles.choiceTitle}>{o.title}</span>
                        {o.description && (
                          <span className={styles.choiceNote}>{o.description}</span>
                        )}
                      </span>
                      <Money minor={optionAmount(o)} className={styles.choiceAmount} />
                    </label>
                  );
                })}
              </fieldset>
            )}
          </Step>

          {/* ── 3. funding ── */}
          <Step index={3} title="Payment" done={false}>
            <p className={styles.stepHint}>
              Gift cards are presented open-amount and drawn first. Whatever they can&rsquo;t
              cover is authorized on the card.
            </p>

            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="gift-code" className={styles.label}>
                  Gift card code <span className={styles.optional}>optional</span>
                </label>
                <input
                  id="gift-code"
                  className={styles.input}
                  value={giftCode}
                  onChange={(e) => setGiftCode(e.target.value)}
                  placeholder="GC-DEMO-7777"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldPin}`}>
                <label htmlFor="gift-pin" className={styles.label}>
                  PIN
                </label>
                <input
                  id="gift-pin"
                  className={styles.input}
                  value={giftPin}
                  onChange={(e) => setGiftPin(e.target.value)}
                  placeholder="1234"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>

            <p className={styles.giftStatus} aria-live="polite">
              {!giftCode.trim() ? (
                <span className={styles.stepHint}>
                  No gift card — the card covers the whole amount.
                </span>
              ) : matchedGift ? (
                <span className={styles.giftFound}>
                  Matches an enrolled card ending {matchedGift.last4},{" "}
                  {giftBalanceTrusted ? (
                    <>
                      balance <strong>{matchedGift.balance_display}</strong>.
                    </>
                  ) : (
                    <>
                      but its balance{" "}
                      {matchedGift.balance_stale ? "was last read a while ago" : "isn’t verified"}
                      , so the store settles the draw at payment.
                    </>
                  )}
                </span>
              ) : (
                <span className={styles.stepHint}>
                  Codes are stored hashed, so this one can&rsquo;t be looked up from here. The
                  store will verify it at payment.
                </span>
              )}
            </p>

            <div className={styles.cardRail}>
              <p className={styles.railHead}>
                Card
                <Badge tone="warn" soft>
                  Stripe test mode
                </Badge>
              </p>
              <fieldset className={styles.fieldset} disabled={busy}>
                <legend className={styles.srOnly}>Card</legend>
                {TEST_CARDS.map((c) => (
                  <label
                    key={c.token}
                    className={styles.choice}
                    data-selected={cardToken === c.token || undefined}
                  >
                    <input
                      type="radio"
                      name="card"
                      value={c.token}
                      checked={cardToken === c.token}
                      onChange={() => setCardToken(c.token)}
                      className={styles.radio}
                    />
                    <span className={styles.choiceBody}>
                      <span className={styles.choiceTitle}>
                        {c.brand} <span className={styles.last4}>····&thinsp;{c.last4}</span>
                      </span>
                      <span className={styles.choiceNote}>
                        {c.outcome}
                        {c.code && <code className={styles.outcomeCode}>{c.code}</code>}
                      </span>
                    </span>
                  </label>
                ))}
                <label
                  className={styles.choice}
                  data-selected={cardToken === "" || undefined}
                >
                  <input
                    type="radio"
                    name="card"
                    value=""
                    checked={cardToken === ""}
                    onChange={() => setCardToken("")}
                    className={styles.radio}
                  />
                  <span className={styles.choiceBody}>
                    <span className={styles.choiceTitle}>No card</span>
                    <span className={styles.choiceNote}>
                      Gift card only. Succeeds only if it covers the whole amount.
                    </span>
                  </span>
                </label>
              </fieldset>
              <p className={styles.railNote}>
                These are Stripe&rsquo;s published test PaymentMethods. The authorization and
                capture are real API calls in test mode; the issuer is Stripe&rsquo;s simulator.
                No card number ever reaches this app.
              </p>
            </div>
          </Step>
        </div>

        {/* ── summary ── */}
        <aside className={styles.aside}>
          <Panel className={styles.summary}>
            <h2 className={styles.summaryTitle}>Order</h2>

            <ul className={styles.items}>
              {session.line_items.map((l) => (
                <li key={l.id} className={styles.item}>
                  <span className={styles.itemQty}>{l.quantity}×</span>
                  <span className={styles.itemTitle}>{l.item.title}</span>
                  <Money minor={l.item.price * l.quantity} className={styles.itemAmount} />
                </li>
              ))}
            </ul>

            <div className={styles.subtotals}>
              <div className={styles.subtotalRow}>
                <span>Subtotal</span>
                <Money minor={subtotalOf(session)} />
              </div>
              {session.totals
                .filter((t) => t.type !== "subtotal" && t.type !== "total")
                .map((t) => (
                  <div key={t.type} className={styles.subtotalRow}>
                    <span>{t.display_text ?? labelForTotal(t.type)}</span>
                    <Money minor={t.amount} />
                  </div>
                ))}
            </div>

            <FundingPlanRows plan={plan} />

            {failure && <Declined error={failure} />}

            <Button
              size="lg"
              full
              onClick={onPay}
              disabled={!canPay || phase === "paying"}
              aria-busy={phase === "paying"}
            >
              {/* One flex child, not two. `.btn` carries an 8px gap for icon+label, and two
                  bare text nodes inherit it — "Pay" and the amount drift apart and read as
                  two labels instead of one sentence. */}
              {phase === "paying" ? (
                "Authorizing…"
              ) : (
                <span>
                  Pay <Money minor={due} />
                </span>
              )}
            </Button>

            <p className={styles.payNote} aria-live="polite">
              {phase === "paying"
                ? "Drawing the gift card, then authorizing the card. Don't close this tab."
                : !fulfilled
                  ? "Choose an address and a delivery speed to continue."
                  : !hasGift && !hasCard
                    ? "Add a gift card or choose a card to continue."
                    : planFallsShort(plan)
                      ? "The gift card doesn't cover the total, and no card is selected."
                      : "The card is authorized first and captured only once the gift cards settle."}
            </p>
          </Panel>
        </aside>
      </div>
    </Container>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function labelForTotal(type: string): string {
  if (type === "fulfillment") return "Delivery";
  if (type === "tax") return "Tax";
  if (type === "discount") return "Discount";
  return type.replace(/_/g, " ");
}

function Step({
  index,
  title,
  done,
  muted,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.step} data-muted={muted || undefined}>
      <div className={styles.stepHead}>
        <span className={styles.stepIndex} data-done={done || undefined} aria-hidden>
          {done ? (
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5 6.2 11.7 13 4.9" />
            </svg>
          ) : (
            index
          )}
        </span>
        <h2 className={styles.stepTitle}>{title}</h2>
      </div>
      <div className={styles.stepBody}>{children}</div>
    </section>
  );
}

/** The loading state is the shape of the thing that's coming, not a spinner. */
function SkeletonSummary() {
  return (
    <Panel className={styles.skeleton} aria-hidden>
      <span className={`${styles.bar} ${styles.barWide}`} />
      <span className={styles.bar} />
      <span className={`${styles.bar} ${styles.barShort}`} />
    </Panel>
  );
}

/**
 * A decline, stated exactly.
 *
 * The store reverses every gift-card draw before it returns the error, so the one thing a
 * buyer needs to know — that their balance is intact — is said first and without hedging.
 */
function Declined({ error }: { error: StoreError }) {
  return (
    <div className={styles.declined} role="alert">
      <p className={styles.declinedTitle}>
        Not paid
        {error.code && <code className={styles.declinedCode}>{error.code}</code>}
      </p>
      <p className={styles.declinedBody}>{error.detail}</p>
      <p className={styles.declinedRestore}>
        Every gift-card draw in this attempt was reversed. Your balances are exactly what they
        were before you pressed pay, and the card was not captured.
      </p>
    </div>
  );
}

function Paid({ session }: { session: Session }) {
  const orderId = session.order?.id;
  return (
    <Container narrow>
      <div className={`${styles.standalone} rise`}>
        <span className={styles.paidMark} aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5 9.5 18 20 6.5" />
          </svg>
        </span>
        <h1 className={styles.paidTitle}>Paid.</h1>
        <p className={styles.emptyBody}>
          The gift cards settled first and the card covered the remainder. Both are recorded
          against one order in an append-only ledger.
        </p>

        {orderId && (
          <Panel tone="sunk" className={styles.orderPanel}>
            <p className={styles.orderLabel}>Order</p>
            <p className={styles.orderId}>{orderId}</p>
          </Panel>
        )}

        <div className={styles.paidActions}>
          <Button href="/" size="lg">
            Back to the shop
          </Button>
          <Link href="/wallet" className={styles.paidLink}>
            See what&rsquo;s left in the wallet
          </Link>
        </div>
      </div>
    </Container>
  );
}
