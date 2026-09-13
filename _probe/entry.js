// 探针入口：集中导出需要真实执行的生产模块
import VueStub from 'vue'
import MindMapStub from 'simple-mind-map'

export { default as Edit } from '@/pages/Edit/components/Edit.vue'
export { default as FileBar } from '@/pages/Edit/components/FileBar.vue'
export { default as HistoryDialog } from '@/pages/Edit/components/HistoryDialog.vue'
export { default as ReviewFloat } from '@/pages/Edit/components/ReviewFloat.vue'
export * as api from '@/api'
export * as directoryStorage from '@/api/directoryStorage'
export { default as store } from '@/store'
export * as loadingUtils from '@/utils/loading'
export * as reviewApi from '@/review'
export * as serverStorage from '@/api/serverStorage'

export { default as Toolbar } from '@/pages/Edit/components/Toolbar.vue'
export const bus = VueStub.prototype.$bus
export { MindMapStub }
