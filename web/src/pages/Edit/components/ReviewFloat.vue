<template>
  <div
    class="reviewFloat"
    :class="{ collapsed, isDark, 'is-behind': behindOverlays }"
    :style="{ right: right + 'px', bottom: bottom + 'px' }"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <!-- 收起态：圆形小按钮 + 待复习数 -->
    <div v-if="collapsed" class="floatBtn" @mousedown="startDrag" @click="onToggle">
      <span class="el-icon-notebook-2"></span>
      <span class="badge" v-if="dueCount > 0">{{ dueCount > 99 ? '99+' : dueCount }}</span>
    </div>

    <!-- 展开态：面板 -->
    <div
      v-else
      class="floatPanel"
      :style="{ width: panelWidth + 'px', height: panelHeight + 'px' }"
    >
      <div class="panelHeader" @mousedown="startDrag">
        <span class="title">复习中心</span>
        <span class="actions">
          <el-button size="mini" type="text" @click.stop="goReviewPage">复习页</el-button>
          <i class="el-icon-minus" @click.stop="onToggle"></i>
        </span>
      </div>

      <!-- 视图切换 -->
      <div class="viewTabs">
        <span
          class="viewTab"
          :class="{ active: view === 'today' }"
          @click="view = 'today'; saveConfig()"
        >今日（{{ dueList.length }}）</span>
        <span
          class="viewTab"
          :class="{ active: view === 'all' }"
          @click="view = 'all'; saveConfig()"
        >全部（{{ allList.length }}）</span>
      </div>

      <!-- 筛选 / 排序工具条（会话态，不持久化） -->
      <div class="filterBar">
        <el-select
          v-model="fStatus"
          size="mini"
          clearable
          placeholder="状态"
          class="fbSelect"
        >
          <el-option
            v-for="o in STATUS_OPTIONS"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          ></el-option>
        </el-select>
        <el-select
          v-model="fDue"
          size="mini"
          clearable
          placeholder="到期"
          class="fbSelect"
        >
          <el-option
            v-for="o in DUE_OPTIONS"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          ></el-option>
        </el-select>
        <el-select
          v-model="fFile"
          size="mini"
          clearable
          placeholder="科目"
          class="fbSelect"
        >
          <el-option
            v-for="f in fileOptions"
            :key="f.value"
            :label="f.label + '（' + f.count + '）'"
            :value="f.value"
          ></el-option>
        </el-select>
        <el-select
          v-model="fTag"
          size="mini"
          clearable
          placeholder="标签"
          class="fbSelect"
        >
          <el-option
            v-for="t in allTags"
            :key="t"
            :label="t"
            :value="t"
          ></el-option>
        </el-select>
        <el-select
          v-model="sortMode"
          size="mini"
          placeholder="排序"
          class="fbSelect"
        >
          <el-option
            v-for="o in SORT_OPTIONS"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          ></el-option>
        </el-select>
        <el-button
          v-if="filterActive"
          size="mini"
          type="text"
          class="fbClear"
          @click="clearFilters"
        >清除</el-button>
      </div>

      <div class="panelBody">
        <!-- 今日视图 -->
        <template v-if="view === 'today'">
          <div v-if="dueList.length === 0" class="empty">今日没有待复习项</div>
          <div v-else-if="dueFiltered.length === 0" class="empty">
            无匹配项
            <el-button size="mini" type="text" @click="clearFilters">清除筛选</el-button>
          </div>
          <div v-else>
            <div class="allGroup" v-for="g in dueGroups" :key="g.key">
              <div class="groupHeader todayHeader">
                <span class="groupName">{{ g.fileName }}</span>
                <span class="groupCount">{{ g.list.length }}</span>
              </div>
              <div class="dueItem" v-for="item in g.list" :key="item.uid" :style="{ paddingLeft: 12 + item.level * 18 + 'px' }">
                <div class="itemInfo">
                  <div class="itemName">{{ item.name }}</div>
                  <div class="itemMeta">
                    <span>{{ item.path || '' }}</span>
                    <span class="overdueTag" v-if="isOverdue(item)">逾期</span>
                  </div>
                </div>
                <div class="itemOps">
                  <el-button size="mini" type="text" @click.stop="locate(item)">
                    <i class="el-icon-location-outline"></i>
                  </el-button>
                  <el-button size="mini" type="text" @click.stop="postpone(item)">推迟</el-button>
                  <el-button size="mini" type="text" @click.stop="forgot(item)">忘了</el-button>
                  <el-button size="mini" type="primary" @click.stop="complete(item)">
                    完成
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 全部视图：按文件分组 -->
        <template v-else>
          <div v-if="allList.length === 0" class="empty">暂无复习节点</div>
          <div v-else-if="allFiltered.length === 0" class="empty">
            无匹配项
            <el-button size="mini" type="text" @click="clearFilters">清除筛选</el-button>
          </div>
          <div
            class="allGroup"
            v-for="g in allGroups"
            :key="g.key"
          >
            <div class="groupHeader" @click="toggleGroup(g.key)">
              <span class="groupName">
                <i
                  class="el-icon-arrow-right"
                  :class="{ expanded: !g.collapsed }"
                ></i>
                {{ g.fileName }}
              </span>
              <span class="groupCount">{{ g.list.length }}</span>
            </div>
            <div v-if="!g.collapsed">
              <div class="dueItem" v-for="item in g.list" :key="item.uid" :style="{ paddingLeft: 12 + item.level * 18 + 'px' }">
                <div class="itemInfo">
                  <div class="itemName">{{ item.name }}</div>
                  <div class="itemMeta">
                    <el-tag
                      size="mini"
                      :type="statusType(item.status)"
                      style="margin-right: 6px;"
                    >{{ statusText(item.status) }}</el-tag>
                    <span>{{ item.nextReview || '已掌握' }}</span>
                  </div>
                </div>
                <div class="itemOps">
                  <el-button size="mini" type="text" @click.stop="locate(item)">
                    <i class="el-icon-location-outline"></i>
                  </el-button>
                  <el-button
                    size="mini"
                    type="text"
                    v-if="item.status !== 'mastered'"
                    @click.stop="complete(item)"
                  >完成</el-button>
                  <el-button size="mini" type="text" @click.stop="forgot(item)">忘了</el-button>
                  <el-button size="mini" type="text" @click.stop="reset(item)">重置</el-button>
                  <el-button
                    size="mini"
                    type="text"
                    class="danger"
                    @click.stop="remove(item)"
                  >移除</el-button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 调整大小把手：四边+四角 -->
      <!-- 四角 -->
      <div class="resizeHandle top-left" @mousedown="startResize('top-left', $event)">
        <i class="el-icon-top-left"></i>
      </div>
      <div class="resizeHandle top-right" @mousedown="startResize('top-right', $event)">
        <i class="el-icon-top-right"></i>
      </div>
      <div class="resizeHandle bottom-left" @mousedown="startResize('bottom-left', $event)">
        <i class="el-icon-bottom-left"></i>
      </div>
      <div class="resizeHandle bottom-right" @mousedown="startResize('bottom-right', $event)">
        <i class="el-icon-bottom-right"></i>
      </div>

      <!-- 四边 -->
      <div class="resizeHandle top" @mousedown="startResize('top', $event)">
        <i class="el-icon-top"></i>
      </div>
      <div class="resizeHandle right" @mousedown="startResize('right', $event)">
        <i class="el-icon-right"></i>
      </div>
      <div class="resizeHandle bottom" @mousedown="startResize('bottom', $event)">
        <i class="el-icon-bottom"></i>
      </div>
      <div class="resizeHandle left" @mousedown="startResize('left', $event)">
        <i class="el-icon-left"></i>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import {
  todayList,
  getNodeList,
  completeReview,
  postponeReview,
  resetReview,
  removeReview,
  forgotReview,
  todayStr
} from '@/review'
import { buildParentMap, buildReviewGroups, toDirectorySubjectList } from '@/review/tree'
import {
  STATUS_OPTIONS,
  DUE_OPTIONS,
  SORT_OPTIONS,
  buildFileOptions,
  applyReviewList
} from '@/review/listTools'
import {
  setCurrentFileId,
  readFileData,
  clearDataCache,
  getCurrentMapIdentity,
  readMapDataByIdentity
} from '@/api'
import * as directoryStorage from '@/api/directoryStorage'
import { notifyWorkspaceChanged } from '@/api/workspaceEvents'

const STATUS_MAP = {
  new: '待开始',
  learning: '学习中',
  reviewing: '复习中',
  mastered: '已掌握'
}
const STATUS_TYPE = {
  new: 'info',
  learning: 'warning',
  reviewing: 'primary',
  mastered: 'success'
}
const FLOAT_CONFIG_KEY = 'MIND_MAP_REVIEW_FLOAT_CONFIG'

export default {
  name: 'ReviewFloat',
  data() {
    return {
      collapsed: true,
      view: 'today',
      // 筛选 / 排序（会话态，不持久化，避免下次打开被遗留筛选困惑）
      fStatus: '',
      fDue: '',
      fFile: '',
      fTag: '',
      sortMode: 'urgency',
      right: 16,
      bottom: 20,
      panelWidth: 320,
      panelHeight: 480,
      MIN_WIDTH: 260,
      MIN_HEIGHT: 240,
      dueList: [],
      allList: [],
      dueCount: 0,
      hover: false,
      dragged: false,
      behindOverlays: false,
      timer: null,
      mindMap: null,
      collapsedGroups: {},
      activeDocumentHandlers: [],
      pendingLocate: null,
      // fileId -> childUid→parentUid 映射缓存（异步读取，供分组用）
      parentMapCache: {}
    }
  },
  mounted() {
    this.loadConfig()
    this.clampToViewport()
    window.addEventListener('resize', this.onWindowResize)
    this.startOverlayWatch()
  },
  computed: {
    todayStrValue() {
      return todayStr()
    },
    // 导入的选项常量包装给模板（Vue2 模板不能直接访问 import 值）
    STATUS_OPTIONS() {
      return STATUS_OPTIONS
    },
    DUE_OPTIONS() {
      return DUE_OPTIONS
    },
    SORT_OPTIONS() {
      return SORT_OPTIONS
    },
    // 科目下拉选项：按全部节点聚合（含数量）
    fileOptions() {
      return buildFileOptions(this.allList)
    },
    // 标签下拉：去重收集全部节点标签
    allTags() {
      const set = new Set()
      ;(this.allList || []).forEach(n => {
        ;(n.tags || []).forEach(t => set.add(t))
      })
      return [...set].sort()
    },
    // 是否有任一筛选生效（含排序非默认）→ 控制「清除」按钮
    filterActive() {
      return !!(this.fStatus || this.fDue || this.fFile || this.fTag || this.sortMode !== 'urgency')
    },
    // 当前筛选/排序条件
    filterCond() {
      return {
        status: this.fStatus,
        due: this.fDue,
        file: this.fFile,
        tag: this.fTag,
        sort: this.sortMode
      }
    },
    // 应用筛选排序后的今日列表（徽标 dueCount 保持原始总数不变）
    dueFiltered() {
      return applyReviewList(this.dueList, this.filterCond)
    },
    // 应用筛选排序后的全部列表
    allFiltered() {
      return applyReviewList(this.allList, this.filterCond)
    },
    dueGroups() {
      return this.buildGroups(this.dueFiltered)
    },
    // 全部节点按文件分组（组内按真实父子关系排序）
    allGroups() {
      return this.buildGroups(this.allFiltered)
    },
    ...mapState({
      isDark: state => state.localConfig.isDark,
      isDirectoryMode: state => state.isDirectoryMode
    })
  },
  created() {
    this.refresh()
    this.$bus.$on('app_inited', mm => {
      this.mindMap = mm
    })
    this.$bus.$on('node_tree_render_end', this.onTreeRenderEnd)
    this.$bus.$on('review_data_change', this.refresh)
    this.timer = setInterval(this.refresh, 60000)
  },
  beforeDestroy() {
    clearInterval(this.timer)
    window.removeEventListener('resize', this.onWindowResize)
    this.stopOverlayWatch()
    this.activeDocumentHandlers.forEach(({ event, handler }) => {
      document.removeEventListener(event, handler)
    })
    this.$bus.$off('app_inited')
    this.$bus.$off('node_tree_render_end', this.onTreeRenderEnd)
    this.$bus.$off('review_data_change', this.refresh)
    this.pendingLocate = null
  },
  methods: {
    clearFilters() {
      this.fStatus = ''
      this.fDue = ''
      this.fFile = ''
      this.fTag = ''
      this.sortMode = 'urgency'
    },
    buildGroups(list) {
      const parentMaps = {}
      ;(list || []).forEach(item => {
        if (!item.fileId || parentMaps[item.fileId]) return
        // 目录模式下正文来自工作目录文件，这里用异步填充的缓存；
        // 浏览器模式同步读 localStorage。
        parentMaps[item.fileId] = this.getParentMapSync(item.fileId)
      })
      return buildReviewGroups(list, parentMaps).map(group => ({
        ...group,
        collapsed: !!this.collapsedGroups[group.key]
      }))
    },
    // 同步拿父子映射：优先用异步缓存（目录模式），否则回退 localStorage
    getParentMapSync(fileId) {
      if (Object.prototype.hasOwnProperty.call(this.parentMapCache, fileId)) {
        return this.parentMapCache[fileId]
      }
      return buildParentMap(readFileData(fileId))
    },
    isOverdue(item) {
      return !!(item && item.nextReview && item.nextReview < todayStr())
    },
    loadConfig() {
      try {
        const raw = localStorage.getItem(FLOAT_CONFIG_KEY)
        const config = raw ? JSON.parse(raw) : {}
        ;['right', 'bottom', 'panelWidth', 'panelHeight'].forEach(key => {
          if (Number.isFinite(Number(config[key]))) this[key] = Number(config[key])
        })
        if (config.view === 'today' || config.view === 'all') this.view = config.view
        if (typeof config.collapsed === 'boolean') this.collapsed = config.collapsed
      } catch (e) {
        // 配置损坏时使用默认值，不影响复习功能。
      }
    },
    saveConfig() {
      try {
        localStorage.setItem(FLOAT_CONFIG_KEY, JSON.stringify({
          right: this.right,
          bottom: this.bottom,
          panelWidth: this.panelWidth,
          panelHeight: this.panelHeight,
          collapsed: this.collapsed,
          view: this.view
        }))
        notifyWorkspaceChanged()
      } catch (e) {
        // localStorage 不可用时保留当前内存配置。
      }
    },
    clampToViewport() {
      const maxWidth = Math.max(160, window.innerWidth - 16)
      const maxHeight = Math.max(160, window.innerHeight - 16)
      const minWidth = Math.min(this.MIN_WIDTH, maxWidth)
      const minHeight = Math.min(this.MIN_HEIGHT, maxHeight)
      this.panelWidth = Math.max(minWidth, Math.min(maxWidth, this.panelWidth))
      this.panelHeight = Math.max(minHeight, Math.min(maxHeight, this.panelHeight))
      const width = this.collapsed ? 48 : this.panelWidth
      const height = this.collapsed ? 48 : this.panelHeight
      this.right = Math.max(0, Math.min(window.innerWidth - width - 8, this.right))
      this.bottom = Math.max(0, Math.min(window.innerHeight - height - 8, this.bottom))
    },
    onWindowResize() {
      this.clampToViewport()
      this.saveConfig()
    },
    postpone(item) {
      if (!postponeReview(item.uid)) return
      this.$message.success('已推迟一天')
      this.$bus.$emit('review_data_change')
      this.refresh()
    },
    refresh() {
      // 目录模式下把复习记录归一为现役科目导图的 fileId（<科目>.smm），
      // 让历史 fileId（浏览器旧代次 file_default/file_xxx）归并到同一科目组，
      // 并可被定位命中现役科目导图。仅做展示层派生，不写回存储。
      const rawDue = todayList()
      const rawAll = getNodeList()
      this.dueList = toDirectorySubjectList(rawDue, this.isDirectoryMode)
      this.allList = toDirectorySubjectList(rawAll, this.isDirectoryMode)
      this.dueCount = this.dueList.length
      this.loadParentMaps()
    },
    // 目录模式下异步读取各导图文件用于分组（不生成 blob URL，仅需 uid 结构）
    loadParentMaps() {
      const current = getCurrentMapIdentity()
      const fileIds = new Set()
      ;[...this.dueList, ...this.allList].forEach(item => {
        if (item && item.fileId) fileIds.add(item.fileId)
      })
      if (current.fileId) fileIds.add(current.fileId)
      const targets = [...fileIds].filter(
        id => !Object.prototype.hasOwnProperty.call(this.parentMapCache, id)
      )
      if (targets.length === 0) return
      Promise.all(
        targets.map(async id => {
          const isDir =
            (current.isDirectory && !/^file_/.test(id)) ||
            id.toLowerCase().endsWith('.smm')
          if (isDir) {
            const data = await readMapDataByIdentity({
              fileId: id,
              isDirectory: true
            })
            this.parentMapCache = {
              ...this.parentMapCache,
              [id]: buildParentMap(data)
            }
          } else {
            // 浏览器模式：localStorage 同步可读，直接缓存
            this.parentMapCache = {
              ...this.parentMapCache,
              [id]: buildParentMap(readFileData(id))
            }
          }
        })
      ).then(() => {
        // 触发 computed 重新计算
        this.$forceUpdate()
      })
    },
    // 定位到思维导图中的对应节点：展开路径 + 居中 + 高亮
    async locate(item) {
      if (!this.mindMap) {
        this.$message.warning('思维导图未就绪')
        return
      }
      const renderer = this.mindMap.renderer
      if (!renderer || !item || !item.uid) return
      const current = getCurrentMapIdentity()
      // 跨文件时先切换数据，等真实树渲染完成后再定位，避免旧树误跳。
      if (item.fileId && item.fileId !== current.fileId) {
        this.pendingLocate = item
        if (current.isDirectory) {
          // 目录模式：切换到工作目录中的另一张导图
          const opened = await directoryStorage.openMapFile(item.fileId)
          if (!opened || !opened.ok) {
            this.pendingLocate = null
            this.$message.warning('目标导图不存在或已删除')
            return
          }
          this.$store.commit('setCurrentSmmFile', opened.fileName)
          clearDataCache()
          this.$bus.$emit('setData', opened.data)
        } else {
          setCurrentFileId(item.fileId)
          clearDataCache()
          this.$bus.$emit('setData', readFileData(item.fileId))
        }
        return
      }
      this.doLocate(item)
    },
    onTreeRenderEnd() {
      if (!this.pendingLocate) return
      const item = this.pendingLocate
      this.pendingLocate = null
      const current = getCurrentMapIdentity()
      if (!item.fileId || item.fileId === current.fileId) {
        this.doLocate(item)
      }
    },
    getNodeParentUid(node) {
      return node && node.parent && node.parent.uid ? node.parent.uid : ''
    },
    doLocate(item) {
      const renderer = this.mindMap.renderer
      // 逾期/待复习节点常位于“已折叠”的子树里：折叠时其子节点实例尚未创建，
      // findNodeByUid 会返回空。因此必须先按真实 parent 链逐级展开，展开完成（可能触发
      // 重渲染）后再查找节点；不能先查再决定是否展开。
      renderer.expandToNodeUid(item.uid, () => {
        const target = renderer.findNodeByUid(item.uid)
        if (!target) {
          this.$message.warning('当前导图中未找到该节点，已停止定位')
          return
        }
        // 复习记录携带父 UID 时校验真实父节点，防止同 UID/旧路径导致错误跳转。
        if (item.parentUid && this.getNodeParentUid(target) !== item.parentUid) {
          this.$message.warning('节点父子关系已变化，已停止定位')
          return
        }
        target.active()
        renderer.moveNodeToCenter(target)
        // 高亮发光提示
        target.group && target.group.addClass('smm-node-highlight')
        setTimeout(() => {
          target.group && target.group.removeClass('smm-node-highlight')
        }, 1500)
        this.$message.success('已定位：' + item.name)
      })
    },
    statusText(s) {
      return STATUS_MAP[s] || s
    },
    statusType(s) {
      return STATUS_TYPE[s] || 'info'
    },
    complete(item) {
      completeReview(item.uid)
      this.$message.success('已完成')
      this.$bus.$emit('review_data_change')
      this.refresh()
    },
    forgot(item) {
      // 选择遗忘后的下次复习日期（复用复习模块逻辑，保持记录一致）
      this.$prompt('几天后再复习？', '忘了？', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: '1',
        inputPattern: /^[1-9]\d*$/,
        inputErrorMessage: '请输入正整数',
        inputValidator: (value) => {
          const days = parseInt(value)
          if (days > 365) {
            return '最多支持365天后复习'
          }
          return true
        }
      }).then(({ value }) => {
        const days = parseInt(value)
        const result = forgotReview(item.uid, days)
        if (!result) {
          this.$message.warning('该节点不在复习计划中')
          return
        }
        this.$message.success(`已标记遗忘，${days} 天后（${result.nextReview}）再复习`)
        this.$bus.$emit('review_data_change')
        this.refresh()
      }).catch(() => {
        // 用户取消
      })
    },
    reset(item) {
      resetReview(item.uid)
      this.$message.success('已重置')
      this.$bus.$emit('review_data_change')
      this.refresh()
    },
    remove(item) {
      removeReview(item.uid)
      this.$message.success('已移除')
      this.$bus.$emit('review_data_change')
      this.refresh()
    },
    toggleGroup(key) {
      this.$set(this.collapsedGroups, key, !this.collapsedGroups[key])
    },
    onToggle() {
      if (this.dragged) {
        this.dragged = false
        return
      }
      this.collapsed = !this.collapsed
      this.ensureInView()
      this.saveConfig()
    },
    goReviewPage() {
      const route = this.$router.resolve({ path: '/review' })
      window.open(route.href, '_blank', 'noopener,noreferrer')
    },
    // 按住拖动小窗（按面板实际尺寸限制，保证完整在视口内）
    startDrag(e) {
      if (e.button !== 0) return
      e.preventDefault()
      const startX = e.clientX
      const startY = e.clientY
      const rect = this.$el.getBoundingClientRect()
      const startRight = window.innerWidth - rect.right
      const startBottom = window.innerHeight - rect.bottom
      let moved = false
      const onMove = ev => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true
        const w = this.collapsed ? 48 : this.panelWidth
        const h = this.collapsed ? 48 : this.panelHeight
        let r = startRight - dx
        let b = startBottom - dy
        // 防止超出窗口：右边距 ≥ 0，且左边不越出屏幕
        r = Math.max(0, Math.min(window.innerWidth - w - 8, r))
        b = Math.max(0, Math.min(window.innerHeight - h - 8, b))
        this.right = r
        this.bottom = b
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        this.activeDocumentHandlers = []
        if (moved) this.dragged = true
        this.saveConfig()
      }
      this.activeDocumentHandlers = [
        { event: 'mousemove', handler: onMove },
        { event: 'mouseup', handler: onUp }
      ]
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },

    // 多方向拖拽调整面板大小
    startResize(direction, e) {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const startW = this.panelWidth
      const startH = this.panelHeight
      const startRight = this.right
      const startBottom = this.bottom

      const onMove = ev => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        const vw = window.innerWidth
        const vh = window.innerHeight

        // 本面板用 right/bottom（贴右下）定位，边与位置参数互相耦合：
        //   左边缘 x = vw - right - width；右边缘 x = vw - right
        //   上边缘 y = vh - bottom - height；下边缘 y = vh - bottom
        // 因此“某边固定”时，right/bottom 必须随宽高反向补偿（不能只改尺寸）。
        // 关键约束：被拖边的增长上限 = 固定边到视口边界的距离 —— 一旦被拖边贴住
        // 屏幕边缘就停止增长，绝不能把增长“转移”到固定边（旧实现先放大再回头
        // clamp 位置，贴边时会向对边反转，表现为“拖下端却上端在长”）。
        const dragsLeft = direction === 'left' || direction === 'bottom-left' || direction === 'top-left'
        const dragsRight = direction === 'right' || direction === 'bottom-right' || direction === 'top-right'
        const dragsUp = direction === 'top' || direction === 'top-left' || direction === 'top-right'
        const dragsDown = direction === 'bottom' || direction === 'bottom-left' || direction === 'bottom-right'

        // 固定边到视口右/下边缘的距离（拖拽全程不变）
        const rightDist = startRight + startW // 左边缘固定时：到视口右边缘
        const bottomDist = startBottom + startH // 上边缘固定时：到视口下边缘

        // 尺寸上限：被拖边最多到视口边界；固定边侧的最大宽度/高度由固定边位置给出
        const maxW = dragsRight
          ? Math.max(this.MIN_WIDTH, rightDist) // 左边缘固定，右边缘可到视口右缘
          : Math.max(this.MIN_WIDTH, vw - startRight) // 右边缘固定，左边缘可到视口左缘
        const maxH = dragsDown
          ? Math.max(this.MIN_HEIGHT, bottomDist) // 上边缘固定，下边缘可到视口下缘
          : Math.max(this.MIN_HEIGHT, vh - startBottom) // 下边缘固定，上边缘可到视口上缘

        let w = startW
        let h = startH
        if (dragsLeft || dragsRight) {
          // 拖右边缘/右角向右扩；拖左边缘/左角向左扩
          const target = startW + (dragsRight ? dx : -dx)
          w = Math.max(this.MIN_WIDTH, Math.min(maxW, target))
        }
        if (dragsUp || dragsDown) {
          // 拖下边缘/下角向下扩；拖上边缘/上角向上扩
          const target = startH + (dragsDown ? dy : -dy)
          h = Math.max(this.MIN_HEIGHT, Math.min(maxH, target))
        }

        // 由“固定边不动”反推 right/bottom：
        //   · 右边缘固定（拖左侧）→ right 保持初值；左边缘固定（拖右侧）→ right = 固定边距 - w
        //   · 下边缘固定（拖上侧）→ bottom 保持初值；上边缘固定（拖下侧）→ bottom = 固定边距 - h
        const r = dragsLeft ? startRight : dragsRight ? rightDist - w : startRight
        const b = dragsUp ? startBottom : dragsDown ? bottomDist - h : startBottom

        this.panelWidth = w
        this.panelHeight = h
        // 保险：双端都收进视口（正常拖拽下已被上限约束，这里只兜底启动时越界的旧配置）
        this.right = Math.max(0, Math.min(Math.max(0, vw - w), r))
        this.bottom = Math.max(0, Math.min(Math.max(0, vh - h), b))
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        this.activeDocumentHandlers = []
        this.saveConfig()
      }

      this.activeDocumentHandlers = [
        { event: 'mousemove', handler: onMove },
        { event: 'mouseup', handler: onUp }
      ]
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },

    // 展开/折叠时确保位置不越界
    ensureInView() {
      this.$nextTick(() => {
        const w = this.collapsed ? 48 : this.panelWidth
        const h = this.collapsed ? 48 : this.panelHeight
        this.right = Math.max(0, Math.min(this.right, Math.max(0, window.innerWidth - w - 8)))
        this.bottom = Math.max(0, Math.min(this.bottom, Math.max(0, window.innerHeight - h - 8)))
        this.dragged = false
      })
    },
  }
}
</script>

<style lang="less" scoped>
.reviewFloat {
  position: fixed;
  z-index: 2000;
  opacity: 0.82;
  &:hover {
    opacity: 1;
  }

  .floatBtn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #409eff;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 22px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    position: relative;
    user-select: none;

    .badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      padding: 0 4px;
      border-radius: 9px;
      background: #f56c6c;
      color: #fff;
      font-size: 12px;
      text-align: center;
      box-sizing: border-box;
    }
  }

  .floatPanel {
    width: 320px;
    height: 480px;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    overflow: hidden;
    user-select: none;
    position: relative;

    .panelHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: #f5f7fa;
      cursor: move;
      font-weight: 600;
      font-size: 14px;

      .actions {
        display: flex;
        align-items: center;
        gap: 4px;

        .el-icon-minus {
          cursor: pointer;
          color: #909399;
          font-size: 16px;
        }
      }
    }

    .viewTabs {
      display: flex;
      border-bottom: 1px solid #f0f2f5;

      .viewTab {
        flex: 1;
        text-align: center;
        padding: 6px 0;
        font-size: 13px;
        color: #909399;
        cursor: pointer;

        &.active {
          color: #409eff;
          font-weight: 600;
          border-bottom: 2px solid #409eff;
        }
      }
    }

    .filterBar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-bottom: 1px solid #f0f2f5;
      background: #fafbfc;

      .fbSelect {
        width: 96px;
      }

      .fbClear {
        margin-left: auto;
        padding: 0 2px;
      }
    }

    .panelBody {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 0;

      .empty {
        padding: 24px 0;
        text-align: center;
        color: #909399;
        font-size: 13px;
      }

      .dueItem {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid #f0f2f5;

        &:last-child {
          border-bottom: none;
        }

        .itemInfo {
          min-width: 0;
          flex: 1;
          margin-right: 8px;

          .itemName {
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .itemMeta {
            font-size: 12px;
            color: #909399;
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            white-space: nowrap;
            overflow: hidden;

            .overdueTag {
              color: #f56c6c;
              margin-left: 6px;
            }

            .fileTag {
              background: #ecf5ff;
              color: #409eff;
              padding: 0 6px;
              border-radius: 3px;
              margin-right: 6px;
            }
          }
        }

        .itemOps {
          white-space: nowrap;

          .danger {
            color: #f56c6c;
          }
        }
      }

      .allGroup {
        .groupHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          background: #fafafa;
          font-size: 13px;
          font-weight: 600;

          .groupName {
            display: flex;
            align-items: center;

            .el-icon-arrow-right {
              margin-right: 6px;
              transition: transform 0.2s;

              &.expanded {
                transform: rotate(90deg);
              }
            }
          }

          .groupCount {
            color: #909399;
            font-weight: 400;
            font-size: 12px;
          }
        }
      }
    }
  }

  &.isDark {
    .floatPanel {
      background: #2b3034;

      .panelHeader {
        background: #363b3f;
        color: #fff;
      }

      .viewTabs {
        border-bottom-color: rgba(255, 255, 255, 0.1);

        .viewTab.active {
          color: #409eff;
        }
      }

      .filterBar {
        background: #2b3034;
        border-bottom-color: rgba(255, 255, 255, 0.1);

        ::v-deep .el-input__inner {
          color: #c0c4cc;
          border-color: rgba(255, 255, 255, 0.18);
          background: #363b3f;
        }

        ::v-deep .el-input__inner::placeholder {
          color: #909399;
        }
      }

      .dueItem {
        border-bottom-color: rgba(255, 255, 255, 0.08);

        .itemMeta {
          color: #909399;
        }
      }

      .allGroup .groupHeader {
        background: #33383c;
      }
    }
  }

  // 调整大小把手：四边+四角
  .floatPanel .resizeHandle {
    position: absolute;
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c0c4cc;
    z-index: 5;
    opacity: 0;
    transition: opacity 0.2s;

    &:hover {
      color: #409eff;
      opacity: 1;
    }

    .el-icon {
      font-size: 10px;
    }

    // 四角
    &.top-left {
      top: 0;
      left: 0;
      cursor: nw-resize;
      border-radius: 2px 0 0 0;
    }

    &.top-right {
      top: 0;
      right: 0;
      cursor: ne-resize;
      border-radius: 0 2px 0 0;
    }

    &.bottom-left {
      bottom: 0;
      left: 0;
      cursor: sw-resize;
      border-radius: 0 0 0 2px;
    }

    &.bottom-right {
      bottom: 0;
      right: 0;
      cursor: nwse-resize;
      border-radius: 0 0 2px 0;
    }

    // 四边
    &.top {
      top: 0;
      left: 6px;
      right: 6px;
      height: 4px;
      cursor: n-resize;
      border-radius: 2px;
    }

    &.right {
      top: 6px;
      right: 0;
      bottom: 6px;
      width: 4px;
      cursor: e-resize;
      border-radius: 2px;
    }

    &.bottom {
      bottom: 0;
      left: 6px;
      right: 6px;
      height: 4px;
      cursor: s-resize;
      border-radius: 2px;
    }

    &.left {
      top: 6px;
      left: 0;
      bottom: 6px;
      width: 4px;
      cursor: w-resize;
      border-radius: 2px;
    }
  }

  // 鼠标悬停时显示调整把手
  .floatPanel:hover .resizeHandle {
    opacity: 0.6;
  }

  .floatPanel:hover .resizeHandle:hover {
    opacity: 1;
  }
}
</style>
