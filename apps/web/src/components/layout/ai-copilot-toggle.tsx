import { Bot } from 'lucide-react'
import { useCopilotStore } from '../../stores/copilot-store.js'

/**
 * 全局浮动按钮
 *
 * 仅作为小销助手的"开启入口"。小助手打开后，按钮自动隐藏，关闭入口由助手面板顶部的 X 按钮承担。
 */
export default function AiCopilotToggle() {
  const visible = useCopilotStore((state) => state.visible)
  const show = useCopilotStore((state) => state.show)

  if (visible) return null

  return (
    <button
      type="button"
      onClick={show}
      title="打开小销助手"
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <Bot size={20} />
    </button>
  )
}