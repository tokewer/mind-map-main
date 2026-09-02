import Vue from 'vue'
import { scheduleServerAutoSave } from './serverStorage'

// 通知工作区自动保存层：任何数据变更后触发。
// 一是通知手动工作区文件自动保存（若已授权），二是触发本地文件夹磁盘自动保存。
export const notifyWorkspaceChanged = () => {
  scheduleServerAutoSave()
  if (Vue.prototype.$bus) {
    Vue.prototype.$bus.$emit('workspace_data_change')
  }
}

export const notifyWorkspaceError = message => {
  if (Vue.prototype.$bus) {
    Vue.prototype.$bus.$emit('workspace_auto_save_error', message)
  }
}
