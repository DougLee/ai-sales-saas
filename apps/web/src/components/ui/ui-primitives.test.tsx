import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Upload } from 'lucide-react'
import { PageHeader } from './page-header.js'
import { SectionCard } from './section-card.js'
import { KpiTile } from './kpi-tile.js'
import { StatusPill } from './status-pill.js'
import { EmptyBlock } from './empty-block.js'
import { SkeletonRow } from './skeleton-row.js'
import { EmptyState } from './states.js'
import { cssColor, funnelSegmentOfMilestone } from './tokens.js'

describe('ui 组件库冒烟（render 不炸 + 关键交互）', () => {
  it('PageHeader 四槽渲染', () => {
    render(
      <PageHeader
        title="数据报表"
        subtitle="销售漏斗与团队绩效分析"
        badge={<StatusPill tone="urgency-high">3 条已逾期</StatusPill>}
        actions={<button>主行动</button>}
      >
        <div>筛选区</div>
      </PageHeader>,
    )
    expect(screen.getByRole('heading', { level: 1, name: '数据报表' })).toBeTruthy()
    expect(screen.getByText('3 条已逾期')).toBeTruthy()
    expect(screen.getByText('销售漏斗与团队绩效分析')).toBeTruthy()
    expect(screen.getByText('筛选区')).toBeTruthy()
  })

  it('SectionCard 标题/操作位/内容渲染', () => {
    render(
      <SectionCard title="商机里程碑分布" description="按阶段统计" actions={<span>共 9 段</span>} icon={Upload}>
        <div>图表内容</div>
      </SectionCard>,
    )
    expect(screen.getByText('商机里程碑分布')).toBeTruthy()
    expect(screen.getByText('图表内容')).toBeTruthy()
  })

  it('KpiTile：值 + 环比 + 可点', () => {
    const onClick = vi.fn()
    render(<KpiTile label="活跃商机" value={12} delta={8} deltaLabel="较上周" tone="funnel-negotiate" onClick={onClick} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('↑ 8%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('KpiTile：loading 走骨架不渲染值', () => {
    render(<KpiTile label="活跃商机" value={12} loading />)
    expect(screen.queryByText('12')).toBeNull()
  })

  it('StatusPill 全语义档渲染', () => {
    const tones = [
      'primary', 'success', 'warning', 'danger', 'info', 'neutral',
      'funnel-nurture', 'funnel-negotiate', 'funnel-close',
      'level-manual', 'level-single', 'level-cross', 'level-final',
      'urgency-high', 'urgency-mid', 'urgency-low',
    ] as const
    for (const tone of tones) {
      const { unmount } = render(<StatusPill tone={tone} dot>{tone}</StatusPill>)
      expect(screen.getByText(tone)).toBeTruthy()
      unmount()
    }
  })

  it('EmptyBlock：一行折叠，点击展开', () => {
    render(<EmptyBlock title="其余战线" description="8 个客户今日无紧迫动作" />)
    expect(screen.queryByText('8 个客户今日无紧迫动作')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('8 个客户今日无紧迫动作')).toBeTruthy()
  })

  it('SkeletonRow 渲染指定行数', () => {
    const { container } = render(<SkeletonRow rows={3} />)
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3)
  })

  it('EmptyState compact 档渲染', () => {
    render(<EmptyState title="暂无预警" compact />)
    expect(screen.getByText('暂无预警')).toBeTruthy()
  })

  it('tokens：里程碑 → 漏斗三段判定', () => {
    expect(funnelSegmentOfMilestone(0)).toBe('nurture')
    expect(funnelSegmentOfMilestone(3)).toBe('nurture')
    expect(funnelSegmentOfMilestone(4)).toBe('negotiate')
    expect(funnelSegmentOfMilestone(6)).toBe('negotiate')
    expect(funnelSegmentOfMilestone(7)).toBe('close')
    expect(funnelSegmentOfMilestone(8)).toBe('close')
  })

  it('tokens：cssColor 在无值变量上返回空串（不炸）', () => {
    expect(cssColor('--color-not-exist')).toBe('')
  })
})
