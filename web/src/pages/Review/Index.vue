<template>
  <div class="reviewPage" :class="{ dark: isDark }">
    <header class="pageHeader">
      <div class="left">
        <h2>复习中心</h2>
        <span class="date">{{ today }}</span>
      </div>
      <div class="right">
        <el-button size="small" @click="goEdit">返回编辑器</el-button>
      </div>
    </header>

    <!-- 统计卡片 -->
    <div class="statsRow">
      <div class="statCard">
        <div class="num">{{ stats.total }}</div>
        <div class="label">总复习</div>
      </div>
      <div class="statCard">
        <div class="num">{{ stats.learning }}</div>
        <div class="label">学习中</div>
      </div>
      <div class="statCard">
        <div class="num">{{ stats.mastered }}</div>
        <div class="label">已掌握</div>
      </div>
      <div class="statCard highlight">
        <div class="num">{{ stats.todayDone }}/{{ stats.todayDue }}</div>
        <div class="label">今日完成</div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="mainTabs">
      <!-- 今日复习 -->
      <el-tab-pane label="今日复习" name="today">
        <!-- 复习模式：卡片 + 三档评价 -->
        <div v-if="reviewMode && currentReview" class="reviewMode" :class="{ dark: isDark }">
          <div class="reviewHeader">
            <div class="progressWrap">
              <el-progress :percentage="reviewProgress()" :stroke-width="8" :show-text="false"></el-progress>
              <span class="progressText">{{ reviewIndex + 1 }} / {{ reviewQueue.length }}</span>
            </div>
            <el-button size="small" @click="exitReview">退出复习</el-button>
          </div>

          <div class="reviewCardWrap">
            <div class="reviewNodeInfo">
              <span class="nodeName">{{ currentReview.name }}</span>
              <span class="nodePath">{{ currentReview.path }}</span>
              <span class="nodeMeta">
                已复习 {{ currentReview.times }} 次 · 错误 {{ currentReview.errorCount || 0 }} 次
              </span>
              <span class="nodeTags" v-if="currentReview.tags && currentReview.tags.length">
                <el-tag size="mini" v-for="t in currentReview.tags" :key="t" type="info">{{ t }}</el-tag>
              </span>
            </div>

            <!-- 卡片翻面 -->
            <div class="cardArea" @click="toggleAnswer">
              <div class="cardFront">
                <span class="cardType">{{ cardTypeText('qa') }}</span>
                <div class="cardContent" v-if="currentCards.length > 0">
                  <!-- 第一张卡片（当前用第一张演示） -->
                  <div class="qaFront">{{ currentCards[0].front }}</div>
                  <div class="qaHint" v-if="currentCards[0].hint">提示：{{ currentCards[0].hint }}</div>
                </div>
                <div class="cardContent" v-else>
                  <div class="qaFront">回忆：{{ currentReview.name }}</div>
                  <div class="qaHint">（该节点还没有复习卡片，先回忆知识点内容）</div>
                </div>
                <div class="flipTip">{{ showAnswer ? '点击收起答案' : '点击显示答案' }}</div>
              </div>

              <div class="cardBack" v-if="showAnswer">
                <div class="backLabel">答案</div>
                <div class="backContent" v-if="currentCards.length > 0">
                  <div class="qaBack">{{ currentCards[0].back }}</div>
                </div>
                <div class="backContent" v-else>
                  <div class="qaBack">（无卡片，可在节点详情中添加复习卡片）</div>
                </div>
              </div>
            </div>

            <!-- 三档评价 -->
            <div class="ratingBar">
              <el-button type="danger" size="medium" @click="rate(RATING.FORGOT)">
                😰 忘记
              </el-button>
              <el-button type="warning" size="medium" @click="rate(RATING.FUZZY)">
                🤔 模糊
              </el-button>
              <el-button type="success" size="medium" @click="rate(RATING.REMEMBER)">
                ✅ 记得
              </el-button>
            </div>
            <div class="ratingTip">忘记=今天再复习 · 模糊=缩短间隔 · 记得=推进周期</div>
          </div>
        </div>

        <!-- 非复习模式：队列列表 -->
        <template v-else>
          <div class="reviewEntry">
            <div class="entryStats">
              <span>今日到期 <b>{{ dueList.length }}</b> 项</span>
              <span>薄弱节点 <b>{{ weakListData.length }}</b> 项</span>
            </div>
            <div class="entryBtns">
              <el-button type="primary" :disabled="dueList.length === 0" @click="startReview('due')">
                开始复习（今日）
              </el-button>
              <el-button type="warning" :disabled="weakListData.length === 0" @click="startReview('weak')">
                复习薄弱项
              </el-button>
            </div>
          </div>

          <div v-if="dueList.length === 0" class="emptyTip">今日没有待复习项，休息一下吧</div>
          <div class="fileGroup todayGroup" v-for="g in dueGroups" :key="g.key" :class="{ dark: isDark }">
            <div class="groupHeader">
              <span class="groupName">{{ g.fileName }}</span>
              <span class="groupCount">{{ g.list.length }} 项</span>
            </div>
            <div class="taskItem" v-for="item in g.list" :key="item.uid" :style="{ paddingLeft: 16 + item.level * 22 + 'px' }" :class="{ dark: isDark }">
              <div class="taskInfo">
                <div class="taskName">{{ item.name }}</div>
                <div class="taskMeta">
                  <span v-if="item.path">{{ item.path }}</span>
                  <span class="times">{{ item.times }}/{{ item.cycles.length }} 次</span>
                  <span class="overdueTag" v-if="item.nextReview < todayStrValue">逾期</span>
                  <span class="errorCount" v-if="item.errorCount">
                    <el-tag size="mini" type="danger">错 {{ item.errorCount }}</el-tag>
                  </span>
                </div>
              </div>
              <div class="taskOps">
                <el-button size="mini" @click="onPostpone(item)">推迟 1 天</el-button>
                <el-button size="mini" type="primary" @click="onComplete(item)">完成</el-button>
              </div>
            </div>
          </div>
        </template>
      </el-tab-pane>

      <!-- 全部节点 -->
      <el-tab-pane label="全部节点" name="all">
        <div class="allToolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索节点名称 / 路径"
            size="small"
            clearable
            style="width: 260px;"
          ></el-input>
          <div class="rightOps">
            <el-select
              v-model="filterFile"
              placeholder="全部文件"
              size="small"
              clearable
              style="width: 180px;"
            >
              <el-option
                v-for="f in fileGroups"
                :key="f.key"
                :label="f.fileName + '（' + f.count + '）'"
                :value="f.key"
              ></el-option>
            </el-select>
            <el-button size="small" type="primary" @click="activeTab = 'add'">+ 添加复习</el-button>
          </div>
        </div>

        <!-- 按文件分组，组内按父子级树形显示 -->
        <div class="fileGroup" v-for="g in groupedList" :key="g.key" :class="{ dark: isDark }">
          <div class="groupHeader" @click="toggleFileGroup(g.key)">
            <span class="groupName">
              <i class="el-icon-arrow-right" :class="{ expanded: !g.collapsed }"></i>
              {{ g.fileName }}
            </span>
            <span class="groupCount">{{ g.list.length }} 项</span>
          </div>
          <div v-if="!g.collapsed">
            <div
              class="treeRow"
              v-for="item in g.list"
              :key="item.uid"
              :style="{ paddingLeft: 12 + item.level * 22 + 'px' }"
              :class="{ dark: isDark }"
            >
              <span class="levelLine" v-if="item.level > 0"></span>
              <div class="rowMain">
                <div class="rowName">
                  <span class="treeGuide" v-if="item.level > 0">
                    <i class="el-icon-d-caret"></i>
                  </span>
                  <span class="nameText">{{ item.name }}</span>
                  <el-tag
                    size="mini"
                    :type="statusType(item.status)"
                    style="margin-left: 8px;"
                  >{{ statusText(item.status) }}</el-tag>
                </div>
                <div class="rowMeta">
                  <span v-if="item.path" class="pathText">{{ item.path }}</span>
                  <span class="cycleText">{{ cyclesToStr(item.cycles) }}</span>
                  <span class="timesText">{{ item.times }}/{{ item.cycles.length }} 次</span>
                  <span class="nextText">{{ item.nextReview || '已掌握' }}</span>
                </div>
              </div>
              <div class="rowOps">
                <el-button size="mini" type="text" @click="onCards(item)">卡片</el-button>
                <el-button size="mini" type="text" @click="onEdit(item)">设置</el-button>
                <el-button
                  size="mini"
                  type="text"
                  v-if="item.status !== 'mastered'"
                  @click="onComplete(item)"
                >完成</el-button>
                <el-button size="mini" type="text" @click="onReset(item)">重置</el-button>
                <el-button size="mini" type="text" class="danger" @click="onRemove(item)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="groupedList.length === 0" class="emptyTip">
          暂无复习节点{{ filterFile ? '（当前筛选）' : '' }}
        </div>
      </el-tab-pane>

      <!-- 薄弱节点 -->
      <el-tab-pane label="薄弱节点" name="weak">
        <div class="allToolbar">
          <div class="leftInfo">
            <span>共 <b>{{ weakListData.length }}</b> 个薄弱节点（错误≥3 次 或 超过14天未复习）</span>
          </div>
          <div class="rightOps">
            <el-button size="small" type="warning" :disabled="weakListData.length === 0" @click="startReview('weak')">
              复习薄弱项
            </el-button>
          </div>
        </div>
        <div v-if="weakListData.length === 0" class="emptyTip">没有薄弱节点，继续保持！</div>
        <div class="fileGroup" v-for="g in weakGroups" :key="g.key" :class="{ dark: isDark }">
          <div class="groupHeader" @click="toggleFileGroup(g.key)">
            <span class="groupName">
              <i class="el-icon-arrow-right" :class="{ expanded: !g.collapsed }"></i>
              {{ g.fileName }}
            </span>
            <span class="groupCount">{{ g.list.length }} 项</span>
          </div>
          <div v-if="!g.collapsed">
            <div class="treeRow" v-for="item in g.list" :key="item.uid" :style="{ paddingLeft: 12 + item.level * 22 + 'px' }" :class="{ dark: isDark }">
              <div class="rowMain">
                <div class="rowName">
                  <span class="nameText">{{ item.name }}</span>
                  <el-tag size="mini" type="danger" style="margin-left: 8px;" v-if="item.errorCount >= 3">
                    错 {{ item.errorCount }}
                  </el-tag>
                  <el-tag size="mini" type="warning" style="margin-left: 8px;" v-else>
                    久未复习
                  </el-tag>
                </div>
                <div class="rowMeta">
                  <span v-if="item.path" class="pathText">{{ item.path }}</span>
                  <span class="nextText">下次：{{ item.nextReview || '已掌握' }}</span>
                </div>
              </div>
              <div class="rowOps">
                <el-button size="mini" type="text" @click="onReset(item)">重置</el-button>
                <el-button size="mini" type="text" class="danger" @click="onRemove(item)">删除</el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 添加复习 -->
      <el-tab-pane label="添加复习" name="add">
        <div class="addPanel">
          <el-form label-width="80px" size="small" style="max-width: 440px;">
            <el-form-item label="名称">
              <el-input v-model="addName" placeholder="知识点名称"></el-input>
            </el-form-item>
            <el-form-item label="所属文件">
              <el-select
                v-model="addFileId"
                placeholder="选择文件（科目）"
                clearable
                style="width: 100%;"
              >
                <el-option
                  v-for="f in fileListForAdd"
                  :key="f.id"
                  :label="f.name"
                  :value="f.id"
                ></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="复习周期">
              <el-input v-model="addCycles" :placeholder="'如 1,3,4（默认：' + defaultCyclesStr + '）'"></el-input>
              <div class="presetRow">
                <span class="presetLabel">常用预设：</span>
                <el-button
                  size="mini"
                  v-for="p in cyclePresets"
                  :key="p.name"
                  @click="addCycles = p.value"
                >{{ p.name }}（{{ p.value }}）</el-button>
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="onAddManual">加入复习</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 设置与数据 -->
      <el-tab-pane label="设置与数据" name="settings">
        <div class="settingsPanel">
          <div class="setGroup">
            <div class="setLabel">默认复习周期</div>
            <div class="setRow">
              <el-input v-model="defaultCyclesStr" size="small" style="width: 200px;" placeholder="如 1,3,4"></el-input>
              <el-button size="small" type="primary" @click="onSaveDefaultCycles">保存</el-button>
            </div>
            <div class="setTip">新加入复习的节点将默认使用该周期，可在加入时单独修改。</div>
            <div class="presetRow">
              <span class="presetLabel">常用预设：</span>
              <el-button
                size="mini"
                v-for="p in cyclePresets"
                :key="p.name"
                @click="defaultCyclesStr = p.value"
              >{{ p.name }}（{{ p.value }}）</el-button>
            </div>
          </div>
          <div class="setGroup">
            <div class="setLabel">节点发光</div>
            <div class="setRow glowEnabledRow">
              <span>在导图中突出今日到期和重点节点</span>
              <el-switch v-model="glowConfig.enabled" @change="onGlowConfigChange"></el-switch>
            </div>
            <div class="glowConfigGrid" v-if="glowConfig.enabled">
              <div class="glowConfigItem">
                <span>到期颜色</span>
                <el-color-picker v-model="glowConfig.reviewColor" size="mini" @change="onGlowConfigChange"></el-color-picker>
              </div>
              <div class="glowConfigItem">
                <span>重点颜色</span>
                <el-color-picker v-model="glowConfig.focusColor" size="mini" @change="onGlowConfigChange"></el-color-picker>
              </div>
              <div class="glowConfigItem sliderItem">
                <span>发光强度</span>
                <el-slider v-model="glowConfig.intensity" :min="4" :max="30" :step="1" @change="onGlowConfigChange"></el-slider>
              </div>
              <div class="glowConfigItem sliderItem">
                <span>动画速度</span>
                <el-slider v-model="glowConfig.speed" :min="0.5" :max="6" :step="0.5" @change="onGlowConfigChange"></el-slider>
              </div>
            </div>
          </div>
          <div class="setGroup">
            <div class="setLabel">存储用量</div>
            <div class="storageInfo">
              <div class="usageRow">
                <span>导图数据</span>
                <span>{{ fmtSize(fileDataBytes) }}</span>
              </div>
              <div class="usageRow">
                <span>历史版本</span>
                <span>{{ fmtSize(historyBytes) }}</span>
              </div>
              <div class="usageRow">
                <span>复习数据</span>
                <span>{{ fmtSize(reviewBytes) }}</span>
              </div>
              <div class="usageRow" v-if="storageTotal">
                <span>浏览器总配额（此站点）</span>
                <span>{{ fmtSize(storageTotal) }}（已用 {{ fmtSize(storageUsed) }}）</span>
              </div>
              <div class="setTip" v-if="!isServerAvailable">
                浏览器存储空间不足（约 5-10MB）会影响保存。导图多时可清理历史版本释放空间。
              </div>
              <div class="setTip" v-else>
                当前使用服务器存储，数据已自动备份到本地文件，无需担心浏览器存储限制。
              </div>
            </div>
          </div>
          <div class="setGroup">
            <div class="setLabel">数据备份</div>
            <div class="setRow">
              <el-button size="small" type="success" plain @click="onSaveWorkspace">保存整个工作区</el-button>
              <el-button size="small" @click="onOpenWorkspace">打开整个工作区</el-button>
              <input
                ref="workspaceInput"
                type="file"
                accept=".smmw.json,.json"
                style="display: none;"
                @change="onWorkspaceInput"
              />
            </div>
            <div class="setRow">
              <el-button size="small" @click="onExport">仅导出复习 JSON</el-button>
              <el-button size="small" @click="$refs.importInput.click()">仅导入复习 JSON</el-button>
              <input
                ref="importInput"
                type="file"
                accept=".json"
                style="display: none;"
                @change="onImportFile"
              />
            </div>
            <div class="setTip">工作区文件包含全部导图、复习记录、卡片、历史版本和设置，可在其他浏览器打开。首次保存工作区后，当前会话中的编辑会自动保存到该文件。</div>
          </div>
          <div class="setGroup">
            <div class="setLabel">复习卡片 Markdown</div>
            <div class="setRow">
              <el-button size="small" @click="onExportCards">导出卡片 Markdown</el-button>
              <el-button size="small" @click="$refs.cardsInput.click()">导入卡片 Markdown</el-button>
              <input
                ref="cardsInput"
                type="file"
                accept=".md,.markdown,.txt"
                style="display: none;"
                @change="onImportCardsFile"
              />
            </div>
            <div class="setTip">
              卡片格式：`## 节点名 (uid:xxx)` 下用 `- Q:` 问题 / `A:` 答案 / `T:` 类型 / `H:` 提示。用稳定 uid 关联节点，可跨设备迁移不丢复习历史。
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    // 编辑周期/名称/标签 对话框
    <el-dialog title="复习设置" :visible.sync="editVisible" width="420px" append-to-body>
      <div v-if="editing" class="editDialog">
        <el-form label-width="80px" size="small">
          <el-form-item label="名称">
            <el-input v-model="editName"></el-input>
          </el-form-item>
          <el-form-item label="周期">
            <el-input v-model="editCycles" placeholder="如 1,3,4"></el-input>
            <div class="presetRow">
              <span class="presetLabel">常用预设：</span>
              <el-button
                size="mini"
                v-for="p in cyclePresets"
                :key="p.name"
                @click="editCycles = p.value"
              >{{ p.name }}（{{ p.value }}）</el-button>
            </div>
          </el-form-item>
          <el-form-item label="复习频率">
            <el-radio-group v-model="editFrequency">
              <el-radio label="low">低频（间隔×1.5）</el-radio>
              <el-radio label="normal">正常</el-radio>
              <el-radio label="high">高频（间隔×0.5）</el-radio>
            </el-radio-group>
            <div class="freqTip">不熟悉的内容选"高频"可更频繁复习</div>
          </el-form-item>
          <el-form-item label="标签">
            <el-select
              v-model="editTags"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="输入标签后回车添加"
              style="width: 100%;"
            >
              <el-option v-for="t in allTags" :key="t" :label="t" :value="t"></el-option>
            </el-select>
          </el-form-item>
        </el-form>
        <div class="editInfo">
          <div class="row">
            <span class="label">状态</span>
            <span>{{ statusText(editing.status) }}</span>
          </div>
          <div class="row">
            <span class="label">掌握度</span>
            <span>{{ masteryText(editing.mastery) }}</span>
          </div>
          <div class="row">
            <span class="label">错误次数</span>
            <span>{{ editing.errorCount || 0 }}</span>
          </div>
          <div class="row">
            <span class="label">次数</span>
            <span>{{ editing.times }} / {{ editing.cycles.length }}</span>
          </div>
          <div class="row">
            <span class="label">下次复习</span>
            <span>{{ editing.nextReview || '已掌握' }}</span>
          </div>
          <div class="row" v-if="editing.history && editing.history.length">
            <span class="label">复习记录</span>
            <span>{{ editing.history.length }} 次</span>
          </div>
        </div>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button size="small" @click="editVisible = false">关闭</el-button>
        <el-button size="small" type="primary" @click="onSaveEdit">保存</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import {
  getNodeList,
  todayList,
  getStats,
  addReview,
  removeReview,
  completeReview,
  resetReview,
  postponeReview,
  updateCycles,
  updateReviewName,
  parseCycles,
  cyclesToStr,
  getDefaultCycles,
  setDefaultCycles,
  exportReviewData,
  importReviewData,
  rateReview,
  RATING,
  getAllTags,
  todayStr,
  updateTags,
  updateFrequency,
  cardsToMarkdown,
  markdownToCards
} from '@/review'
import { getFileList, getLocalConfig, readFileData } from '@/api'
import { buildParentMap, buildReviewGroups, getReviewFileKey } from '@/review/tree'
import { getReviewGlowConfig, normalizeReviewGlowConfig } from '@/review/glowConfig'
import {
  saveWorkspaceFile,
  openWorkspaceFile,
  applyOpenedWorkspace,
  isWorkspaceAutoSaveEnabled,
  scheduleWorkspaceAutoSave
} from '@/api/workspace'
import { isServerAvailable } from '@/api/serverStorage'

const STATUS_MAP = {
  new: '待开始',
  learning: '学习中',
  reviewing: '复习中',
  mastered: '已掌握'
}
const STATUS_TYPE = {
  new: 'info',
  learning: 'warning',
  reviewing: 'primary',
  mastered: 'success'
}
const CARD_TYPE_MAP = {
  qa: '问答',
  cloze: '填空',
  judge: '判断',
  example: '例题'
}

export default {
  name: 'ReviewPage',
  data() {
    return {
      activeTab: 'today',
      keyword: '',
      filterFile: '',
      dueList: [],
      allList: [],
      stats: { total: 0, learning: 0, mastered: 0, todayDone: 0, todayDue: 0 },
      addName: '',
      addCycles: '',
      addFileId: '',
      fileListForAdd: [],
      defaultCyclesStr: '',
      glowConfig: getReviewGlowConfig(),
      cyclePresets: [
        { name: '艾宾浩斯', value: '1,2,4,7,15' },
        { name: '常用', value: '1,3,7' },
        { name: '密集', value: '1,1,3,3,7' },
        { name: '宽松', value: '3,7,15,30' },
        { name: '自定义', value: '1,3,4' }
      ],
      fileDataBytes: 0,
      historyBytes: 0,
      reviewBytes: 0,
      storageTotal: 0,
      storageUsed: 0,
      collapsedFileGroups: {},
      editVisible: false,
      editing: null,
      editName: '',
      editCycles: '',
      editTags: [],
      editFrequency: 'normal',
      allTags: [],
      today: '',
      // 复习模式状态
      reviewMode: false,
      reviewQueue: [], // 当前待复习队列
      reviewIndex: 0, // 当前复习项下标
      showAnswer: false, // 是否显示答案
      reviewFilter: 'due' // due=今日到期 weak=薄弱
    }
  },
  computed: {
    // 结构化搜索：支持 tag:xxx status:weak due:today error:high 和普通关键词
    filteredList() {
      const kw = this.keyword.trim()
      if (!kw) return this.allList
      // 解析结构化过滤
      const tagF = kw.match(/tag:(\S+)/g) || []
      const statusF = kw.match(/status:(\S+)/g) || []
      const dueF = /due:today/.test(kw)
      const errorF = /error:high/.test(kw) || /error:\d+/.test(kw)
      const errNum = (kw.match(/error:(\d+)/) || [])[1]
      // 纯关键词部分：去掉结构化片段
      const plain = kw
        .replace(/tag:\S+/g, ' ')
        .replace(/status:\S+/g, ' ')
        .replace(/due:today/g, ' ')
        .replace(/error:\S+/g, ' ')
        .trim()
        .toLowerCase()
      const today = todayStr()
      return this.allList.filter(n => {
        // 标签过滤
        if (tagF.length) {
          const tags = n.tags || []
          if (!tagF.every(t => tags.includes(t.replace(/^tag:/, '')))) return false
        }
        // 状态过滤
        if (statusF.length) {
          const st = statusF[0].replace(/^status:/, '')
          if (n.status !== st && n.mastery !== st) return false
        }
        // 今日到期
        if (dueF && (n.status === 'mastered' || !n.nextReview || n.nextReview > today)) {
          return false
        }
        // 错误次数
        if (errorF) {
          const min = errNum ? Number(errNum) : 1
          if ((n.errorCount || 0) < min) return false
        }
        // 关键词
        if (plain) {
          const hay = ((n.name || '') + ' ' + (n.path || '')).toLowerCase()
          if (!hay.includes(plain)) return false
        }
        return true
      })
    },
    // 文件（科目）分组统计，供筛选下拉
    fileGroups() {
      const map = new Map()
      this.allList.forEach(n => {
        const key = getReviewFileKey(n)
        if (!map.has(key)) {
          map.set(key, {
            key,
            fileId: n.fileId || '',
            fileName: n.fileName || '未归属',
            count: 0
          })
        }
        map.get(key).count++
      })
      return [...map.values()].sort((a, b) => b.count - a.count)
    },
    todayStrValue() {
      return todayStr()
    },
    dueGroups() {
      return this.withTreeGroups(this.dueList)
    },
    // 按文件分组后的节点列表（应用搜索 + 文件筛选 + 父子级层级）
    groupedList() {
      const base = this.filteredList.filter(
        n => !this.filterFile || getReviewFileKey(n) === this.filterFile
      )
      return this.withTreeGroups(base)
    },
    // 当前正在复习的项
    currentReview() {
      if (!this.reviewMode) return null
      return this.reviewQueue[this.reviewIndex] || null
    },
    // 薄弱节点（错误≥3 或长期未复习）
    weakListData() {
      return this.allList.filter(n => {
        if (n.status === 'mastered') return false
        if ((n.errorCount || 0) >= 3) return true
        if (n.nextReview) {
          const diff = new Date().getTime() - new Date(n.nextReview).getTime()
          if (diff > 14 * 86400000) return true
        }
        return false
      })
    },
    // 薄弱节点按文件和父子级分组
    weakGroups() {
      return this.withTreeGroups(this.weakListData)
    },
    // 当前项的所有卡片
    currentCards() {
      const cur = this.currentReview
      if (!cur) return []
      return cur.cards || []
    },
    cardTypeText() {
      return type => CARD_TYPE_MAP[type] || type || '问答'
    },
    ...mapState({
      isDark: state => state.localConfig.isDark
    }),
    isServerAvailable() {
      return isServerAvailable()
    }
  },
  created() {
    const savedLocalConfig = getLocalConfig()
    if (savedLocalConfig) {
      this.setLocalConfig({
        ...this.$store.state.localConfig,
        ...savedLocalConfig
      })
    }
    this.glowConfig = getReviewGlowConfig(this.$store.state.localConfig)
    this.today = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
    this.refresh()
    this.$bus.$on('review_data_change', this.refresh)
    this.$bus.$on('workspace_data_change', this.onWorkspaceChanged)
    this.$bus.$on('workspace_auto_save_error', this.onWorkspaceAutoSaveError)
  },
  beforeDestroy() {
    this.$bus.$off('review_data_change', this.refresh)
    this.$bus.$off('workspace_data_change', this.onWorkspaceChanged)
    this.$bus.$off('workspace_auto_save_error', this.onWorkspaceAutoSaveError)
  },
  methods: {
    ...mapMutations(['setLocalConfig']),
    onGlowConfigChange() {
      this.glowConfig = normalizeReviewGlowConfig(this.glowConfig)
      this.setLocalConfig({ reviewGlow: { ...this.glowConfig } })
      this.$bus.$emit('review_glow_config_change', this.glowConfig)
    },
    withTreeGroups(list) {
      const parentMaps = {}
      ;(list || []).forEach(item => {
        if (!item.fileId || parentMaps[item.fileId]) return
        parentMaps[item.fileId] = buildParentMap(readFileData(item.fileId))
      })
      return buildReviewGroups(list, parentMaps).map(group => ({
        ...group,
        collapsed: !!this.collapsedFileGroups[group.key]
      }))
    },
    // Vue2 模板只能调用 methods，不能直接访问 import 的函数
    cyclesToStr(cycles) {
      return cyclesToStr(cycles)
    },
    refresh() {
      this.dueList = todayList()
      this.allList = getNodeList()
      this.stats = getStats()
      this.defaultCyclesStr = cyclesToStr(getDefaultCycles())
      this.fileListForAdd = getFileList()
      this.allTags = getAllTags()
      this.calcStorageUsage()
    },
    // 统计本应用各部分的 localStorage 占用（UTF-16 每字符 2 字节）
    calcStorageUsage() {
      let fileBytes = 0
      let historyBytes = 0
      let reviewBytes = 0
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        const v = localStorage.getItem(k)
        const bytes = v ? v.length * 2 : 0
        if (k.startsWith('SIMPLE_MIND_MAP_FILE_')) {
          fileBytes += bytes
        } else if (k.startsWith('SIMPLE_MIND_MAP_HISTORY_')) {
          historyBytes += bytes
        } else if (k === 'MIND_MAP_REVIEW_DATA') {
          reviewBytes += bytes
        }
      }
      this.fileDataBytes = fileBytes
      this.historyBytes = historyBytes
      this.reviewBytes = reviewBytes
      // 浏览器总配额（异步）
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(({ usage, quota }) => {
          this.storageUsed = usage || 0
          this.storageTotal = quota || 0
        }).catch(() => {})
      }
    },
    fmtSize(bytes) {
      if (!bytes) return '0 KB'
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    },
    statusText(s) {
      return STATUS_MAP[s] || s
    },
    statusType(s) {
      return STATUS_TYPE[s] || 'info'
    },
    goEdit() {
      this.$router.push('/')
    },
    toggleFileGroup(key) {
      this.$set(this.collapsedFileGroups, key, !this.collapsedFileGroups[key])
    },
    onComplete(item) {
      completeReview(item.uid)
      this.$message.success('已完成')
      this.afterChange()
    },
    onPostpone(item) {
      postponeReview(item.uid)
      this.$message.success('已推迟一天')
      this.afterChange()
    },
    // ---------- 复习模式 ----------
    startReview(type) {
      this.reviewFilter = type || 'due'
      this.reviewQueue = (type === 'weak' ? this.weakListData : this.dueList).slice()
      this.reviewIndex = 0
      this.showAnswer = false
      this.reviewMode = true
    },
    exitReview() {
      this.reviewMode = false
      this.reviewQueue = []
      this.showAnswer = false
      this.afterChange()
    },
    toggleAnswer() {
      this.showAnswer = !this.showAnswer
    },
    // 三档评价
    rate(rating) {
      const cur = this.currentReview
      if (!cur) return
      rateReview(cur.uid, rating)
      this.showAnswer = false
      // 下一项
      this.reviewIndex += 1
      if (this.reviewIndex >= this.reviewQueue.length) {
        this.$message.success('本轮复习完成！')
        this.exitReview()
      } else {
        this.$bus.$emit('review_data_change')
      }
    },
    ratingText(r) {
      return {
        [RATING.FORGOT]: '忘记',
        [RATING.FUZZY]: '模糊',
        [RATING.REMEMBER]: '记得'
      }[r] || r
    },
    // 复习进度百分比
    reviewProgress() {
      if (!this.reviewQueue.length) return 0
      return Math.round((this.reviewIndex / this.reviewQueue.length) * 100)
    },
    onReset(item) {
      resetReview(item.uid)
      this.$message.success('已重置')
      this.afterChange()
    },
    onRemove(item) {
      this.$confirm(`确定移除「${item.name}」的复习吗？`, '移除复习', {
        confirmButtonText: '移除',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          removeReview(item.uid)
          this.$message.success('已移除')
          this.afterChange()
        })
        .catch(() => {})
    },
    onEdit(item) {
      this.editing = item
      this.editName = item.name
      this.editCycles = cyclesToStr(item.cycles)
      this.editTags = item.tags ? item.tags.slice() : []
      this.editFrequency = item.frequency || 'normal'
      this.editVisible = true
    },
    masteryText(m) {
      return { new: '未学习', learning: '学习中', basic: '基本掌握', weak: '容易遗忘', mastered: '熟练' }[m] || m || '未学习'
    },
    onCards(item) {
      this.$bus.$emit('open_card_manager', {
        uid: item.uid,
        name: item.name,
        path: item.path
      })
    },
    onSaveEdit() {
      if (!this.editName.trim()) {
        this.$message.warning('名称不能为空')
        return
      }
      const parsed = parseCycles(this.editCycles)
      if (!parsed.length) {
        this.$message.warning('周期格式不正确')
        return
      }
      updateReviewName(this.editing.uid, this.editName.trim())
      updateCycles(this.editing.uid, parsed)
      updateTags(this.editing.uid, this.editTags)
      updateFrequency(this.editing.uid, this.editFrequency)
      this.editVisible = false
      this.$message.success('已保存')
      this.afterChange()
    },
    onAddManual() {
      if (!this.addName.trim()) {
        this.$message.warning('请输入名称')
        return
      }
      const parsed = parseCycles(this.addCycles || this.defaultCyclesStr)
      if (!parsed.length) {
        this.$message.warning('周期格式不正确')
        return
      }
      const file = this.fileListForAdd.find(f => f.id === this.addFileId) || null
      addReview({
        name: this.addName.trim(),
        cycles: parsed,
        fileId: file ? file.id : '',
        fileName: file ? file.name : ''
      })
      this.addName = ''
      this.addCycles = ''
      this.$message.success('已加入复习')
      this.afterChange()
    },
    onSaveDefaultCycles() {
      const parsed = parseCycles(this.defaultCyclesStr)
      if (!parsed.length) {
        this.$message.warning('周期格式不正确')
        return
      }
      setDefaultCycles(parsed)
      this.$message.success('默认周期已保存')
    },
    async onSaveWorkspace() {
      try {
        await saveWorkspaceFile()
        this.$message.success(isWorkspaceAutoSaveEnabled() ? '工作区已保存，后续编辑将自动保存' : '工作区已下载')
      } catch (error) {
        if (String(error && error.name).toLowerCase() !== 'aborterror') {
          this.$message.error('工作区保存失败：' + (error.message || '浏览器不支持或没有写入权限'))
        }
      }
    },
    onOpenWorkspace() {
      if (typeof window.showOpenFilePicker === 'function') {
        this.openWorkspaceFromPicker()
      } else {
        this.$refs.workspaceInput.click()
      }
    },
    async openWorkspaceFromPicker() {
      try {
        const result = await openWorkspaceFile()
        if (result.cancelled) return
        if (!result.ok) {
          this.$message.error(result.message || '工作区打开失败')
          return
        }
        this.confirmAndApplyWorkspace(result)
      } catch (error) {
        if (String(error && error.name).toLowerCase() !== 'aborterror') {
          this.$message.error('工作区打开失败：' + (error.message || '文件读取失败'))
        }
      }
    },
    onWorkspaceInput(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = ''
      if (!file) return
      openWorkspaceFile(file).then(result => {
        if (!result.ok) {
          this.$message.error(result.message || '工作区打开失败')
          return
        }
        this.confirmAndApplyWorkspace(result)
      })
    },
    confirmAndApplyWorkspace(result) {
      this.$confirm('打开工作区会覆盖当前浏览器中的导图和复习数据，是否继续？', '确认导入', {
        confirmButtonText: '覆盖并打开',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const applied = await applyOpenedWorkspace(result)
        if (!applied.ok) {
          this.$message.error(applied.message || '工作区导入失败')
          return
        }
        this.$confirm('工作区已导入，页面将重新加载以应用全部数据。', '导入成功', {
          confirmButtonText: '重新加载',
          cancelButtonText: '稍后',
          type: 'success'
        }).then(() => window.location.reload()).catch(() => {})
      }).catch(() => {})
    },
    onWorkspaceChanged() {
      if (isWorkspaceAutoSaveEnabled()) scheduleWorkspaceAutoSave()
    },
    onWorkspaceAutoSaveError(message) {
      this.$message.warning(message)
    },
    onExport() {
      const json = exportReviewData()
      const blob = new Blob([json], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = '复习数据_' + new Date().toISOString().slice(0, 10) + '.json'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    onImportFile(e) {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const ok = importReviewData(reader.result)
        if (ok) {
          this.$message.success('导入成功')
          this.afterChange()
        } else {
          this.$message.error('导入失败：格式不正确')
        }
      }
      reader.readAsText(file, 'utf-8')
      e.target.value = ''
    },
    // 导出卡片 Markdown
    onExportCards() {
      const md = cardsToMarkdown()
      const blob = new Blob([md], { type: 'text/markdown' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = '复习卡片_' + new Date().toISOString().slice(0, 10) + '.md'
      a.click()
      URL.revokeObjectURL(a.href)
      if (!md.trim()) this.$message.info('当前没有复习卡片可导出')
    },
    // 导入卡片 Markdown
    onImportCardsFile(e) {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const count = markdownToCards(reader.result)
        if (count > 0) {
          this.$message.success(`导入成功，共 ${count} 张卡片`)
          this.afterChange()
        } else {
          this.$message.warning('未解析到卡片，请检查格式')
        }
      }
      reader.readAsText(file, 'utf-8')
      e.target.value = ''
    },
    afterChange() {
      this.refresh()
      this.$bus.$emit('review_data_change')
    }
  }
}
</script>

<style lang="less" scoped>
.reviewPage {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  font-family: PingFangSC-Regular, 'PingFang SC', 'Microsoft YaHei', sans-serif;

  &.dark {
    color: #fff;
  }

  .pageHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .left {
      h2 {
        margin: 0 0 4px;
      }

      .date {
        color: #909399;
        font-size: 13px;
      }
    }
  }

  .statsRow {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;

    .statCard {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

      &.dark {
        background: #363b3f;
      }

      .num {
        font-size: 24px;
        font-weight: 700;
        color: #409eff;
      }

      &.highlight .num {
        color: #f56c6c;
      }

      .label {
        margin-top: 6px;
        font-size: 12px;
        color: #909399;
      }
    }
  }

  .mainTabs {
    ::v-deep .el-tabs__nav-wrap::after {
      background-color: #e4e7ed;
    }
  }

  .overdueTag {
    color: #f56c6c;
    font-weight: 600;
  }

  .emptyTip {
    text-align: center;
    color: #909399;
    padding: 40px 0;
  }

  // 复习模式
  .reviewEntry {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    &.dark {
      background: #363b3f;
    }

    .entryStats {
      display: flex;
      gap: 20px;
      font-size: 13px;
      color: #606266;

      b {
        color: #409eff;
        font-size: 16px;
      }
    }
  }

  .reviewMode {
    .reviewHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;

      .progressWrap {
        flex: 1;
        margin-right: 16px;
        display: flex;
        align-items: center;
        gap: 10px;

        .progressText {
          font-size: 13px;
          color: #909399;
          white-space: nowrap;
        }
      }
    }

    .reviewCardWrap {
      background: #fff;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);

      &.dark {
        background: #363b3f;
      }

      .reviewNodeInfo {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 14px;

        .nodeName {
          font-size: 16px;
          font-weight: 700;
        }

        .nodePath {
          font-size: 12px;
          color: #909399;
        }

        .nodeMeta {
          font-size: 12px;
          color: #c0a062;
        }

        .nodeTags {
          display: flex;
          gap: 4px;
        }
      }

      .cardArea {
        min-height: 200px;
        border: 2px dashed #e4e7ed;
        border-radius: 8px;
        padding: 20px;
        cursor: pointer;
        margin-bottom: 16px;
        transition: border-color 0.2s;

        &:hover {
          border-color: #409eff;
        }

        .cardFront {
          .cardType {
            display: inline-block;
            font-size: 11px;
            color: #409eff;
            background: #ecf5ff;
            border-radius: 3px;
            padding: 2px 8px;
            margin-bottom: 10px;
          }

          .cardContent {
            .qaFront {
              font-size: 18px;
              font-weight: 600;
              line-height: 1.6;
            }

            .qaHint {
              margin-top: 10px;
              font-size: 13px;
              color: #909399;
              font-style: italic;
            }
          }

          .flipTip {
            margin-top: 20px;
            text-align: center;
            font-size: 12px;
            color: #c0c4cc;
          }
        }

        .cardBack {
          margin-top: 16px;
          border-top: 1px solid #f0f2f5;
          padding-top: 14px;

          .backLabel {
            font-size: 12px;
            color: #67c23a;
            font-weight: 600;
            margin-bottom: 8px;
          }

          .backContent {
            .qaBack {
              font-size: 16px;
              line-height: 1.7;
              color: #303133;
            }
          }
        }
      }

      .ratingBar {
        display: flex;
        justify-content: center;
        gap: 14px;

        .el-button {
          min-width: 110px;
          font-size: 15px;
        }
      }

      .ratingTip {
        margin-top: 10px;
        text-align: center;
        font-size: 12px;
        color: #909399;
      }
    }
  }

  .taskItem {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff;
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

    &.dark {
      background: #363b3f;
    }

    .taskInfo {
      min-width: 0;

      .taskName {
        font-weight: 600;
        font-size: 14px;
      }

      .taskMeta {
        margin-top: 4px;
        font-size: 12px;
        color: #909399;
        display: flex;
        gap: 8px;

        .fileTag {
          background: #ecf5ff;
          color: #409eff;
          padding: 0 6px;
          border-radius: 3px;
        }
      }
    }
  }

  .allToolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;

    .rightOps {
      display: flex;
      gap: 8px;
    }
  }

  .fileGroup {
    margin-bottom: 18px;
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    overflow: hidden;

    &.dark {
      background: #363b3f;
    }

    .groupHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f5f7fa;
      font-weight: 600;
      font-size: 14px;
      color: #409eff;
      cursor: pointer;
      user-select: none;

      .groupName {
        display: flex;
        align-items: center;

        .el-icon-arrow-right {
          margin-right: 6px;
          transition: transform 0.2s;

          &.expanded {
            transform: rotate(90deg);
          }
        }
      }

      .groupCount {
        font-weight: 400;
        font-size: 12px;
        color: #909399;
      }
    }

    .treeRow {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      border-bottom: 1px solid #f0f2f5;
      position: relative;

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: #f7f9fc;
      }

      &.dark {
        border-bottom-color: rgba(255, 255, 255, 0.08);

        &:hover {
          background: #40464b;
        }
      }

      .levelLine {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: #409eff;
        opacity: 0.25;
      }

      .rowMain {
        min-width: 0;
        flex: 1;
        margin-right: 8px;

        .rowName {
          display: flex;
          align-items: center;
          font-weight: 500;
          font-size: 13px;

          .treeGuide {
            color: #909399;
            font-size: 12px;
            margin-right: 4px;
          }

          .nameText {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 320px;
          }
        }

        .rowMeta {
          margin-top: 3px;
          font-size: 12px;
          color: #909399;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;

          .pathText {
            color: #b0b3b8;
          }
        }
      }

      .rowOps {
        white-space: nowrap;

        .danger {
          color: #f56c6c;
        }
      }
    }
  }

  .pathText {
    color: #909399;
    font-size: 12px;
  }

  .danger {
    color: #f56c6c;
  }

  .addPanel {
    padding: 20px 0;
  }

  .settingsPanel {
    .setGroup {
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

      &.dark {
        background: #363b3f;
      }

      .setLabel {
        font-weight: 600;
        margin-bottom: 10px;
      }

      .setRow {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .glowEnabledRow {
        justify-content: space-between;
        font-size: 13px;
      }

      .glowConfigGrid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px 24px;
        margin-top: 14px;

        .glowConfigItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-width: 0;
          font-size: 13px;

          &.sliderItem {
            display: grid;
            grid-template-columns: 76px minmax(120px, 1fr);
            gap: 12px;
          }
        }
      }

      .presetRow {
        margin-top: 10px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;

        .presetLabel {
          font-size: 12px;
          color: #909399;
        }
      }

      .storageInfo {
        .usageRow {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 13px;

          span:last-child {
            color: #606266;
            font-weight: 500;
          }
        }
      }

      .setTip {
        margin-top: 8px;
        font-size: 12px;
        color: #909399;
      }
    }
  }

  .editDialog {
    .freqTip {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
    }

    .editInfo {
      margin-top: 12px;
      border-top: 1px solid #f0f2f5;
      padding-top: 10px;

      .row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 13px;

        .label {
          color: #909399;
        }
      }
    }
  }
}
</style>
