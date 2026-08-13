import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CopilotStore {
  visible: boolean
  toggle: () => void
  show: () => void
  hide: () => void
}

export const useCopilotStore = create<CopilotStore>()(
  persist(
    (set) => ({
      visible: true,
      toggle: () => set((state) => ({ visible: !state.visible })),
      show: () => set({ visible: true }),
      hide: () => set({ visible: false }),
    }),
    {
      name: 'ai-sales-copilot-visible',
    },
  ),
)
