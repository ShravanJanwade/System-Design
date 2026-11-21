import type { DiagramSpec, Problem } from '../types';

/** v1: one payment service, one database, one call to the provider. */
const v1: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'buyer', type: 'client', label: 'Buyer', x: 0, y: 0 },
    { id: 'checkout', type: 'service', label: 'Checkout', x: 1, y: 0 },
    { id: 'pay', type: 'service', label: 'Payment service', x: 2, y: 0 },
    { id: 'psp', type: 'external', label: 'Payment provider', x: 3, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'payments', x: 2, y: 1 },
  ],
  edges: [
    { id: 'buyer-checkout', from: 'buyer', to: 'checkout', kind: 'sync' },
    { id: 'checkout-pay', from: 'checkout', to: 'pay', kind: 'sync' },
    { id: 'pay-psp', from: 'pay', to: 'psp', kind: 'sync', label: 'charge' },
    { id: 'pay-db', from: 'pay', to: 'db', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The buyer clicks Pay. **Checkout** asks the **payment service** to charge the order, and the service first saves a payment row with status `processing` in the **database**.',
      flow: ['buyer-checkout', 'checkout-pay', 'pay-db', '<pay-db'],
    },
    {
      caption:
        'The payment service asks the **payment provider** to charge the card. It sends a token the provider issued when the buyer typed the card into the provider’s own form, so card numbers never reach our servers.',
      flow: ['pay-psp', '<pay-psp'],
      notes: [{ target: 'psp', text: '≈ 2 s' }],
    },
    {
      caption:
        'The service records the result and replies, and checkout shows a receipt. It works until a reply is lost: the provider charged the card, checkout timed out and tried again, and the buyer paid twice.',
      flow: ['pay-db', '<pay-db', { edge: 'checkout-pay', reverse: true, tag: 'paid' }, '<buyer-checkout'],
    },
  ],
};

/** v2: idempotency keys on both hops, unknown outcomes, a recovery worker and webhooks. */
const v2: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'checkout', type: 'service', label: 'Checkout', x: 0, y: 0 },
    { id: 'pay', type: 'service', label: 'Payment service', x: 1, y: 0 },
    { id: 'psp', type: 'external', label: 'Payment provider', x: 2, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'unique keys', x: 1, y: 1 },
    { id: 'recovery', type: 'worker', label: 'Recovery worker', x: 2, y: 1 },
  ],
  edges: [
    { id: 'checkout-pay', from: 'checkout', to: 'pay', kind: 'sync' },
    { id: 'pay-db', from: 'pay', to: 'db', kind: 'sync' },
    { id: 'pay-psp', from: 'pay', to: 'psp', kind: 'sync' },
    { id: 'psp-pay', from: 'psp', to: 'pay', kind: 'async' },
    { id: 'recovery-db', from: 'recovery', to: 'db', kind: 'sync' },
    { id: 'recovery-psp', from: 'recovery', to: 'psp', kind: 'sync', label: 'status?' },
  ],
  steps: [
    {
      caption:
        'Checkout sends one idempotency key per order attempt. The **payment service** inserts the payment under that key with a unique constraint, so a retry finds the existing row and gets its stored answer instead of a second charge.',
      flow: ['checkout-pay', 'pay-db', '<pay-db'],
      notes: [{ target: 'db', text: 'key 7f3a taken' }],
    },
    {
      caption:
        'The service calls the **payment provider** with a key of its own, derived from the payment attempt. The call times out, so the outcome is unknown: the row is marked `unknown`, and nobody retries with a fresh key.',
      flow: [{ edge: 'pay-psp', tag: 'timeout', tone: 'alert' }],
      notes: [{ target: 'db', text: 'status: unknown', tone: 'alert' }],
    },
    {
      caption:
        'The **recovery worker** picks up payments left `unknown` for a minute and asks the provider what happened, or retries with the same key, which returns the first result instead of charging again.',
      flow: ['recovery-db', '<recovery-db', 'recovery-psp', '<recovery-psp', 'recovery-db'],
    },
    {
      caption:
        'Some outcomes arrive later by webhook: an extra check by the card’s bank finishing, a bank transfer clearing, a chargeback. The payment service checks the signature, stores the event by its ID so a resend is ignored, and moves the payment forward.',
      flow: ['psp-pay', 'pay-db', '<pay-db', '<psp-pay'],
    },
  ],
};

/** v3: the double-entry ledger, the outbox and payouts to sellers. */
const v3: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'pay', type: 'service', label: 'Payment service', x: 0, y: 0 },
    { id: 'db', type: 'sqlDb', label: 'Database', sublabel: 'payments, ledger, outbox', x: 1, y: 0 },
    { id: 'relay', type: 'worker', label: 'Outbox relay', x: 2, y: 0 },
    { id: 'events', type: 'queue', label: 'Payment events', x: 3, y: 0 },
    { id: 'payout', type: 'worker', label: 'Payout job', sublabel: 'weekly', x: 1, y: 1 },
    { id: 'bank', type: 'external', label: 'Bank', sublabel: 'pays sellers', x: 2, y: 1 },
    { id: 'orders', type: 'service', label: 'Order service', x: 3, y: 1 },
  ],
  edges: [
    { id: 'pay-db', from: 'pay', to: 'db', kind: 'sync' },
    { id: 'relay-db', from: 'relay', to: 'db', kind: 'sync' },
    { id: 'relay-events', from: 'relay', to: 'events', kind: 'async' },
    { id: 'events-orders', from: 'events', to: 'orders', kind: 'async' },
    { id: 'payout-db', from: 'payout', to: 'db', kind: 'sync' },
    { id: 'payout-bank', from: 'payout', to: 'bank', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'The provider confirms a $50 charge. In one database transaction, the **payment service** marks the payment succeeded and writes balanced ledger entries: debit the provider’s account $50 (it owes us), credit the seller $45 and credit our fees $5.',
      flow: ['pay-db', '<pay-db'],
      notes: [{ target: 'db', text: 'debits = credits' }],
    },
    {
      caption:
        'The same transaction adds an outbox row. The **outbox relay** publishes it to **payment events**, and the **order service** marks the order paid; a relay that crashes publishes again, so consumers skip events they have already seen.',
      flow: ['relay-db', '<relay-db', 'relay-events', 'events-orders'],
    },
    {
      caption:
        'Each week, the **payout job** reads every seller’s balance from the ledger, holds back a reserve for refunds and chargebacks, and asks the **bank** to send the rest, with an idempotency key. The payout posts its own balanced entries, so each balance drops by exactly what was sent.',
      flow: ['payout-db', '<payout-db', 'payout-bank', '<payout-bank', 'payout-db'],
    },
  ],
};

/** v4: daily reconciliation against the provider's settlement file. */
const v4: DiagramSpec = {
  grid: { cols: 4, rows: 2 },
  nodes: [
    { id: 'psp', type: 'external', label: 'Payment provider', x: 0, y: 0 },
    { id: 'files', type: 'objectStore', label: 'Settlement files', sublabel: 'one a day', x: 1, y: 0 },
    { id: 'recon', type: 'worker', label: 'Reconciliation job', x: 2, y: 0 },
    { id: 'ledger', type: 'sqlDb', label: 'Ledger', x: 3, y: 0 },
    { id: 'exc', type: 'queue', label: 'Exceptions', x: 2, y: 1 },
    { id: 'finance', type: 'client', label: 'Finance team', x: 3, y: 1 },
  ],
  edges: [
    { id: 'psp-files', from: 'psp', to: 'files', kind: 'async', label: 'nightly' },
    { id: 'recon-files', from: 'recon', to: 'files', kind: 'sync' },
    { id: 'recon-ledger', from: 'recon', to: 'ledger', kind: 'sync' },
    { id: 'recon-exc', from: 'recon', to: 'exc', kind: 'async', label: 'mismatches' },
    { id: 'finance-exc', from: 'finance', to: 'exc', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Each night the **payment provider** delivers a settlement file listing every charge, refund, fee and chargeback it processed, and the total it is sending to our bank: about 10 million lines a day (ballpark).',
      flow: ['psp-files'],
    },
    {
      caption:
        'The **reconciliation job** matches every line to the **ledger** by the provider’s payment ID, comparing amount, currency and state. Three kinds of mismatch matter: in their file but not our ledger, in our ledger but not their file, and in both but different.',
      flow: ['recon-files', '<recon-files', 'recon-ledger', '<recon-ledger'],
    },
    {
      caption:
        'Matched lines post settlement entries: the money moves from the provider’s account to our bank account, and the provider’s fee is booked as an expense. The day’s matched lines must also add up to the payout that reached the bank.',
      flow: ['recon-ledger'],
      notes: [{ target: 'ledger', text: 'settled' }],
    },
    {
      caption:
        'Everything else goes to **exceptions**. Many clear on their own within a day or two, such as a refund the provider settles a day later; the rest go to the **finance team**, who fix them with new correcting entries, never by editing old ones.',
      flow: ['recon-exc', 'finance-exc', '<finance-exc'],
    },
  ],
};

/** v5: what a database failure and a provider outage do to payments. */
const v5: DiagramSpec = {
  grid: { cols: 3, rows: 3 },
  nodes: [
    { id: 'checkout', type: 'service', label: 'Checkout', x: 0, y: 1 },
    { id: 'pay', type: 'service', label: 'Payment service', sublabel: 'three zones', x: 1, y: 1 },
    { id: 'pspA', type: 'external', label: 'Provider A', sublabel: 'main', x: 2, y: 0 },
    { id: 'pspB', type: 'external', label: 'Provider B', sublabel: 'backup', x: 2, y: 1 },
    { id: 'primary', type: 'sqlDb', label: 'Primary', sublabel: 'database, zone 1', x: 1, y: 2 },
    { id: 'replica', type: 'sqlDb', label: 'Replica', sublabel: 'synchronous, zone 2', x: 2, y: 2 },
  ],
  edges: [
    { id: 'checkout-pay', from: 'checkout', to: 'pay', kind: 'sync' },
    { id: 'pay-pspA', from: 'pay', to: 'pspA', kind: 'sync' },
    { id: 'pay-pspB', from: 'pay', to: 'pspB', kind: 'sync' },
    { id: 'pay-primary', from: 'pay', to: 'primary', kind: 'sync' },
    { id: 'primary-replica', from: 'primary', to: 'replica', kind: 'replication' },
    { id: 'pay-replica', from: 'pay', to: 'replica', kind: 'sync' },
  ],
  steps: [
    {
      caption:
        'Every tier runs in three zones. Each commit on the **primary** waits until the **replica** in another zone has it, which adds a millisecond or two (ballpark), so a committed payment survives losing the primary.',
      flow: ['checkout-pay', 'pay-primary', 'primary-replica', '<pay-primary', '<checkout-pay'],
    },
    {
      caption:
        'The primary dies. The replica already holds every committed transaction, so it is promoted within about 30 seconds (ballpark) and nothing is lost; checkout retries the payments that were in flight, with the same idempotency keys.',
      fail: ['primary'],
      add: ['pay-replica'],
      flow: ['pay-replica', '<pay-replica'],
      notes: [{ target: 'replica', text: 'promoted', tone: 'signal' }],
    },
    {
      caption:
        '**Provider A** starts timing out. A [[circuit breaker|circuit-breaker]] in the payment service opens after a burst of failures, and new checkouts collect the card with **provider B** instead; payments already sent to A stay `unknown` until the recovery worker can ask A.',
      fail: ['pspA'],
      flow: ['checkout-pay', 'pay-pspB', '<pay-pspB', '<checkout-pay'],
      notes: [{ target: 'pspA', text: 'timing out', tone: 'alert' }],
    },
  ],
};

const problem: Problem = {
  id: 'payment-system',
  title: 'Payment system',
  tier: 3,
  flagship: false,
  minutes: 60,
  prompt:
    'Design the payment system for an online marketplace. Buyers pay for orders by card through an outside payment provider, sellers are paid out later, and money must never be charged twice, lost, or created out of nowhere.',
  concepts: ['idempotency', 'databases-101', 'distributed-transactions', 'timeouts-retries-backoff', 'batch-vs-stream', 'cqrs-event-sourcing', 'security-essentials', 'back-of-the-envelope'],
  hints: [
    'The volume here is modest; correctness is the hard part. What happens when checkout times out and retries, or when the provider charged the card but its reply never arrived?',
    'Record money so it can never appear or vanish: think about how accountants write every movement in two places at once, and why they never erase an entry. Then ask how you would prove your records match the provider’s.',
    'One shape that works: the payment service saves a payment row under an [[idempotency key|idempotency-key]] before calling the provider with a key of its own; replies and [[webhooks|webhook]] move the payment through a small state machine; each change writes balanced entries to an append-only ledger in the same [[transaction|transaction]]; and a daily job compares the ledger with the provider’s settlement files.',
  ],
  clarifyingQuestions: [
    {
      q: 'How many payments a day, and how spiky is the traffic?',
      why: 'Assume about 10 million a day: 100 a second on average and 1,000 at peak on sale days (ballpark). That is modest, so one well-run relational database can hold the ledger, and the design can spend its effort on correctness rather than scale.',
    },
    {
      q: 'Do we process cards ourselves, or use an outside payment provider?',
      why: 'Building on a payment service provider (PSP) such as Stripe or Adyen means card numbers never touch our servers, which keeps most of our systems out of the Payment Card Industry Data Security Standard (PCI DSS) audit. It also means every charge is a call to someone else’s system that can time out with the outcome unknown.',
    },
    {
      q: 'Is this a single store, or a marketplace that pays sellers?',
      why: 'A marketplace holds buyers’ money before paying sellers, minus fees, so it needs its own ledger of who is owed what, plus scheduled payouts. A single store can lean on the provider’s records for much of that.',
    },
    {
      q: 'Which payment methods and currencies?',
      why: 'Cards answer within seconds, while bank transfers and some wallets confirm hours or days later, so payments need pending states and updates that arrive later. Several currencies mean storing every amount with its currency, and never adding amounts in different currencies.',
    },
    {
      q: 'What happens with refunds and chargebacks?',
      why: 'Both move money backwards, sometimes months later and after the seller was paid. The ledger must record them as new entries, never edits, and payouts may hold back a reserve to cover them.',
    },
    {
      q: 'Who reads this data, and how fresh must it be?',
      why: 'Finance needs exact daily totals and an [[audit trail|audit-trail]] kept for years; buyers need a payment’s status within seconds. That points to one strongly consistent store as the [[source of truth|source-of-truth]], with reporting copies built from it.',
    },
  ],
  requirements: {
    functional: [
      'Charge a buyer for an order through an outside payment provider, and report success or failure to checkout.',
      'Refund all or part of a payment.',
      'Record every movement of money in a double-entry ledger, and show sellers their balances.',
      'Pay sellers on a schedule, minus fees and any amount held back.',
      'Reconcile our records against the provider’s every day and flag every mismatch.',
    ],
    nonFunctional: [
      'Exactly-once effect: a buyer is never charged twice for one order, whatever retries, timeouts and crashes happen.',
      'Correct and auditable: every cent is accounted for, entries are never edited or deleted, and any balance can be explained from its history.',
      'Highly available checkout, around 99.99% (a ballpark target), since a failed payment is a lost sale; a payment may wait in a pending state rather than fail.',
      'Latency is mostly the provider’s: about 1 to 3 seconds per charge (ballpark), with our own work adding under 100 ms.',
      'Secure: no raw card numbers anywhere in our systems, sensitive data encrypted, and every access logged.',
    ],
    outOfScope: [
      'Fraud scoring, beyond calling a risk service before each charge.',
      'Tax, invoices and currency exchange.',
      'Connecting to the card networks ourselves.',
    ],
  },
  estimation: {
    assumptions: [
      { label: 'Payments per day', value: 'about 10 million (ballpark)' },
      { label: 'Busiest hour compared with the daily average', value: '10×, on big sale days' },
      { label: 'Average payment', value: 'about $50 (ballpark)' },
      { label: 'Time the provider takes to answer', value: '1 to 3 seconds (ballpark)' },
      { label: 'Bytes stored per payment', value: 'about 2 KB: the payment row, its attempts, events and about four ledger entries' },
      { label: 'How long records are kept', value: '10 years (ballpark; the real figure comes from finance and legal)' },
      {
        label: 'In the calculator',
        value: '10 million buyers, 2 actions each (a payment and a status check), so 1 read per write; one object is one payment with its ledger entries, 2 KB',
      },
    ],
    steps: [
      { label: 'Payments per second', math: '10⁷ ÷ 10⁵ seconds a day', result: '≈ 100 a second, 1,000 at peak' },
      { label: 'Provider calls in flight', math: '1,000 a second × about 2 seconds each', result: '≈ 2,000 at once at peak: use non-blocking calls or a large connection pool' },
      {
        label: 'Ledger entries',
        math: '10⁷ payments × about 4 entries = 4 × 10⁷ a day; ÷ 10⁵ seconds',
        result: '≈ 400 a second, 4,000 at peak: within reach of one well-tuned relational database (ballpark)',
      },
      { label: 'Storage', math: '10⁷ × 2 KB ≈ 20 GB a day; × 365 ≈ 7 TB a year; × 10 years', result: '≈ 70 TB: keep two years hot, archive the rest' },
      { label: 'Money at stake', math: '10⁷ payments × $50', result: '≈ $500 million a day, so an error rate of 0.01% is $50,000 a day' },
      {
        label: 'Reconciliation',
        math: '10⁷ provider lines matched to ledger entries by the provider’s payment identifier (ID)',
        result: 'a batch join of minutes, run nightly',
      },
    ],
    calculator: { dau: 10_000_000, actionsPerUser: 2, readsPerWrite: 1, objectBytes: 2_000, peakFactor: 10, retentionYears: 10 },
  },
  api: [
    {
      signature: 'POST /v1/payments  Idempotency-Key: <uuid>  { orderId, amount: 4999, currency: "USD", paymentMethodToken }  →  201 { paymentId, status }',
      description:
        'Called by checkout. The amount is a whole number in the currency’s smallest unit, cents here, never a floating-point number. A retry with the same key returns the original result, and `status` may be `pending` if the provider hasn’t answered yet.',
    },
    {
      signature: 'GET /v1/payments/{paymentId}  →  200 { status, amount, currency, attempts: [ … ] }',
      description: 'Status for checkout and support. It reads from the primary database, so a payment that just finished never looks missing.',
    },
    {
      signature: 'POST /v1/payments/{paymentId}/refunds  Idempotency-Key: <uuid>  { amount }  →  201 { refundId, status }',
      description: 'Full or partial refunds, each with its own key. The service refuses a refund larger than what was captured minus earlier refunds.',
    },
    {
      signature: 'POST /webhooks/provider  { eventId, type, providerPaymentId, … }  →  200 OK',
      description:
        'The provider reports outcomes here: a delayed success, a failure, a chargeback. We verify the signature, save the event by `eventId` so a repeat is ignored, and answer `200` only once it is saved; webhooks arrive [[at least once|at-least-once]], so the provider resends anything we miss.',
    },
  ],
  dataModel: [
    {
      entity: 'Payment',
      fields: ['payment_id', 'order_id', 'idempotency_key (unique)', 'amount_minor: integer, currency', 'status: processing, succeeded, failed, unknown, refunded', 'provider_payment_id', 'version'],
      store: 'Relational database such as PostgreSQL, with a synchronous replica in another zone',
      why: 'Each state change must commit together with its ledger entries and outbox row, a job for [[ACID|acid]] transactions (atomicity, consistency, isolation and durability). A unique constraint on the key makes a duplicate charge impossible at the database level, and the version column stops two workers from moving one payment at once.',
    },
    {
      entity: 'Ledger entry',
      fields: ['entry_id', 'movement_id: groups the entries of one movement', 'account_id', 'direction: debit or credit', 'amount_minor, currency', 'created_at'],
      store: 'The same database, in an append-only table: inserts only, never updates or deletes',
      why: 'Every movement writes at least two entries whose debits equal its credits, so money can never appear or vanish, and a check rejects any movement that doesn’t balance. Balances are sums of entries; corrections are new entries that reverse old ones.',
    },
    {
      entity: 'Account',
      fields: ['account_id', 'type: provider clearing, seller payable, fees, bank, reserve', 'currency', 'balance_minor (cached)', 'version'],
      store: 'The same database',
      why: 'Accounts are the buckets money moves between. The cached balance, updated in the same transaction as the entries, makes payouts fast, and it can always be rebuilt from the entries.',
    },
    {
      entity: 'Outbox event',
      fields: ['event_id', 'type: payment_succeeded, refund_created, …', 'payload', 'published_at (or null)'],
      store: 'The same database; a relay publishes rows to a queue',
      why: 'Written in the same transaction as the payment, so other services hear about every change that commits and never about one that rolled back: the [[transactional outbox|transactional-outbox]] pattern.',
    },
    {
      entity: 'Provider event',
      fields: ['event_id (unique)', 'type', 'payload', 'received_at, processed_at'],
      store: 'The same database',
      why: 'Webhooks can arrive twice, late or out of order. Saving each by its event ID before acting on it makes a resend harmless.',
    },
  ],
  stages: [
    {
      title: 'v1: It works',
      solves: 'Charge a buyer for an order through an outside provider and remember the result, with the fewest moving parts.',
      diagram: v1,
      explanation:
        'One service, one database and one call to the provider are enough for a shop taking a few payments a minute. It has no answer to lost replies and retries, no record of where money went beyond a status, and no way to tell whether its numbers match the provider’s.',
    },
    {
      title: 'v2: Never charging twice',
      solves: 'Retries are certain: double clicks, timeouts, crashes between charging and saving. A lost reply plus a retry must never charge a buyer twice.',
      diagram: v2,
      explanation:
        'Idempotency keys on both hops make every retry safe, and writing the row before the call means a crash always leaves a trail. The key idea is that a timeout is a third outcome, unknown, which is settled by asking, never by guessing.',
    },
    {
      title: 'v3: Every cent accounted for',
      solves:
        'The business must know, to the cent, what each seller is owed and what it earned in fees, and other services must hear about every payment, once it is final.',
      diagram: v3,
      explanation:
        'The payment row says what happened to one payment; the ledger says where every cent is, for every account, for years. Because the entries, the payment and the outbox row commit together, the books, the order and every downstream service agree on what happened.',
    },
    {
      title: 'v4: Proving the books match',
      solves:
        'Even with idempotency everywhere, our records and the provider’s drift apart: a lost webhook, a late refund, a bug in fee math. Finance must show every day that the books match where the money actually went.',
      diagram: v4,
      explanation:
        'Idempotency prevents most errors, and [[reconciliation|reconciliation]] finds the rest. Running it daily keeps any drift to one day’s worth, small enough to investigate, and correcting entries keep the ledger an honest record of what happened and how it was fixed.',
    },
    {
      title: 'v5: It survives failures',
      solves: 'A database or provider outage must not lose a committed payment, nor leave buyers charged for orders that never went through.',
      diagram: v5,
      explanation:
        'Failures turn into delays rather than wrong money: the database loses no committed payment, a failing provider is cut off before it ties up every thread, and whatever is left uncertain is settled later by the recovery worker and reconciliation.',
    },
  ],
  deepDives: [
    {
      title: 'Never charging twice',
      problem:
        'Retries are unavoidable: the buyer double-clicks, checkout times out and tries again, the payment service crashes between calling the provider and saving the answer. At each hop, one payment can become two charges unless that hop recognizes a repeat.',
      options: {
        caption: 'Layers of protection against a double charge',
        rows: [
          {
            option: 'Retry with no protection',
            goodAt: 'Nothing to build.',
            badAt: 'A lost reply plus a retry is a double charge, the most damaging bug a payment system can have.',
            pickWhen: 'Never.',
          },
          {
            option: 'Idempotency key from the client',
            goodAt: 'Checkout makes one key per order attempt, and the payment service stores it under a unique constraint with its response, so a retry gets the first answer.',
            badAt: 'Protects only the first hop; a crash after charging but before saving still needs help.',
            pickWhen: 'Always, at the front door of the payment service.',
          },
          {
            option: 'Idempotency key sent to the provider',
            goodAt: 'A retried charge with the same key returns the first result instead of charging again, and major providers such as Stripe accept such keys.',
            badAt: 'Providers keep keys only for a limited time, about a day at some (ballpark), so retries must happen within that window.',
            pickWhen: 'Always, on every call that moves money.',
          },
          {
            option: 'One successful payment per order',
            goodAt: 'A unique constraint on the order’s successful payment catches bugs that generate new keys.',
            badAt: 'Blocks a legitimate second attempt, such as a retry with another card, unless attempts are stored as separate rows.',
            pickWhen: 'As a backstop, with each attempt kept as its own row.',
          },
        ],
      },
      recommendation:
        'Use all the layers: a client key at the front door, a key per attempt on every provider call, and a unique constraint so even a buggy client can’t create two successful payments for one order. Write the payment row as `processing` before calling the provider, so a crash always leaves a trail for the recovery worker. Treat a timeout as unknown, never as failed: retry with the same key or ask the provider, never with a fresh key.',
    },
    {
      title: 'The double-entry ledger',
      problem:
        'The business must know, to the cent and for years, how much each seller is owed, how much the provider owes us and how much we earned in fees, with every change explainable. A balance column that services update in place can drift silently, and then nobody can say why.',
      options: {
        caption: 'Four ways to record money',
        rows: [
          {
            option: 'A balance column updated in place',
            goodAt: 'Simple and fast to read.',
            badAt: 'No history: a bug or a [[race condition|race-condition]] that adds $10 leaves no trace, and nothing checks that the money came from somewhere.',
            pickWhen: 'Never for money that belongs to other people.',
          },
          {
            option: 'A single-entry log of payments',
            goodAt: 'A history per payment, and balances can be summed from it.',
            badAt: 'Nothing forces each movement to come from somewhere, so a bug can create or destroy money and the log still looks fine.',
            pickWhen: 'A simple shop whose provider’s records serve as the books.',
          },
          {
            option: 'Double-entry, append-only',
            goodAt:
              'Every movement debits some accounts and credits others by the same total, so all balances always sum to zero and any imbalance is caught when it is written. Mistakes are fixed with reversing entries, so the history stays whole.',
            badAt: 'More rows and more care: account types and sign rules must be designed with the finance team.',
            pickWhen: 'Any system that holds or moves other people’s money.',
          },
          {
            option: 'An event-sourced ledger',
            goodAt: 'Every change is an event, and balances are [[projections|projection]] that can be rebuilt or reshaped at any time.',
            badAt: 'Rebuilding a balance by replay is slow without snapshots, and a payout needs a current, consistent balance.',
            pickWhen: 'Teams already built on [[event sourcing|event-sourcing]], with snapshots for balances.',
          },
        ],
      },
      recommendation:
        'Keep a double-entry ledger in the relational database: an append-only table of entries, each movement a balanced group written in one transaction, with a check that its debits equal its credits. Store amounts as integers in the smallest unit along with the currency, and never mix currencies in one account. Cache balances per account in the same transaction, and rebuild them from the entries every night to prove the cache right.',
    },
    {
      title: 'Talking to the provider',
      problem:
        'The provider is someone else’s system across the internet. Calls take seconds, some outcomes arrive minutes or days later, and a timeout tells you nothing about whether the card was charged.',
      options: {
        caption: 'Three ways to learn what happened',
        rows: [
          {
            option: 'Wait for every outcome in the call',
            goodAt: 'Simple: the buyer sees success or failure on the spot.',
            badAt:
              'Bank transfers and extra checks by the card’s bank don’t finish in seconds, and by [[Little’s law|littles-law]] a provider that slows to 10 seconds turns 1,000 payments a second into 10,000 open calls.',
            pickWhen: 'Card payments the provider answers within a few seconds.',
          },
          {
            option: 'Webhooks for results',
            goodAt: 'The provider pushes each outcome as it happens, covering slow methods, refunds and chargebacks.',
            badAt: 'Webhooks can arrive late, twice or out of order, and our own outage means missed events until the provider resends them.',
            pickWhen: 'Always, alongside the call, for every outcome that comes later.',
          },
          {
            option: 'Polling the provider',
            goodAt: 'We ask when we want to know, so nothing depends on receiving a push.',
            badAt: 'Extra load against the provider’s rate limits, and a delay between an event and noticing it.',
            pickWhen: 'As the recovery path for payments stuck in `unknown` or pending for too long.',
          },
        ],
      },
      recommendation:
        'Use all three, each for what it does best: a call with a [[timeout|timeout]] of a few seconds for the common case, webhooks for anything that settles later, and a recovery worker that polls for payments stuck too long. Model the payment as a state machine whose transitions only move forward and are [[idempotent|idempotent]], so a late, repeated or out-of-order event can never move a refunded payment back to `succeeded`.',
    },
    {
      title: 'Reconciliation',
      problem:
        'Even with idempotency everywhere, our ledger and the provider’s records drift: a webhook lost in an outage, a refund the provider settled late, a bug in fee math, a chargeback filed by phone. Finance must prove every day that our books match where the money actually went.',
      options: {
        caption: 'How to check the books',
        rows: [
          {
            option: 'Trust our own records',
            goodAt: 'Nothing to build.',
            badAt: 'Drift goes unnoticed until a seller complains or an auditor asks, and by then it takes months to untangle.',
            pickWhen: 'Never for real money.',
          },
          {
            option: 'Nightly batch reconciliation',
            goodAt: 'Match the provider’s settlement file line by line against the ledger and flag every difference: simple, complete and auditable.',
            badAt: 'Problems surface up to a day late.',
            pickWhen: 'The baseline, for every provider and bank account.',
          },
          {
            option: 'Continuous matching as events arrive',
            goodAt: 'Mismatches show up within minutes, so a broken integration is caught the same day.',
            badAt: 'Harder to build, and still needs the nightly file for fees and payouts that only it reports.',
            pickWhen: 'High volume, where a day of drift is too much money.',
          },
          {
            option: 'Three-way: ledger, provider and bank',
            goodAt: 'Also checks that the money the provider says it sent actually reached our bank.',
            badAt: 'Bank statements arrive in yet another format, on their own schedule.',
            pickWhen: 'Mature systems, and whenever auditors expect it.',
          },
        ],
      },
      recommendation:
        'Reconcile nightly against every provider’s settlement file and the bank statement, matching on the provider’s payment ID and checking amount, currency, fees and state. Clear known timing differences, such as a refund that settles a day later, automatically after a waiting period, and send the rest to a finance queue. Fix every mismatch with new correcting entries, never by editing old ones, so the audit trail stays whole.',
    },
  ],
  failureModes: [
    {
      scenario: '10× load: a big sale at 10,000 payments a second (ballpark).',
      impact: 'The provider’s rate limits and the ledger’s writes become the limits, and about 20,000 calls in flight (ballpark) exhaust connection pools.',
      mitigation:
        'Agree on higher limits with the provider before big sales, make provider calls non-blocking so waiting payments don’t hold threads, and split the ledger by seller account if one database can’t keep up.',
    },
    {
      scenario: 'A retry storm: checkout and clients retrying at 100× normal load.',
      impact: 'Retries multiply the load on the payment service and the provider exactly when both are slowest.',
      mitigation:
        'Retry with [[exponential backoff|exponential-backoff]] and jitter under a [[retry budget|retry-budget]], and use [[load shedding|load-shedding]] to turn away new checkouts with a clear message before payments already accepted are harmed.',
    },
    {
      scenario: 'The provider times out or goes down.',
      impact: 'Payments in flight have unknown outcomes, and new payments fail.',
      mitigation:
        'Mark in-flight payments `unknown` for the recovery worker to settle later. Open a circuit breaker, then send new checkouts to a backup provider or accept orders with payment pending.',
    },
    {
      scenario: 'The payment service crashes between charging and saving the result.',
      impact: 'The buyer was charged, but our row still says `processing`.',
      mitigation:
        'The recovery worker finds rows stuck in `processing`, asks the provider using the stored key, and finishes the transition, ledger entries included.',
    },
    {
      scenario: 'The database primary dies.',
      impact: 'Payments can’t be recorded during the failover.',
      mitigation:
        'Synchronous replication to another zone means no committed payment is lost. The replica is promoted within about 30 seconds (ballpark), and checkout retries with the same keys.',
    },
    {
      scenario: 'Webhooks arrive late, twice or out of order.',
      impact: 'A late “succeeded” could overwrite a newer “refunded”, and a repeat could post entries twice.',
      mitigation: 'Store events by ID, apply only forward state transitions, and post ledger entries under a unique key per payment and entry type.',
    },
    {
      scenario: 'A bug posts wrong ledger entries for a day.',
      impact: 'Seller balances are wrong, and so are any payouts made from them.',
      mitigation:
        'Reconciliation flags the drift. Fix it with reversing and correcting entries, and pause payouts for the affected sellers until their balances check out.',
    },
  ],
  levelSignals: [
    {
      level: 'entry',
      signals: [
        'Uses an outside payment provider instead of handling card numbers, and stores each payment with its status.',
        'Notices that a retry can charge twice and adds an idempotency key.',
        'Stores amounts as whole numbers of cents with a currency, never as floating point.',
      ],
    },
    {
      level: 'mid',
      signals: [
        'Sends idempotency keys on every hop, including to the provider, and treats a timeout as an unknown outcome.',
        'Models the payment as a state machine updated by replies and webhooks, with a recovery job for stuck payments.',
        'Records money in a double-entry, append-only ledger, in the same transaction as the payment.',
      ],
    },
    {
      level: 'senior',
      signals: [
        'Designs daily reconciliation against provider and bank records, with mismatch types and correcting entries.',
        'Uses an outbox to tell other services, and explains why one transaction across our database and the provider is impossible.',
        'Covers operations and risk: provider outages and a backup provider, payout reserves for chargebacks, card data kept out of scope, and audits.',
      ],
    },
  ],
  followUps: [
    {
      q: 'The call to the provider timed out. Was the customer charged?',
      a: 'We don’t know, and the design must not guess. The payment stays `unknown`, and the recovery worker either asks the provider for its status or retries the charge with the same idempotency key, which returns the first result if there was one. Only then does it move to succeeded or failed; checkout shows “processing” to the buyer until it does.',
    },
    {
      q: 'Why not one distributed transaction across our database and the provider?',
      a: 'The provider doesn’t take part in our transactions, and [[two-phase commit|two-phase-commit]] would hold locks in our database for the seconds the provider takes. Instead, each step is idempotent and recorded locally: the payment row before the call and the outcome after it, with recovery for anything in between. It is a [[saga|saga]] in all but name, with a refund as the [[compensating action|compensating-action]].',
    },
    {
      q: 'A seller says their balance is $200 short. How do you investigate?',
      a: 'Their balance is the sum of the entries on their account, so I list every entry and match each to a payment, refund, fee or payout. The ledger is append-only, so the history is complete, and reconciliation shows whether the provider’s records disagree with ours for any of those payments. Any fix is a new correcting entry with a reason, never an edit.',
    },
    {
      q: 'A chargeback arrives two months after the seller was paid. What happens?',
      a: 'The provider’s webhook creates a chargeback record and balanced entries: money leaves our provider account, and the seller’s balance drops, below zero if need be. Future payouts recover the shortfall, and the reserve held back from recent payouts covers it in the meantime. If the seller contests it, we send their evidence through the provider’s dispute process.',
    },
    {
      q: 'The provider is down for an hour during a sale. What do customers see?',
      a: 'The circuit breaker opens after a burst of failures, so buyers aren’t left waiting on dead calls. With a second provider, new checkouts go there; without one, we either take the order with payment pending and charge when the provider returns, or show a clear error. Payments that were in flight stay `unknown` until the recovery worker can ask the provider.',
    },
    {
      q: 'How would you support many currencies?',
      a: 'Every amount is an integer in the currency’s smallest unit, stored with its currency code; the smallest unit varies, and yen have no decimal places at all. Each account holds one currency, so balances never mix. A conversion is its own ledger movement between accounts in two currencies at a recorded rate, and reconciliation runs per currency.',
    },
    {
      q: 'How do you keep card data safe?',
      a: 'We never handle raw card numbers: buyers type them into the provider’s form or its software development kit (SDK), and we get back a token, which keeps most of our systems out of PCI DSS scope. Tokens, personal data and webhook secrets are still protected with [[encryption at rest|encryption-at-rest]], every access is logged, and only the payment service may call the provider.',
    },
  ],
  rubric: [
    { item: 'Estimated volume, money at stake and calls in flight, and concluded that correctness, not scale, is the hard part', weight: 5, lessonId: 'back-of-the-envelope' },
    { item: 'Made every hop idempotent, including calls to the provider, and treated a timeout as an unknown outcome', weight: 25, lessonId: 'idempotency' },
    { item: 'Recorded money in a double-entry, append-only ledger with integer amounts and currencies', weight: 20, lessonId: 'databases-101' },
    { item: 'Kept payment state, ledger entries and events consistent with local transactions and an outbox, not a distributed transaction', weight: 15, lessonId: 'distributed-transactions' },
    { item: 'Handled replies, webhooks and stuck payments with a state machine and a recovery worker', weight: 10, lessonId: 'timeouts-retries-backoff' },
    { item: 'Reconciled the ledger daily against provider and bank records, fixing mismatches with correcting entries', weight: 15, lessonId: 'batch-vs-stream' },
    { item: 'Kept card numbers out of our systems with provider tokens, and planned for provider outages', weight: 10, lessonId: 'security-essentials' },
  ],
};

export default problem;
