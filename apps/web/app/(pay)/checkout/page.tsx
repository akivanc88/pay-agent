/** Orchestrates the browser checkout lifecycle, selections, funding, and terminal states. */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Container, Money, Panel, SectionLabel } from "@/components/ui";
import { StatePage } from "@/components/state-page";
import { useCart } from "@/lib/cart";
import { minorFromDisplay } from "@/lib/money";

import { Paid, SkeletonSummary } from "./checkout-pieces";
import { DeliverySection } from "./delivery-section";
import { DestinationSection } from "./destination-section";
import { OrderSummary } from "./order-summary";
import { PaymentSection } from "./payment-section";
import styles from "./page.module.css";
import {
  TEST_CARDS,
  buildInstruments,
  buildPlan,
  createSession,
  fetchFundingCards,
  fulfillmentIsComplete,
  pay,
  planFallsShort,
  resolveGiftCard,
  selectDestination,
  selectShippingOption,
  shippingGroupOf,
  shippingMethodOf,
  totalOf,
  type Destination,
  type FundingCard,
  type GiftUnknown,
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

  const match = useMemo(() => resolveGiftCard(giftCode, cards), [giftCode, cards]);
  const matchedGift = match.kind === "matched" ? match.card : null;

  const hasGift = giftCode.trim().length > 0 && giftPin.trim().length > 0;
  const hasCard = cardToken.length > 0;

  /*
   * A balance only feeds the projected split when the ledger currently vouches for it *and*
   * the code resolves to exactly one enrolled card. An unverified figure is a claim rather
   * than a fact; an ambiguous last-four is somebody else's balance half the time. Both must
   * render as "not yet known" — but for different stated reasons, which is what `giftUnknown`
   * carries. Withholding the number is the honest move; withholding the reason is not.
   */
  const giftBalance = useMemo(() => {
    if (!matchedGift) return null;
    if (!matchedGift.balance_verified || matchedGift.balance_stale) return null;
    return minorFromDisplay(matchedGift.balance_display);
  }, [matchedGift]);

  const giftUnknown: GiftUnknown | null = useMemo(() => {
    if (!hasGift || giftBalance !== null) return null;
    if (match.kind === "ambiguous") {
      return { reason: "ambiguous", last4: match.last4, count: match.count };
    }
    if (match.kind === "unmatched") return { reason: "unmatched", last4: match.last4 };
    if (match.kind === "empty") return { reason: "tooShort" };
    if (match.card.balance_stale) return { reason: "stale" };
    if (!match.card.balance_verified) return { reason: "unverified" };
    return { reason: "unreadable" };
  }, [hasGift, giftBalance, match]);

  const plan = useMemo(
    () => buildPlan({ due, giftBalance, hasGift, hasCard }),
    [due, giftBalance, hasGift, hasCard],
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
           An empty checkout is the one place worth showing what this checkout is *for*.
           Bare strokes — `StatePage` supplies the disc it sits on, and a drawing that brings
           its own fills would fight the plinth's ground instead of sitting on it. */
        art={
          <svg
            viewBox="0 0 96 96"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <g opacity="0.42">
              <rect x="30" y="21" width="56" height="36" rx="7" />
              <path d="M30 33h56" />
            </g>
            <rect x="10" y="39" width="56" height="36" rx="7" />
            <path d="M10 51h56" />
            <path d="M20 62h11" stroke="var(--gold)" strokeWidth="6" />
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
  const payNote =
    phase === "paying"
      ? "Drawing the gift card, then authorizing the card. Don’t close this tab."
      : !fulfilled
        ? "Choose an address and a delivery speed to continue."
        : !hasGift && !hasCard
          ? "Add a gift card or choose a card to continue."
          : planFallsShort(plan)
            ? "The gift card doesn’t cover the total, and no card is selected."
            : "";

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

          <DestinationSection
            destinations={method?.destinations ?? []}
            selectedId={selectedDestinationId}
            busy={busy}
            onChoose={chooseDestination}
          />
          <DeliverySection
            destinationSelected={Boolean(selectedDestinationId)}
            options={options}
            selectedId={selectedOptionId}
            busy={busy}
            onChoose={chooseOption}
          />
          <PaymentSection
            busy={busy}
            giftCode={giftCode}
            giftPin={giftPin}
            cardToken={cardToken}
            giftBalance={giftBalance}
            matchedGift={matchedGift}
            match={match}
            hasGift={hasGift}
            hasCard={hasCard}
            onGiftCodeChange={setGiftCode}
            onGiftPinChange={setGiftPin}
            onCardTokenChange={setCardToken}
          />
        </div>

        {/*
          The summary column, not a summary card.
          ──────────────────────────────────────
          It used to be a bordered, shadowed Panel floating in a rail that ran out ~600px
          above the bottom of the form beside it, which is what made the right-hand third of
          the page read as dead. The panel is gone: this is a column of the page now, marked
          off by one full-height hairline, so the space below it belongs to the column rather
          than being left over. The only object with chrome inside it is the split itself —
          one depth idea, spent on the thing the project exists to show.
        */}
        <OrderSummary
          session={session}
          plan={plan}
          giftUnknown={giftUnknown}
          failure={failure}
          hasGift={hasGift}
          hasCard={hasCard}
          due={due}
          paying={phase === "paying"}
          canPay={canPay}
          payNote={payNote}
          onPay={onPay}
        />
      </div>
    </Container>
  );
}
