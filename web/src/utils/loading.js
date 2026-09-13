import { Loading } from 'element-ui'

let loadingInstance = null

export const showLoading = () => {
  // 先关闭可能残留的旧实例：一次渲染周期内多次 showLoading（快速切换文件、
  // 启动恢复与 setData 重叠）时，旧遮罩若只是被覆盖就再也无人关闭，表现为永久转圈。
  if (loadingInstance) {
    loadingInstance.close()
    loadingInstance = null
  }
  loadingInstance = Loading.service({
    lock: true
  })
}

export const hideLoading = () => {
    if (loadingInstance) {
        loadingInstance.close()
        loadingInstance = null
    }
  }
  