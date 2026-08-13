/**
 * 意图识别测试用例
 * 用于评估 routeIntent 的准确率
 */

export interface IntentTestCase {
  message: string
  expectedIntent: string
  description?: string
}

export const INTENT_TEST_CASES: IntentTestCase[] = [
  // 系统帮助
  { message: '我该怎么使用这个系统', expectedIntent: 'system_help', description: '系统使用帮助' },
  { message: '这个按钮是干嘛的', expectedIntent: 'system_help', description: '功能说明' },
  { message: '怎么创建线索', expectedIntent: 'system_help', description: '操作流程' },

  // 拜访相关
  { message: '分析一下昨天的拜访录音', expectedIntent: 'visit_analysis', description: '拜访复盘' },
  { message: '帮我复盘上次见客户', expectedIntent: 'visit_analysis', description: '拜访复盘' },
  { message: '明天要去见河南科技学院，帮我准备一下', expectedIntent: 'visit_preparation', description: '拜访准备' },
  { message: '准备下周的拜访话术', expectedIntent: 'visit_preparation', description: '拜访准备' },

  // 客户背景调研
  { message: '调研一下河南科技学院', expectedIntent: 'background_research', description: '客户调研' },
  { message: '洛阳理工学院的人工智能通识课负责人是谁', expectedIntent: 'background_research', description: '联系人调研' },
  { message: '这个客户有没有AI课程', expectedIntent: 'background_research', description: '客户背景' },

  // 区域客户开发
  { message: '新乡地区有哪些高校可以做AI通识课', expectedIntent: 'territory_search', description: '区域搜索' },
  { message: '帮我推荐一些目标客户', expectedIntent: 'territory_search', description: '客户推荐' },
  { message: '我想开拓郑州市场', expectedIntent: 'territory_expansion', description: '市场开拓' },

  // 商机/项目分析
  { message: '河南科技学院项目现在到什么阶段了', expectedIntent: 'team_management', description: '项目状态' },
  { message: '看看最近有什么商机需要推进', expectedIntent: 'team_management', description: '商机跟进' },
  { message: '这个项目靠谱吗', expectedIntent: 'illusion_detection', description: '风险识别' },

  // 线索评估
  { message: '评估一下这个线索值不值得跟进', expectedIntent: 'lead_assessment', description: '线索评估' },
  { message: '这个客户有没有预算', expectedIntent: 'demand_mining', description: '需求挖掘' },

  // 跟进策略
  { message: '客户两周没回复了怎么办', expectedIntent: 'follow_up', description: '跟进策略' },
  { message: '怎么推进这个商机', expectedIntent: 'follow_up', description: '推进策略' },

  // 销售辅导
  { message: '客户说预算不够怎么回应', expectedIntent: 'sales_coaching', description: '销售辅导' },
  { message: '怎么应对价格异议', expectedIntent: 'sales_coaching', description: '异议处理' },

  // 招投标
  { message: '最近有没有人工智能通识课的招标信息', expectedIntent: 'bidding_monitor', description: '招投标监测' },

  // 一般对话 / 脱靶
  { message: '今天天气怎么样', expectedIntent: 'general_chat', description: '闲聊' },
  { message: '帮我写一首诗', expectedIntent: 'general_chat', description: '非销售请求' },

  // 商机健康度/评分诊断（project_health，2026-08-12 标杆用例入册）
  { message: '河南大学人工智能通识课的商机评分在30分，我该怎么才能提升', expectedIntent: 'project_health', description: '标杆用例：评分提升' },
  { message: '这个商机的健康度为什么一直在降', expectedIntent: 'project_health', description: '健康度下降' },
  { message: '黄淮学院项目质量分怎么才40分', expectedIntent: 'project_health', description: '质量分疑问' },
  { message: '这个项目30分还有救吗', expectedIntent: 'project_health', description: '口语化低分求助' },
  { message: '怎么把河南科技学院的评分提上去', expectedIntent: 'project_health', description: '提升评分' },
  { message: '我这个商机分数为啥这么低', expectedIntent: 'project_health', description: '分数归因' },
  { message: '最近哪个商机健康度最差', expectedIntent: 'project_health', description: '健康度排行' },
  { message: '洛阳理工那个项目现在健康状况怎么样', expectedIntent: 'project_health', description: '健康状况问询' },
]
