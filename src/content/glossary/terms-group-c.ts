import type { RawTerm } from '../types';

/** New glossary terms from lesson group C. See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  /* Shared ids owned by group C */
  {
    id: 'throughput',
    term: 'Throughput',
    definition: 'How much work a system finishes per unit of time, such as requests per second or uploads per minute.',
    example: 'At the evening peak, Snapgram’s upload server finishes about four uploads a second.',
  },
  {
    id: 'bandwidth',
    term: 'Bandwidth',
    definition: 'The most data a link can carry per second, usually counted in bits per second. Throughput can never be higher.',
    example: 'A 100 Mbps connection moves at most about 12.5 megabytes a second.',
  },
  {
    id: 'percentile',
    term: 'Percentile',
    aka: ['p95', 'p99', 'p99.9'],
    definition: 'A value that a given share of measurements fall at or below. At the 99th percentile (p99), 99% of requests are this fast or faster.',
    example: 'Snapgram’s p99 page load is 3 seconds, while half its pages load in about 160 ms.',
  },
  {
    id: 'tail-latency',
    term: 'Tail latency',
    definition: 'The latency of the slowest requests, usually measured at the 99th percentile or above. It is what your unluckiest users feel.',
    example: 'Most Snapgram pages load in 160 ms, but the tail reaches 3 seconds.',
  },
  {
    id: 'fan-out',
    term: 'Fan-out',
    definition: 'One request that sets off many others, such as a page calling ten backend services at once. The page waits for the slowest.',
    example: 'Snapgram’s home page fans out to ten backend calls.',
  },
  {
    id: 'availability',
    term: 'Availability',
    aka: ['uptime'],
    definition: 'The share of time a system works when users need it, usually written as a percentage such as 99.9%.',
    example: 'Snapgram’s four-hour crash used up about half of a 99.9% year.',
  },
  {
    id: 'downtime',
    term: 'Downtime',
    aka: ['outage'],
    definition: 'Time when a system does not work for its users, whether from a crash, a bad change or planned maintenance.',
    example: 'The Saturday crash gave Snapgram four hours of downtime.',
  },
  {
    id: 'sli',
    term: 'SLI',
    aka: ['service level indicator'],
    definition: 'Service level indicator: a measurement of how well a service is doing, such as the share of requests that succeed quickly.',
    example: 'The share of Snapgram page loads that succeed in under 500 ms.',
  },
  {
    id: 'slo',
    term: 'SLO',
    aka: ['service level objective'],
    definition: 'Service level objective: a team’s target for an SLI over a time window, such as 99.9% of requests succeeding each month.',
    example: 'Snapgram aims for 99.9% of page loads to succeed each month.',
  },
  {
    id: 'sla',
    term: 'SLA',
    aka: ['service level agreement'],
    definition: 'Service level agreement: a contract promising customers a level of service, with consequences such as refunds or credits if it is missed.',
    example: 'A cloud provider credits part of the bill when it misses its SLA.',
  },
  {
    id: 'single-point-of-failure',
    term: 'Single point of failure',
    aka: ['SPOF'],
    definition: 'A component whose failure alone takes the whole system down, because nothing else can do its job.',
    example: 'Snapgram’s one server: when it crashed, everything went with it.',
  },
  {
    id: 'redundancy',
    term: 'Redundancy',
    definition: 'Spare copies of a component, so another can take over when one fails.',
    example: 'Two app servers instead of one, so a crash leaves the other running.',
  },

  /* Lesson 2.1 */
  {
    id: 'bottleneck',
    term: 'Bottleneck',
    definition: 'The part of a system that runs out of capacity first, which limits the throughput of everything that depends on it.',
    example: 'At peak, Snapgram’s 100 Mbps server connection fills up before anything else does.',
  },
  {
    id: 'propagation-delay',
    term: 'Propagation delay',
    definition: 'The time a signal takes to travel the distance between two points. More bandwidth does not shorten it; only less distance does.',
    example: 'Light in fiber covers about 200 km per millisecond, so oceans cost tens of milliseconds.',
  },
  {
    id: 'transmission-time',
    term: 'Transmission time',
    aka: ['serialization delay'],
    definition: 'The time to push a message’s bits onto a link: its size divided by the bandwidth.',
    example: 'A 3 MB photo over a 10 Mbps link takes about 2.4 seconds.',
  },
  {
    id: 'queueing-delay',
    term: 'Queueing delay',
    aka: ['waiting time'],
    definition: 'Time a request spends waiting in line before work on it starts. It grows quickly as a component nears full capacity.',
    example: 'At peak, Snapgram uploads wait for room on a full connection.',
  },
  {
    id: 'utilization',
    term: 'Utilization',
    definition: 'The share of a component’s capacity in use. Waiting times climb steeply as it approaches 100%.',
    example: '40 requests a second on a server that can handle 50 is 80% utilization.',
  },
  {
    id: 'headroom',
    term: 'Headroom',
    definition: 'Spare capacity kept free for bursts and growth, so a component never runs at its limit.',
    example: 'Snapgram’s new 1 Gbps connection runs at about 15% at the evening peak.',
  },
  {
    id: 'batching',
    term: 'Batching',
    definition: 'Grouping many small pieces of work into one, so each costs less overhead. Throughput rises, but items wait for their batch.',
    example: 'Writing view counts to the database once a second instead of on every view.',
  },
  {
    id: 'littles-law',
    term: 'Little’s law',
    definition: 'In a steady system, the average number of requests in progress equals throughput times average latency.',
    example: '1,000 requests a second at 50 ms each means about 50 in progress at once.',
  },
  {
    id: 'bandwidth-delay-product',
    term: 'Bandwidth-delay product',
    definition: 'Bandwidth times round-trip time: how much data must be in flight to keep a long link fully busy.',
    example: '1 Gbps with a 150 ms round trip needs about 19 megabytes in flight.',
  },

  /* Lesson 2.2 */
  {
    id: 'mean',
    term: 'Mean',
    aka: ['average', 'arithmetic mean'],
    definition: 'The sum of all values divided by how many there are. A few very slow requests can pull it far from the typical one.',
    example: 'Nine 100 ms loads and one 2-second load average 290 ms.',
  },
  {
    id: 'median',
    term: 'Median',
    aka: ['p50', '50th percentile'],
    definition: 'The middle value: half of the measurements are lower and half are higher. Also called the 50th percentile, or p50.',
    example: 'Half of Snapgram’s home page loads finish in under 160 ms.',
  },
  {
    id: 'histogram',
    term: 'Histogram',
    definition: 'A chart that sorts measurements into ranges and shows how many fall in each, revealing the shape of the data.',
    example: 'A latency histogram with a big hump near 100 ms and a thin tail past one second.',
  },
  {
    id: 'timeout',
    term: 'Timeout',
    definition: 'A limit on how long to wait for a response before giving up, and then trying again or carrying on without it.',
    example: 'Snapgram’s home page gives the notifications call 300 ms, then shows the page without it.',
  },
  {
    id: 'hedged-request',
    term: 'Hedged request',
    definition: 'A backup copy of a slow request, sent to a second server. The caller uses whichever answer arrives first.',
    example: 'If a feed read has not answered within its usual p95, Snapgram asks another copy.',
  },

  /* Lesson 2.3 */
  {
    id: 'nines',
    term: 'Nines',
    aka: ['three nines', 'four nines', 'five nines'],
    definition: 'Shorthand for availability by its count of 9s: 99.9% is three nines and 99.999% is five.',
    example: 'Three nines allows about 8.8 hours of downtime a year.',
  },
  {
    id: 'correlated-failure',
    term: 'Correlated failure',
    definition: 'Several components failing at once because they share something, such as power, a network, a region or a bad update.',
    example: 'Two app servers in the same rack both go dark when its power fails.',
  },
  {
    id: 'error-budget',
    term: 'Error budget',
    definition: 'The amount of failure an SLO allows over its window: the gap between the target and 100%.',
    example: 'A 99.9% monthly SLO leaves about 43 minutes of downtime to spend.',
  },
  {
    id: 'availability-zone',
    term: 'Availability Zone',
    definition: 'One or more data centers in a cloud region with their own power and networking, so one zone failing rarely affects another.',
    example: 'App servers in two zones keep serving when one data center goes dark.',
  },
];
