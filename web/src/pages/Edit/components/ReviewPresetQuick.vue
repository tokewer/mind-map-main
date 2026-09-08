<template>
  <el-popover
    v-model="visible"
    placement="bottom"
    width="260"
    trigger="click"
  >
    <div class="presetQuick">
      <div class="title">复习周期预设</div>
      <div class="currentLine">
        当前：<b>{{ currentLabel }}</b>
        <span class="currentCycles">（{{ currentCyclesStr }}）</span>
      </div>
      <div class="list">
        <div
          class="item"
          :class="{ active: p.id === activePresetId }"
          v-for="p in presets"
          :key="p.id"
          @click="apply(p)"
        >
          <span class="name">{{ p.name }}</span>
          <span class="cycles">{{ cyclesToStr(p.cycles) }}</span>
          <span class="check" v-if="p.id === activePresetId">✓</span>
          <i
            class="el-icon-delete del"
            :title="'删除预设 ' + p.name"
            @click.stop="removePreset(p)"
          ></i>
        </div>
        <div
          class="item custom"
          :class="{ active: !activePresetId }"
          @click="useCustom"
        >
          <span class="name">自定义</span>
          <span class="cycles">{{ defaultCyclesStr }}</span>
          <span class="check" v-if="!activePresetId">✓</span>
        </div>
        <div class="emptyTip" v-if="presets.length === 0">暂无预设，到复习中心新建</div>
      </div>
      <div class="footer">
        <el-button size="mini" type="text" @click="goManage">到复习中心管理预设 →</el-button>
      </div>
    </div>
    <div slot="reference" class="toolbarBtn">
      <span class="icon el-icon-time"></span>
      <span class="text">{{ shortLabel }}</span>
    </div>
  </el-popover>
</template>

<script>
import { mapState } from 'vuex'
import {
  getPresets,
  getActivePreset,
  getDefaultCycles,
  setActivePreset,
  clearActivePreset,
  deletePreset,
  cyclesToStr
} from '@/review'

export default {
  name: 'ReviewPresetQuick',
  data() {
    return {
      visible: false,
      presets: [],
      activePresetId: '',
      defaultCycles: []
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    }),
    defaultCyclesStr() {
      return cyclesToStr(this.defaultCycles)
    },
    currentPreset() {
      return this.presets.find(p => p.id === this.activePresetId) || null
    },
    currentLabel() {
      return this.currentPreset ? this.currentPreset.name : '自定义'
    },
    currentCyclesStr() {
      return this.currentPreset
        ? cyclesToStr(this.currentPreset.cycles)
        : this.defaultCyclesStr
    },
    shortLabel() {
      return '复习:' + this.currentLabel
    }
  },
  created() {
    this.refresh()
    this.$bus.$on('review_data_change', this.refresh)
    this.$bus.$on('review_preset_change', this.refresh)
  },
  beforeDestroy() {
    this.$bus.$off('review_data_change', this.refresh)
    this.$bus.$off('review_preset_change', this.refresh)
  },
  methods: {
    cyclesToStr(cycles) {
      return cyclesToStr(cycles)
    },
    refresh() {
      this.presets = getPresets()
      const active = getActivePreset()
      this.activePresetId = active ? active.id : ''
      this.defaultCycles = getDefaultCycles()
    },
    apply(p) {
      setActivePreset(p.id)
      this.visible = false
      this.refresh()
      this.$bus.$emit('review_data_change')
      this.$message.success('已切换复习周期预设：' + p.name)
    },
    useCustom() {
      clearActivePreset()
      this.visible = false
      this.refresh()
      this.$bus.$emit('review_data_change')
      this.$message.success('已使用自定义复习周期')
    },
    removePreset(p) {
      this.$confirm(`删除预设「${p.name}」？已加入复习的节点周期不受影响。`, '删除预设', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          deletePreset(p.id)
          this.refresh()
          this.$bus.$emit('review_data_change')
          this.$message.success('预设已删除')
        })
        .catch(() => {})
    },
    goManage() {
      this.visible = false
      const route = this.$router.resolve({ path: '/review', query: { tab: 'settings' } })
      window.open(route.href, '_blank', 'noopener,noreferrer')
    }
  }
}
</script>

<style lang="less" scoped>
.presetQuick {
  .title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 8px;
  }
  .currentLine {
    font-size: 13px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f0f2f5;
    margin-bottom: 6px;

    .currentCycles {
      color: #909399;
      font-size: 12px;
    }
  }
  .list {
    max-height: 260px;
    overflow-y: auto;

    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 8px;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: #f5f7fa;
      }

      &.active {
        background: #ecf5ff;
      }

      .name {
        font-size: 13px;
        font-weight: 500;
      }

      .cycles {
        font-size: 12px;
        color: #909399;
        margin-left: auto;
      }

      .check {
        color: #409eff;
      }

      .del {
        color: #c0c4cc;
        font-size: 13px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s;

        &:hover {
          color: #f56c6c;
        }
      }

      &:hover .del {
        opacity: 1;
      }
    }

    .emptyTip {
      padding: 8px 0;
      text-align: center;
      color: #909399;
      font-size: 12px;
    }
  }
  .footer {
    text-align: right;
    border-top: 1px solid #f0f2f5;
    margin-top: 4px;
    padding-top: 4px;
  }
}
.toolbarBtn {
  display: flex;
  align-items: center;
  padding: 0 10px;
  height: 36px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f0f2f5;
  }

  .icon {
    margin-right: 4px;
  }
}
</style>
