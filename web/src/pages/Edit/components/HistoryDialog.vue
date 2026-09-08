<template>
  <el-dialog
    title="历史版本"
    :visible.sync="visible"
    width="520px"
    :append-to-body="true"
  >
    <div class="historyToolbar">
      <span class="tip">自动快照（约每 60 秒）+ 手动存档，点击恢复可回滚</span>
      <el-button size="mini" type="primary" plain @click="onSaveNow">保存当前版本</el-button>
      <el-button size="mini" type="danger" plain @click="onClearAll">清空历史</el-button>
    </div>
    <div class="historyList">
      <div v-if="loading" class="empty">加载中…</div>
      <div v-else-if="list.length === 0" class="empty">暂无历史版本</div>
      <div
        class="historyItem"
        v-for="(item, index) in list"
        :key="index"
        :class="{ dark: isDark }"
      >
        <div class="itemLeft">
          <span class="time">{{ formatTime(item.time) }}</span>
          <span class="tag" :class="{ manual: item.manual }">
            {{ item.manual ? '手动' : '自动' }}
          </span>
        </div>
        <div class="itemRight">
          <el-button
            size="mini"
            type="text"
            @click="onRestore(item)"
          >恢复</el-button>
          <el-button
            size="mini"
            type="text"
            class="dangerText"
            @click="onDeleteOne(item)"
          >删除</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'
import {
  getSnapshots,
  saveSnapshot,
  clearSnapshots,
  deleteSnapshot,
  flushStore,
  restoreSnapshot,
  getCurrentFileId,
  getDirectorySnapshots,
  saveDirectorySnapshot,
  clearDirectorySnapshots,
  deleteDirectorySnapshot,
  restoreDirectorySnapshot
} from '@/api'

const pad = n => String(n).padStart(2, '0')

export default {
  name: 'HistoryDialog',
  data() {
    return {
      visible: false,
      list: [],
      loading: false
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      isDirectoryMode: state => state.isDirectoryMode
    })
  },
  created() {
    this.$bus.$on('open_history_dialog', this.open)
  },
  beforeDestroy() {
    this.$bus.$off('open_history_dialog', this.open)
  },
  methods: {
    open() {
      this.refresh()
      this.visible = true
    },
    async refresh() {
      if (this.isDirectoryMode) {
        this.loading = true
        try {
          const list = await getDirectorySnapshots()
          this.list = (list || []).slice().reverse() // 显示倒序：最新在前
        } finally {
          this.loading = false
        }
        return
      }
      this.list = getSnapshots().slice().reverse() // 显示倒序：最新在前
    },
    formatTime(t) {
      const d = new Date(t)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    },
    async onSaveNow() {
      if (this.isDirectoryMode) {
        await saveDirectorySnapshot(true)
      } else {
        // 先把节流中的最新编辑落盘，快照才能包含刚改的内容
        if (this.$store.state.isHandleLocalFile) {
          this.$bus.$emit('flush_local_file')
        } else {
          flushStore()
        }
        saveSnapshot(getCurrentFileId(), true)
      }
      await this.refresh()
      this.$message.success('已保存当前版本')
    },
    onRestore(item) {
      this.$confirm('恢复该版本将覆盖当前内容，是否继续？', '提示', {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(async () => {
          if (this.isDirectoryMode) {
            const res = await restoreDirectorySnapshot(item.name)
            if (!res || !res.ok) {
              this.$message.error((res && res.message) || '恢复失败')
              return
            }
            this.$bus.$emit('setData', res.data)
          } else {
            const data = restoreSnapshot(getCurrentFileId(), item)
            this.$bus.$emit('setData', data)
          }
          this.visible = false
          this.$message.success('已恢复到该版本')
        })
        .catch(() => {})
    },
    async onDeleteOne(item) {
      if (this.isDirectoryMode) {
        await deleteDirectorySnapshot(item.name)
      } else {
        // 列表是倒序（最新在前），删除时换算回升序下标
        const ascIndex = this.list.length - 1 - this.list.findIndex(x => x === item)
        deleteSnapshot(getCurrentFileId(), ascIndex)
      }
      await this.refresh()
    },
    async onClearAll() {
      if (this.isDirectoryMode) {
        await clearDirectorySnapshots()
      } else {
        clearSnapshots()
      }
      await this.refresh()
      this.$message.success('历史已清空')
    }
  }
}
</script>

<style lang="less" scoped>
.historyToolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  .tip {
    font-size: 12px;
    color: #909399;
  }
}
.historyList {
  max-height: 420px;
  overflow-y: auto;

  .empty {
    text-align: center;
    color: #909399;
    padding: 30px 0;
    font-size: 13px;
  }

  .historyItem {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 8px;
    border-bottom: 1px solid #f0f2f5;

    .itemLeft {
      display: flex;
      align-items: center;
      gap: 8px;

      .time {
        font-size: 13px;
      }

      .tag {
        font-size: 11px;
        color: #909399;
        background: #f0f2f5;
        border-radius: 3px;
        padding: 1px 6px;

        &.manual {
          color: #409eff;
          background: #ecf5ff;
        }
      }
    }

    .itemRight {
      .dangerText {
        color: #f56c6c;
      }
    }
  }
}
</style>
