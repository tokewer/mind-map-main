<template>
  <!-- 今日到期复习节点和重点节点发光：无可见组件，静默同步 SVG class。 -->
  <span class="reviewGlowSync"></span>
</template>

<script>
import { mapState } from 'vuex'
import { getNodeList, todayStr } from '@/review'
import {
  getReviewGlowConfig,
  hexToRgb,
  normalizeReviewGlowConfig
} from '@/review/glowConfig'

const LOCAL_CONFIG_KEY = 'SIMPLE_MIND_MAP_LOCAL_CONFIG'

// 今日到期节点蓝色发光，重点节点金色发光；重点优先级更高。
export default {
  name: 'ReviewGlowSync',
  data() {
    return {
      mindMap: null,
      glowUids: new Set(),
      glowConfig: getReviewGlowConfig()
    }
  },
  computed: {
    ...mapState({
      localConfig: state => state.localConfig
    })
  },
  created() {
    this.glowConfig = getReviewGlowConfig(this.localConfig)
    this.$bus.$on('app_inited', this.onAppInited)
    this.$bus.$on('node_tree_render_end', this.refreshGlow)
    this.$bus.$on('review_data_change', this.refreshGlow)
    this.$bus.$on('review_glow_config_change', this.updateGlowConfig)
    window.addEventListener('storage', this.onStorageChange)
  },
  beforeDestroy() {
    this.clearGlow()
    this.$bus.$off('app_inited', this.onAppInited)
    this.$bus.$off('node_tree_render_end', this.refreshGlow)
    this.$bus.$off('review_data_change', this.refreshGlow)
    this.$bus.$off('review_glow_config_change', this.updateGlowConfig)
    window.removeEventListener('storage', this.onStorageChange)
  },
  methods: {
    updateGlowConfig(config) {
      this.glowConfig = normalizeReviewGlowConfig(config)
      this.refreshGlow()
    },
    onStorageChange(event) {
      if (event.key !== LOCAL_CONFIG_KEY || !event.newValue) return
      try {
        this.updateGlowConfig(getReviewGlowConfig(JSON.parse(event.newValue)))
      } catch (e) {
        // 其它标签页写入了损坏配置时继续使用当前有效配置。
      }
    },
    onAppInited(mindMap) {
      this.mindMap = mindMap
      this.refreshGlow()
    },
    applyGlowVariables(group) {
      const element = group && group.node
      if (!element) return
      const { reviewColor, focusColor, intensity, speed } = this.glowConfig
      element.style.setProperty('--smm-glow-speed', `${speed}s`)
      element.style.setProperty('--smm-glow-intensity', `${intensity}px`)
      element.style.setProperty('--smm-focus-glow-intensity', `${intensity + 3}px`)
      element.style.setProperty('--smm-review-glow-color', reviewColor)
      element.style.setProperty('--smm-review-glow-rgb', hexToRgb(reviewColor))
      element.style.setProperty('--smm-focus-glow-color', focusColor)
      element.style.setProperty('--smm-focus-glow-rgb', hexToRgb(focusColor))
    },
    clearGroup(group) {
      if (!group) return
      group.removeClass('smm-node-focus-glow')
      group.removeClass('smm-node-review-glow')
      const element = group.node
      if (!element) return
      ;[
        '--smm-glow-speed',
        '--smm-glow-intensity',
        '--smm-focus-glow-intensity',
        '--smm-review-glow-color',
        '--smm-review-glow-rgb',
        '--smm-focus-glow-color',
        '--smm-focus-glow-rgb'
      ].forEach(name => element.style.removeProperty(name))
    },
    clearGlow() {
      const root = this.mindMap && this.mindMap.renderer && this.mindMap.renderer.root
      if (!root) return
      this.walkNodes(root, node => this.clearGroup(node.group))
      this.glowUids = new Set()
    },
    refreshGlow() {
      const root = this.mindMap && this.mindMap.renderer && this.mindMap.renderer.root
      if (!root) return

      const today = todayStr()
      const reviewNodes = getNodeList()
      const focusSet = new Set(
        reviewNodes.filter(node => node.isFocus).map(node => node.uid)
      )
      const dueSet = new Set(
        reviewNodes
          .filter(node => {
            return (
              !node.isFocus &&
              node.status !== 'mastered' &&
              node.nextReview &&
              node.nextReview <= today
            )
          })
          .map(node => node.uid)
      )
      const nextGlowUids = new Set()

      this.walkNodes(root, node => {
        const group = node.group
        this.clearGroup(group)
        if (!this.glowConfig.enabled || !group) return
        const isFocus = focusSet.has(node.uid)
        const isDue = dueSet.has(node.uid)
        if (!isFocus && !isDue) return
        this.applyGlowVariables(group)
        nextGlowUids.add(node.uid)
        group.addClass(isFocus ? 'smm-node-focus-glow' : 'smm-node-review-glow')
      })
      this.glowUids = nextGlowUids
    },
    walkNodes(node, visitor) {
      if (!node) return
      visitor(node)
      if (Array.isArray(node.children)) {
        node.children.forEach(child => this.walkNodes(child, visitor))
      }
    }
  }
}
</script>
