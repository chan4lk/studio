// mergeLibraryItems: the pure merge+paginate layer for GET /api/library
// (deck-library-consolidation). No DB, no I/O — just two pre-sorted
// (createdAt desc) arrays in, one sliced+merged page out. Covers: draft-only
// page, deck-only page, a page straddling the boundary between the two
// sorted sources, empty input, and stable ordering on createdAt ties
// (design.md Risks: "pagination correctness at the two-source boundary").

import { describe, it, expect } from 'vitest'
import { mergeLibraryItems, type MergeableLibraryItem } from '@/lib/library/mergeLibraryItems'

interface TestPost extends MergeableLibraryItem {
  type: 'post'
  id: string
}

interface TestDeck extends MergeableLibraryItem {
  type: 'deck'
  id: string
}

function post(id: string, createdAt: number): TestPost {
  return { type: 'post', id, createdAt: new Date(createdAt) }
}

function deck(id: string, createdAt: number): TestDeck {
  return { type: 'deck', id, createdAt: new Date(createdAt) }
}

function ids(items: MergeableLibraryItem[]): string[] {
  return (items as (TestPost | TestDeck)[]).map((item) => item.id)
}

describe('mergeLibraryItems', () => {
  it('returns only posts when there are no decks (draft-only page)', () => {
    const posts = [post('p1', 30), post('p2', 20), post('p3', 10)]
    const result = mergeLibraryItems(posts, [], 1, 2)
    expect(ids(result)).toEqual(['p1', 'p2'])
    expect(result.every((item) => item.type === 'post')).toBe(true)
  })

  it('returns only decks when there are no posts (deck-only page)', () => {
    const decks = [deck('d1', 30), deck('d2', 20), deck('d3', 10)]
    const result = mergeLibraryItems([], decks, 1, 2)
    expect(ids(result)).toEqual(['d1', 'd2'])
    expect(result.every((item) => item.type === 'deck')).toBe(true)
  })

  it('returns an empty page for empty input', () => {
    expect(mergeLibraryItems([], [], 1, 20)).toEqual([])
  })

  it('merges interleaved sources within a single page', () => {
    // Combined desc order by createdAt: p1(10) d1(9) p2(8) d2(7) p3(6) d3(5)
    const posts = [post('p1', 10), post('p2', 8), post('p3', 6)]
    const decks = [deck('d1', 9), deck('d2', 7), deck('d3', 5)]
    const result = mergeLibraryItems(posts, decks, 1, 4)
    expect(ids(result)).toEqual(['p1', 'd1', 'p2', 'd2'])
  })

  it('does not skip or duplicate items on a page straddling the post/deck boundary', () => {
    // Combined desc order: p1(60) p2(50) p3(40) d1(30) d2(20) d3(10)
    // pageSize 2, page 2 -> items at combined indices 2..3: p3, d1 — the
    // exact boundary between the two sources, inside one page.
    const posts = [post('p1', 60), post('p2', 50), post('p3', 40)]
    const decks = [deck('d1', 30), deck('d2', 20), deck('d3', 10)]

    const page1 = mergeLibraryItems(posts, decks, 1, 2)
    const page2 = mergeLibraryItems(posts, decks, 2, 2)
    const page3 = mergeLibraryItems(posts, decks, 3, 2)

    expect(ids(page1)).toEqual(['p1', 'p2'])
    expect(ids(page2)).toEqual(['p3', 'd1'])
    expect(ids(page3)).toEqual(['d2', 'd3'])

    // No item skipped or duplicated across the full paginated sweep.
    const all = [...page1, ...page2, ...page3]
    expect(ids(all)).toEqual(['p1', 'p2', 'p3', 'd1', 'd2', 'd3'])
  })

  it('breaks createdAt ties deterministically, posts before decks', () => {
    const posts = [post('p1', 100)]
    const decks = [deck('d1', 100)]
    expect(ids(mergeLibraryItems(posts, decks, 1, 10))).toEqual(['p1', 'd1'])
  })

  it('preserves relative order within a source when multiple items tie', () => {
    const posts = [post('p1', 100), post('p2', 100)]
    const decks = [deck('d1', 100), deck('d2', 100)]
    expect(ids(mergeLibraryItems(posts, decks, 1, 10))).toEqual(['p1', 'p2', 'd1', 'd2'])
  })

  it('returns an empty array when the requested page is past the end', () => {
    const posts = [post('p1', 10)]
    const decks = [deck('d1', 5)]
    expect(mergeLibraryItems(posts, decks, 5, 10)).toEqual([])
  })
})
