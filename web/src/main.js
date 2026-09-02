import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import '@/assets/icon-font/iconfont.css'
import 'viewerjs/dist/viewer.css'
import VueViewer from 'v-viewer'
import i18n from './i18n'
import { getLang } from '@/api'
import { restoreDirectory } from '@/api/directoryStorage'
// import VConsole from 'vconsole'
// const vConsole = new VConsole()

Vue.config.productionTip = false
const bus = new Vue()
Vue.prototype.$bus = bus
Vue.use(ElementUI)
Vue.use(VueViewer)

const initApp = async () => {
  i18n.locale = getLang()
  // 工作目录模式：先恢复 handle 与权限状态，避免启动时误用 localStorage 初始化。
  try {
    const dirRes = await restoreDirectory()
    if (dirRes && dirRes.ok) {
      store.commit('setIsDirectoryMode', true)
      store.commit('setDirectoryName', dirRes.name)
      if (dirRes.currentFileName) {
        store.commit('setCurrentSmmFile', dirRes.currentFileName)
      }
    }
  } catch (e) {
    console.error('恢复工作目录失败', e)
  }
  new Vue({
    render: h => h(App),
    router,
    store,
    i18n
  }).$mount('#app')
}

// 是否处于接管应用模式
if (window.takeOverApp) {
  window.initApp = initApp
  window.$bus = bus
} else {
  initApp()
}
