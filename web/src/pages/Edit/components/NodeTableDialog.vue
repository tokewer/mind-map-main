<template>
  <el-dialog
    :title="isEditing ? '编辑表格' : '插入表格'"
    :visible.sync="visible"
    width="680px"
    :append-to-body="true"
    custom-class="nodeTableDialog"
  >
    <div class="tableDialogPanel" :class="{ isDark: isDark }">
      <!-- 控制栏 -->
      <div class="configBar">
        <div class="configItem">
          <span class="label">行数:</span>
          <el-input-number
            v-model="rowCount"
            :min="1"
            :max="20"
            size="mini"
            @change="onRowCountChange"
          ></el-input-number>
        </div>
        <div class="configItem">
          <span class="label">列数:</span>
          <el-input-number
            v-model="colCount"
            :min="1"
            :max="10"
            size="mini"
            @change="onColCountChange"
          ></el-input-number>
        </div>
        <div class="configItem">
          <el-checkbox v-model="hasHeader">首行作为表头</el-checkbox>
        </div>
        <div class="configItem btnGroup">
          <el-button size="mini" icon="el-icon-plus" @click="addRow" title="在底部增加一行">加行</el-button>
          <el-button size="mini" icon="el-icon-plus" @click="addCol" title="在右侧增加一列">加列</el-button>
          <el-button size="mini" icon="el-icon-minus" @click="delRow" :disabled="rowCount <= 1" title="删除最后一行">减行</el-button>
          <el-button size="mini" icon="el-icon-minus" @click="delCol" :disabled="colCount <= 1" title="删除最后一列">减列</el-button>
          <el-button size="mini" type="text" @click="clearData">清空内容</el-button>
          <el-button
            v-if="isEditing"
            size="mini"
            type="text"
            class="dangerText"
            @click="removeTable"
          >移除表格</el-button>
        </div>
      </div>

      <!-- 表格编辑区 -->
      <div class="gridWrapper">
        <table class="gridTable">
          <tbody>
            <tr v-for="(row, rIndex) in matrix" :key="rIndex">
              <td
                v-for="(cell, cIndex) in row"
                :key="cIndex"
                :class="{ isHeaderCell: hasHeader && rIndex === 0 }"
              >
                <input
                  :ref="'cell_' + rIndex + '_' + cIndex"
                  v-model="matrix[rIndex][cIndex]"
                  class="cellInput"
                  :placeholder="hasHeader && rIndex === 0 ? '表头' : ''"
                  @keydown.enter.prevent="onEnterKey(rIndex, cIndex)"
                  @keydown.tab="onTabKey(rIndex, cIndex, $event)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="hint">
        提示：按 <b>Tab</b> 键可直接切换到下一个单元格，在最后一个单元格按 <b>Tab</b> 会自动新增一行；按 <b>Enter</b> 切至下一行。
      </div>
    </div>

    <div slot="footer" class="dialog-footer">
      <el-button size="small" @click="visible = false">取消</el-button>
      <el-button size="small" type="primary" @click="confirm">确定</el-button>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'

const escapeHtml = str =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export default {
  name: 'NodeTableDialog',
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      visible: false,
      isEditing: false,
      activeNode: null,
      rowCount: 3,
      colCount: 3,
      hasHeader: true,
      matrix: [],
      prefixText: '',
      postfixText: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    this.$bus.$on('showNodeTable', this.open)
  },
  beforeDestroy() {
    this.$bus.$off('showNodeTable', this.open)
  },
  methods: {
    open(targetNode) {
      const node =
        targetNode ||
        (this.mindMap &&
          this.mindMap.renderer &&
          this.mindMap.renderer.activeNodeList &&
          this.mindMap.renderer.activeNodeList[0])
      if (!node) {
        this.$message.warning('请先选中一个节点')
        return
      }
      this.activeNode = node
      this.parseNodeContent(node)
      this.visible = true
      this.$nextTick(() => {
        const firstInput = this.$refs['cell_0_0']
        if (firstInput && firstInput[0]) {
          firstInput[0].focus()
        }
      })
    },

    parseNodeContent(node) {
      const text = String(node.getData('text') || '')
      if (/<table[\s>]/i.test(text)) {
        this.isEditing = true
        try {
          const parser = new DOMParser()
          const doc = parser.parseFromString(text, 'text/html')
          const table = doc.querySelector('table')

          // 提取 table 前后的非表格 HTML
          const rawHtml = doc.body.innerHTML
          const tableOuter = table.outerHTML
          const parts = rawHtml.split(tableOuter)
          this.prefixText = parts[0] || ''
          this.postfixText = parts.length > 1 ? parts.slice(1).join(tableOuter) : ''

          const trs = Array.from(table.querySelectorAll('tr'))
          if (trs.length > 0) {
            const hasTh = trs[0].querySelectorAll('th').length > 0
            this.hasHeader = hasTh
            let maxCols = 0
            const parsedMatrix = trs.map(tr => {
              const cells = Array.from(tr.querySelectorAll('th, td'))
              maxCols = Math.max(maxCols, cells.length)
              return cells.map(td => td.innerText.replace(/\u00a0/g, ' ').trim())
            })
            maxCols = Math.max(maxCols, 1)
            // 对齐列宽
            parsedMatrix.forEach(row => {
              while (row.length < maxCols) {
                row.push('')
              }
            })
            this.matrix = parsedMatrix
            this.rowCount = parsedMatrix.length
            this.colCount = maxCols
            return
          }
        } catch (e) {
          console.warn('解析节点现有表格失败，初始化为默认表格', e)
        }
      }

      // 无现有表格，初始化默认 3x3 模板
      this.isEditing = false
      this.prefixText = text
      this.postfixText = ''
      this.rowCount = 3
      this.colCount = 3
      this.hasHeader = true
      this.initMatrix(3, 3)
    },

    initMatrix(rows, cols) {
      const mat = []
      for (let r = 0; r < rows; r++) {
        const row = []
        for (let c = 0; c < cols; c++) {
          if (r === 0 && this.hasHeader) {
            row.push(`列 ${c + 1}`)
          } else {
            row.push('')
          }
        }
        mat.push(row)
      }
      this.matrix = mat
    },

    onRowCountChange(newVal) {
      const cur = this.matrix.length
      if (newVal > cur) {
        for (let i = cur; i < newVal; i++) {
          this.matrix.push(new Array(this.colCount).fill(''))
        }
      } else if (newVal < cur) {
        this.matrix = this.matrix.slice(0, newVal)
      }
    },

    onColCountChange(newVal) {
      const cur = this.colCount
      this.matrix.forEach(row => {
        if (newVal > cur) {
          for (let i = cur; i < newVal; i++) {
            row.push('')
          }
        } else if (newVal < cur) {
          row.splice(newVal)
        }
      })
    },

    addRow() {
      if (this.rowCount >= 20) return
      this.rowCount++
      this.matrix.push(new Array(this.colCount).fill(''))
    },

    delRow() {
      if (this.rowCount <= 1) return
      this.rowCount--
      this.matrix.pop()
    },

    addCol() {
      if (this.colCount >= 10) return
      this.colCount++
      this.matrix.forEach((row, idx) => {
        row.push(idx === 0 && this.hasHeader ? `列 ${this.colCount}` : '')
      })
    },

    delCol() {
      if (this.colCount <= 1) return
      this.colCount--
      this.matrix.forEach(row => row.pop())
    },

    clearData() {
      this.matrix.forEach(row => {
        for (let i = 0; i < row.length; i++) {
          row[i] = ''
        }
      })
    },

    onEnterKey(r, c) {
      if (r < this.rowCount - 1) {
        const next = this.$refs[`cell_${r + 1}_${c}`]
        if (next && next[0]) next[0].focus()
      } else {
        this.addRow()
        this.$nextTick(() => {
          const next = this.$refs[`cell_${r + 1}_${c}`]
          if (next && next[0]) next[0].focus()
        })
      }
    },

    onTabKey(r, c, event) {
      if (event.shiftKey) {
        // Shift+Tab 保持默认或向前跳
        return
      }
      if (r === this.rowCount - 1 && c === this.colCount - 1) {
        event.preventDefault()
        this.addRow()
        this.$nextTick(() => {
          const next = this.$refs[`cell_${r + 1}_0`]
          if (next && next[0]) next[0].focus()
        })
      }
    },

    removeTable() {
      this.$confirm('确定要从该节点中移除表格吗？', '提示', {
        type: 'warning'
      })
        .then(() => {
          const combined = (this.prefixText + this.postfixText).trim() || '新建主题'
          this.applyTextToNode(combined)
          this.visible = false
          this.$message.success('已移除表格')
        })
        .catch(() => {})
    },

    buildTableHtml() {
      if (!this.matrix || this.matrix.length === 0) return ''
      let html = '<table class="smm-node-table">'
      if (this.hasHeader && this.matrix.length > 0) {
        html += '<thead><tr>'
        this.matrix[0].forEach(cell => {
          html += `<th>${escapeHtml(cell)}</th>`
        })
        html += '</tr></thead><tbody>'
        for (let r = 1; r < this.matrix.length; r++) {
          html += '<tr>'
          this.matrix[r].forEach(cell => {
            html += `<td>${escapeHtml(cell)}</td>`
          })
          html += '</tr>'
        }
        html += '</tbody>'
      } else {
        html += '<tbody>'
        this.matrix.forEach(row => {
          html += '<tr>'
          row.forEach(cell => {
            html += `<td>${escapeHtml(cell)}</td>`
          })
          html += '</tr>'
        })
        html += '</tbody>'
      }
      html += '</table>'
      return html
    },

    applyTextToNode(finalText) {
      if (!this.activeNode) return
      // 开启富文本
      if (this.mindMap && !this.mindMap.opt.openNodeRichText) {
        this.$bus.$emit('toggleOpenNodeRichText', true)
      }
      this.mindMap.execCommand('SET_NODE_TEXT', this.activeNode, finalText, true, true)
    },

    confirm() {
      const tableHtml = this.buildTableHtml()
      let finalText = ''
      const prefix = this.prefixText.trim()
      const postfix = this.postfixText.trim()

      if (prefix && prefix !== '<p><br></p>') {
        finalText += prefix + (prefix.endsWith('</p>') ? '' : '<br>')
      }
      finalText += tableHtml
      if (postfix && postfix !== '<p><br></p>') {
        finalText += (postfix.startsWith('<p>') ? '' : '<br>') + postfix
      }

      this.applyTextToNode(finalText)
      this.visible = false
      this.$message.success(this.isEditing ? '表格已更新' : '表格已插入')
    }
  }
}
</script>

<style lang="less" scoped>
.tableDialogPanel {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &.isDark {
    color: #cfd3dc;

    .gridTable {
      border-color: #4c4d4f;

      td {
        border-color: #4c4d4f;

        &.isHeaderCell {
          background-color: #2b2f3a;
        }

        .cellInput {
          background-color: transparent;
          color: #cfd3dc;
        }
      }
    }
  }

  .configBar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #ebeef5;

    .configItem {
      display: flex;
      align-items: center;
      gap: 6px;

      .label {
        font-size: 13px;
        white-space: nowrap;
      }

      &.btnGroup {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }

    .dangerText {
      color: #f56c6c;
    }
  }

  .gridWrapper {
    max-height: 380px;
    overflow: auto;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 8px;
  }

  .gridTable {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;

    td {
      border: 1px solid #dcdfe6;
      padding: 0;
      position: relative;

      &.isHeaderCell {
        background-color: #f5f7fa;
        font-weight: bold;
      }

      .cellInput {
        width: 100%;
        box-sizing: border-box;
        border: none;
        outline: none;
        padding: 6px 8px;
        font-size: 13px;
        background: transparent;

        &:focus {
          box-shadow: inset 0 0 0 1.5px #409eff;
        }
      }
    }
  }

  .hint {
    font-size: 12px;
    color: #909399;
    line-height: 1.5;
  }
}
</style>
