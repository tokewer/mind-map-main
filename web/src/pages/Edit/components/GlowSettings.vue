<template>
  <span class="glowSettings">
    <el-tooltip content="节点发光效果" placement="bottom">
      <div
        class="toolbarBtn"
        :class="{ active: enabled }"
        @click="onToggle"
      >
        <span class="icon" :class="enabled ? 'el-icon-star-on' : 'el-icon-star-off'"></span>
        <span class="text">发光</span>
      </div>
    </el-tooltip>
    <el-tooltip content="自定义发光效果" placement="bottom">
      <div class="toolbarBtn" @click="openSettings">
        <span class="icon el-icon-setting"></span>
      </div>
    </el-tooltip>
  </span>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'GlowSettings',
  data() {
    return {
      enabled: false,
      mindMap: null,
      glowConfig: {
        intensity: 0.3,
        blur: 10,
        spread: 5,
        color: '#409eff',
        enabled: false
      }
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    // 通过 app_inited 事件获取思维导图实例
    this.$bus.$on('app_inited', this.handleAppInited)
    this.$bus.$on('node_tree_render_end', this.refreshGlow)
    this.$bus.$on('glow_config_change', this.refreshGlow)
  },
  beforeDestroy() {
    this.clearGlow()
    this.$bus.$off('app_inited', this.handleAppInited)
    this.$bus.$off('node_tree_render_end', this.refreshGlow)
    this.$bus.$off('glow_config_change', this.refreshGlow)
  },
  methods: {
    handleAppInited(mindMap) {
      this.mindMap = mindMap
      this.loadGlowConfig()
    },
    getMindMap() {
      return this.mindMap
    },
    loadGlowConfig() {
      const saved = localStorage.getItem('SIMPLE_MIND_MAP_GLOW_CONFIG')
      if (saved) {
        this.glowConfig = { ...this.glowConfig, ...JSON.parse(saved) }
      }
    },
    saveGlowConfig() {
      localStorage.setItem('SIMPLE_MIND_MAP_GLOW_CONFIG', JSON.stringify(this.glowConfig))
    },
    openSettings() {
      this.$bus.$emit('show_glow_settings')
    },
    onToggle() {
      this.enabled = !this.enabled
      if (this.enabled) {
        this.loadGlowConfig()
        this.applyGlow()
        this.$message.success('已开启节点发光效果')
      } else {
        this.clearGlow()
        this.$message.success('已关闭节点发光效果')
      }
    },
    applyGlow() {
      const mindMap = this.getMindMap()
      if (!mindMap || !mindMap.renderer || !mindMap.renderer.root) return

      this.walkNodes(mindMap.renderer.root, node => {
        this.applyNodeGlow(node)
      })
    },
    applyNodeGlow(node) {
      const group = node && node.group
      const element = group && group.node
      if (!group || !element) return

      if (this.glowConfig.enabled) {
        group.addClass('smm-node-glow')
        const glowStyle = `drop-shadow(0 0 ${this.glowConfig.blur}px rgba(64, 158, 255, ${this.glowConfig.intensity}))`
        element.style.filter = glowStyle
      } else {
        this.clearNodeGlow(node)
      }
    },
    clearNodeGlow(node) {
      const group = node && node.group
      const element = group && group.node
      if (!group || !element) return
      group.removeClass('smm-node-glow')
      element.style.filter = ''
    },
    walkNodes(node, visitor) {
      if (!node) return
      visitor(node)
      if (Array.isArray(node.children)) {
        node.children.forEach(child => this.walkNodes(child, visitor))
      }
    },
    clearGlow() {
      const mindMap = this.getMindMap()
      if (!mindMap || !mindMap.renderer || !mindMap.renderer.root) return
      this.walkNodes(mindMap.renderer.root, this.clearNodeGlow)
    },
    refreshGlow() {
      if (this.enabled) {
        this.applyGlow()
      }
    }
  }
}
</script>

<style lang="less">
.smm-node-glow {
  filter: drop-shadow(0 0 10px rgba(64, 158, 255, 0.3)) !important;
}
</style>

<style lang="less" scoped>
.glowSettings {
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