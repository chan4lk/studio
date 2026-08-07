// Pure merge+paginate layer for GET /api/library (deck-library-consolidation,
// design.md Key Decision 1). Standalone posts and decks are two independently
// -sorted (createdAt desc) result sets from different tables; there is no
// DB-level UNION across their differently-shaped rows, so the route fetches
// up to `page * pageSize` rows from EACH source and this function does the
// merge + page slice in application code.
//
// Correctness at a page boundary requires each input array to already cover
// every item that could land on or before the requested page — i.e. the
// caller must fetch at least `page * pageSize` rows (or its whole result set,
// if smaller) per source, sorted createdAt desc. This function does no I/O
// and knows nothing about pages beyond the one requested; it only merges and
// slices what it is given.

export interface MergeableLibraryItem {
  type: 'post' | 'deck'
  createdAt: Date
}

/**
 * Merges two createdAt-desc-sorted arrays into one createdAt-desc-sorted
 * array and returns the slice for the requested page.
 *
 * On a createdAt tie, `posts` items sort before `decks` items — an arbitrary
 * but deterministic and stable tie-break (neither input is reordered
 * relative to itself).
 */
export function mergeLibraryItems<A extends MergeableLibraryItem, B extends MergeableLibraryItem>(
  posts: A[],
  decks: B[],
  page: number,
  pageSize: number,
): (A | B)[] {
  const merged: (A | B)[] = []
  let i = 0
  let j = 0

  while (i < posts.length && j < decks.length) {
    if (posts[i].createdAt.getTime() >= decks[j].createdAt.getTime()) {
      merged.push(posts[i])
      i++
    } else {
      merged.push(decks[j])
      j++
    }
  }
  while (i < posts.length) merged.push(posts[i++])
  while (j < decks.length) merged.push(decks[j++])

  const start = (page - 1) * pageSize
  return merged.slice(start, start + pageSize)
}
