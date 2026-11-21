import type { RawTerm } from '../types';

/** New glossary terms from lesson group P (lessons 5.9 and 5.10). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'compare-and-set',
    term: 'Compare-and-set',
    aka: ['compare-and-swap', 'conditional write'],
    definition: 'A write that succeeds only if the current value still matches what the writer expects, so two concurrent updates cannot silently overwrite each other.',
    example: 'Set the balance to 90 only if it is still 100; otherwise read it again and retry.',
  },
  {
    id: 'garbage-collection',
    term: 'Garbage collection',
    aka: ['GC'],
    definition: 'A language runtime automatically freeing memory a program no longer uses. Some collectors briefly stop the whole program while they work.',
    example: 'A 15-second garbage collection pause froze one of Snapgram’s email workers.',
  },
  {
    id: 'probabilistic-data-structure',
    term: 'Probabilistic data structure',
    definition: 'A compact structure that answers questions approximately, trading a small, predictable error for far less memory than an exact answer needs.',
    example: 'A few kilobytes estimate a photo’s unique viewers instead of a list of every viewer.',
  },
  {
    id: 'sketch',
    term: 'Sketch',
    definition: 'A small, fixed-size summary of a large stream of data that answers certain questions approximately, such as how often or how many distinct.',
    example: 'The trending tab reads hashtag counts from a 54 KB sketch, not from every post.',
  },
  {
    id: 'bloom-filter',
    term: 'Bloom filter',
    definition: 'A bit array plus several hash functions that says an item is definitely not in a set, or maybe is, using very little memory.',
    example: 'Maya’s seen-photos filter takes about 7 KB and never lets a photo she has seen back into her feed.',
  },
  {
    id: 'bit-array',
    term: 'Bit array',
    aka: ['bitmap', 'bitset'],
    definition: 'A row of bits, each 0 or 1, packed tightly: a million bits fit in 125 kilobytes.',
    example: 'Maya’s 20 seen photos, hashed 3 times each into a 128-bit array, give about 5% false positives.',
  },
  {
    id: 'false-negative',
    term: 'False negative',
    definition: 'A result that says no when the true answer is yes, such as missing an item that really is in the set.',
    example: 'A Bloom filter never gives a false negative: a photo that was added always finds its bits set.',
  },
  {
    id: 'hyperloglog',
    term: 'HyperLogLog',
    aka: ['HLL'],
    definition: 'A sketch that estimates how many distinct items it has seen, in a few kilobytes, however many items there are.',
    example: 'Each photo’s unique-viewer count is a HyperLogLog of at most 12 KB in Redis.',
  },
  {
    id: 'cardinality',
    term: 'Cardinality',
    definition: 'The number of distinct items in a set, counting repeats only once.',
    example: 'A photo viewed 5 million times by 2 million people has 2 million distinct viewers.',
  },
  {
    id: 'standard-error',
    term: 'Standard error',
    definition: 'How far an estimate typically lands from the true value. About two in three estimates fall within one standard error.',
    example: 'With a 0.81% standard error, a count of 2 million is usually within about 16,000 of the truth.',
  },
  {
    id: 'count-min-sketch',
    term: 'Count-Min Sketch',
    definition: 'A small grid of counters, with one hash function per row, that estimates how often each item appeared. It can overcount but never undercounts.',
    example: 'The estimate for #sunset is the smallest of its counters across the rows.',
  },
  {
    id: 'top-k',
    term: 'Top K',
    aka: ['top-K', 'heavy hitters'],
    definition: 'The K most frequent items in a stream, such as the ten most used hashtags in the last hour.',
    example: 'The trending tab shows Snapgram’s top 10 hashtags for the past hour.',
  },
];
