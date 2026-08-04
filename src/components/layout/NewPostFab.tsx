'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { FilePlus2, Presentation } from 'lucide-react'
import { cn } from '@/lib/utils'

// Suppressed on /brief and /deck-brief (nothing to float over — each is its
// own creation flow) and /choose-team (renders inside this same AppShell
// layout, but neither flow is reachable until a team is resolved). z-30 keeps
// it below the mobile sidebar overlay's z-50, so opening the sidebar
// naturally covers it with no extra state to track.
const SUPPRESSED_PATHS = ['/brief', '/deck-brief', '/choose-team']

export function NewPostFab() {
  const pathname = usePathname()
  if (SUPPRESSED_PATHS.includes(pathname)) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Create new"
          title="Create new"
          className="fixed bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-3 rounded-full
            glass-panel shadow-lg text-primary dark:text-primary-light
            hover:bg-primary/10 dark:hover:bg-primary-light/10 transition-colors"
        >
          <FilePlus2 size={18} />
          <span className="hidden sm:inline text-sm font-medium">New</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="top"
          sideOffset={10}
          className={cn(
            'z-50 min-w-52',
            'glass-popover rounded-xl p-1.5',
            'data-[state=open]:animate-fade-in',
          )}
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/brief"
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none',
                'text-light-text dark:text-dark-text',
                'hover:bg-primary/10 dark:hover:bg-primary-light/10',
                'focus:bg-primary/10 dark:focus:bg-primary-light/10',
              )}
            >
              <FilePlus2 size={16} className="flex-shrink-0" />
              <span>New post</span>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/deck-brief"
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer outline-none',
                'text-light-text dark:text-dark-text',
                'hover:bg-primary/10 dark:hover:bg-primary-light/10',
                'focus:bg-primary/10 dark:focus:bg-primary-light/10',
              )}
            >
              <Presentation size={16} className="flex-shrink-0" />
              <span>New Slide Deck</span>
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
