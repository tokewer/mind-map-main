<template>
  <el-dialog
    :title="dialogTitle"
    :visible.sync="visible"
    width="440px"
    :append-to-body="true"
    :close-on-click-modal="false"
    @closed="onClosed"
  >
    <!-- 未加入复习：添加表单 -->
    <template v-if="!reviewNode">
      <el-alert
        v-if="archivedNode"
        class="archivedAlert"
        type="info"
        :closable="false"
        show-icon
      >
        <div slot="title" class="archivedAlertTitle">
          检测到历史复习进度：已复习 {{ archivedNode.times }} 次
          <span v-if="archivedNode.cards && archivedNode.cards.length">，包含 {{ archivedNode.cards.length }} 张卡片</span>
        </div>
        <div class="archivedAlertDesc">
          重新加入将自动保留上次所有复习进度、周期与卡片内容。
        </div>
      </el-alert>
      <el-form label-width="76px" size="small" :style="{ marginTop: archivedNode ? '12px' : '0' }">
        <el-form-item label="节点">
          <span class="nodeName">{{ nodeName }}</span>
          <div class="nodePath" v-if="nodePath">{{ nodePath }}</div>
        </el-form-item>
        <el-form-item label="复习周期">
          <el-input
            v-model="cyclesInput"
            placeholder="如：1,3,4 或 1d-3d-4d"
          ></el-input>
          <div class="tip">
            间隔天数序列：第1次复习后隔 X 天 → 第2次、再隔 Y 天 → 第3次……用尽即视为已掌握。
          </div>
        </el-form-item>
      </el-form>
    </template>

    <!-- 已加入复习：管理 -->
    <template v-else>
      <div class="reviewInfo">
        <div class="infoRow stageRow">
          <span class="label">复习阶段</span>
          <span class="value reviewStage">{{ stageText }}</span>
        </div>
        <div class="stageTip">{{ stageDescription }}</div>
        <div class="infoRow">
          <span class="label">当前次数</span>
          <span class="value">
            {{ reviewNode.times }} / {{ reviewNode.cycles.length }} 次
          </span>
        </div>
        <div class="infoRow">
          <span class="label">周期序列</span>
          <span class="value">{{ cyclesStr }}</span>
        </div>
        <div class="infoRow">
          <span class="label">下次复习</span>
          <span class="value">{{ reviewNode.nextReview || '已掌握' }}</span>
        </div>
        <div class="infoRow">
          <span class="label">状态</span>
          <span class="value">{{ statusText }}</span>
        </div>
        <el-form label-width="76px" size="small" style="margin-top: 12px;">
          <el-form-item label="复习周期">
            <el-input v-model="cyclesInput" placeholder="如：1,3,4"></el-input>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <div slot="footer" class="dialog-footer">
      <template v-if="!reviewNode">
        <el-button size="small" @click="visible = false">取消</el-button>
        <el-button
          v-if="archivedNode"
          size="small"
          type="warning"
          plain
          @click="onAdd(true)"
        >从头全新开始</el-button>
        <el-button type="primary" size="small" @click="onAdd(false)">
          {{ archivedNode ? '恢复并加入复习' : '加入复习' }}
        </el-button>
      </template>
      <template v-else>
        <el-button size="small" @click="onRemove" type="danger" plain>移除</el-button>
        <el-button size="small" @click="onReset">重置</el-button>
        <el-button size="small" @click="onSaveCycles">保存周期</el-button>
        <el-button type="primary" size="small" @click="onComplete">完成一次复习</el-button>
        <el-button size="small" :type="focusStatus ? 'warning' : 'info'" @click="onToggleFocus">
          {{ focusStatus ? '取消重点' : '标记重点' }}
        </el-button>
      </template>
    </div>
  </el-dialog>
</template>

<script>
import {
  getNode,
  getArchivedNode,
  addReview,
  removeReview,
  completeReview,
  resetReview,
  updateCycles,
  cyclesToStr,
  parseCycles,
  getDefaultCycles,
  getReviewStage,
  REVIEW_STAGES,
  toggleFocus
} from '@/review'

export default {
  name: 'ReviewDialog',
  data() {
    return {
      visible: false,
      uid: '',
      nodeName: '',
      nodePath: '',
      fileId: '',
      fileName: '',
      parentUid: '',
      cyclesInput: '',
      refreshVersion: 0
    }
  },
  computed: {
    reviewNode() {
      // 通过 refreshVersion 建立响应式依赖，避免直接依赖非 Vue 响应式 localStorage。
      this.refreshVersion
      return this.uid ? getNode(this.uid) : null
    },
    archivedNode() {
      this.refreshVersion
      return this.uid ? getArchivedNode(this.uid) : null
    },
    focusStatus() {
      return !!(this.reviewNode && this.reviewNode.isFocus)
    },
    cyclesStr() {
      return this.reviewNode ? cyclesToStr(this.reviewNode.cycles) : ''
    },
    stage() {
      return getReviewStage(this.reviewNode)
    },
    stageInfo() {
      return REVIEW_STAGES.find(item => item.stage === this.stage) || REVIEW_STAGES[0]
    },
    stageText() {
      return `${this.stageInfo.title}：${this.stageInfo.text.split('：')[0]}`
    },
    stageDescription() {
      return this.stageInfo.text
    },
    statusText() {
      const map = {
        new: '待开始',
        learning: '学习中',
        reviewing: '复习中',
        mastered: '已掌握'
      }
      return this.reviewNode ? map[this.reviewNode.status] || this.reviewNode.status : ''
    },
    dialogTitle() {
      return this.reviewNode ? '复习管理' : '加入复习'
    }
  },
  created() {
    this.$bus.$on('open_review_dialog', this.open)
    this.$bus.$on('review_data_change', this.onReviewDataChange)
  },
  beforeDestroy() {
    this.$bus.$off('open_review_dialog', this.open)
    this.$bus.$off('review_data_change', this.onReviewDataChange)
  },
  methods: {
    open(info) {
      this.uid = info && info.uid ? info.uid : ''
      this.nodeName = (info && info.name) || ''
      this.nodePath = (info && info.path) || ''
      this.fileId = (info && info.fileId) || ''
      this.fileName = (info && info.fileName) || ''
      this.parentUid = (info && info.parentUid) || ''
      const existing = this.uid ? getNode(this.uid) : null
      const archived = this.uid ? getArchivedNode(this.uid) : null
      if (existing) {
        this.cyclesInput = cyclesToStr(existing.cycles)
      } else if (archived && archived.cycles && archived.cycles.length) {
        this.cyclesInput = cyclesToStr(archived.cycles)
      } else {
        this.cyclesInput = cyclesToStr(getDefaultCycles())
      }
      this.visible = true
    },
    onClosed() {
      this.uid = ''
      this.refreshVersion += 1
    },
    onReviewDataChange() {
      this.refreshVersion += 1
    },
    onAdd(resetProgress = false) {
      const cycles = parseCycles(this.cyclesInput)
      if (!cycles.length) {
        this.$message.warning('请填写有效的复习周期，如 1,3,4')
        return
      }
      const res = addReview({
        uid: this.uid,
        name: this.nodeName,
        path: this.nodePath,
        fileId: this.fileId,
        fileName: this.fileName,
        parentUid: this.parentUid,
        cycles,
        resetProgress
      })
      if (res && res.restoredFromArchive) {
        this.$message.success(`已恢复复习计划，保留历史进度（已复习 ${res.times} 次）`)
      } else {
        this.$message.success('已加入复习（阶段 1：骨架）')
      }
      this.visible = false
      this.$bus.$emit('review_data_change')
    },
    onSaveCycles() {
      const cycles = parseCycles(this.cyclesInput)
      if (!cycles.length) {
        this.$message.warning('请填写有效的复习周期，如 1,3,4')
        return
      }
      updateCycles(this.uid, cycles)
      this.$message.success('复习周期已保存')
      this.$bus.$emit('review_data_change')
    },
    onComplete() {
      completeReview(this.uid)
      this.$message.success('已完成一次复习')
      this.$bus.$emit('review_data_change')
    },
    onReset() {
      resetReview(this.uid)
      this.$message.success('已重置进度')
      this.$bus.$emit('review_data_change')
    },
    onRemove() {
      removeReview(this.uid)
      this.$message.success('已移出复习')
      this.visible = false
      this.$bus.$emit('review_data_change')
    },
    onToggleFocus() {
      const focused = toggleFocus(this.uid)
      this.$message.success(focused ? '已标记为重点' : '已取消重点')
      this.$bus.$emit('review_data_change')
    }
  }
}
</script>

<style lang="less" scoped>
.archivedAlert {
  margin-bottom: 14px;
  .archivedAlertTitle {
    font-weight: 600;
    color: #409eff;
  }
  .archivedAlertDesc {
    font-size: 12px;
    margin-top: 4px;
    color: #606266;
  }
}
.nodeName {
  font-weight: 600;
}
.nodePath {
  font-size: 12px;
  color: #999;
  word-break: break-all;
}
.tip,
.stageTip {
  font-size: 12px;
  color: #999;
  line-height: 1.5;
  margin-top: 6px;
}
.stageTip {
  padding: 6px 8px;
  border-radius: 4px;
  color: #996515;
  background: #fff8e6;
}
.reviewStage {
  color: #e6a23c;
}
.reviewInfo {
  .infoRow {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    .label {
      color: #999;
    }
    .value {
      font-weight: 500;
    }
  }
}
.dialog-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
</style>
