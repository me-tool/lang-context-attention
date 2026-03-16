import { create } from 'zustand'
import type { RoutingDecision } from '@llm-context/core'

interface DebugState {
  currentRoutingDecision: RoutingDecision | null
  expandedSections: Set<string>

  loadRoutingDecision: (messageId: string) => Promise<void>
  toggleSection: (section: string) => void
}

export const useDebugStore = create<DebugState>((set, get) => ({
  currentRoutingDecision: null,
  expandedSections: new Set(['retrieval', 'judgment']),

  loadRoutingDecision: async (messageId: string) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/routing`)
      if (!res.ok) {
        set({ currentRoutingDecision: null })
        return
      }
      const decision = await res.json()
      set({ currentRoutingDecision: decision })
    } catch {
      set({ currentRoutingDecision: null })
    }
  },

  toggleSection: (section: string) => {
    const current = get().expandedSections
    const next = new Set(current)
    if (next.has(section)) {
      next.delete(section)
    } else {
      next.add(section)
    }
    set({ expandedSections: next })
  },
}))
