import { useEffect, type ReactNode } from 'react';

export type InfoPageId = 'policies' | 'privacy' | 'terms' | 'contact';

const PAGES: Record<InfoPageId, { title: string; eyebrow: string }> = {
  policies: { title: 'Policies', eyebrow: 'Before you order' },
  privacy: { title: 'Privacy', eyebrow: 'Your order details' },
  terms: { title: 'Terms, shipping and returns', eyebrow: 'Custom orders' },
  contact: { title: 'Contact', eyebrow: 'West Vinyl Studio' },
};

function PageShell({
  page,
  children,
}: {
  page: InfoPageId;
  children: ReactNode;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${PAGES[page].title} · West Vinyl Studio`;
    return () => {
      document.title = previous;
    };
  }, [page]);

  return (
    <div className="min-h-[100dvh] bg-[#0f111a] px-4 py-8 text-slate-200">
      <article className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-black tracking-widest text-pink-400 uppercase">
            West Vinyl Studio
          </p>
          <h1 className="font-mono text-3xl text-pink-500">{PAGES[page].title}</h1>
          <p className="text-sm text-slate-400">{PAGES[page].eyebrow}</p>
        </header>
        <nav className="flex flex-wrap gap-3 font-mono text-xs text-slate-400">
          <a className="hover:text-pink-300" href="/">
            Studio
          </a>
          <a className="hover:text-pink-300" href="/policies">
            Policies
          </a>
          <a className="hover:text-pink-300" href="/privacy">
            Privacy
          </a>
          <a className="hover:text-pink-300" href="/terms">
            Terms
          </a>
          <a className="hover:text-pink-300" href="/contact">
            Contact
          </a>
        </nav>
        <div className="space-y-4 text-sm leading-relaxed text-slate-300">{children}</div>
        <footer className="border-t border-slate-800 pt-4 text-xs leading-relaxed text-slate-500">
          Analytics and advertising cookies are used only when measurement is switched on.{' '}
          <a className="hover:text-pink-300" href="/privacy">
            Privacy
          </a>
        </footer>
      </article>
    </div>
  );
}

function OfferSummary() {
  return (
    <section className="space-y-2 rounded border border-slate-800 bg-[#181a25] p-4">
      <h2 className="font-mono text-base text-pink-400">What you are buying</h2>
      <p>
        West Vinyl Studio is a design tool and made-to-order shop for custom vinyl stickers and
        iron-on apparel. You design the artwork in the browser. After Stripe marks the checkout
        paid, the job is cut or pressed and shipped to the address you entered.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          The price depends on the product, print size, and design. Decals start from a vinyl floor
          of A$8.50 before labour. There is no GST line. West Vinyl Studio is not GST registered.
        </li>
        <li>
          Decal shipping is Untracked Rigid Post (A$4.00) or Tracked Parcel Mailer (A$10.00).
          Everything else ships as a Standard AusPost Parcel (A$12.00).
        </li>
        <li>Prices are AUD. The Stripe total is the amount charged. The browser cannot set the price.</li>
      </ul>
    </section>
  );
}

function PrivacyBody() {
  return (
    <>
      <p>
        We collect the name, email, phone if you provide one, shipping address, and the design file
        (SVG) you submit so we can make and post the order. Card numbers are entered on Stripe
        Checkout and are not stored on this site.
      </p>
      <p>
        Paid and pending jobs are stored in a private order file on Vercel Blob so the shop can
        open the artwork after payment. We do not sell personal information.
      </p>
      <p>
        When analytics or ads measurement is switched on, Google and Meta may set cookies to
        measure page views and purchases. Those cookies are not set while measurement is off.
      </p>
      <p>
        To ask for a copy or deletion of an order record, email{' '}
        <a className="text-pink-300 hover:text-pink-200" href="mailto:westvinylco@gmail.com">
          westvinylco@gmail.com
        </a>{' '}
        with the order id from your receipt. Payment records Stripe must keep for tax and disputes
        stay with Stripe.
      </p>
    </>
  );
}

function TermsBody() {
  return (
    <>
      <OfferSummary />
      <section className="space-y-2">
        <h2 className="font-mono text-base text-pink-400">Shipping</h2>
        <p>
          Orders are made in Wentworth, NSW, Australia. Checkout collects a shipping address in
          Australia, the United States, the United Kingdom, Canada, New Zealand, or another
          country. Decals ship untracked or tracked; other products ship as a tracked AusPost parcel.
          Delivery time depends on that address. We do
          not promise a courier window.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-mono text-base text-pink-400">Custom goods and returns</h2>
        <p>
          Each sticker and garment is made from the artwork you submit, so change-of-mind refunds
          are not offered once production has started. If the piece arrives damaged, is the wrong
          product, or is not the design you paid for, email within 14 days of delivery with the
          order id and photos. We will repair, replace, or refund that order.
        </p>
        <p>
          These terms do not limit rights under the Australian Consumer Law, including remedies
          where goods are faulty or not as described.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-mono text-base text-pink-400">Payment</h2>
        <p>
          Payment is taken by Stripe on a hosted Checkout page for West Vinyl Studio. Cancelling
          Checkout takes no payment. A pending job stays unpaid until Stripe confirms it.
        </p>
      </section>
    </>
  );
}

function ContactBody() {
  return (
    <>
      <p>West Vinyl Studio · Wentworth NSW 2648, Australia</p>
      <p>
        Email{' '}
        <a className="text-pink-300 hover:text-pink-200" href="mailto:westvinylco@gmail.com">
          westvinylco@gmail.com
        </a>
      </p>
      <p>
        Phone{' '}
        <a className="text-pink-300 hover:text-pink-200" href="tel:+61466832047">
          0466 832 047
        </a>
      </p>
      <p>Use the order id from your Stripe receipt when you write about a job.</p>
    </>
  );
}

export function StudioInfoPage({ page }: { page: InfoPageId }) {
  return (
    <PageShell page={page}>
      {page === 'policies' ? (
        <>
          <OfferSummary />
          <p>
            Read the full <a className="text-pink-300 hover:text-pink-200" href="/privacy">privacy policy</a>,{' '}
            <a className="text-pink-300 hover:text-pink-200" href="/terms">terms, shipping and returns</a>, and{' '}
            <a className="text-pink-300 hover:text-pink-200" href="/contact">contact details</a> before you pay.
          </p>
        </>
      ) : null}
      {page === 'privacy' ? <PrivacyBody /> : null}
      {page === 'terms' ? <TermsBody /> : null}
      {page === 'contact' ? <ContactBody /> : null}
    </PageShell>
  );
}

export default StudioInfoPage;
