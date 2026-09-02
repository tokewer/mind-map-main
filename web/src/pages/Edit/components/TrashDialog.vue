<template>
  <el-dialog
    title="回收站"
    :visible.sync="visible"
    width="560px"
    :append-to-body="true"
  >
    <div class="trashPanel" :class="{ dark: isDark }">
      <div class="trashToolbar">
        <span class="tip">删除的节点会暂存在这里（最多50条），可恢复</span>
        <el-button size="mini" type="danger" plain @click="onClearAll">清空回收站</el-button>
      </div>
      <div v-if="list.length === 0" class="empty">回收站是空的</div>
      <div class="trashItem" v-for="item in list" :key="item.id" :class="{ dark: isDark }">
        <div class="itemInfo">
          <div class="itemName">{{ getText(item.data) }}</div>
          <div class="itemTime">{{ formatTime(item.time) }}</div>
        </div>
        <div class="itemOps">
          <el-button size="mini" type="text" @click="onRestore(item)">恢复</el-button>
          <el-button size="mini" type="text" class="danger" @click="onRemove(item)">删除</el-button>
        </div>
      </div>
    </div>
    <div slot="footer" class="dialog-footer">
      <el-button size="small" @click="visible = false">关闭</el-button>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'
import { getTrashList, removeFromTrash, clearTrash } from '@/review/trash'

export default {
  name: 'TrashDialog',
  data() {
    return {
      visible: false,
      list: [],
      mindMap: null
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    this.$bus.$on('open_trash', this.open)
    this.$bus.$on('app_inited', mm => {
      this.mindMap = mm
    })
  },
  beforeDestroy() {
    this.$bus.$off('open_trash', this.open)
  },
  methods: {
    open() {
      this.list = getTrashList()
      this.visible = true
    },
    getText(data) {
      if (!data || !data.data) return '未知节点'
      const t = data.data.text || ''
      return String(t).replace(/<[^>]+>/g, '').slice(0, 50) || '空节点'
    },
    formatTime(t) {
      const d = new Date(t)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`
    },
    // 恢复到当前导图（作为根节点的子节点）
    onRestore(item) {
      this.$confirm('将把该节点恢复到当前思维导图的根节点下，是否继续？', '恢复节点', {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          const mindMap = this.mindMap
          if (!mindMap) {
            this.$message.error('未获取到思维导图实例')
            return
          }
          const root = mindMap.renderer.root
          if (!root) return
          // 深拷贝被删节点数据，附上新 uid
          const nodeData = JSON.parse(JSON.stringify(item.data))
          nodeData.data.uid = 'restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
          nodeData.data.isActive = true
          root.nodeData.children.push(nodeData)
          mindMap.render()
          removeFromTrash(item.id)
          this.list = getTrashList()
          this.$message.success('已恢复节点')
        })
        .catch(() => {})
    },
    onRemove(item) {
      removeFromTrash(item.id)
      this.list = getTrashList()
      this.$message.success('已彻底删除')
    },
    onClearAll() {
      this.$confirm('确定清空回收站吗？清空后无法恢复。', '清空回收站', {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          clearTrash()
          this.list = []
          this.$message.success('回收站已清空')
        })
        .catch(() => {})
    }
  }
}
</script>

<style lang="less" scoped>
.trashPanel {
  &.dark {
    .trashItem {
      background: #363b3f;
      border-color: rgba(255, 255, 255, 0.1);
    }
  }

  .trashToolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .tip {
      font-size: 12px;
      color: #909399;
    }
  }

  .empty {
    text-align: center;
    color: #909399;
    padding: 30px 0;
    font-size: 13px;
  }

  .trashItem {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 8px;

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

      .itemTime {
        font-size: 11px;
        color: #909399;
        margin-top: 2px;
      }
    }

    .itemOps {
      white-space: nowrap;

      .danger {
        color: #f56c6c;
      }
    }
  }
}
</style>
