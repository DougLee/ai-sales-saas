import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 全局 staleTime 缩短到 30s，与 dashboard 主动轮询频率对齐，
      // 避免删除数据后页面在 5 分钟内仍展示陈旧缓存（"今日任务残留"问题）。
      staleTime: 1000 * 30,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})
