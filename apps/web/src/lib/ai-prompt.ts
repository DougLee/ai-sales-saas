import { useCopilotStore } from '../stores/copilot-store.js'

/**
 * 统一 AI 触发入口。
 *
 * 背景：小销助手面板收起时组件整体卸载，'ai-copilot-prompt' 监听器不存在，
 * 裸 dispatch 事件会被静默丢弃（表现为"点了没反应"）。
 * 这里先展开面板，下一帧再投递 prompt，保证监听器已挂载。
 */
export function sendAiPrompt(prompt: string) {
  useCopilotStore.getState().show()
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('ai-copilot-prompt', { detail: prompt }))
  }, 0)
}
