// 复习列表筛选 / 排序共享逻辑（复习球悬浮面板 与 复习中心页共用）。
// 纯函数，不依赖页面组件；只引用 ./tree 的展示键，避免与 ./index 形成循环依赖。
// 设计原则：语义与复习页现状一致 ——
//   · 默认排序 sort='urgency' 与数据层 getNodeList 的 nextReview 升序完全相同；
//   · 不加任何筛选/不改排序时，结果应与改造前一致（无回归）。

import { getReviewFileKey, getReviewFileName } from './tree'

// 下拉选项：供两处 UI 复用，保证文案一致
export const STATUS_OPTIONS = [
  { value: 'new', label: '待开始' },
  { value: 'learning', label: '学习中' },
  { value: 'reviewing', label: '复习中' },
  { value: 'mastered', label: '已掌握' }
]

// 到期状态（互斥桶，覆盖全部未掌握且有 nextReview 的项）
export const DUE_OPTIONS = [
  { value: 'overdue', label: '已逾期' },
  { value: 'today', label: '今日到期' },
  { value: 'upcoming', label: '3天内到期' },
  { value: 'later', label: '3天后' }
]

export const SORT_OPTIONS = [
  { value: 'urgency', label: '到期紧迫' },
  { value: 'created', label: '最近加入' },
  { value: 'name', label: '名称排序' },
  { value: 'error', label: '错误优先' }
]

// 距今天数差（nextReview - today，单位天，向下取整整天）。
// 日期为 YYYY-MM-DD 字符串，转本地零点 Date 求整差，避免时区偏移。
const dayDiff = dateStr => {
  if (!dateStr) return NaN
  const ms = new Date(dateStr + 'T00:00:00').getTime() -
    new Date(new Date().toDateString()).getTime()
  return Math.round(ms / 86400000)
}

// 到期桶判定：overdue / today / upcoming / later；未掌握且无 nextReview → null（不在任何桶）
export const dueBucketOf = node => {
  if (!node || node.status === 'mastered' || !node.nextReview) return null
  const diff = dayDiff(node.nextReview)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3) return 'upcoming'
  return 'later'
}

// 按状态 / 到期 / 标签过滤。全部未指定时原样返回。
export const filterReviewList = (list, { status = '', due = '', tag = '' } = {}) => {
  return (list || []).filter(n => {
    if (status && n.status !== status) return false
    if (due && dueBucketOf(n) !== due) return false
    if (tag && !(n.tags || []).includes(tag)) return false
    return true
  })
}

// 稳定排序：先拷贝再排序，不污染入参数组。
// urgency 必须与数据层 getNodeList（nextReview 升序、无日期沉底）完全一致。
const compareName = (a, b) =>
  String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN')

export const sortReviewList = (list, mode = 'urgency') => {
  const arr = (list || []).slice()
  const byNext = (a, b) => {
    const an = a.nextReview || '9999-99-99'
    const bn = b.nextReview || '9999-99-99'
    return an < bn ? -1 : an > bn ? 1 : 0
  }
  switch (mode) {
    case 'created':
      arr.sort((a, b) => {
        const an = a.createdAt || ''
        const bn = b.createdAt || ''
        if (an !== bn) return an > bn ? -1 : 1 // 新加入在前
        return compareName(a, b)
      })
      break
    case 'name':
      arr.sort(compareName)
      break
    case 'error':
      arr.sort((a, b) => {
        const ae = a.errorCount || 0
        const be = b.errorCount || 0
        if (ae !== be) return be - ae
        return byNext(a, b)
      })
      break
    case 'urgency':
    default:
      // 已掌握（无 nextReview）沉底 → 未掌握按到期升序 → 名称兜底（保证稳定可预期）
      arr.sort((a, b) => {
        const am = a.status === 'mastered'
        const bm = b.status === 'mastered'
        if (am !== bm) return am ? 1 : -1
        const cmp = byNext(a, b)
        if (cmp !== 0) return cmp
        return compareName(a, b)
      })
      break
  }
  return arr
}

// 文件（科目）分组统计，供下拉选项：{ value, label, count }，数量降序
export const buildFileOptions = list => {
  const map = new Map()
  ;(list || []).forEach(n => {
    const key = getReviewFileKey(n)
    if (!map.has(key)) {
      map.set(key, { value: key, label: getReviewFileName(n), count: 0 })
    }
    map.get(key).count++
  })
  return [...map.values()].sort((a, b) => b.count - a.count)
}

// 组合入口：过滤（状态/到期/标签）→ 文件过滤 → 排序
export const applyReviewList = (
  items,
  { status = '', due = '', file = '', tag = '', sort = 'urgency' } = {}
) => {
  let list = filterReviewList(items, { status, due, tag })
  if (file) list = list.filter(n => getReviewFileKey(n) === file)
  return sortReviewList(list, sort)
}
