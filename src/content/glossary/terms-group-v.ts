import type { RawTerm } from '../types';

/** New glossary terms from lesson group V (lessons 7.4 and 7.5). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  // 7.4 Multi-region and disaster recovery
  {
    id: 'disaster-recovery',
    term: 'Disaster recovery',
    aka: ['DR'],
    definition: 'Plans and copies for restoring a system after a large failure, such as losing a region, within agreed limits on lost data and downtime.',
    example: 'Snapgram’s plan moves Oregon’s users to Singapore within 15 minutes if Oregon goes down.',
  },
  {
    id: 'recovery-point-objective',
    term: 'Recovery point objective',
    aka: ['RPO'],
    definition: 'The most recent data you can afford to lose in a disaster, measured in time, such as the last minute of writes.',
    example: 'Likes have an RPO of a few minutes; boost credits have an RPO of zero.',
  },
  {
    id: 'recovery-time-objective',
    term: 'Recovery time objective',
    aka: ['RTO'],
    definition: 'How long a system may be down after a disaster before it must be serving users again.',
    example: 'Snapgram’s main app has an RTO of 15 minutes; analytics can wait a day.',
  },
  {
    id: 'active-passive',
    term: 'Active-passive',
    aka: ['active-standby', 'primary-standby'],
    definition: 'A setup where one copy of a system serves all traffic while another waits, ready to take over if the first fails.',
    example: 'Oregon serves everyone while Singapore holds replicated data and waits for a failover.',
  },
  {
    id: 'active-active',
    term: 'Active-active',
    aka: ['multi-site active-active'],
    definition: 'A setup where several copies of a system, often in different regions, all serve users at the same time and cover for each other.',
    example: 'Oregon and Singapore both serve their nearby users every day, each ready to take the other’s.',
  },
  {
    id: 'home-region',
    term: 'Home region',
    definition: 'The one region that stores a given user’s data and accepts its writes, chosen by location or by law.',
    example: 'A user in Berlin has Frankfurt as her home region.',
  },
  {
    id: 'pilot-light',
    term: 'Pilot light',
    definition: 'A disaster recovery setup that keeps data replicated in a second region but leaves its app servers off until a disaster.',
    example: 'The databases in the second region stay current, and app servers start only if the first region fails.',
  },
  {
    id: 'warm-standby',
    term: 'Warm standby',
    definition: 'A disaster recovery setup with a small but working copy of the whole system in a second region, scaled up when needed.',
    example: 'A few app servers run in Singapore all the time and grow to full size during a failover.',
  },
  {
    id: 'point-in-time-recovery',
    term: 'Point-in-time recovery',
    definition: 'Restoring a database to its exact state at a chosen moment, using a snapshot plus the log of changes made after it.',
    example: 'Snapgram restores the comments table to one minute before a faulty migration ran.',
  },
  {
    id: 'game-day',
    term: 'Game day',
    aka: ['disaster recovery drill', 'DR drill'],
    definition: 'A planned exercise in which a team deliberately causes a failure, such as losing a region, to test its recovery plan and tools.',
    example: 'Once a quarter, Snapgram moves all of Oregon’s traffic to Singapore during working hours.',
  },

  // 7.5 Cost awareness
  {
    id: 'egress',
    term: 'Egress',
    aka: ['data transfer out', 'egress fees'],
    definition: 'Data leaving a cloud provider’s network, such as files sent to users on the internet, usually billed per gigabyte.',
    example: 'Every photo view sends about 1 MB of egress from Snapgram to a phone.',
  },
  {
    id: 'storage-class',
    term: 'Storage class',
    aka: ['storage tier', 'hot storage', 'cold storage'],
    definition: 'A price and speed level in a storage service: hotter classes cost more to keep but little to read, colder ones the reverse.',
    example: 'New photos use the standard class; photos over a year old move to a colder one.',
  },
  {
    id: 'lifecycle-rule',
    term: 'Lifecycle rule',
    aka: ['lifecycle policy'],
    definition: 'A storage setting that automatically moves objects to another storage class, or deletes them, once they reach a given age.',
    example: 'Snapgram’s rule moves photos to colder storage 365 days after upload.',
  },
  {
    id: 'retrieval-fee',
    term: 'Retrieval fee',
    definition: 'A per-gigabyte charge for reading data back from a colder storage class, on top of its low monthly storage price.',
    example: 'Reading an old photo back from colder storage costs $0.03 per GB at list price.',
  },
  {
    id: 'rightsizing',
    term: 'Rightsizing',
    definition: 'Matching each machine’s size to the work it actually does, so you stop paying for capacity that sits idle.',
    example: 'A server that is busy only 10% of the time moves to a smaller, cheaper machine.',
  },
  {
    id: 'on-demand-pricing',
    term: 'On-demand pricing',
    aka: ['pay as you go'],
    definition: 'Paying the full list price for cloud capacity by the hour or second, with no commitment and the freedom to stop any time.',
    example: 'Extra app servers for Saturday evening run on demand and are switched off afterwards.',
  },
  {
    id: 'committed-use-discount',
    term: 'Committed-use discount',
    aka: ['reserved instance', 'savings plan'],
    definition: 'A lower price for cloud capacity in exchange for promising to use a set amount of it for one or three years.',
    example: 'Snapgram commits to the servers it always runs, its steady base load.',
  },
  {
    id: 'spot-instance',
    term: 'Spot instance',
    aka: ['spot capacity', 'preemptible machine'],
    definition: 'Spare cloud capacity sold at a deep discount that the provider can take back at short notice.',
    example: 'Rebuilding old thumbnails runs on spot machines and restarts if one is taken back.',
  },
  {
    id: 'unit-economics',
    term: 'Unit economics',
    aka: ['cost per user', 'unit cost'],
    definition: 'What it costs to serve one unit of work, such as one user or a thousand requests, tracked to see if efficiency improves with growth.',
    example: 'Snapgram tracks its cloud cost per thousand daily users every month.',
  },
];
