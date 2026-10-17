<template>
  <el-dialog
    :visible.sync="visible"
    width="680px"
    :append-to-body="true"
    :close-on-click-modal="false"
    :custom-class="'reviewQuizDialog' + (isDark ? ' isDark' : '')"
    @closed="onClosed"
  >
    <div slot="title" class="dialogHeader">
      <div class="titleMain">
        <span class="quizIcon">🧠</span>
        <span class="titleText">{{ modeTitle }}</span>
      </div>
      <div class="progressInfo" v-if="queue.length > 0 && !isFinished">
        <span class="progressText">第 {{ currentIndex + 1 }} / {{ queue.length }} 项</span>
        <el-progress
          :percentage="progressPercent"
          :stroke-width="6"
          :show-text="false"
          style="width: 140px; margin-left: 10px;"
        ></el-progress>
      </div>
    </div>

    <!-- 1. 复习完成总结界面 -->
    <div v-if="isFinished" class="finishedWrap">
      <div class="finishIcon">🎉</div>
      <h3 class="finishTitle">本轮拷问复习圆满完成！</h3>
      <p class="finishDesc">记忆已按艾宾浩斯记忆模型重新排期，温故而知新。</p>

      <div class="finishStats">
        <div class="fStatItem">
          <div class="num">{{ finishSummary.total }}</div>
          <div class="label">本次复习</div>
        </div>
        <div class="fStatItem">
          <div class="num text-success">{{ finishSummary.remember }}</div>
          <div class="label">记得/熟练</div>
        </div>
        <div class="fStatItem">
          <div class="num text-warning">{{ finishSummary.fuzzy }}</div>
          <div class="label">模糊</div>
        </div>
        <div class="fStatItem">
          <div class="num text-danger">{{ finishSummary.forgot }}</div>
          <div class="label">忘记</div>
        </div>
      </div>

      <div class="finishOps">
        <el-button type="primary" size="medium" @click="visible = false">完成并关闭</el-button>
        <el-button size="medium" @click="goToReviewPage">前往复习中心</el-button>
      </div>
    </div>

    <!-- 2. 无卡片/队列为空提示 -->
    <div v-else-if="!currentReview" class="emptyWrap">
      <div class="emptyIcon">☕️</div>
      <div class="emptyText">当前没有需要复习的项目</div>
      <el-button size="small" type="primary" @click="visible = false">关闭</el-button>
    </div>

    <!-- 3. 核心拷问卡片区域 -->
    <div v-else class="quizBody">
      <!-- 节点元数据信息 -->
      <div class="nodeMetaBox">
        <div class="nodeMainLine">
          <span class="nodeName">{{ currentReview.name }}</span>
          <span class="nodeTags" v-if="currentReview.tags && currentReview.tags.length">
            <el-tag size="mini" v-for="t in currentReview.tags" :key="t" type="info">{{ t }}</el-tag>
          </span>
        </div>
        <div class="nodeSubLine">
          <span class="nodePath" v-if="currentReview.path">{{ currentReview.path }}</span>
          <span class="nodeCounts">
            已复习 {{ currentReview.times || 0 }} 次 · 错误 {{ currentReview.errorCount || 0 }} 次
          </span>
        </div>

        <!-- 当前节点拥有多张卡片时的切换工具栏 -->
        <div class="cardIndexBar" v-if="currentCards.length > 1">
          <span class="cardCountText">卡片 {{ currentCardIndex + 1 }} / {{ currentCards.length }}</span>
          <el-button-group>
            <el-button size="mini" icon="el-icon-arrow-left" :disabled="currentCardIndex <= 0" @click="prevCard">上一张</el-button>
            <el-button size="mini" :disabled="currentCardIndex >= currentCards.length - 1" @click="nextCard">下一张<i class="el-icon-arrow-right el-icon--right"></i></el-button>
          </el-button-group>
        </div>
      </div>

      <!-- 卡片正反面呈现区 -->
      <div class="cardInteractiveArea" :class="{ 'is-revealed': showAnswer }" @click="toggleAnswer">
        <div class="cardFront">
          <div class="cardTopBar">
            <span class="cardTypeBadge">{{ cardTypeText(activeCard ? activeCard.type : 'qa') }}</span>
            <span class="stageBadge">{{ showAnswer ? '【答案面】' : '【正面 · 思考回忆中】' }}</span>
          </div>

          <div class="cardQuestion" v-if="activeCard">
            <div class="qaText">{{ activeCard.front }}</div>
            <div class="qaHint" v-if="activeCard.hint">💡 提示：{{ activeCard.hint }}</div>
          </div>
          <div class="cardQuestion" v-else>
            <div class="qaText">回忆：{{ currentReview.name }}</div>
            <div class="qaHint">（该节点暂未添加独立卡片，请根据知识点名称回忆相关全部内容）</div>
          </div>

          <div class="flipPrompt">
            <span v-if="!showAnswer">👉 点击或按 [Space / Enter] 显示答案</span>
            <span v-else>👈 点击或按 [Space] 收起答案</span>
          </div>
        </div>

        <!-- 揭示的答案面 -->
        <transition name="el-zoom-in-top">
          <div class="cardBack" v-if="showAnswer">
            <div class="backTitle">✅ 参考答案</div>
            <div class="backBody" v-if="activeCard">
              <div class="answerText">{{ activeCard.back }}</div>
            </div>
            <div class="backBody" v-else>
              <div class="answerText">（该节点暂无独立卡片，建议在导图节点右键“管理卡片”中添加正反面卡片）</div>
            </div>
          </div>
        </transition>
      </div>

      <!-- 操作面板：揭示前先回忆，揭示后四级评价 -->
      <div class="actionBox">
        <div v-if="!showAnswer" class="unrevealedState">
          <el-button type="primary" size="medium" icon="el-icon-view" @click="toggleAnswer">
            显示答案 (Space)
          </el-button>
          <div class="actionTip">请先在脑海中回忆答案，揭示答案后即可进行复习效果评价</div>
        </div>

        <div v-else class="revealedState">
          <div class="ratingGroup">
            <el-button type="danger" size="medium" @click="rate(RATING.FORGOT)">
              😰 忘记 (1)
            </el-button>
            <el-button type="warning" size="medium" @click="rate(RATING.FUZZY)">
              🤔 模糊 (2)
            </el-button>
            <el-button type="success" size="medium" @click="rate(RATING.REMEMBER)">
              ✅ 记得 (3)
            </el-button>
            <el-button type="primary" size="medium" @click="rate(RATING.MASTERED)">
              🌟 熟练 (4)
            </el-button>
          </div>
          <div class="ratingExplanation">
            忘记=今天重练 · 模糊=减半复现 · 记得=推进一步 · 熟练=直接掌握
          </div>
        </div>
      </div>

      <!-- 快捷键操作提示 -->
      <div class="shortcutBar">
        <span class="scItem"><b>Space</b>: {{ showAnswer ? '收起答案' : '显示答案' }}</span>
        <span class="scItem" v-if="currentCards.length > 1"><b>← / →</b>: 切换卡片</span>
        <span class="scItem" v-if="showAnswer"><b>1-4</b>: 快速评价</span>
        <span class="scItem"><b>Esc</b>: 退出拷问</span>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'
import {
  rateReview,
  RATING,
  todayList,
  getNodeList,
  getNode
} from '@/review'
import {
  reviewShortcutDispatcher
} from '@/review/reviewShortcuts'

const CARD_TYPE_MAP = {
  qa: '问答题',
  blank: '填空题',
  judge: '判断题'
}

export default {
  name: 'ReviewQuizDialog',
  data() {
    return {
      visible: false,
      modeTitle: '知识拷问复习',
      queue: [],
      currentIndex: 0,
      currentCardIndex: 0,
      showAnswer: false,
      isFinished: false,
      isSubmittingRate: false,
      finishSummary: {
        total: 0,
        remember: 0,
        fuzzy: 0,
        forgot: 0
      },
      RATING
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    }),
    currentReview() {
      if (this.isFinished || !this.queue.length) return null
      return this.queue[this.currentIndex] || null
    },
    currentCards() {
      const cur = this.currentReview
      if (!cur) return []
      return cur.cards || []
    },
    activeCard() {
      const cards = this.currentCards
      if (!cards.length) return null
      const idx = Math.max(0, Math.min(this.currentCardIndex, cards.length - 1))
      return cards[idx] || null
    },
    progressPercent() {
      if (!this.queue.length) return 0
      return Math.round(((this.currentIndex) / this.queue.length) * 100)
    }
  },
  created() {
    this.$bus.$on('open_quiz_dialog', this.open)
    this.registerQuizShortcuts()
  },
  beforeDestroy() {
    this.$bus.$off('open_quiz_dialog', this.open)
  },
  methods: {
    cardTypeText(t) {
      return CARD_TYPE_MAP[t] || t || '问答题'
    },
    open(payload = {}) {
      // payload 可以是:
      // 1. { type: 'due' } => 今日待复习队列
      // 2. { type: 'weak' } => 薄弱项队列
      // 3. { item } => 单项拷问
      // 4. { uid } => 根据 uid 查询项拷问
      // 5. { queue, title } => 自定义队列
      let queue = []
      let title = '知识拷问复习'

      if (payload.item) {
        queue = [payload.item]
        title = `单项拷问：${payload.item.name || ''}`
      } else if (payload.uid) {
        const found = getNode(payload.uid)
        if (found) {
          queue = [found]
          title = `单项拷问：${found.name || ''}`
        }
      } else if (payload.type === 'weak') {
        const all = getNodeList()
        queue = all.filter(n => {
          if (n.status === 'mastered') return false
          if ((n.errorCount || 0) >= 3) return true
          if (n.nextReview) {
            const diff = new Date().getTime() - new Date(n.nextReview).getTime()
            if (diff > 14 * 86400000) return true
          }
          return false
        })
        title = `薄弱项拷问 (${queue.length} 项)`
      } else if (payload.type === 'due') {
        queue = todayList()
        title = `今日到期拷问 (${queue.length} 项)`
      } else if (Array.isArray(payload.queue) && payload.queue.length) {
        queue = payload.queue
        if (payload.title) title = payload.title
      } else {
        // 默认按今日待复习
        queue = todayList()
        title = `今日到期拷问 (${queue.length} 项)`
      }

      this.modeTitle = title
      this.queue = queue.slice()
      this.currentIndex = 0
      this.currentCardIndex = 0
      this.showAnswer = false
      this.isFinished = false
      this.isSubmittingRate = false
      this.finishSummary = {
        total: 0,
        remember: 0,
        fuzzy: 0,
        forgot: 0
      }

      if (!this.queue.length) {
        this.$message.info('当前没有需要复习的卡片')
        return
      }

      this.visible = true
      // 切换快捷键作用域为 quiz
      reviewShortcutDispatcher.setScope('quiz')
    },

    toggleAnswer() {
      this.showAnswer = !this.showAnswer
    },

    prevCard() {
      if (this.currentCardIndex > 0) {
        this.currentCardIndex -= 1
        this.showAnswer = false
      }
    },

    nextCard() {
      if (this.currentCardIndex < this.currentCards.length - 1) {
        this.currentCardIndex += 1
        this.showAnswer = false
      }
    },

    rate(rating) {
      if (this.isSubmittingRate) return
      if (!this.showAnswer) {
        this.$message.warning('请先显示答案，核对回忆后再提交评价')
        return
      }
      const cur = this.currentReview
      if (!cur) return

      this.isSubmittingRate = true
      try {
        rateReview(cur.uid, rating)

        // 累计本轮统计
        this.finishSummary.total += 1
        if (rating === RATING.FORGOT) {
          this.finishSummary.forgot += 1
        } else if (rating === RATING.FUZZY) {
          this.finishSummary.fuzzy += 1
        } else {
          this.finishSummary.remember += 1
        }

        this.showAnswer = false
        this.currentCardIndex = 0

        this.currentIndex += 1
        if (this.currentIndex >= this.queue.length) {
          this.isFinished = true
        }
        this.$bus.$emit('review_data_change')
      } finally {
        setTimeout(() => {
          this.isSubmittingRate = false
        }, 150)
      }
    },

    goToReviewPage() {
      this.visible = false
      this.$router.push('/review')
    },

    onClosed() {
      // 弹窗关闭时，切回 map 快捷键作用域
      reviewShortcutDispatcher.setScope('map')
      this.queue = []
      this.isFinished = false
      this.showAnswer = false
    },

    registerQuizShortcuts() {
      // 当主页面打开此弹窗时，scope 为 quiz，响应这些动作
      reviewShortcutDispatcher.register('quiz', 'showAnswer', () => {
        if (this.visible && this.currentReview) {
          this.toggleAnswer()
        }
      })
      reviewShortcutDispatcher.register('quiz', 'prevCard', () => {
        if (this.visible && this.currentReview) {
          this.prevCard()
        }
      })
      reviewShortcutDispatcher.register('quiz', 'nextCard', () => {
        if (this.visible && this.currentReview) {
          this.nextCard()
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateForgot', () => {
        if (this.visible && this.currentReview && this.showAnswer) {
          this.rate(RATING.FORGOT)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateFuzzy', () => {
        if (this.visible && this.currentReview && this.showAnswer) {
          this.rate(RATING.FUZZY)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateRemember', () => {
        if (this.visible && this.currentReview && this.showAnswer) {
          this.rate(RATING.REMEMBER)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateMastered', () => {
        if (this.visible && this.currentReview && this.showAnswer) {
          this.rate(RATING.MASTERED)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'exitQuiz', () => {
        if (this.visible) {
          this.visible = false
        }
      })
    }
  }
}
</script>

<style lang="less">
.reviewQuizDialog {
  border-radius: 12px;
  overflow: hidden;

  .el-dialog__header {
    padding: 16px 20px;
    border-bottom: 1px solid #ebeef5;
    background: #fafbfc;
  }

  .el-dialog__body {
    padding: 20px 24px 24px;
  }

  &.isDark {
    background: #2b2f33;
    color: #f5f7fa;

    .el-dialog__header {
      background: #363b3f;
      border-bottom-color: hsla(0, 0%, 100%, 0.1);
    }
    .el-dialog__title {
      color: #fff;
    }
    .quizBody {
      .nodeMetaBox {
        background: #363b3f;
        .nodeMainLine .nodeName {
          color: #fff;
        }
      }
      .cardInteractiveArea {
        background: #363b3f;
        border-color: #4a5056;

        .cardFront {
          .qaText {
            color: #fff;
          }
        }
        .cardBack {
          border-top-color: #4a5056;
          .backBody .answerText {
            color: #dcdfe6;
          }
        }
      }
    }

    .finishedWrap {
      .finishTitle {
        color: #fff;
      }
      .finishStats {
        background: #363b3f;
      }
    }
  }
}

.dialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .titleMain {
    display: flex;
    align-items: center;
    gap: 8px;

    .quizIcon {
      font-size: 20px;
    }
    .titleText {
      font-size: 16px;
      font-weight: 700;
      color: #303133;
    }
  }

  .progressInfo {
    display: flex;
    align-items: center;
    margin-right: 28px;

    .progressText {
      font-size: 13px;
      color: #909399;
      font-weight: 600;
    }
  }
}

.quizBody {
  .nodeMetaBox {
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;

    .nodeMainLine {
      display: flex;
      align-items: center;
      gap: 10px;

      .nodeName {
        font-size: 16px;
        font-weight: 700;
        color: #303133;
      }
    }

    .nodeSubLine {
      margin-top: 6px;
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #909399;
    }

    .cardIndexBar {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px dashed #ebeef5;
      padding-top: 8px;

      .cardCountText {
        font-size: 12px;
        font-weight: 600;
        color: #409eff;
      }
    }
  }

  .cardInteractiveArea {
    background: #fff;
    border: 2px solid #e4e7ed;
    border-radius: 10px;
    padding: 20px;
    min-height: 180px;
    cursor: pointer;
    transition: all 0.25s ease;

    &:hover {
      border-color: #409eff;
      box-shadow: 0 4px 12px rgba(64, 158, 255, 0.12);
    }

    &.is-revealed {
      border-color: #67c23a;
    }

    .cardTopBar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .cardTypeBadge {
        font-size: 12px;
        background: #ecf5ff;
        color: #409eff;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
      }

      .stageBadge {
        font-size: 12px;
        font-weight: 600;
        color: #909399;
      }
    }

    .cardQuestion {
      .qaText {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.6;
        color: #303133;
      }
      .qaHint {
        margin-top: 10px;
        font-size: 13px;
        color: #e6a23c;
      }
    }

    .flipPrompt {
      margin-top: 24px;
      text-align: center;
      font-size: 12px;
      color: #909399;
    }

    .cardBack {
      margin-top: 16px;
      border-top: 1px solid #ebeef5;
      padding-top: 14px;

      .backTitle {
        font-size: 13px;
        font-weight: 700;
        color: #67c23a;
        margin-bottom: 8px;
      }

      .backBody {
        .answerText {
          font-size: 15px;
          line-height: 1.6;
          color: #303133;
        }
      }
    }
  }

  .actionBox {
    margin-top: 18px;
    text-align: center;

    .unrevealedState {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;

      .actionTip {
        font-size: 12px;
        color: #909399;
      }
    }

    .revealedState {
      .ratingGroup {
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;

        .el-button {
          min-width: 96px;
          font-weight: 600;
        }
      }

      .ratingExplanation {
        margin-top: 8px;
        font-size: 12px;
        color: #909399;
      }
    }
  }

  .shortcutBar {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px dashed #ebeef5;
    display: flex;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #909399;

    .scItem b {
      color: #409eff;
      background: #ecf5ff;
      padding: 1px 5px;
      border-radius: 3px;
      margin-right: 4px;
    }
  }
}

.finishedWrap {
  text-align: center;
  padding: 16px 0;

  .finishIcon {
    font-size: 44px;
    margin-bottom: 10px;
  }
  .finishTitle {
    font-size: 20px;
    font-weight: 700;
    color: #303133;
    margin: 0 0 6px;
  }
  .finishDesc {
    font-size: 13px;
    color: #909399;
    margin: 0 0 20px;
  }
  .finishStats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    background: #f8fafc;
    border-radius: 8px;
    padding: 14px 8px;
    margin-bottom: 22px;

    .fStatItem {
      .num {
        font-size: 20px;
        font-weight: 700;
        color: #409eff;

        &.text-success { color: #67c23a; }
        &.text-warning { color: #e6a23c; }
        &.text-danger { color: #f56c6c; }
      }
      .label {
        margin-top: 4px;
        font-size: 12px;
        color: #909399;
      }
    }
  }
  .finishOps {
    display: flex;
    justify-content: center;
    gap: 14px;
  }
}

.emptyWrap {
  text-align: center;
  padding: 30px 0;

  .emptyIcon {
    font-size: 40px;
    margin-bottom: 10px;
  }
  .emptyText {
    font-size: 14px;
    color: #909399;
    margin-bottom: 16px;
  }
}
</style>
