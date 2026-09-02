<template>
  <el-dialog
    title="复习卡片管理"
    :visible.sync="visible"
    width="640px"
    :append-to-body="true"
  >
    <div class="cardManager" :class="{ dark: isDark }">
      <!-- 节点信息 -->
      <div class="nodeInfo">
        <span class="name">{{ nodeName }}</span>
        <span class="path">{{ nodePath }}</span>
      </div>

      <!-- 卡片列表 -->
      <div class="cardList" v-if="cards.length > 0">
        <div class="cardItem" v-for="(card, idx) in cards" :key="card.id">
          <div class="cardHead">
            <span class="typeTag">{{ typeText(card.type) }}</span>
            <span class="cardOps">
              <i class="el-icon-edit-outline" @click="editCard(idx)"></i>
              <i class="el-icon-delete" @click="removeCard(idx)"></i>
            </span>
          </div>
          <div class="cardBody">
            <div class="qLine">
              <span class="qlabel">问题</span>
              <span class="qtext">{{ card.front }}</span>
            </div>
            <div class="qLine">
              <span class="qlabel">答案</span>
              <span class="qtext back">{{ card.back }}</span>
            </div>
            <div class="qLine" v-if="card.hint">
              <span class="qlabel">提示</span>
              <span class="qtext hint">{{ card.hint }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty">该节点还没有复习卡片，添加一张吧</div>

      <!-- 添加/编辑表单 -->
      <div class="addForm">
        <div class="formTitle">{{ editingIndex === -1 ? '添加卡片' : '编辑卡片' }}</div>
        <el-form label-width="60px" size="small">
          <el-form-item label="类型">
            <el-select v-model="form.type" style="width: 160px;">
              <el-option label="问答卡" value="qa"></el-option>
              <el-option label="填空卡" value="cloze"></el-option>
              <el-option label="判断卡" value="judge"></el-option>
              <el-option label="例题卡" value="example"></el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="问题">
            <el-input v-model="form.front" type="textarea" :rows="2" placeholder="问题/正面内容"></el-input>
          </el-form-item>
          <el-form-item label="答案">
            <el-input v-model="form.back" type="textarea" :rows="3" placeholder="答案/背面内容"></el-input>
          </el-form-item>
          <el-form-item label="提示">
            <el-input v-model="form.hint" placeholder="可选提示（点击显示答案前先提示）"></el-input>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveCard">保存卡片</el-button>
            <el-button v-if="editingIndex !== -1" @click="cancelEdit">取消编辑</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <div slot="footer" class="dialog-footer">
      <el-button size="small" @click="visible = false">关闭</el-button>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'
import { getNode, addCard, updateCard, removeCard } from '@/review'

const TYPE_MAP = { qa: '问答', cloze: '填空', judge: '判断', example: '例题' }

export default {
  name: 'CardManagerDialog',
  data() {
    return {
      visible: false,
      uid: '',
      nodeName: '',
      nodePath: '',
      cards: [],
      editingIndex: -1,
      form: { type: 'qa', front: '', back: '', hint: '' }
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  created() {
    this.$bus.$on('open_card_manager', this.open)
  },
  beforeDestroy() {
    this.$bus.$off('open_card_manager', this.open)
  },
  methods: {
    typeText(t) {
      return TYPE_MAP[t] || t
    },
    open(info) {
      this.uid = info && info.uid ? info.uid : ''
      this.nodeName = (info && info.name) || ''
      this.nodePath = (info && info.path) || ''
      const node = this.uid ? getNode(this.uid) : null
      this.cards = node ? node.cards || [] : []
      this.editingIndex = -1
      this.resetForm()
      this.visible = true
    },
    resetForm() {
      this.form = { type: 'qa', front: '', back: '', hint: '' }
    },
    editCard(idx) {
      this.editingIndex = idx
      const c = this.cards[idx]
      this.form = { type: c.type, front: c.front, back: c.back, hint: c.hint || '' }
    },
    cancelEdit() {
      this.editingIndex = -1
      this.resetForm()
    },
    saveCard() {
      if (!this.form.front.trim()) {
        this.$message.warning('问题不能为空')
        return
      }
      if (this.editingIndex === -1) {
        addCard(this.uid, { ...this.form })
        this.$message.success('已添加卡片')
      } else {
        const cardId = this.cards[this.editingIndex].id
        updateCard(this.uid, cardId, { ...this.form })
        this.$message.success('已更新卡片')
      }
      // 刷新
      const node = getNode(this.uid)
      this.cards = node ? node.cards || [] : []
      this.editingIndex = -1
      this.resetForm()
      this.$bus.$emit('review_data_change')
    },
    removeCard(idx) {
      const cardId = this.cards[idx].id
      removeCard(this.uid, cardId)
      const node = getNode(this.uid)
      this.cards = node ? node.cards || [] : []
      this.$message.success('已删除卡片')
      this.$bus.$emit('review_data_change')
    }
  }
}
</script>

<style lang="less" scoped>
.cardManager {
  &.dark {
    .cardItem,
    .addForm {
      background: #363b3f;
    }
  }

  .nodeInfo {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 14px;

    .name {
      font-weight: 600;
    }

    .path {
      font-size: 12px;
      color: #909399;
    }
  }

  .cardList {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 14px;

    .cardItem {
      border: 1px solid #ebeef5;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 10px;

      .cardHead {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;

        .typeTag {
          font-size: 11px;
          color: #409eff;
          background: #ecf5ff;
          padding: 2px 8px;
          border-radius: 3px;
        }

        .cardOps {
          color: #909399;

          i {
            cursor: pointer;
            margin-left: 8px;

            &:hover {
              color: #409eff;
            }
          }

          .el-icon-delete:hover {
            color: #f56c6c;
          }
        }
      }

      .cardBody {
        .qLine {
          display: flex;
          gap: 8px;
          font-size: 13px;
          margin-bottom: 4px;

          .qlabel {
            color: #909399;
            width: 30px;
            flex-shrink: 0;
          }

          .qtext {
            flex: 1;
            word-break: break-all;

            &.back {
              color: #67c23a;
            }

            &.hint {
              color: #c0a062;
              font-style: italic;
            }
          }
        }
      }
    }
  }

  .empty {
    text-align: center;
    color: #909399;
    padding: 20px 0;
    font-size: 13px;
  }

  .addForm {
    border-top: 1px solid #f0f2f5;
    padding-top: 12px;

    .formTitle {
      font-weight: 600;
      margin-bottom: 10px;
      font-size: 14px;
    }
  }
}
</style>
