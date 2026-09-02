<template>
  <div
    class="reviewFloat"
    :class="{ collapsed, isDark }"
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

      <div class="panelBody">
        <!-- 今日视图 -->
        <template v-if="view === 'today'">
          <div v-if="dueList.length === 0" class="empty">今日没有待复习项</div>
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
      <div class="resizeHandle top-left" @mousedown="startResize('top-left')">
        <i class="el-icon-top-left"></i>
      </div>
      <div class="resizeHandle top-right" @mousedown="startResize('top-right')">
        <i class="el-icon-top-right"></i>
      </div>
      <div class="resizeHandle bottom-left" @mousedown="startResize('bottom-left')">
        <i class="el-icon-bottom-left"></i>
      </div>
      <div class="resizeHandle bottom-right" @mousedown="startResize('bottom-right')">
        <i class="el-icon-bottom-right"></i>
      </div>

      <!-- 四边 -->
      <div class="resizeHandle top" @mousedown="startResize('top')">
        <i class="el-icon-top"></i>
      </div>
      <div class="resizeHandle right" @mousedown="startResize('right')">
        <i class="el-icon-right"></i>
      </div>
      <div class="resizeHandle bottom" @mousedown="startResize('bottom')">
        <i class="el-icon-bottom"></i>
      </div>
      <div class="resizeHandle left" @mousedown="startResize('left')">
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
  todayStr
} from '@/review'
import { buildParentMap, buildReviewGroups } from '@/review/tree'
import { getCurrentFileId, setCurrentFileId, readFileData, clearDataCache } from '@/api'
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
      timer: null,
      mindMap: null,
      collapsedGroups: {},
      activeDocumentHandlers: [],
      pendingLocate: null
    }
  },
  mounted() {
    this.loadConfig()
    this.clampToViewport()
    window.addEventListener('resize', this.onWindowResize)
  },
  computed: {
    todayStrValue() {
      return todayStr()
    },
    dueGroups() {
      return this.buildGroups(this.dueList)
    },
    // 全部节点按文件分组（组内按真实父子关系排序）
    allGroups() {
      return this.buildGroups(this.allList)
    },
    ...mapState({
      isDark: state => state.localConfig.isDark
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
    this.activeDocumentHandlers.forEach(({ event, handler }) => {
      document.removeEventListener(event, handler)
    })
    this.$bus.$off('app_inited')
    this.$bus.$off('node_tree_render_end', this.onTreeRenderEnd)
    this.$bus.$off('review_data_change', this.refresh)
    this.pendingLocate = null
  },
  methods: {
    buildGroups(list) {
      const parentMaps = {}
      ;(list || []).forEach(item => {
        if (!item.fileId || parentMaps[item.fileId]) return
        parentMaps[item.fileId] = buildParentMap(readFileData(item.fileId))
      })
      return buildReviewGroups(list, parentMaps).map(group => ({
        ...group,
        collapsed: !!this.collapsedGroups[group.key]
      }))
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
      this.dueList = todayList()
      this.allList = getNodeList()
      this.dueCount = this.dueList.length
    },
    // 定位到思维导图中的对应节点：展开路径 + 居中 + 高亮
    locate(item) {
      if (!this.mindMap) {
        this.$message.warning('思维导图未就绪')
        return
      }
      const renderer = this.mindMap.renderer
      if (!renderer || !item || !item.uid) return
      // 跨文件时先切换数据，等真实树渲染完成后再定位，避免旧树误跳。
      if (item.fileId && item.fileId !== getCurrentFileId()) {
        this.pendingLocate = item
        setCurrentFileId(item.fileId)
        clearDataCache()
        this.$bus.$emit('setData', readFileData(item.fileId))
        return
      }
      this.doLocate(item)
    },
    onTreeRenderEnd() {
      if (!this.pendingLocate) return
      const item = this.pendingLocate
      this.pendingLocate = null
      if (!item.fileId || item.fileId === getCurrentFileId()) {
        this.doLocate(item)
      }
    },
    getNodeParentUid(node) {
      return node && node.parent && node.parent.uid ? node.parent.uid : ''
    },
    doLocate(item) {
      const renderer = this.mindMap.renderer
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
      // 展开到节点（由渲染器按真实 parent 链展开）
      renderer.expandToNodeUid(item.uid, () => {
        const target = renderer.findNodeByUid(item.uid)
        if (target) {
          target.active()
          renderer.moveNodeToCenter(target)
          // 高亮发光提示
          target.group && target.group.addClass('smm-node-highlight')
          setTimeout(() => {
            target.group && target.group.removeClass('smm-node-highlight')
          }, 1500)
          this.$message.success('已定位：' + item.name)
        } else {
          this.$message.warning('未找到该节点')
        }
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
      // 显示频率选择对话框
      this.$prompt('请选择下次复习时间', '忘了？', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPlaceholder: '输入天数，如：1, 3, 7',
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
        const nextReview = new Date()
        nextReview.setDate(nextReview.getDate() + days)

        // 更新复习数据
        const reviewData = JSON.parse(localStorage.getItem('MIND_MAP_REVIEW_DATA') || '{}')
        if (reviewData[item.uid]) {
          reviewData[item.uid].nextReview = nextReview.toISOString().split('T')[0]
          reviewData[item.uid].status = 'learning'
          reviewData[item.uid].errorCount = (reviewData[item.uid].errorCount || 0) + 1
          localStorage.setItem('MIND_MAP_REVIEW_DATA', JSON.stringify(reviewData))

          this.$message.success(`已推迟 ${days} 天复习`)
          this.$bus.$emit('review_data_change')
          this.refresh()
        }
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

        let w = startW
        let h = startH
        let r = startRight
        let b = startBottom

        // 根据调整方向计算新的尺寸和位置
        switch (direction) {
          case 'bottom-right':
            // 右下角固定，只改变宽高
            w = Math.max(this.MIN_WIDTH, Math.min(window.innerWidth - 16, startW + dx))
            h = Math.max(this.MIN_HEIGHT, Math.min(window.innerHeight - 16, startH + dy))
            break

          case 'bottom-left':
            // 左下角调整
            w = Math.max(this.MIN_WIDTH, Math.min(window.innerWidth - 16, startW - dx))
            h = Math.max(this.MIN_HEIGHT, Math.min(window.innerHeight - 16, startH + dy))
            r = Math.max(0, Math.min(window.innerWidth - w - 8, startRight + dx))
            break

          case 'top-right':
            // 右上角调整
            w = Math.max(this.MIN_WIDTH, Math.min(window.innerWidth - 16, startW + dx))
            h = Math.max(this.MIN_HEIGHT, Math.min(window.innerHeight - 16, startH - dy))
            b = Math.max(0, Math.min(window.innerHeight - h - 8, startBottom + dy))
            break

          case 'top-left':
            // 左上角调整
            w = Math.max(this.MIN_WIDTH, Math.min(window.innerWidth - 16, startW - dx))
            h = Math.max(this.MIN_HEIGHT, Math.min(window.innerHeight - 16, startH - dy))
            r = Math.max(0, Math.min(window.innerWidth - w - 8, startRight + dx))
            b = Math.max(0, Math.min(window.innerHeight - h - 8, startBottom + dy))
            break

          case 'bottom':
            // 底边调整
            h = Math.max(this.MIN_HEIGHT, Math.min(window.innerHeight - 16, startH + dy))
            b = Math.max(0, Math.min(window.innerHeight - h - 8, startBottom + dy))
            break

          case 'top':
            // 顶边调整
            h = Math.max(this.MIN_HEIGHT, Math.min(window.innerHeight - 16, startH - dy))
            b = Math.max(0, Math.min(window.innerHeight - h - 8, startBottom + dy))
            break

          case 'right':
            // 右边调整
            w = Math.max(this.MIN_WIDTH, Math.min(window.innerWidth - 16, startW + dx))
            break

          case 'left':
            // 左边调整
            w = Math.max(this.MIN_WIDTH, Math.min(window.innerWidth - 16, startW - dx))
            r = Math.max(0, Math.min(window.innerWidth - w - 8, startRight + dx))
            break
        }

        this.panelWidth = w
        this.panelHeight = h
        this.right = r
        this.bottom = b
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
