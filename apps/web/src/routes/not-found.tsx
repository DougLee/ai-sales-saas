import { Link } from 'react-router-dom'
import { Compass, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted text-primary">
        <Compass size={32} />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-text-primary">页面不存在</h2>
        <p className="mt-1 text-sm text-text-secondary">您访问的地址不存在或已被移除</p>
      </div>
      <Link
        to="/"
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
      >
        <Home size={14} /> 返回工作台
      </Link>
    </div>
  )
}
