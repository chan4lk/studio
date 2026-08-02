'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FilePlus2 } from 'lucide-react'

// Suppressed on /brief (nothing to float over) and /choose-team (renders
// inside this same AppShell layout, but /brief isn't reachable until a team
// is resolved). z-30 keeps it below the mobile sidebar overlay's z-50, so
// opening the sidebar naturally covers it with no extra state to track.
const SUPPRESSED_PATHS = ['/brief', '/choose-team']

export function NewPostFab() {
  const pathname = usePathname()
  if (SUPPRESSED_PATHS.includes(pathname)) return null

  return (
    <Link
      href="/brief"
      aria-label="Start a new post"
      title="Start a new post"
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full
        glass-panel shadow-lg text-primary dark:text-primary-light
        hover:bg-primary/10 dark:hover:bg-primary-light/10 transition-colors"
    >
      <FilePlus2 size={18} />
      <span className="hidden sm:inline text-sm font-medium">New post</span>
    </Link>
  )
}
