import type { RawTerm } from '../types';

/** New glossary terms from lesson group T (lessons 6.7 and 6.8). See AUTHORING.md. */
export const groupTerms: RawTerm[] = [
  {
    id: 'latitude-and-longitude',
    term: 'Latitude and longitude',
    aka: ['lat/lon', 'coordinates'],
    definition: 'Two angles that pin down any place on Earth: latitude runs from −90 (south) to 90 (north), longitude from −180 (west) to 180 (east).',
    example: 'Marina Bay in Singapore is at about latitude 1.28, longitude 103.86.',
  },
  {
    id: 'bounding-box',
    term: 'Bounding box',
    definition: 'The smallest rectangle, given by minimum and maximum latitude and longitude, that contains a shape; a cheap first filter before exact checks.',
    example: 'The bounding box of a 1 km circle around Maya is about 2 km on each side.',
  },
  {
    id: 'range-query',
    term: 'Range query',
    definition: 'A query for every row whose value falls between two bounds, which a sorted index answers by reading one stretch of entries.',
    example: 'All photos with a latitude between 1.2744 and 1.2924.',
  },
  {
    id: 'geospatial-index',
    term: 'Geospatial index',
    aka: ['spatial index', 'geo index'],
    definition: 'An index built for locations, so a query such as “everything within a kilometer” reads a few map cells instead of every row.',
    example: 'Snapgram’s geospatial index finds photos near Maya by reading a handful of cells.',
  },
  {
    id: 'geohash',
    term: 'Geohash',
    definition: 'A short string naming a map rectangle, made by halving longitude and latitude in turn; each extra character names a smaller cell inside it.',
    example: 'w21z73 is a cell about 1.2 km wide and 610 m tall near Marina Bay.',
  },
  {
    id: 'haversine-formula',
    term: 'Haversine formula',
    definition: 'The standard formula for the distance between two points on a sphere, given their latitudes and longitudes.',
    example: 'Snapgram uses it to drop candidate photos more than 1 km from Maya.',
  },
  {
    id: 'quadtree',
    term: 'Quadtree',
    definition: 'A tree that splits a square into four quarters once it holds too many points, so crowded areas get smaller cells than empty ones.',
    example: 'Downtown Singapore’s cells split down to about 150 m while quiet corners stay kilometers wide.',
  },
  {
    id: 'nearest-neighbor-search',
    term: 'Nearest-neighbor search',
    aka: ['k-nearest neighbors'],
    definition: 'Finding the K points closest to a location, however far away they are, rather than every point within a fixed distance.',
    example: 'Show the 20 photos closest to Maya, even if the nearest is 3 km away.',
  },
  {
    id: 'space-filling-curve',
    term: 'Space-filling curve',
    aka: ['Z-order curve'],
    definition: 'A path that visits every cell of a grid once, turning two-dimensional positions into one sortable value while keeping most neighbors close.',
    example: 'Geohashes follow a Z-shaped curve, so cells w21z6 and w21z7 sort next to each other.',
  },
  {
    id: 'r-tree',
    term: 'R-tree',
    definition: 'A tree index that groups nearby shapes into nested bounding boxes; spatial databases such as PostGIS use it for points, lines and areas.',
    example: 'An R-tree could index the outline of every park for “photos taken in this park”.',
  },
  {
    id: 'optimistic-update',
    term: 'Optimistic update',
    definition: 'Showing a user’s change on screen at once, before the server confirms it, and fixing it up if the server disagrees.',
    example: 'Maya’s new word appears the moment she types it, while the edit is still on its way.',
  },
  {
    id: 'operational-transformation',
    term: 'Operational transformation',
    aka: ['OT'],
    definition: 'A way to merge simultaneous edits by sending each as an operation and adjusting any operation that missed another, such as shifting its position.',
    example: 'Sam’s insert at position 20 becomes position 26 on Maya’s copy, after her six new characters.',
  },
  {
    id: 'tombstone',
    term: 'Tombstone',
    definition: 'A marker kept in place of deleted data, so copies that merge later know the item was deleted rather than never added.',
    example: 'A deleted letter stays in the CRDT as a hidden tombstone, so edits that point at it still find their place.',
  },
  {
    id: 'convergence',
    term: 'Convergence',
    definition: 'The property that every copy of shared data ends up identical once all copies have received the same edits.',
    example: 'After the edits cross, Maya’s phone and Sam’s laptop show the same album description.',
  },
  {
    id: 'presence',
    term: 'Presence',
    definition: 'Live, short-lived information about who is online or active and where, such as a green dot in a chat or a cursor in a document.',
    example: 'Maya sees Sam’s named cursor at the end of the album description.',
  },
  {
    id: 'fractional-indexing',
    term: 'Fractional indexing',
    definition: 'Giving each item in a list a position number between its neighbors’ numbers, so inserting an item never renumbers the others.',
    example: 'A photo dropped between positions 0.5 and 0.75 in a shared album gets 0.625.',
  },
];
