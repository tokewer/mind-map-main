<template>
  <el-dialog
    title="掌握度颜色设置"
    :visible.sync="visible"
    width="560px"
    :append-to-body="true"
  >
    <div class="colorSettings">
      <div class="tip">
        为每种掌握状态设置【背景色】和【文字色】。系统会提示对比度是否可读（建议 ≥ 4.5:1）。
      </div>

      <div
        class="colorRow"
        v-for="level in levelKeys"
        :key="level"
      >
        <div class="rowLabel">
          <span class="dot" :style="{ background: getColor(level).fillColor }"></span>
          <span class="name">{{ levelText(level) }}</span>
        </div>
        <div class="rowInputs">
          <div class="field">
            <span class="fLabel">背景</span>
            <el-color-picker
              v-model="getColor(level).fillColor"
              size="mini"
              @change="onColorChange(level)"
            ></el-color-picker>
          </div>
          <div class="field">
            <span class="fLabel">文字</span>
            <el-color-picker
              v-model="getColor(level).textColor"
              size="mini"
              @change="onColorChange(level)"
            ></el-color-picker>
          </div>
          <div class="field preview">
            <span
              class="previewText"
              :style="{ background: getColor(level).fillColor, color: getColor(level).textColor }"
            >预览</span>
            <span class="contrast" :class="{ ok: contrastInfo[level] >= 4.5 }">
              {{ contrastInfo[level] ? contrastInfo[level].toFixed(1) + ':1' : '' }}
            </span>
          </div>
        </div>
      </div>

      <div class="actions">
        <el-button size="small" @click="onReset">恢复默认</el-button>
        <el-button size="small" type="primary" @click="onSave">保存并应用</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'
import { notifyWorkspaceChanged } from '@/api/workspaceEvents'

// 默认掌握度配色（背景/文字）
export const DEFAULT_MASTERY_COLORS = {
  weak: { fillColor: '#fde2e2', textColor: '#c0392b' },
  due: { fillColor: '#d6eaf8', textColor: '#2471a3' },
  learning: { fillColor: '#fef9e7', textColor: '#7a6000' },
  basic: { fillColor: '#eafaf1', textColor: '#1e8449' },
  mastered: { fillColor: '#e8f8f5', textColor: '#117864' },
  new: { fillColor: '#f4f6f7', textColor: '#4a5458' }
}

const STORAGE_KEY = 'MIND_MAP_MASTERY_COLORS'

// 读取自定义配色
export const getMasteryColors = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return {
        ...DEFAULT_MASTERY_COLORS,
        ...data
      }
    }
  } catch (e) {
    console.warn('读取掌握度配色失败', e)
  }
  return { ...DEFAULT_MASTERY_COLORS }
}

// 保存自定义配色
export const saveMasteryColors = colors => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  notifyWorkspaceChanged()
}

// 计算 WCAG 对比度
export const calcContrast = (fgHex, bgHex) => {
  const toRgb = h => {
    h = h.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const lum = rgb => {
    const vals = rgb.map(c => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]
  }
  const l1 = lum(toRgb(fgHex))
  const l2 = lum(toRgb(bgHex))
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const LEVEL_TEXT = {
  weak: '容易遗忘',
  due: '今日到期',
  learning: '学习中',
  basic: '基本掌握',
  mastered: '熟练',
  new: '未学习'
}

export default {
  name: 'MasteryColorSettings',
  data() {
    return {
      visible: false,
      settings: {},
      contrastInfo: {},
      levelKeys: ['weak', 'due', 'learning', 'basic', 'mastered', 'new']
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    this.$bus.$on('open_mastery_color_settings', this.open)
  },
  beforeDestroy() {
    this.$bus.$off('open_mastery_color_settings', this.open)
  },
  methods: {
    levelText(l) {
      return LEVEL_TEXT[l] || l
    },
    // settings 在 open() 时才填充，渲染阶段可能为空对象；缺省回退默认色避免 undefined 报错
    getColor(level) {
      return this.settings[level] || DEFAULT_MASTERY_COLORS[level]
    },
    open() {
      this.settings = getMasteryColors()
      this.computeContrast()
      this.visible = true
    },
    computeContrast() {
      this.levelKeys.forEach(level => {
        const s = this.settings[level]
        this.contrastInfo[level] = calcContrast(s.textColor, s.fillColor)
      })
    },
    onColorChange() {
      this.computeContrast()
    },
    onSave() {
      saveMasteryColors(this.settings)
      this.$bus.$emit('review_data_change')
      this.$message.success('已保存，正在重新应用配色')
      this.visible = false
    },
    onReset() {
      this.settings = { ...DEFAULT_MASTERY_COLORS }
      this.computeContrast()
    }
  }
}
</script>

<style lang="less" scoped>
.colorSettings {
  .tip {
    font-size: 12px;
    color: #909399;
    margin-bottom: 16px;
  }

  .colorRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid #f0f2f5;

    .rowLabel {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 130px;

      .dot {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(0, 0, 0, 0.1);
      }

      .name {
        font-size: 13px;
      }
    }

    .rowInputs {
      display: flex;
      align-items: center;
      gap: 12px;

      .field {
        display: flex;
        align-items: center;
        gap: 6px;

        .fLabel {
          font-size: 12px;
          color: #909399;
        }
      }

      .preview {
        .previewText {
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 13px;
        }

        .contrast {
          font-size: 11px;
          color: #e6a23c;

          &.ok {
            color: #67c23a;
          }
        }
      }
    }
  }

  .actions {
    margin-top: 16px;
    text-align: right;
  }
}
</style>
