<template>
  <Sidebar ref="sidebar" :title="$t('shortcutKey.title')">
    <div class="box" :class="{ isDark: isDark }">
      <!-- 复习功能快捷键（支持自定义、全局开关与冲突检测） -->
      <div class="reviewShortcutSection">
        <div class="sectionHeader">
          <div class="title" style="margin: 16px 0 8px 0;">🎯 复习功能快捷键</div>
          <el-button
            type="text"
            size="mini"
            class="resetBtn"
            @click="onResetAllReviewShortcuts"
            title="恢复全部复习快捷键默认设置"
          >
            恢复默认
          </el-button>
        </div>

        <!-- 全局开关 -->
        <div class="globalToggleRow">
          <span class="toggleLabel">全局复习快捷键开关：</span>
          <el-switch
            v-model="shortcutConfig.enabled"
            @change="onToggleEnabled"
            size="small"
          ></el-switch>
          <span class="toggleStatus">{{ shortcutConfig.enabled ? '已开启' : '已关闭' }}</span>
        </div>

        <div class="tipText" v-if="shortcutConfig.enabled">
          提示：点击“按键按钮”后直接在键盘上按下组合键（如 Space、1、Alt + R），松开自动保存；按 Esc 取消。
        </div>
        <div class="tipText disabledTip" v-else>
          ⚠️ 当前复习快捷键已全局关闭，所有复习快捷键均不响应，鼠标点击操作不受影响。
        </div>

        <div class="list" :class="{ disabledList: !shortcutConfig.enabled }">
          <div
            class="item customItem"
            v-for="item in actionDefs"
            :key="item.key"
          >
            <span class="icon">{{ item.icon }}</span>
            <div class="itemInfo">
              <div class="nameRow">
                <span class="name" :title="item.desc">{{ item.name }}</span>
                <el-tag size="mini" :type="item.scope === 'quiz' ? 'warning' : item.scope === 'map' ? 'success' : 'info'">
                  {{ item.scope === 'quiz' ? '拷问' : item.scope === 'map' ? '导图' : '全局' }}
                </el-tag>
              </div>
              <div class="desc">{{ item.desc }}</div>
            </div>
            <div class="actionBox">
              <el-button
                size="mini"
                :type="recordingKey === item.key ? 'danger' : 'primary'"
                plain
                :disabled="!shortcutConfig.enabled"
                class="shortcutBtn"
                @keydown.native.prevent="onKeyRecord($event, item.key)"
                @blur="onBlurRecord(item.key)"
                @click="startRecord(item.key)"
              >
                {{ recordingKey === item.key ? (tempRecorded || '按下按键...') : (shortcutConfig.shortcuts[item.key] || '未设置') }}
              </el-button>
              <el-button
                size="mini"
                type="text"
                class="singleResetBtn"
                :disabled="!shortcutConfig.enabled || shortcutConfig.shortcuts[item.key] === item.defaultKey"
                @click="onResetSingleShortcut(item.key)"
                title="恢复该项默认键位"
              >
                默认
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 系统原生快捷键列表 -->
      <div v-for="item in shortcutKeyList" :key="item.type">
        <div class="title">{{ item.type }}</div>
        <div class="list" v-for="item2 in item.list" :key="item2.value">
          <div class="item">
            <span
              v-if="item2.icon"
              class="icon iconfont"
              :class="[item2.icon]"
            ></span>
            <span class="name" :title="item2.name">{{ item2.name }}</span>
            <div class="value" :title="item2.value">{{ item2.value }}</div>
          </div>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { shortcutKeyList } from '@/config'
import { mapState } from 'vuex'
import {
  REVIEW_ACTION_DEFS,
  getReviewShortcutConfig,
  saveReviewShortcutConfig,
  resetReviewShortcuts,
  setReviewShortcutsEnabled,
  formatKeyEventToShortcut,
  checkShortcutConflict,
  reviewShortcutDispatcher
} from '@/review/reviewShortcuts'

// 快捷键
export default {
  components: {
    Sidebar
  },
  data() {
    return {
      shortcutConfig: getReviewShortcutConfig(),
      actionDefs: REVIEW_ACTION_DEFS,
      recordingKey: null,
      tempRecorded: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    }),

    shortcutKeyList() {
      return shortcutKeyList[this.$i18n.locale] || shortcutKeyList.zh
    }
  },
  watch: {
    activeSidebar(val) {
      if (val === 'shortcutKey') {
        this.shortcutConfig = getReviewShortcutConfig()
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
      }
    }
  },
  methods: {
    onToggleEnabled(val) {
      this.shortcutConfig = setReviewShortcutsEnabled(val)
      this.$bus.$emit('review_shortcuts_changed', this.shortcutConfig.shortcuts)
      this.$message.success(val ? '复习快捷键已开启' : '复习快捷键已全局关闭')
    },
    startRecord(key) {
      this.recordingKey = key
      this.tempRecorded = ''
      reviewShortcutDispatcher.setRecording(true)
    },
    onBlurRecord(key) {
      if (this.recordingKey === key) {
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
      }
    },
    onKeyRecord(e, key) {
      // Esc 取消录制
      if (e.keyCode === 27) {
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
        return
      }
      const formatted = formatKeyEventToShortcut(e)
      this.tempRecorded = formatted

      // 如果按下了实际按键（非单纯修饰键）
      if (![16, 17, 18, 91, 93, 224].includes(e.keyCode)) {
        if (formatted) {
          // 冲突检测
          const conflict = checkShortcutConflict(key, formatted, this.shortcutConfig.shortcuts)
          if (conflict.hasConflict) {
            if (conflict.type === 'browser') {
              this.$message.warning(conflict.message)
            } else {
              this.$message.error(conflict.message)
              this.recordingKey = null
              this.tempRecorded = ''
              reviewShortcutDispatcher.setRecording(false)
              return
            }
          }

          const nextShortcuts = {
            ...this.shortcutConfig.shortcuts,
            [key]: formatted
          }
          this.shortcutConfig = saveReviewShortcutConfig({
            enabled: this.shortcutConfig.enabled,
            shortcuts: nextShortcuts
          })
          this.$bus.$emit('review_shortcuts_changed', this.shortcutConfig.shortcuts)
          this.$message.success(`已保存快捷键：${formatted}`)
        }
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
      }
    },
    onResetAllReviewShortcuts() {
      this.$confirm('确定将所有复习快捷键恢复为默认值吗？', '恢复默认', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        const defaults = resetReviewShortcuts()
        this.shortcutConfig = getReviewShortcutConfig()
        this.$bus.$emit('review_shortcuts_changed', defaults)
        this.$message.success('已恢复全部默认复习快捷键')
      }).catch(() => {})
    },
    onResetSingleShortcut(key) {
      const def = this.actionDefs.find(d => d.key === key)
      if (!def) return
      const nextShortcuts = {
        ...this.shortcutConfig.shortcuts,
        [key]: def.defaultKey
      }
      this.shortcutConfig = saveReviewShortcutConfig({
        enabled: this.shortcutConfig.enabled,
        shortcuts: nextShortcuts
      })
      this.$bus.$emit('review_shortcuts_changed', this.shortcutConfig.shortcuts)
      this.$message.success(`「${def.name}」已恢复为默认：${def.defaultKey}`)
    }
  }
}
</script>

<style lang="less" scoped>
.box {
  padding: 0 20px;

  .reviewShortcutSection {
    border-bottom: 1px dashed #dcdfe6;
    padding-bottom: 16px;
    margin-bottom: 16px;

    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .resetBtn {
        padding: 0;
      }
    }

    .globalToggleRow {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 500;

      .toggleStatus {
        font-size: 12px;
        color: #909399;
      }
    }

    .tipText {
      font-size: 12px;
      color: #909399;
      line-height: 1.5;
      margin-bottom: 12px;

      &.disabledTip {
        color: #e6a23c;
      }
    }

    .disabledList {
      opacity: 0.6;
    }

    .customItem {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 12px;

      .icon {
        margin-right: 8px;
        font-size: 16px;
        margin-top: 2px;
      }

      .itemInfo {
        flex: 1;
        margin-right: 8px;

        .nameRow {
          display: flex;
          align-items: center;
          gap: 6px;

          .name {
            font-size: 13px;
            font-weight: 500;
          }
        }

        .desc {
          font-size: 11px;
          color: #909399;
          margin-top: 2px;
          line-height: 1.3;
        }
      }

      .actionBox {
        display: flex;
        align-items: center;
        gap: 4px;

        .shortcutBtn {
          min-width: 84px;
          font-family: monospace;
          font-weight: 500;
          font-size: 12px;
          padding: 4px 6px;
        }

        .singleResetBtn {
          padding: 2px 4px;
          font-size: 11px;
        }
      }
    }
  }

  &.isDark {
    .reviewShortcutSection {
      border-bottom-color: #4c4d4f;
      .tipText {
        color: #a8abb2;
      }
    }
    .title {
      color: #fff;
    }

    .list {
      .item {
        .icon {
          color: hsla(0, 0%, 100%, 0.6);
        }
        .name {
          color: hsla(0, 0%, 100%, 0.6);
        }

        .value {
          color: hsla(0, 0%, 100%, 0.3);
        }
      }
    }
  }

  .title {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    margin: 26px 0 20px;
  }

  .list {
    font-size: 14px;

    .item {
      display: flex;
      align-items: center;
      margin-bottom: 15px;

      .icon {
        font-size: 16px;
        margin-right: 12px;
      }

      .name {
        color: #333;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .value {
        color: #909090;
        margin-left: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}
</style>
