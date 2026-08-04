// Hard cap on slides per deck (design.md Key Decisions: "generous for any deck
// use case seen so far, cheap to raise later"). Both the outline-proposal
// prompt (outline.ts) and the outline/approve route validate against this.
export const MAX_DECK_SLIDES = 15
