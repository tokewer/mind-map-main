<template>
  <span class="reviewColorToggle">
    <el-tooltip content="按复习掌握度给节点上色" placement="bottom">
      <div
        class="toolbarBtn"
        :class="{ active: enabled }"
        @click="onToggle"
      >
        <span class="icon" :class="enabled ? 'el-icon-star-on' : 'el-icon-star-off'"></span>
        <span class="text">掌握度</span>
      </div>
    </el-tooltip>
    <el-tooltip content="自定义掌握度颜色" placement="bottom">
      <div class="toolbarBtn" @click="openSettings">
        <span class="icon el-icon-brush"></span>
      </div>
    </el-tooltip>
  </span>
</template>

<script>
import { mapState } from 'vuex'
import { getNodeList, todayStr } from '@/review'
import { getMasteryColors } from './MasteryColorSettings.vue'

export default {
  name: 'ReviewColorToggle',
  data() {
    return {
      enabled: false,
      mindMap: null,
      masteryColors: null
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    // 通过 app_inited 事件获取思维导图实例（Edit.vue 初始化后发出）
    this.$bus.$on('app_inited', this.handleAppInited)
    this.$bus.$on('node_tree_render_end', this.refreshColors)
    this.$bus.$on('review_data_change', this.refreshColors)
  },
  beforeDestroy() {
    this.clearColors()
    this.$bus.$off('app_inited', this.handleAppInited)
    this.$bus.$off('node_tree_render_end', this.refreshColors)
    this.$bus.$off('review_data_change', this.refreshColors)
  },
  methods: {
    handleAppInited(mindMap) {
      this.mindMap = mindMap
      this.masteryColors = getMasteryColors()
    },
    getMindMap() {
      return this.mindMap
    },
    openSettings() {
      this.$bus.$emit('open_mastery_color_settings')
    },
    onToggle() {
      this.enabled = !this.enabled
      if (this.enabled) {
        this.masteryColors = getMasteryColors()
        this.applyColors()
        this.$message.success('已开启掌握度上色')
      } else {
        this.clearColors()
        this.$message.success('已关闭掌握度上色')
      }
    },
    // 掌握度颜色只作用于 SVG 展示层，不写节点数据和撤销历史。
    applyColors() {
      const mindMap = this.getMindMap()
      if (!mindMap || !mindMap.renderer || !mindMap.renderer.root) return
      if (!this.masteryColors) this.masteryColors = getMasteryColors()
      const nodeMap = {}
      getNodeList().forEach(node => {
        nodeMap[node.uid] = node
      })
      const today = todayStr()
      this.walkNodes(mindMap.renderer.root, node => {
        this.clearNodeColor(node)
        const review = nodeMap[node.uid]
        const color = review && this.getNodeColor(review, today)
        if (color) this.applyNodeColor(node, color)
      })
    },
    applyNodeColor(node, color) {
      const group = node && node.group
      const element = group && group.node
      if (!group || !element) return
      group.addClass('smm-node-mastery-color')
      element.style.setProperty('--smm-mastery-fill', color.fillColor)
      element.style.setProperty('--smm-mastery-text', color.color)
    },
    clearNodeColor(node) {
      const group = node && node.group
      const element = group && group.node
      if (!group || !element) return
      group.removeClass('smm-node-mastery-color')
      // 移除样式属性，但保留默认值避免黑色显示
      element.style.removeProperty('--smm-mastery-fill')
      element.style.removeProperty('--smm-mastery-text')
      // 设置透明或默认值，确保节点不会显示为黑色
      if (!element.style.getPropertyValue('--smm-mastery-fill')) {
        element.style.setProperty('--smm-mastery-fill', 'transparent')
      }
      if (!element.style.getPropertyValue('--smm-mastery-text')) {
        element.style.setProperty('--smm-mastery-text', '#000000')
      }
    },
    walkNodes(node, visitor) {
      if (!node) return
      visitor(node)
      if (Array.isArray(node.children)) {
        node.children.forEach(child => this.walkNodes(child, visitor))
      }
    },
    getNodeColor(review, today) {
      if (!review) return null
      const c = this.masteryColors
      if (!c) return null
      if (review.status === 'mastered') {
        return { fillColor: c.mastered.fillColor, color: c.mastered.textColor }
      }
      if (review.errorCount >= 3) {
        return { fillColor: c.weak.fillColor, color: c.weak.textColor }
      }
      if (review.nextReview && review.nextReview <= today) {
        return { fillColor: c.due.fillColor, color: c.due.textColor }
      }
      if (review.mastery === 'basic') {
        return { fillColor: c.basic.fillColor, color: c.basic.textColor }
      }
      if (review.mastery === 'learning' || review.status === 'learning' || review.status === 'reviewing') {
        return { fillColor: c.learning.fillColor, color: c.learning.textColor }
      }
      return { fillColor: c.new.fillColor, color: c.new.textColor }
    },
    clearColors() {
      const mindMap = this.getMindMap()
      if (!mindMap || !mindMap.renderer || !mindMap.renderer.root) return
      this.walkNodes(mindMap.renderer.root, this.clearNodeColor)
    },
    refreshColors() {
      if (this.enabled) {
        this.masteryColors = getMasteryColors()
        this.applyColors()
      }
    }
  }
}
</script>

<style lang="less">
.smm-node-mastery-color {
  .smm-node-shape {
    fill: var(--smm-mastery-fill) !important;
  }

  .smm-text-node-wrap {
    fill: var(--smm-mastery-text) !important;
  }

  foreignObject,
  .smm-richtext-node-wrap,
  .smm-richtext-node-wrap * {
    color: var(--smm-mastery-text) !important;
  }
}
</style>

<style lang="less" scoped>
.reviewColorToggle {
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

    &.active {
      color: #409eff;
      background: #ecf5ff;
    }

    .icon {
      margin-right: 4px;
    }
  }
}
</style>
