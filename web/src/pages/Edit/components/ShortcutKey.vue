<template>
  <Sidebar ref="sidebar" :title="$t('shortcutKey.title')">
    <div class="box" :class="{ isDark: isDark }">
      <!-- 复习功能快捷键（支持自定义与录制） -->
      <div class="reviewShortcutSection">
        <div class="sectionHeader">
          <div class="title" style="margin: 16px 0 8px 0;">🎯 复习功能快捷键</div>
          <el-button
            type="text"
            size="mini"
            class="resetBtn"
            @click="onResetReviewShortcuts"
            title="恢复复习快捷键默认设置"
          >
            恢复默认
          </el-button>
        </div>
        <div class="tipText">
          提示：点击“录制”后直接在键盘上按下组合键（如 Alt + R 或 Ctrl + Alt + 1），松开即可保存。
        </div>
        <div class="list">
          <div
            class="item customItem"
            v-for="item in reviewShortcutDefList"
            :key="item.key"
          >
            <span class="icon">{{ item.icon }}</span>
            <div class="name" :title="item.desc">{{ item.name }}</div>
            <div class="actionBox">
              <el-button
                size="mini"
                :type="recordingKey === item.key ? 'danger' : 'primary'"
                plain
                class="shortcutBtn"
                @keydown.native.prevent="onKeyRecord($event, item.key)"
                @blur="onBlurRecord(item.key)"
                @click="startRecord(item.key)"
              >
                {{ recordingKey === item.key ? (tempRecorded || '请按下按键...') : (reviewShortcuts[item.key] || '未设置') }}
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
  getReviewShortcuts,
  saveReviewShortcuts,
  resetReviewShortcuts,
  formatKeyEventToShortcut
} from '@/review/reviewShortcuts'

// 快捷键
export default {
  components: {
    Sidebar
  },
  data() {
    return {
      reviewShortcuts: getReviewShortcuts(),
      recordingKey: null,
      tempRecorded: '',
      reviewShortcutDefList: [
        {
          key: 'toggleReview',
          name: '加入 / 移出复习',
          desc: '选中节点后加入或移出复习计划',
          icon: '🔄'
        },
        {
          key: 'openReviewDialog',
          name: '打开复习详情',
          desc: '打开当前选中节点的复习管理弹窗',
          icon: '📖'
        },
        {
          key: 'toggleFocus',
          name: '标记 / 取消重点',
          desc: '切换当前选中节点的星标重点复习状态',
          icon: '⭐️'
        },
        {
          key: 'quickRemember',
          name: '快捷评价：记得',
          desc: '直接完成一次复习并推进复习周期',
          icon: '✅'
        },
        {
          key: 'quickFuzzy',
          name: '快捷评价：模糊',
          desc: '直接完成一次复习并缩短间隔',
          icon: '🤔'
        },
        {
          key: 'quickForgot',
          name: '快捷评价：忘了',
          desc: '直接完成一次复习并重置周期',
          icon: '😰'
        }
      ]
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
        this.reviewShortcuts = getReviewShortcuts()
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
        this.recordingKey = null
        this.tempRecorded = ''
      }
    }
  },
  methods: {
    startRecord(key) {
      this.recordingKey = key
      this.tempRecorded = ''
    },
    onBlurRecord(key) {
      if (this.recordingKey === key) {
        this.recordingKey = null
        this.tempRecorded = ''
      }
    },
    onKeyRecord(e, key) {
      // Esc 取消录制
      if (e.keyCode === 27) {
        this.recordingKey = null
        this.tempRecorded = ''
        return
      }
      const formatted = formatKeyEventToShortcut(e)
      this.tempRecorded = formatted

      // 如果按下了实际按键（非单纯修饰键）
      if (![16, 17, 18, 91, 93, 224].includes(e.keyCode)) {
        if (formatted) {
          const next = {
            ...this.reviewShortcuts,
            [key]: formatted
          }
          this.reviewShortcuts = saveReviewShortcuts(next)
          this.$bus.$emit('review_shortcuts_changed', this.reviewShortcuts)
          this.$message.success(`已保存快捷键：${formatted}`)
        }
        this.recordingKey = null
        this.tempRecorded = ''
      }
    },
    onResetReviewShortcuts() {
      this.reviewShortcuts = resetReviewShortcuts()
      this.$bus.$emit('review_shortcuts_changed', this.reviewShortcuts)
      this.$message.success('已恢复复习快捷键默认设置')
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

    .tipText {
      font-size: 12px;
      color: #909399;
      line-height: 1.5;
      margin-bottom: 12px;
    }

    .customItem {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;

      .name {
        flex: 1;
        margin-right: 8px;
        font-size: 13px;
      }

      .actionBox {
        .shortcutBtn {
          min-width: 90px;
          font-family: monospace;
          font-weight: 500;
          font-size: 12px;
          padding: 5px 8px;
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
