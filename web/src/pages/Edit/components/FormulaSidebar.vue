<template>
  <Sidebar ref="sidebar" :title="$t('formulaSidebar.title')">
    <div class="box" :class="{ isDark: isDark }">
      <div class="formulaInputBox">
        <el-input
          v-model="formulaText"
          :rows="4"
          resize="none"
          type="textarea"
          :placeholder="$t('formulaSidebar.placeholder')"
          @keydown.native.stop
        />
        <el-button
          size="small"
          style="width: 100%; margin-top: 20px;"
          @click="confirm"
          >{{ $t('formulaSidebar.confirm') }}</el-button
        >
      </div>
      <div class="title">
        <span>{{ $t('formulaSidebar.common') }}</span>
        <span class="count">{{ filteredTotal }}</span>
      </div>
      <el-input
        v-model="keyword"
        size="mini"
        clearable
        :placeholder="$t('formulaSidebar.search')"
        prefix-icon="el-icon-search"
        class="searchInput"
        @keydown.native.stop
      />
      <div class="formulaList customScrollbar">
        <div v-if="filteredTotal === 0" class="empty">
          {{ $t('formulaSidebar.empty') }}
        </div>
        <template v-else>
          <div
            class="group"
            v-for="group in visibleGroups"
            :key="group.name"
          >
            <div class="groupHeader" @click="toggleGroup(group.name)">
              <i
                class="el-icon-arrow-right"
                :class="{ expanded: isExpanded(group.name) }"
              ></i>
              <span class="groupName">{{ group.name }}</span>
              <span class="groupCount">{{ group.list.length }}</span>
            </div>
            <div v-show="isExpanded(group.name)">
              <!-- 整行可点：点击即把该公式源码填回上方输入框（原有交互） -->
              <div
                class="formulaItem"
                v-for="(item, index) in group.list"
                :key="group.name + '_' + index"
                :title="$t('formulaSidebar.clickToFill')"
                @click="fill(item.text)"
              >
                <div class="overview" v-html="item.overview"></div>
                <div class="text">{{ item.text }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState, mapMutations } from 'vuex'
import { formulaGroups } from '@/config/constant'

export default {
  components: {
    Sidebar
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      formulaText: '',
      keyword: '',
      groups: [],
      collapsed: {}
    }
  },
  computed: {
    ...mapState({
      activeSidebar: state => state.activeSidebar,
      isDark: state => state.localConfig.isDark,
      localConfig: state => state.localConfig
    }),
    // 搜索时跨全部分组匹配（源码 + 分类名），并忽略折叠状态全部展开
    searching() {
      return !!this.keyword.trim()
    },
    visibleGroups() {
      const kw = this.keyword.trim().toLowerCase()
      if (!kw) return this.groups
      return this.groups
        .map(group => ({
          ...group,
          list: group.list.filter(item => item.text.toLowerCase().includes(kw))
        }))
        .filter(group => group.list.length > 0)
    },
    filteredTotal() {
      return this.visibleGroups.reduce((sum, g) => sum + g.list.length, 0)
    }
  },
  watch: {
    activeSidebar(val) {
      if (val === 'formulaSidebar') {
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    }
  },
  created() {
    this.$bus.$on('node_active', this.handleNodeActive)
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.handleNodeActive)
  },
  mounted() {
    this.init()
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    init() {
      // window.katex 由 simple-mind-map 的 Formula 插件注入；未就绪时稍后重试一次，
      // 避免侧边栏先于插件初始化导致列表为空。
      if (!window.katex) {
        this.$nextTick(() => {
          if (!window.katex) return
          this.buildGroups()
        })
        return
      }
      this.buildGroups()
    },

    buildGroups() {
      const config =
        this.mindMap && this.mindMap.formula
          ? this.mindMap.formula.getKatexConfig()
          : { throwOnError: false, errorColor: '#f00', output: 'mathml' }
      try {
        this.groups = formulaGroups.map(group => ({
          name: group.name,
          list: group.list.map(text => {
            let overview = ''
            try {
              overview = window.katex.renderToString(text, config)
            } catch (e) {
              overview = ''
            }
            return { overview, text }
          })
        }))
      } catch (e) {
        this.groups = []
      }
    },

    isExpanded(name) {
      if (this.searching) return true
      return !this.collapsed[name]
    },

    toggleGroup(name) {
      if (this.searching) return
      this.collapsed = { ...this.collapsed, [name]: !this.collapsed[name] }
    },

    fill(text) {
      this.formulaText = text
      if (this.$refs.sidebar) this.$refs.sidebar.show = true
    },

    handleNodeActive(...args) {
      this.activeNodes = [...args[1]]
      if (
        this.activeNodes.length <= 0 &&
        this.activeSidebar === 'formulaSidebar'
      ) {
        this.setActiveSidebar(null)
      }
    },

    confirm() {
      if (!this.localConfig.openNodeRichText) {
        return this.$message.warning(this.$t('formulaSidebar.tip'))
      }
      let str = this.formulaText.trim()
      if (!str) return
      this.mindMap.execCommand('INSERT_FORMULA', str)
    }
  }
}
</script>

<style lang="less" scoped>
.box {
  padding: 10px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.isDark {
    .title {
      color: #fff;
    }

    .groupHeader {
      color: #fff;
      background-color: #2b3035;
    }

    .formulaList {
      .formulaItem {
        border-color: #4c5054;

        .overview,
        .text {
          color: #fff;
        }

        .text {
          background-color: #363b3f;
        }
      }
    }

    /deep/ .el-textarea__inner {
      background-color: transparent;
      color: #fff;
    }
  }

  .title {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    margin: 10px 0;
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;

    .count {
      font-size: 12px;
      font-weight: 400;
      color: #909399;
    }
  }

  .formulaInputBox {
    flex-shrink: 0;
  }

  .searchInput {
    flex-shrink: 0;
    margin-bottom: 8px;
  }

  .formulaList {
    flex: 1;
    min-height: 0; // 关键：允许 flex 子项收缩，否则列表不滚动而是撑破容器
    overflow-y: auto;

    .empty {
      padding: 20px 0;
      text-align: center;
      font-size: 13px;
      color: #909399;
    }

    .groupHeader {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      padding: 6px 8px;
      font-size: 13px;
      font-weight: 500;
      color: #303133;
      background-color: #f5f7fa;
      border-bottom: 1px solid #dcdfe6;
      cursor: pointer;
      user-select: none;

      .el-icon-arrow-right {
        margin-right: 4px;
        transition: transform 0.2s;
        font-size: 12px;

        &.expanded {
          transform: rotate(90deg);
        }
      }

      .groupName {
        flex: 1;
      }

      .groupCount {
        font-size: 12px;
        font-weight: 400;
        color: #909399;
      }
    }

    .formulaItem {
      position: relative;
      display: flex;
      overflow: hidden;
      align-items: center;
      border: 1px solid #dcdfe6;
      border-bottom: none;
      cursor: pointer;

      &:hover {
        background-color: #ecf5ff;
      }

      &:last-of-type {
        border-bottom: 1px solid #dcdfe6;
      }

      .overview,
      .text {
        width: 50%;
        overflow: hidden;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-shrink: 0;
      }

      .overview {
        padding: 10px 0;
        border-right: none;
      }

      .text {
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        height: 100%;
        position: absolute;
        right: 0;
        top: 0;
        padding: 0 8px;
        box-sizing: border-box;
        border-left: 1px solid #dcdfe6;
        background-color: #fafafa;
      }
    }
  }
}
</style>
