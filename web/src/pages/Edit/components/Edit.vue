<template>
  <div
    class="editContainer"
    @dragenter.stop.prevent="onDragenter"
    @dragleave.stop.prevent
    @dragover.stop.prevent
    @drop.stop.prevent
  >
    <div
      class="mindMapContainer"
      id="mindMapContainer"
      ref="mindMapContainer"
    ></div>
    <Count :mindMap="mindMap" v-if="!isZenMode"></Count>
    <Navigator v-if="mindMap" :mindMap="mindMap"></Navigator>
    <NavigatorToolbar :mindMap="mindMap" v-if="!isZenMode"></NavigatorToolbar>
    <OutlineSidebar :mindMap="mindMap"></OutlineSidebar>
    <Style v-if="mindMap && !isZenMode" :mindMap="mindMap"></Style>
    <BaseStyle
      :data="mindMapData"
      :configData="mindMapConfig"
      :mindMap="mindMap"
    ></BaseStyle>
    <AssociativeLineStyle
      v-if="mindMap"
      :mindMap="mindMap"
    ></AssociativeLineStyle>
    <Theme v-if="mindMap" :data="mindMapData" :mindMap="mindMap"></Theme>
    <Structure :mindMap="mindMap"></Structure>
    <ShortcutKey></ShortcutKey>
    <Contextmenu v-if="mindMap" :mindMap="mindMap"></Contextmenu>
    <RichTextToolbar v-if="mindMap" :mindMap="mindMap"></RichTextToolbar>
    <NodeNoteContentShow
      v-if="mindMap"
      :mindMap="mindMap"
    ></NodeNoteContentShow>
    <NodeImgPreview v-if="mindMap" :mindMap="mindMap"></NodeImgPreview>
    <SidebarTrigger v-if="!isZenMode"></SidebarTrigger>
    <Search v-if="mindMap" :mindMap="mindMap"></Search>
    <NodeIconSidebar v-if="mindMap" :mindMap="mindMap"></NodeIconSidebar>
    <NodeIconToolbar v-if="mindMap" :mindMap="mindMap"></NodeIconToolbar>
    <OutlineEdit v-if="mindMap" :mindMap="mindMap"></OutlineEdit>
    <Scrollbar v-if="isShowScrollbar && mindMap" :mindMap="mindMap"></Scrollbar>
    <FormulaSidebar v-if="mindMap" :mindMap="mindMap"></FormulaSidebar>
    <NodeOuterFrame v-if="mindMap" :mindMap="mindMap"></NodeOuterFrame>
    <NodeTagStyle v-if="mindMap" :mindMap="mindMap"></NodeTagStyle>
    <Setting :configData="mindMapConfig" :mindMap="mindMap"></Setting>
    <NodeImgPlacementToolbar
      v-if="mindMap"
      :mindMap="mindMap"
    ></NodeImgPlacementToolbar>
    <NodeNoteSidebar v-if="mindMap" :mindMap="mindMap"></NodeNoteSidebar>
    <AiCreate v-if="mindMap && enableAi" :mindMap="mindMap"></AiCreate>
    <AiChat v-if="enableAi"></AiChat>
    <ReviewFloat></ReviewFloat>
    <ReviewGlowSync></ReviewGlowSync>
    <MasteryColorSettings></MasteryColorSettings>
    <ReviewDialog></ReviewDialog>
    <CardManagerDialog></CardManagerDialog>
    <TrashDialog></TrashDialog>
    <HistoryDialog></HistoryDialog>
    <div
      class="dragMask"
      v-if="showDragMask"
      @dragleave.stop.prevent="onDragleave"
      @dragover.stop.prevent
      @drop.stop.prevent="onDrop"
    >
      <div class="dragTip">{{ $t('edit.dragTip') }}</div>
    </div>
  </div>
</template>

<script>
import MindMap from 'simple-mind-map'
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js'
import Watermark from 'simple-mind-map/src/plugins/Watermark.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import ExportPDF from 'simple-mind-map/src/plugins/ExportPDF.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import RichText from 'simple-mind-map/src/plugins/RichText.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import TouchEvent from 'simple-mind-map/src/plugins/TouchEvent.js'
import NodeImgAdjust from 'simple-mind-map/src/plugins/NodeImgAdjust.js'
import SearchPlugin from 'simple-mind-map/src/plugins/Search.js'
import Painter from 'simple-mind-map/src/plugins/Painter.js'
import ScrollbarPlugin from 'simple-mind-map/src/plugins/Scrollbar.js'
import Formula from 'simple-mind-map/src/plugins/Formula.js'
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js'
import Demonstrate from 'simple-mind-map/src/plugins/Demonstrate.js'
import OuterFrame from 'simple-mind-map/src/plugins/OuterFrame.js'
import MindMapLayoutPro from 'simple-mind-map/src/plugins/MindMapLayoutPro.js'
import NodeBase64ImageStorage from 'simple-mind-map/src/plugins/NodeBase64ImageStorage.js'
import Themes from 'simple-mind-map-plugin-themes'
// 协同编辑插件
// import Cooperate from 'simple-mind-map/src/plugins/Cooperate.js'
import OutlineSidebar from './OutlineSidebar.vue'
import Style from './Style.vue'
import BaseStyle from './BaseStyle.vue'
import Theme from './Theme.vue'
import Structure from './Structure.vue'
import Count from './Count.vue'
import NavigatorToolbar from './NavigatorToolbar.vue'
import ShortcutKey from './ShortcutKey.vue'
import Contextmenu from './Contextmenu.vue'
import RichTextToolbar from './RichTextToolbar.vue'
import NodeNoteContentShow from './NodeNoteContentShow.vue'
import {
  getData,
  getConfig,
  storeData,
  clearDataCache,
  resetDirectorySnapshotThrottle,
  resumeDirectoryMode,
  markDirectoryMapReady,
  resetDirectoryMapReady,
  flushPendingWrites
} from '@/api'
import * as directoryStorage from '@/api/directoryStorage'
import { addToTrash } from '@/review/trash'
import Navigator from './Navigator.vue'
import NodeImgPreview from './NodeImgPreview.vue'
import SidebarTrigger from './SidebarTrigger.vue'
import { mapState } from 'vuex'
import icon from '@/config/icon'
import Vue from 'vue'
import Search from './Search.vue'
import NodeIconSidebar from './NodeIconSidebar.vue'
import NodeIconToolbar from './NodeIconToolbar.vue'
import OutlineEdit from './OutlineEdit.vue'
import { showLoading, hideLoading } from '@/utils/loading'
import handleClipboardText from '@/utils/handleClipboardText'
import { getParentWithClass } from '@/utils'
import { createUid, copyRenderTree } from 'simple-mind-map/src/utils/index'
import Scrollbar from './Scrollbar.vue'
import exampleData from 'simple-mind-map/example/exampleData'
import FormulaSidebar from './FormulaSidebar.vue'
import NodeOuterFrame from './NodeOuterFrame.vue'
import NodeTagStyle from './NodeTagStyle.vue'
import Setting from './Setting.vue'
import AssociativeLineStyle from './AssociativeLineStyle.vue'
import NodeImgPlacementToolbar from './NodeImgPlacementToolbar.vue'
import NodeNoteSidebar from './NodeNoteSidebar.vue'
import AiCreate from './AiCreate.vue'
import AiChat from './AiChat.vue'
import ReviewFloat from './ReviewFloat.vue'
import ReviewGlowSync from './ReviewGlowSync.vue'
import MasteryColorSettings from './MasteryColorSettings.vue'
import ReviewDialog from './ReviewDialog.vue'
import CardManagerDialog from './CardManagerDialog.vue'
import TrashDialog from './TrashDialog.vue'
import HistoryDialog from './HistoryDialog.vue'

// 注册插件
MindMap.usePlugin(MiniMap)
  .usePlugin(Watermark)
  .usePlugin(Drag)
  .usePlugin(KeyboardNavigation)
  .usePlugin(ExportPDF)
  .usePlugin(ExportXMind)
  .usePlugin(Export)
  .usePlugin(Select)
  .usePlugin(AssociativeLine)
  .usePlugin(NodeImgAdjust)
  .usePlugin(TouchEvent)
  .usePlugin(SearchPlugin)
  .usePlugin(Painter)
  .usePlugin(Formula)
  .usePlugin(RainbowLines)
  .usePlugin(Demonstrate)
  .usePlugin(OuterFrame)
  .usePlugin(MindMapLayoutPro)
  .usePlugin(NodeBase64ImageStorage)
// .usePlugin(Cooperate) // 协同插件

// 注册主题
Themes.init(MindMap)
// 扩展主题列表
if (typeof MoreThemes !== 'undefined') {
  MoreThemes.init(MindMap)
}

export default {
  components: {
    OutlineSidebar,
    Style,
    BaseStyle,
    Theme,
    Structure,
    Count,
    NavigatorToolbar,
    ShortcutKey,
    Contextmenu,
    RichTextToolbar,
    NodeNoteContentShow,
    Navigator,
    NodeImgPreview,
    SidebarTrigger,
    Search,
    NodeIconSidebar,
    NodeIconToolbar,
    OutlineEdit,
    Scrollbar,
    FormulaSidebar,
    NodeOuterFrame,
    NodeTagStyle,
    Setting,
    AssociativeLineStyle,
    NodeImgPlacementToolbar,
    NodeNoteSidebar,
    AiCreate,
    AiChat,
    ReviewFloat,
    ReviewGlowSync,
    MasteryColorSettings,
    ReviewDialog,
    CardManagerDialog,
    TrashDialog,
    HistoryDialog
  },
  data() {
    return {
      enableShowLoading: true,
      mindMap: null,
      mindMapData: null,
      mindMapConfig: {},
      prevImg: '',
      storeConfigTimer: null,
      showDragMask: false
    }
  },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      openNodeRichText: state => state.localConfig.openNodeRichText,
      isShowScrollbar: state => state.localConfig.isShowScrollbar,
      enableDragImport: state => state.localConfig.enableDragImport,
      useLeftKeySelectionRightKeyDrag: state =>
        state.localConfig.useLeftKeySelectionRightKeyDrag,
      extraTextOnExport: state => state.extraTextOnExport,
      isDragOutlineTreeNode: state => state.isDragOutlineTreeNode,
      enableAi: state => state.localConfig.enableAi
    })
  },
  watch: {
    openNodeRichText() {
      if (this.openNodeRichText) {
        this.addRichTextPlugin()
      } else {
        this.removeRichTextPlugin()
      }
    },
    isShowScrollbar() {
      if (this.isShowScrollbar) {
        this.addScrollbarPlugin()
      } else {
        this.removeScrollbarPlugin()
      }
    }
  },
  mounted() {
    showLoading()
    this.getData()
    this.init()
    this.$bus.$on('execCommand', this.execCommand)
    this.$bus.$on('paddingChange', this.onPaddingChange)
    this.$bus.$on('export', this.export)
    this.$bus.$on('setData', this.setData)
    this.$bus.$on('startTextEdit', this.handleStartTextEdit)
    this.$bus.$on('endTextEdit', this.handleEndTextEdit)
    this.$bus.$on('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$on('startPainter', this.handleStartPainter)
    this.$bus.$on('node_tree_render_end', this.handleHideLoading)
    this.$bus.$on('showLoading', this.handleShowLoading)
    this.$bus.$on('localStorageExceeded', this.onLocalStorageExceeded)
    window.addEventListener('resize', this.handleResize)
    this.$bus.$on('showDownloadTip', this.showDownloadTip)
    // 工作目录模式：保存状态与错误
    // 工作目录模式：保存状态与错误
    this.$bus.$on('directory_save_status', this.onDirectorySaveStatus)
    this.$bus.$on('directory_error', this.onDirectoryError)
    window.addEventListener('beforeunload', this.onDirectoryBeforeUnload)
    // 页面隐藏（切后台/关闭标签）或刷新前，把各存储模式防抖中的待写数据立即落盘，
    // 否则定时器随页面一起消失，重开后会读到上一版内容。
    window.addEventListener('pagehide', this.onFlushBeforeLeave)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.webTip()
    // 异步恢复上次的工作目录并打开上次文件
    this.restoreDirectoryMode()
  },
  beforeDestroy() {
    this.$bus.$off('execCommand', this.execCommand)
    this.$bus.$off('paddingChange', this.onPaddingChange)
    this.$bus.$off('export', this.export)
    this.$bus.$off('setData', this.setData)
    this.$bus.$off('startTextEdit', this.handleStartTextEdit)
    this.$bus.$off('endTextEdit', this.handleEndTextEdit)
    this.$bus.$off('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$off('startPainter', this.handleStartPainter)
    this.$bus.$off('node_tree_render_end', this.handleHideLoading)
    this.$bus.$off('showLoading', this.handleShowLoading)
    this.$bus.$off('localStorageExceeded', this.onLocalStorageExceeded)
    this.$bus.$off('data_change', this.onDataChange)
    this.$bus.$off('view_data_change', this.onViewDataChange)
    clearTimeout(this.storeConfigTimer)
    window.removeEventListener('resize', this.handleResize)
    this.$bus.$off('showDownloadTip', this.showDownloadTip)
    this.$bus.$off('directory_save_status', this.onDirectorySaveStatus)
    this.$bus.$off('directory_error', this.onDirectoryError)
    window.removeEventListener('beforeunload', this.onDirectoryBeforeUnload)
    window.removeEventListener('pagehide', this.onFlushBeforeLeave)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.unwatchDirectoryReauth()
    this.mindMap.destroy()
  },
  methods: {
    onLocalStorageExceeded() {
      this.$notify({
        type: 'warning',
        title: this.$t('edit.tip'),
        message: this.$t('edit.localStorageExceededTip'),
        duration: 0
      })
    },

    // 工作目录保存状态
    onDirectorySaveStatus(status) {
      this.$store.commit('setDirectorySaveStatus', status || '')
    },

    // 工作目录错误提示
    onDirectoryError(message) {
      this.$notify({
        type: 'error',
        title: this.$t('edit.tip'),
        message,
        duration: 4000
      })
    },

    // 页面隐藏/卸载前：立即写出所有防抖中的待写数据（浏览器存储/本地文件/工作目录）
    onFlushBeforeLeave() {
      return flushPendingWrites()
    },

    onVisibilityChange() {
      if (document.visibilityState === 'hidden') this.onFlushBeforeLeave()
    },

    // 关闭页面前：工作目录模式有未保存数据时提醒
    onDirectoryBeforeUnload(e) {
      const status = this.$store.state.directorySaveStatus
      if (this.$store.state.isDirectoryMode && (status === 'saving' || status === 'error')) {
        const msg = '存在未保存到工作目录的数据，请稍候或重新保存'
        e.returnValue = msg
        return msg
      }
      return undefined
    },

    // 启动时尝试恢复上次的工作目录并打开上次文件
    async restoreDirectoryMode() {
      if (window.takeOverApp) return
      try {
        // 静默查询：只读权限检查，不在启动时弹任何授权框
        const res = await resumeDirectoryMode(false)
        if (!res) return
        if (res.ok) {
          this.applyDirectoryResume(res)
          return
        }
        // 已保存过工作目录但权限待续：等待首次用户手势静默续权（不弹目录选择器）
        if (res.needReauth || res.reason === 'reauth-error' || res.reason === 'no-handle') {
          if (res.reason === 'no-handle') return
          this.watchForDirectoryReauth()
        }
      } catch (error) {
        console.error('恢复工作目录失败', error)
      }
    },

    // 进入工作目录模式并打开指定导图（权限恢复/选择目录后共用）
    applyDirectoryResume(res) {
      if (!res || !res.ok) return
      this.$store.commit('setIsDirectoryMode', true)
      this.$store.commit('setDirectoryName', res.name || '')
      let applied = false
      if (res.fileName) {
        this.$store.commit('setCurrentSmmFile', res.fileName)
      }
      if (res.data) {
        clearDataCache()
        resetDirectorySnapshotThrottle()
        this.$bus.$emit('setData', res.data)
        applied = true
      }
      return applied
    },

    // 用户首次点击/按键时，用已保存的目录句柄静默续权并恢复上次导图
    watchForDirectoryReauth() {
      if (this._dirReauthBound) return
      this._dirReauthBound = true
      const attempt = async () => {
        this.unwatchDirectoryReauth()
        if (this.$store.state.isDirectoryMode) return
        try {
          const res = await resumeDirectoryMode(true)
          if (res && res.ok) {
            this.applyDirectoryResume(res)
            this.$message.success('已恢复上次的工作目录')
          }
        } catch (error) {
          console.error('恢复工作目录权限失败', error)
        }
      }
      const events = ['pointerdown', 'keydown']
      events.forEach(ev => window.addEventListener(ev, attempt, { capture: true }))
      this._dirReauthUnwatch = () => {
        events.forEach(ev => window.removeEventListener(ev, attempt, { capture: true }))
      }
    },

    unwatchDirectoryReauth() {
      if (this._dirReauthUnwatch) {
        this._dirReauthUnwatch()
        this._dirReauthUnwatch = null
      }
      this._dirReauthBound = false
    },

    handleStartTextEdit() {
      this.mindMap.renderer.startTextEdit()
    },

    handleEndTextEdit() {
      this.mindMap.renderer.endTextEdit()
    },

    handleCreateLineFromActiveNode() {
      this.mindMap.associativeLine.createLineFromActiveNode()
    },

    handleStartPainter() {
      this.mindMap.painter.startPainter()
    },

    handleResize() {
      this.mindMap.resize()
    },

    // 显示loading
    handleShowLoading() {
      this.enableShowLoading = true
      showLoading()
    },

    // 渲染结束后关闭loading
    handleHideLoading() {
      if (this.enableShowLoading) {
        this.enableShowLoading = false
        hideLoading()
      }
    },

    // 获取思维导图数据，实际应该调接口获取
    getData() {
      this.mindMapData = getData()
      this.mindMapConfig = getConfig() || {}
    },

    // 存储数据当数据有变时（具名方法，便于销毁时注销）
    bindSaveEvent() {
      this.$bus.$on('data_change', this.onDataChange)
      this.$bus.$on('view_data_change', this.onViewDataChange)
    },

    // 序列化边界：data_change 事件可能携带与渲染树共享同一对象的引用
    // （撤销/重做路径 Render.backForward 会把刚解析的对象直接当作 renderTree，
    // 渲染进程之后会往这些对象上挂载 _node = MindMapNode 运行时引用，形成循环）。
    // 因此不能把事件载荷按引用直接交给存储层，必须在此先做一次“干净拷贝”，
    // 确保持久化数据与编辑器运行时对象解耦、始终可 JSON 序列化。
    onDataChange(data) {
      storeData({ root: data ? copyRenderTree({}, data) : data })
    },

    // 捕获节点删除，写入回收站
    handleDataChangeDetail(detailList) {
      if (!detailList || !Array.isArray(detailList)) return
      detailList.forEach(item => {
        if (item && item.action === 'delete' && item.data) {
          addToTrash(item.data)
        }
      })
    },

    onViewDataChange(data) {
      clearTimeout(this.storeConfigTimer)
      // 记录数据来源的导图身份：300ms 后定时器触发时若已切换文件，
      // 这次视图变化必须被丢弃，否则会写进新打开的导图。
      const ownerFileId = this.$store.state.isDirectoryMode
        ? this.$store.state.currentSmmFile
        : null
      this.storeConfigTimer = setTimeout(() => {
        this.storeConfigTimer = null
        if (ownerFileId && this.$store.state.currentSmmFile !== ownerFileId) return
        storeData({
          view: data
        })
      }, 300)
    },

    // 手动保存
    manualSave() {
      storeData(this.mindMap.getData(true), true)
    },

    // Shift+Enter：在当前节点上方插入同级节点
    insertSiblingAbove() {
      const activeList = this.mindMap.renderer.activeNodeList
      if (activeList.length <= 0) return
      const node = activeList[0]
      // 根节点/概要节点不允许插入同级
      if (node.isRoot || node.isGeneralization) return
      this.mindMap.renderer.textEdit.hideEditTextBox()
      const parent = node.parent
      const index = parent.children.findIndex(item => item === node)
      if (index === -1) return
      const isRichText = this.mindMap.renderer.hasRichTextPlugin()
      const newNodeData = {
        inserting: true,
        data: {
          text: isRichText ? '<p><br></p>' : '',
          expand: true,
          richText: isRichText,
          isActive: true,
          uid: createUid()
        },
        children: []
      }
      parent.nodeData.children.splice(index, 0, newNodeData)
      this.mindMap.renderer.clearActiveNodeList()
      this.mindMap.render()
      // 渲染后激活并进入编辑新节点
      this.$nextTick(() => {
        const target = this.mindMap.renderer.findNodeByUid(newNodeData.data.uid)
        if (target) {
          target.active()
          this.mindMap.renderer.textEdit.show({ node: target })
        }
      })
    },

    // 初始化
    init() {
      let hasFileURL = this.hasFileURL()
      let { root, layout, theme, view } = this.mindMapData
      const config = this.mindMapConfig
      // 如果url中存在要打开的文件，那么思维导图数据、主题、布局都使用默认的
      if (hasFileURL) {
        root = {
          data: {
            text: this.$t('edit.root')
          },
          children: []
        }
        layout = exampleData.layout
        theme = exampleData.theme
        view = null
      }
      this.mindMap = new MindMap({
        el: this.$refs.mindMapContainer,
        data: root,
        fit: false,
        layout: layout,
        theme: theme.template,
        themeConfig: theme.config,
        viewData: view,
        nodeTextEditZIndex: 1000,
        nodeNoteTooltipZIndex: 1000,
        customNoteContentShow: {
          show: (content, left, top, node) => {
            this.$bus.$emit('showNoteContent', content, left, top, node)
          },
          hide: () => {
            // this.$bus.$emit('hideNoteContent')
          }
        },
        openRealtimeRenderOnNodeTextEdit: true,
        enableAutoEnterTextEditWhenKeydown: true,
        demonstrateConfig: {
          openBlankMode: false
        },
        ...(config || {}),
        iconList: [...icon],
        useLeftKeySelectionRightKeyDrag: this.useLeftKeySelectionRightKeyDrag,
        customInnerElsAppendTo: null,
        customHandleClipboardText: handleClipboardText,
        defaultNodeImage: require('../../../assets/img/图片加载失败.svg'),
        initRootNodePosition: ['center', 'center'],
        handleIsSplitByWrapOnPasteCreateNewNode: () => {
          return this.$confirm(
            this.$t('edit.splitByWrap'),
            this.$t('edit.tip'),
            {
              confirmButtonText: this.$t('edit.yes'),
              cancelButtonText: this.$t('edit.no'),
              type: 'warning'
            }
          )
        },
        errorHandler: (code, err) => {
          console.error(err)
          switch (code) {
            case 'export_error':
              this.$message.error(this.$t('edit.exportError'))
              break
            default:
              break
          }
        },
        addContentToFooter: () => {
          const text = this.extraTextOnExport.trim()
          if (!text) return null
          const el = document.createElement('div')
          el.className = 'footer'
          el.innerHTML = text
          const cssText = `
            .footer {
              width: 100%;
              height: 30px;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 12px;
              color: #979797;
            }
          `
          return {
            el,
            cssText,
            height: 30
          }
        },
        expandBtnNumHandler: num => {
          return num >= 100 ? '…' : num
        },
        beforeDeleteNodeImg: node => {
          return new Promise(resolve => {
            this.$confirm(
              this.$t('edit.deleteNodeImgTip'),
              this.$t('edit.tip'),
              {
                confirmButtonText: this.$t('edit.yes'),
                cancelButtonText: this.$t('edit.no'),
                type: 'warning'
              }
            )
              .then(() => {
                resolve(false)
              })
              .catch(() => {
                resolve(true)
              })
          })
        }
      })
      this.loadPlugins()
      this.mindMap.keyCommand.addShortcut('Control+s', () => {
        this.manualSave()
      })
      // 空格键：启动选中节点文本编辑（有选中节点时）
      this.mindMap.keyCommand.addShortcut('Spacebar', () => {
        const activeList = this.mindMap.renderer.activeNodeList
        if (activeList.length <= 0) {
          return
        }
        const node = activeList[0]
        this.mindMap.renderer.textEdit.show({ node })
      })
      // Shift+Enter：在当前节点上方插入同级节点（Enter 默认在下方）
      this.mindMap.keyCommand.addShortcut('Shift+Enter', () => {
        this.insertSiblingAbove()
      })
      // 转发事件
      ;[
        'node_active',
        'data_change',
        'view_data_change',
        'back_forward',
        'node_contextmenu',
        'node_click',
        'draw_click',
        'expand_btn_click',
        'svg_mousedown',
        'mouseup',
        'mode_change',
        'node_tree_render_end',
        'rich_text_selection_change',
        'transforming-dom-to-images',
        'generalization_node_contextmenu',
        'painter_start',
        'painter_end',
        'scrollbar_change',
        'scale',
        'translate',
        'node_attachmentClick',
        'node_attachmentContextmenu',
        'demonstrate_jump',
        'exit_demonstrate',
        'node_note_dblclick',
        'node_mousedown'
      ].forEach(event => {
        this.mindMap.on(event, (...args) => {
          this.$bus.$emit(event, ...args)
        })
      })
      this.bindSaveEvent()
      // 监听删除事件写入回收站
      this.mindMap.on('data_change_detail', this.handleDataChangeDetail)
      // 如果应用被接管，那么抛出事件传递思维导图实例
      if (window.takeOverApp) {
        this.$bus.$emit('app_inited', this.mindMap)
      } else {
        // 非接管模式也发出，供回收站/上色等组件获取实例
        this.$bus.$emit('app_inited', this.mindMap)
      }
      // 解析url中的文件
      if (hasFileURL) {
        this.$bus.$emit('handle_file_url')
      }
      // api/index.js文件使用
      // 当正在编辑本地文件时通过该方法获取最新数据
      Vue.prototype.getCurrentData = () => {
        const fullData = this.mindMap.getData(true)
        return { ...fullData }
      }
      // 协同测试
      this.cooperateTest()
    },

    // 加载相关插件
    loadPlugins() {
      if (this.openNodeRichText) this.addRichTextPlugin()
      if (this.isShowScrollbar) this.addScrollbarPlugin()
    },

    // url中是否存在要打开的文件
    hasFileURL() {
      const fileURL = this.$route.query.fileURL
      if (!fileURL) return false
      return /\.(smm|json|xmind|md|xlsx)$/.test(fileURL)
    },

    // 动态设置思维导图数据
    setData(data) {
      this.handleShowLoading()
      // 取消上一张导图排队的「视图变化」写入：该定时器在切换文件后触发，
      // 会把上一张图的 view 当成当前图的视图写进新文件（视图串台）。
      clearTimeout(this.storeConfigTimer)
      this.storeConfigTimer = null
      clearDataCache() // 切换文件/恢复历史时清除内存缓存
      // 只有真实正文（含 root）就绪才允许目录模式写盘；空对象/坏数据保持门闩关闭，
      // 否则 setData 后的 manualSave 会把空渲染树写成 root:null 覆盖本地文件。
      const usable = !!(data && typeof data === 'object' && data.root)
      if (usable) {
        markDirectoryMapReady()
      } else {
        resetDirectoryMapReady()
      }
      let rootNodeData = null
      if (data && data.root) {
        this.mindMap.setFullData(data)
        rootNodeData = data.root
      } else {
        this.mindMap.setData(data)
        rootNodeData = data
      }
      this.mindMap.view.reset()
      this.manualSave()
      // 如果导入的是富文本内容，那么自动开启富文本模式
      if (rootNodeData && rootNodeData.data && rootNodeData.data.richText && !this.openNodeRichText) {
        this.$bus.$emit('toggleOpenNodeRichText', true)
        this.$notify.info({
          title: this.$t('edit.tip'),
          message: this.$t('edit.autoOpenNodeRichTextTip')
        })
      }
    },

    // 重新渲染
    reRender() {
      this.mindMap.reRender()
    },

    // 执行命令
    execCommand(...args) {
      this.mindMap.execCommand(...args)
    },

    // 导出
    async export(...args) {
      try {
        showLoading()
        await this.mindMap.export(...args)
        hideLoading()
      } catch (error) {
        console.log(error)
        hideLoading()
      }
    },

    // 修改导出内边距
    onPaddingChange(data) {
      this.mindMap.updateConfig(data)
    },

    // 加载节点富文本编辑插件
    addRichTextPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(RichText)
    },

    // 移除节点富文本编辑插件
    removeRichTextPlugin() {
      this.mindMap.removePlugin(RichText)
    },

    // 加载滚动条插件
    addScrollbarPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(ScrollbarPlugin)
    },

    // 移除滚动条插件
    removeScrollbarPlugin() {
      this.mindMap.removePlugin(ScrollbarPlugin)
    },

    // 协同测试
    cooperateTest() {
      if (this.mindMap.cooperate && this.$route.query.userName) {
        this.mindMap.cooperate.setProvider(null, {
          roomName: 'demo-room',
          signalingList: ['ws://localhost:4444']
        })
        this.mindMap.cooperate.setUserInfo({
          id: Math.random(),
          name: this.$route.query.userName,
          color: ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399'][
            Math.floor(Math.random() * 5)
          ],
          avatar:
            Math.random() > 0.5
              ? 'https://img0.baidu.com/it/u=4270674549,2416627993&fm=253&app=138&size=w931&n=0&f=JPEG&fmt=auto?sec=1696006800&t=4d32871d14a7224a4591d0c3c7a97311'
              : ''
        })
      }
    },

    // 拖拽文件到页面导入
    onDragenter() {
      if (!this.enableDragImport || this.isDragOutlineTreeNode) return
      this.showDragMask = true
    },

    onDragleave() {
      this.showDragMask = false
    },

    onDrop(e) {
      if (!this.enableDragImport) return
      this.showDragMask = false
      const dt = e.dataTransfer
      const file = dt.files && dt.files[0]
      if (!file) return
      this.$bus.$emit('importFile', file)
    },

    // 网页版试用提示
    webTip() {
      const storageKey = 'webUseTip'
      const data = localStorage.getItem(storageKey)
      if (data) {
        return
      }
      this.showDownloadTip(
        '重要提示',
        '网页版仅供试用，请下载客户端获得完整体验~'
      )
      localStorage.setItem(storageKey, 1)
    },

    showDownloadTip(title, desc) {
      const h = this.$createElement
      this.$msgbox({
        title,
        message: h('div', null, [
          h(
            'p',
            {
              style: {
                marginBottom: '12px'
              }
            },
            desc
          ),
          h('div', null, [
            h(
              'a',
              {
                attrs: {
                  href:
                    'https://sxmind.cn/',
                  target: '_blank'
                },
                style: {
                  color: '#409eff',
                  marginRight: '12px'
                }
              },
              '详细了解：https://sxmind.cn/'
            )
          ])
        ]),
        showCancelButton: false,
        showConfirmButton: false
      })
    }
  }
}
</script>

<style lang="less" scoped>
.editContainer {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;

  .dragMask {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3999;

    .dragTip {
      pointer-events: none;
      font-weight: bold;
    }
  }

  .mindMapContainer {
    position: absolute;
    left: 0px;
    top: 0px;
    width: 100%;
    height: 100%;
  }
}
</style>
