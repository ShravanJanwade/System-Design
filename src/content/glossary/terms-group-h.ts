import type { RawTerm } from '../types';

/** New glossary terms from lesson group H. See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  /* 3.5 CDNs */
  {
    id: 'cache-control',
    term: 'Cache-Control header',
    aka: ['Cache-Control'],
    definition: 'A response header that tells browsers and CDNs whether they may store a response, and for how long.',
    example: 'Cache-Control: public, max-age=31536000, immutable on a Snapgram photo.',
  },
  {
    id: 'pull-cdn',
    term: 'Pull CDN',
    aka: ['origin pull'],
    definition: 'A CDN whose edges fetch a file from the origin the first time someone asks for it, then serve their cached copy.',
    example: 'The Singapore edge fetches Maya’s photo from Oregon on its first view.',
  },
  {
    id: 'push-cdn',
    term: 'Push CDN',
    definition: 'A CDN you upload files to ahead of time, so the edges already have them before anyone asks.',
    example: 'Copying a new video to every edge the night before it launches.',
  },
  {
    id: 'origin-shield',
    term: 'Origin shield',
    aka: ['shield cache', 'tiered cache'],
    definition: 'An extra cache layer between the CDN edges and the origin, so a missing file leaves the origin once, not once per edge.',
    example: 'Edges in Tokyo, Sydney and Frankfurt ask the shield near Oregon, which asks the origin once.',
  },
  {
    id: 'purge',
    term: 'Purge',
    aka: ['CDN invalidation'],
    definition: 'Telling a CDN to delete its cached copies of an address at every edge, so the next request fetches a fresh copy.',
    example: 'Purging a photo that has to come down right away.',
  },
  {
    id: 'cache-busting',
    term: 'Cache busting',
    aka: ['versioned file names', 'fingerprinting'],
    definition: 'Giving every new version of a file a new address, such as a content hash in its name, so caches never serve the old one.',
    example: 'app.3f9a1c.js replaces app.8b2d7e.js, and nobody asks for the old name again.',
  },
  {
    id: 'static-content',
    term: 'Static content',
    definition: 'Files that are the same for every user, such as photos, videos, scripts and stylesheets. Ideal for caching on a CDN.',
    example: 'Snapgram’s photo files and its web app’s script bundle.',
  },

  /* 3.6 Databases 101 */
  {
    id: 'table',
    term: 'Table',
    definition: 'A named set of rows that all share the same columns, like one tab of a spreadsheet with strict rules.',
    example: 'Snapgram’s users table holds one row per user.',
  },
  {
    id: 'row',
    term: 'Row',
    aka: ['record'],
    definition: 'One item in a table, such as one user or one photo, with a value for each column.',
    example: 'Maya’s row: id 42, name Maya, city Singapore, 120 credits.',
  },
  {
    id: 'column',
    term: 'Column',
    aka: ['field'],
    definition: 'One attribute stored for every row of a table, with a fixed type, such as a name or a balance.',
    example: 'The credits column holds whole numbers and can never go below zero.',
  },
  {
    id: 'primary-key',
    term: 'Primary key',
    definition: 'A column, or set of columns, whose value identifies exactly one row of a table. It can never be empty or repeated.',
    example: 'users.id = 42 is Maya and nobody else.',
  },
  {
    id: 'foreign-key',
    term: 'Foreign key',
    definition: 'A column that holds another table’s primary key, linking the two rows. The database rejects values that point to nothing.',
    example: 'photos.user_id = 42 ties a photo to Maya’s row in users.',
  },
  {
    id: 'constraint',
    term: 'Constraint',
    definition: 'A rule the database checks on every write, such as not empty, unique, a foreign key, or credits never below zero.',
    example: 'A check constraint rejects any update that would leave Maya with negative credits.',
  },
  {
    id: 'join',
    term: 'Join',
    definition: 'A query that combines rows from two tables wherever their keys match, such as each photo with its owner’s name.',
    example: 'Joining photos and users on photos.user_id = users.id.',
  },
  {
    id: 'transaction',
    term: 'Transaction',
    definition: 'A group of database changes that succeed or fail as one unit: either all of them are saved, or none are.',
    example: 'A boost’s debit and credit run inside one transaction.',
  },
  {
    id: 'commit',
    term: 'Commit',
    definition: 'The successful end of a transaction: all its changes become permanent and visible to everyone at the same moment.',
    example: 'COMMIT makes Maya’s 70 credits and Leo’s 130 real together.',
  },
  {
    id: 'rollback',
    term: 'Rollback',
    definition: 'Undoing every change a transaction has made, leaving the data exactly as it was before the transaction began.',
    example: 'The credit to Leo fails, so the debit from Maya is rolled back.',
  },
  {
    id: 'acid',
    term: 'ACID',
    aka: ['atomicity, consistency, isolation, durability'],
    definition: 'Four promises of database transactions: all or nothing, rules always hold, no interference between concurrent transactions, and committed data survives crashes.',
    example: 'A bank transfer is the classic example of why ACID matters.',
  },
  {
    id: 'atomicity',
    term: 'Atomicity',
    definition: 'The all-or-nothing promise: every change in a transaction happens, or none do, even if something fails halfway.',
    example: 'A crash between the debit and the credit leaves neither in place.',
  },
  {
    id: 'isolation',
    term: 'Isolation',
    definition: 'The promise that transactions running at the same time do not see or disturb each other’s unfinished changes.',
    example: 'Two boosts at once cannot both spend the same 60 credits.',
  },
  {
    id: 'durability',
    term: 'Durability',
    definition: 'The promise that once a transaction commits, its changes survive crashes and power cuts.',
    example: 'After Snapgram confirms a boost, a reboot cannot undo it.',
  },
  {
    id: 'write-ahead-log',
    term: 'Write-ahead log',
    aka: ['WAL', 'redo log'],
    definition: 'A file on disk where the database records each change before applying it, so committed work can be replayed after a crash.',
    example: 'On restart, the database replays its log to recover every committed boost.',
  },
  {
    id: 'race-condition',
    term: 'Race condition',
    definition: 'A bug where the result depends on the timing of two operations running at once, such as two reads before either write.',
    example: 'Two app servers both read 60 credits and both approve a 50-credit boost.',
  },
  {
    id: 'isolation-level',
    term: 'Isolation level',
    definition: 'A setting that trades how strictly concurrent transactions are kept apart against speed. Many databases default to a weaker level than full isolation.',
    example: 'PostgreSQL defaults to read committed; serializable is the strictest level.',
  },
];
