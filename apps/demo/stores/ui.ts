import { create } from 'zustand'

interface UiState {
  treeSidebarVisible: boolean
  debugPanelVisible: boolean
  selectedRootQuestionId: string | null
  selectedMessageId: string | null

  toggleTreeSidebar: () => void
  toggleDebugPanel: () => void
  selectRootQuestion: (id: string | null) => void
  selectMessage: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  treeSidebarVisible: true,
  debugPanelVisible: false,
  selectedRootQuestionId: null,
  selectedMessageId: null,

  toggleTreeSidebar: () => set((s) => ({ treeSidebarVisible: !s.treeSidebarVisible })),
  toggleDebugPanel: () => set((s) => ({ debugPanelVisible: !s.debugPanelVisible })),
  selectRootQuestion: (id) => set({ selectedRootQuestionId: id }),
  selectMessage: (id) => set({ selectedMessageId: id, debugPanelVisible: id !== null }),
}))
