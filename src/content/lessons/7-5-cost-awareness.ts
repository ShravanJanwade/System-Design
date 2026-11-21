import type { DiagramSpec, Lesson } from '../types';

/** The main step-through: each meter of the cloud bill, attached to the part of Snapgram that runs it up. */
const meters: DiagramSpec = {
  grid: { cols: 4, rows: 3 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phone', x: 0, y: 1 },
    { id: 'app', type: 'service', label: 'App servers', x: 1, y: 0 },
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 1, y: 1 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', sublabel: 'standard class', x: 2, y: 1 },
    { id: 'replica', type: 'objectStore', label: 'Singapore copy', x: 3, y: 1 },
    { id: 'cold', type: 'objectStore', label: 'Colder storage', x: 2, y: 2 },
  ],
  edges: [
    { id: 'phone-app', from: 'phone', to: 'app', kind: 'sync' },
    { id: 'phone-cdn', from: 'phone', to: 'cdn', kind: 'sync' },
    { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync' },
    { id: 'store-cold', from: 'store', to: 'cold', kind: 'async', label: 'after a year' },
    { id: 'store-replica', from: 'store', to: 'replica', kind: 'replication' },
  ],
  // Phones: the phone on top, app servers to the left, and the photo path straight down through the CDN to storage.
  narrow: {
    grid: { cols: 3, rows: 4 },
    positions: {
      phone: { x: 1, y: 0 },
      app: { x: 0, y: 1 },
      cdn: { x: 1, y: 1 },
      store: { x: 1, y: 2 },
      replica: { x: 2, y: 2 },
      cold: { x: 1, y: 3 },
    },
    sides: { 'phone-app': { fromSide: 'left', toSide: 'top' } },
  },
  steps: [
    {
      caption:
        'Every like, comment and feed request runs on the **App servers**, billed for every hour they run, busy or idle. They matter, but for a photo app they are rarely the biggest line.',
      flow: ['phone-app'],
      notes: [{ target: 'app', text: '≈ $0.20 an hour' }],
    },
    {
      caption:
        'Every photo ever posted sits in **Photo storage**, billed every month for as long as it exists. Photos are almost never deleted, so this line only grows.',
      focus: ['store'],
      notes: [{ target: 'store', text: '$0.023 per GB-month' }],
    },
    {
      caption:
        'Each view sends a photo to a phone. The **CDN** fetches it from storage, its [[origin|origin-server]], for free, then charges per gigabyte delivered, less than storage would charge to send it directly.',
      flow: ['phone-cdn', 'cdn-store', '<cdn-store', '<phone-cdn'],
      notes: [
        { target: 'cdn-store', text: 'free' },
        { target: 'cdn', text: '$0.02–0.085 per GB' },
      ],
    },
    {
      caption:
        'Photos older than a year are rarely opened, so a [[lifecycle rule|lifecycle-rule]] moves them to **Colder storage**, about a sixth of the price. The catch is a [[retrieval fee|retrieval-fee]] of $0.03 per GB each time one is read back.',
      flow: ['store-cold'],
      notes: [{ target: 'cold', text: '$0.004 per GB-month' }],
    },
    {
      caption:
        'For [[disaster recovery|disaster-recovery]], photos are also copied to the **Singapore copy**: $0.02 per GB to send, and then every photo is stored, and billed, a second time.',
      flow: ['store-replica'],
      notes: [{ target: 'replica', text: '+ $0.02 per GB' }],
    },
  ],
};

/** A design choice that cuts a meter: feeds load small thumbnails instead of originals. */
const thumbnails: DiagramSpec = {
  grid: { cols: 3, rows: 2 },
  nodes: [
    { id: 'phone', type: 'client', label: 'Phone', x: 0, y: 0 },
    { id: 'cdn', type: 'cdn', label: 'CDN', x: 1, y: 0 },
    { id: 'store', type: 'objectStore', label: 'Photo storage', x: 2, y: 0 },
    { id: 'worker', type: 'worker', label: 'Thumbnail worker', x: 2, y: 1 },
  ],
  edges: [
    { id: 'phone-cdn', from: 'phone', to: 'cdn', kind: 'sync' },
    { id: 'cdn-store', from: 'cdn', to: 'store', kind: 'sync' },
    { id: 'store-worker', from: 'store', to: 'worker', kind: 'async', label: 'new photo' },
  ],
  steps: [
    {
      caption: 'A feed shows 20 photos. Sent as 1 MB originals, every feed load moves about 20 MB to the phone (illustrative sizes), all of it billed.',
      flow: ['phone-cdn', 'cdn-store', '<cdn-store', '<phone-cdn'],
      notes: [{ target: 'phone', text: '20 MB a feed', tone: 'alert' }],
    },
    {
      caption:
        'A **Thumbnail worker** makes a 50 KB copy of each new photo, once. Feeds load those, about 1 MB per feed: a twentieth of the bytes and of the transfer bill, and faster pages too.',
      flow: ['store-worker', '<store-worker', 'phone-cdn', 'cdn-store', '<cdn-store', '<phone-cdn'],
      notes: [
        { target: 'worker', text: '1 MB → 50 KB' },
        { target: 'phone', text: '1 MB a feed', tone: 'signal' },
      ],
    },
  ],
};

const lesson: Lesson = {
  id: 'cost-awareness',
  module: 'm7',
  order: 5,
  title: 'Cost awareness',
  idea: 'Compute is billed by the hour, storage by the gigabyte-month and data transfer by the gigabyte, so knowing their rough relative costs lets you design for the bill as well as for the load.',
  minutes: 14,
  prerequisites: ['back-of-the-envelope', 'storage-types'],
  outcomes: [
    'Estimate a rough monthly bill from machine hours, gigabytes stored and gigabytes sent out, using public list prices.',
    'Explain why sending and storing photos, not servers, dominate the bill for a photo app.',
    'Cut costs with a content delivery network (CDN), thumbnails and colder storage classes, and say what each saving gives up.',
  ],
  analogy: {
    title: 'A phone plan with three meters',
    body: 'A phone plan bills calls by the minute, data by the gigabyte, and roaming abroad at a much higher rate. The same hour on your phone can cost almost nothing or a small fortune, depending on what you did and where.\n\nPeople who never read the bill get surprised by roaming. People who know the meters change habits: they download films on hotel wifi and keep calls short. A cloud bill works the same way.',
  },
  whyItMatters:
    'Snapgram has about 100 million daily users in three regions, and its monthly cloud bill has grown faster than its users. The founders ask a simple question: where does the money go? The engineers guess servers, because servers are what they think about every day.\n\nThe bill says otherwise. The biggest line is sending photos to phones, the second is storing photos, many of them years old and never opened, and servers come third. Nobody chose this split; it followed from decisions made when the bill was small.',
  body: [
    {
      kind: 'prose',
      md: 'Cloud bills have hundreds of lines, but three meters cover most of the money:\n\n- **Compute**: virtual machines, billed by the hour or second while they run, busy or idle.\n- **Storage**: [[object storage|object-storage]] and disks, billed per gigabyte per month for as long as the data exists, at a price set by its [[storage class|storage-class]].\n- **Data transfer**: free coming in, but billed per gigabyte going out to the internet, called [[egress|egress]], and between regions.',
    },
    {
      kind: 'numbers',
      items: [
        { label: 'One general-purpose machine, 4 virtual processors and 16 GiB of memory', value: '≈ $0.20 an hour', note: 'About $147 a month' },
        { label: 'Standard object storage', value: '$0.023 per GB-month', note: '$0.021 above 500 TB' },
        { label: 'Colder storage (Glacier Instant Retrieval)', value: '$0.004 per GB-month', note: 'Plus $0.03 per GB read back' },
        { label: 'Transfer out to the internet', value: '$0.09 per GB', note: '$0.05 above 150 TB a month' },
        { label: 'Transfer out through a CDN', value: '$0.085 per GB', note: '$0.02 above 5 PB (petabytes) a month' },
        { label: 'Transfer between regions', value: '$0.02 per GB', note: 'Oregon to Singapore' },
        { label: 'Transfer in from the internet', value: 'Free' },
      ],
      caption:
        'List prices for the Oregon region from the public Amazon Web Services (AWS) price pages for [Amazon S3](https://aws.amazon.com/s3/pricing/), [Amazon EC2](https://aws.amazon.com/ec2/pricing/on-demand/), which also covers data transfer, and [Amazon CloudFront](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/), checked in November 2026. Ballpark only: prices change, vary by region and provider, and shrink with discounts.',
    },
    {
      kind: 'prose',
      md: 'Two ratios are worth remembering. Sending a gigabyte to the internet costs about as much as storing it for two to four months, and one machine running all month costs about as much as storing 6 TB.',
    },
    {
      kind: 'diagram',
      title: 'Where Snapgram’s money goes',
      caption: 'The three meters on Snapgram’s design. Step through each line of the bill.',
      spec: meters,
    },
    { kind: 'heading', text: 'Designing with the meters in mind' },
    {
      kind: 'prose',
      md: 'For each design choice, ask which meter it runs up:\n\n- **Send fewer bytes.** Resize and compress images, and serve repeat views from a [[CDN|cdn]], because ==every byte sent out is billed==.\n- **Keep data in the right class.** Move old photos to colder storage, and delete data past its [[retention|data-retention]] period.\n- **Pay only for compute you use.** [[Autoscaling|autoscaling]] removes idle servers at night, and [[rightsizing|rightsizing]] moves servers at low [[utilization|utilization]] to smaller machines.\n- **Keep traffic close.** Calls between regions are billed and slow, so keep chatty services in one region.',
    },
    {
      kind: 'diagram',
      title: 'Thumbnails shrink the transfer bill',
      caption: 'One design choice that cuts a meter.',
      spec: thumbnails,
    },
    {
      kind: 'prose',
      md: 'Compute has discounts of its own. A [[committed-use discount|committed-use-discount]] lowers the hourly price in exchange for a one- or three-year promise, and [[spot instances|spot-instance]] are spare machines sold cheaply that the provider can take back at short notice. Commit for the steady base load, pay [[on-demand|on-demand-pricing]] prices for the peaks, and use spot for work that can restart.',
    },
    {
      kind: 'prose',
      md: 'Watch the cost per unit of work, such as dollars per thousand daily users, not only the total: if it falls as you grow, the design is getting more efficient. That is [[unit economics|unit-economics]]. In an interview, one line of [[back-of-the-envelope|back-of-the-envelope]] math is enough: 400 TB of new photos a year at about $0.02 per GB-month adds about $8,000 to the monthly bill, every year.',
    },
    {
      kind: 'callout',
      tone: 'simplification',
      md: 'Real bills have many more lines: per-request fees (small for 1 MB photos, but they add up for tiny files), managed databases, load balancers, logs, support and taxes. Prices differ by region and provider, and big customers negotiate discounts, so treat every number here as a ballpark ratio, not a quote.',
    },
  ],
  tryIt: [
    {
      kind: 'prose',
      md: 'Start with the plain design: no CDN, every photo in standard storage, one region. Transfer out is about 70% of the bill. Turn on each design choice and watch which bars move, then drag the share of old-photo views until colder storage stops paying off.',
    },
    {
      kind: 'widget',
      id: 'cost-bars',
      title: 'Snapgram’s monthly bill, line by line',
      caption:
        'An illustrative slice of Snapgram, one million of its daily users, from the estimate in [Back-of-the-envelope estimation](lesson:back-of-the-envelope): about 2 PB of photos, 80% of them over a year old, and about 2.6 PB sent out a month. Bars show relative sizes at the list prices above, not a real bill.',
      props: { cold: false, cdn: false, secondRegion: false, oldViews: 5 },
    },
  ],
  tradeoffs: {
    caption: 'Ways to cut the bill, and what each one costs you.',
    rows: [
      {
        option: 'Colder storage classes',
        goodAt: 'Cut the cost of keeping old data to a fraction.',
        badAt: 'Reads cost extra, and data is billed for a minimum time, 30 to 180 days depending on the class.',
        pickWhen: 'Data is rarely read once it ages, such as old photos and backups.',
      },
      {
        option: 'A CDN in front of storage',
        goodAt: 'Lower per-gigabyte prices at volume, free fetches from the same cloud, and faster pages.',
        badAt: 'Per-request fees and one more service to configure.',
        pickWhen: 'The same files are served many times to users far apart.',
      },
      {
        option: 'Commitments and spot machines',
        goodAt: 'Much lower hourly prices.',
        badAt: 'Commitments lock you in for years; spot machines can vanish at short notice.',
        pickWhen: 'Base load is steady, or the work can restart safely.',
      },
      {
        option: 'Running your own hardware',
        goodAt: 'Can be cheaper per unit at huge, steady scale, with full control.',
        badAt: 'Large upfront cost, years of engineering, and every failure is yours.',
        pickWhen: 'The workload is enormous, predictable and central to the product, as storage was for Dropbox.',
      },
    ],
  },
  realWorld: {
    title: 'Dropbox moves its storage off Amazon',
    body: 'In 2016, Dropbox described Magic Pocket, the storage system it built to keep users’ files in its own data centers. Before it, Dropbox ran its metadata and web servers itself but stored file contents on Amazon. The project became a major effort in 2013, launched in 2015, and by October 2015 Dropbox stored and served over 90% of its users’ data on its own infrastructure. The post puts that data at 500 PB.\n\nThe post names performance and "better unit economics" as reasons: at that size, Dropbox could tune hardware and software to one huge workload. It also says Dropbox would keep using AWS where that made sense, such as storing data in Germany for European business customers who asked for it. The lesson is the trade-off: years of engineering, which only a very large, steady workload can justify.',
    sourceUrl: 'https://dropbox.tech/infrastructure/magic-pocket-infrastructure',
    sourceLabel: 'Akhil Gupta, “Scaling to exabytes and beyond,” Dropbox Tech blog, March 2016',
  },
  interview: {
    whenToMention:
      'After the high-level design, when you discuss storage, bandwidth or a second region, or when the interviewer asks how to make the design cheaper. One or two sentences per decision is enough.',
    sayItLikeThis: [
      'Egress will dominate this bill: 2.6 PB a month at even a few cents per gigabyte costs far more than our servers, so photos go through a CDN.',
      'Photos older than a year are rarely viewed, so a lifecycle rule moves them to a colder class at about a sixth of the price.',
      'The disaster recovery copy in the second region can use a colder class too, since it is only read in a disaster.',
    ],
    followUps: [
      {
        q: 'Why not move every photo to the cheapest archive class?',
        a: 'Colder classes are cheap to keep but charge each time you read, and some of the coldest are not designed for instant reads. New photos are read constantly, so they would pay that fee on nearly every view. Cold classes fit data that is rarely read, such as old photos and backups.',
      },
      {
        q: 'Does a CDN always save money?',
        a: 'Not always. It swaps origin transfer for the CDN’s own per-gigabyte and per-request fees, which pays off when the same files are served many times at volume. For tiny or rarely repeated files, request fees can eat the saving, though the speed benefit remains.',
      },
      {
        q: 'How would you estimate the monthly bill for a design?',
        a: 'Multiply each meter by a ballpark price: machines × hours × hourly price, gigabytes stored × price per GB-month, and gigabytes sent out × price per GB. Then compare the lines rather than the total, because the biggest line shows where design changes pay off.',
      },
    ],
    redFlags: [
      'Ignoring data transfer, as if only servers cost money.',
      'Adding a full copy in a second region without saying it roughly doubles storage costs.',
      'Quoting exact prices as facts instead of ballpark ratios.',
    ],
  },
  mistakes: [
    '**Counting only servers.** For media apps, transfer and storage are often far bigger, so tuning code first saves the least.',
    '**Keeping everything hot forever.** Old photos and logs in the standard class cost several times what a colder class would.',
    '**Moving busy data to a cold class.** Retrieval fees on data that is read often can exceed the storage saved.',
    '**Leaving idle machines running.** Test environments and oversized servers bill every hour, used or not.',
  ],
  quiz: [
    {
      kind: 'numeric',
      prompt: 'Snapgram adds 400 TB of photos a year. At about $0.02 per GB-month, roughly how much does one year of photos add to the monthly bill?',
      answer: 8000,
      unit: 'dollars a month',
      tolerance: 1.2,
      solution: [
        '400 TB is 400,000 GB.',
        '400,000 × $0.02 = $8,000 a month.',
        'It is paid every month after that, so five years of photos cost about $40,000 a month.',
      ],
    },
    {
      kind: 'single',
      prompt: 'In the widget’s plain design, which line is the biggest?',
      options: [
        {
          text: 'Transfer out',
          correct: true,
          why: 'About 2.6 PB a month leaves the cloud, and even at $0.05 per GB that is about $130,000, far more than anything else.',
        },
        {
          text: 'Compute',
          correct: false,
          why: 'A hundred machines at about $147 a month come to about $15,000, under a tenth of the bill.',
        },
        {
          text: 'Standard storage',
          correct: false,
          why: 'Storing 2 PB costs about $43,000 a month: large, but about a third of the transfer line.',
        },
        {
          text: 'Reads from colder storage',
          correct: false,
          why: 'Colder storage is off in the plain design, so there is nothing to read back.',
        },
      ],
    },
    {
      kind: 'multi',
      prompt: 'Which changes cut Snapgram’s bill without making photos load more slowly?',
      options: [
        {
          text: 'Serving photos through a CDN',
          correct: true,
          why: 'CDN prices fall below direct transfer at volume, and nearby edges make photos faster.',
        },
        {
          text: 'Sending feed thumbnails instead of originals',
          correct: true,
          why: 'Fewer bytes per feed cuts transfer, and smaller files load faster.',
        },
        {
          text: 'Moving every photo, new ones included, to colder storage',
          correct: false,
          why: 'New photos are read constantly, so retrieval fees on every view would outweigh the storage saved.',
        },
        {
          text: 'Copying all photos to a second region',
          correct: false,
          why: 'That adds cost: transfer between regions plus a second copy to store. It buys disaster recovery, not savings.',
        },
      ],
    },
    {
      kind: 'single',
      prompt:
        'Colder storage saves about $0.017 per GB-month, but each GB read back costs $0.03. A set of old photos is read back about once a month. Should it move?',
      options: [
        {
          text: 'No: one read a month costs $0.03 per GB, more than the $0.017 saved',
          correct: true,
          why: 'Colder storage pays only for data read less than about once every two months.',
        },
        {
          text: 'Yes: colder storage is always cheaper',
          correct: false,
          why: 'Only keeping data there is cheaper; reads add a fee that can outweigh the saving.',
        },
        {
          text: 'It depends only on the photo size',
          correct: false,
          why: 'The saving and the fee are both per gigabyte, so size scales them equally; how often data is read decides.',
        },
        {
          text: 'No: colder storage cannot hold photos',
          correct: false,
          why: 'Colder classes store any file; the question is price, not ability.',
        },
      ],
    },
    {
      kind: 'order',
      prompt: 'Order these from cheapest to most expensive per gigabyte, using this lesson’s list prices.',
      items: ['Transfer in from the internet', 'A month in colder storage', 'Transfer between regions', 'A month in standard storage', 'Transfer out to the internet'],
      why: 'Inbound transfer is free, colder storage is $0.004 per GB-month, transfer between regions $0.02, standard storage about $0.023 and transfer out $0.05 to $0.09. Data leaving the cloud carries the highest price per gigabyte.',
    },
  ],
  takeaways: [
    'Compute is billed by the hour, storage by the gigabyte-month and data transfer by the gigabyte going out, and their rough ratios guide design.',
    'For a photo app like Snapgram, sending and storing photos cost far more than the servers, so CDNs, thumbnails and colder storage save the most.',
    'Every saving costs something, such as retrieval fees, commitments or engineering time, so estimate both sides with ballpark prices before you choose.',
  ],
  deeper: [
    {
      kind: 'prose',
      md: '**Traffic between zones.** Inside one region, traffic between [[availability zones|availability-zone]] is often billed per gigabyte too, so a chatty service spread across zones pays on every call. Keeping tightly coupled services in one zone saves money but gives up some resilience.',
    },
    {
      kind: 'prose',
      md: '**Showback.** Large teams tag every resource with the team that owns it and show each team its share of the bill. Teams that see their own costs can act on them, which is the idea behind the practice called FinOps.',
    },
    {
      kind: 'prose',
      md: '**Reading a price page.** Look for the unit (per hour, per GB-month, per GB, per 10,000 requests), the volume tiers, the free allowances and the minimums, such as the 30 to 180 days some colder classes bill even if you delete early. Many bill surprises come from a unit nobody noticed rather than from the headline price.',
    },
  ],
  flashcards: [
    { front: 'What are the three main meters on a cloud bill?', back: 'Compute by the hour, storage by the gigabyte-month, and data transfer by the gigabyte, mostly going out.' },
    {
      front: 'How do egress and storage prices compare?',
      back: 'Sending a gigabyte to the internet costs about as much as storing it in standard storage for two to four months (list prices, ballpark).',
    },
    { front: 'When does colder storage stop saving money?', back: 'When data is read often: each read pays a retrieval fee, which can exceed the storage saved.' },
    {
      front: 'How does a CDN lower the transfer bill?',
      back: 'Fetches from the same cloud’s storage are free, and the CDN’s per-gigabyte prices fall below direct transfer at volume; pages get faster too.',
    },
    { front: 'What is unit economics?', back: 'Cost per unit of work, such as per thousand daily users, used to check whether a design gets more efficient as it grows.' },
    { front: 'What does a second region add to the bill?', back: 'Transfer between regions for every gigabyte copied, plus storing everything a second time.' },
  ],
  related: ['back-of-the-envelope', 'storage-types', 'cdns', 'caching', 'multi-region-dr', 'vertical-vs-horizontal-scaling', 'estimation-in-the-room'],
  glossaryTerms: [
    'object-storage',
    'storage-class',
    'egress',
    'origin-server',
    'lifecycle-rule',
    'retrieval-fee',
    'disaster-recovery',
    'cdn',
    'data-retention',
    'autoscaling',
    'rightsizing',
    'utilization',
    'committed-use-discount',
    'spot-instance',
    'on-demand-pricing',
    'unit-economics',
    'back-of-the-envelope',
    'availability-zone',
  ],
};

export default lesson;
