<template>
  <div class="reviewPage" :class="{ dark: isDark }">
    <header class="pageHeader">
      <div class="left">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2>复习中心</h2>
          <el-tag size="mini" type="info">v1.1.0</el-tag>
        </div>
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
        <!-- 复习模式：完整卡片拷问流程（提问 -> 回忆 -> 揭示答案 -> 四级评价 -> 结束统计） -->
        <div v-if="reviewMode && currentReview" class="reviewMode" :class="{ dark: isDark }">
          <div class="reviewHeader">
            <div class="progressWrap">
              <el-progress :percentage="reviewProgress()" :stroke-width="8" :show-text="false"></el-progress>
              <span class="progressText">第 {{ reviewIndex + 1 }} 项 / 共 {{ reviewQueue.length }} 项</span>
            </div>
            <div class="headerOps">
              <el-button size="mini" type="info" plain @click="openShortcutDialog">快捷键 (Alt + ?)</el-button>
              <el-button size="small" @click="exitReview">退出复习 (Esc)</el-button>
            </div>
          </div>

          <div class="reviewCardWrap">
            <div class="reviewNodeInfo">
              <span class="nodeName">{{ currentReview.name }}</span>
              <span class="nodePath" v-if="currentReview.path">{{ currentReview.path }}</span>
              <span class="nodeMeta">
                已复习 {{ currentReview.times }} 次 · 错误 {{ currentReview.errorCount || 0 }} 次
              </span>
              <span class="nodeTags" v-if="currentReview.tags && currentReview.tags.length">
                <el-tag size="mini" v-for="t in currentReview.tags" :key="t" type="info">{{ t }}</el-tag>
              </span>
              <!-- 多卡片切换提示与按钮 -->
              <div class="cardIndexBar" v-if="currentCards.length > 1">
                <span class="cardCountText">卡片 {{ currentCardIndex + 1 }} / {{ currentCards.length }}</span>
                <el-button-group>
                  <el-button size="mini" icon="el-icon-arrow-left" :disabled="currentCardIndex <= 0" @click="prevCard">上一张</el-button>
                  <el-button size="mini" :disabled="currentCardIndex >= currentCards.length - 1" @click="nextCard">下一张<i class="el-icon-arrow-right el-icon--right"></i></el-button>
                </el-button-group>
              </div>
            </div>

            <!-- 卡片交互区域 -->
            <div class="cardArea" :class="{ 'is-revealed': showAnswer }" @click="toggleAnswer">
              <div class="cardFront">
                <div class="cardTopBar">
                  <span class="cardType">{{ cardTypeText(activeCard ? activeCard.type : 'qa') }}</span>
                  <span class="stageBadge">{{ showAnswer ? '【答案面】' : '【正面 · 思考中】' }}</span>
                </div>

                <div class="cardContent" v-if="activeCard">
                  <div class="qaFront">{{ activeCard.front }}</div>
                  <div class="qaHint" v-if="activeCard.hint">💡 提示：{{ activeCard.hint }}</div>
                </div>
                <div class="cardContent" v-else>
                  <div class="qaFront">回忆：{{ currentReview.name }}</div>
                  <div class="qaHint">（该节点暂未添加卡片，请根据知识点名称回忆全部内容）</div>
                </div>

                <div class="flipTip">
                  <span v-if="!showAnswer">👉 点击或按 [Space / Enter] 显示答案</span>
                  <span v-else>👈 点击或按 [Space] 收起答案</span>
                </div>
              </div>

              <!-- 答案揭示面 -->
              <transition name="el-zoom-in-top">
                <div class="cardBack" v-if="showAnswer">
                  <div class="backLabel">✅ 参考答案</div>
                  <div class="backContent" v-if="activeCard">
                    <div class="qaBack">{{ activeCard.back }}</div>
                  </div>
                  <div class="backContent" v-else>
                    <div class="qaBack">（该节点暂无独立卡片，建议在下方或导图中添加复习卡片）</div>
                  </div>
                </div>
              </transition>
            </div>

            <!-- 阶段控制：未揭示答案前明确提示先回忆；揭示答案后显示四级评价 -->
            <div class="actionPanel">
              <div v-if="!showAnswer" class="unrevealedBar">
                <el-button type="primary" size="medium" icon="el-icon-view" @click="toggleAnswer">
                  显示答案 (Space)
                </el-button>
                <div class="actionTip">请先在脑海中回忆答案，揭示答案后即可进行复习效果评价</div>
              </div>

              <div v-else class="revealedBar">
                <div class="ratingBar">
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
                <div class="ratingTip">
                  忘记=今天重练 · 模糊=减半复现 · 记得=推进一步 · 熟练=直接掌握
                </div>
              </div>
            </div>

            <!-- 快捷键操作提示栏 -->
            <div class="shortcutHelpBar">
              <span class="helpItem"><b>Space</b>: {{ showAnswer ? '收起答案' : '显示答案' }}</span>
              <span class="helpItem" v-if="currentCards.length > 1"><b>← / →</b>: 切换卡片</span>
              <span class="helpItem" v-if="showAnswer"><b>1-4</b>: 快速评价</span>
              <span class="helpItem"><b>Esc</b>: 退出复习</span>
            </div>
          </div>
        </div>

        <!-- 复习完成总结界面 -->
        <div v-else-if="reviewFinished" class="reviewFinishedWrap" :class="{ dark: isDark }">
          <div class="finishedCard">
            <div class="finishIcon">🎉</div>
            <h3 class="finishTitle">本轮复习圆满完成！</h3>
            <p class="finishDesc">温故而知新，知识记忆已根据艾宾浩斯曲线自动排期。</p>

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
              <el-button type="primary" @click="closeFinishSummary">返回复习中心</el-button>
              <el-button @click="goEdit">返回思维导图</el-button>
            </div>
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
              <el-button type="primary" :disabled="dueList.length === 0" icon="el-icon-video-play" @click="startReview('due')">
                开始复习（今日 {{ dueList.length }}）
              </el-button>
              <el-button type="warning" :disabled="weakListData.length === 0" icon="el-icon-aim" @click="startReview('weak')">
                复习薄弱项 ({{ weakListData.length }})
              </el-button>
            </div>
          </div>

          <div v-if="dueList.length === 0" class="emptyTip">
            <div style="font-size: 28px; margin-bottom: 8px;">☕️</div>
            今日没有待复习项，可以休息一下或复习薄弱节点
          </div>
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
                  <span class="cardsCount" v-if="item.cards && item.cards.length">
                    <el-tag size="mini" type="info">{{ item.cards.length }} 张卡片</el-tag>
                  </span>
                </div>
              </div>
              <div class="taskOps">
                <el-button size="mini" type="primary" plain @click="startSingleReview(item)">拷问复习</el-button>
                <el-button size="mini" @click="onCards(item)">卡片</el-button>
                <el-button size="mini" @click="onPostpone(item)">推迟 1 天</el-button>
                <el-button size="mini" type="success" plain @click="onComplete(item)">完成</el-button>
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
            style="width: 220px;"
          ></el-input>
          <div class="rightOps">
            <el-button size="small" type="primary" @click="activeTab = 'add'">+ 添加复习</el-button>
          </div>
        </div>

        <!-- 筛选 / 排序行 -->
        <div class="filterRow">
          <el-select
            v-model="fStatus"
            placeholder="状态"
            size="small"
            clearable
            class="frSelect"
          >
            <el-option
              v-for="o in STATUS_OPTIONS"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            ></el-option>
          </el-select>
          <el-select
            v-model="fDue"
            placeholder="到期"
            size="small"
            clearable
            class="frSelect"
          >
            <el-option
              v-for="o in DUE_OPTIONS"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            ></el-option>
          </el-select>
          <el-select
            v-model="filterFile"
            placeholder="全部文件"
            size="small"
            clearable
            class="frSelect"
          >
            <el-option
              v-for="f in fileGroups"
              :key="f.key"
              :label="f.fileName + '（' + f.count + '）'"
              :value="f.key"
            ></el-option>
          </el-select>
          <el-select
            v-model="fTag"
            placeholder="标签"
            size="small"
            clearable
            class="frSelect"
          >
            <el-option
              v-for="t in allTags"
              :key="t"
              :label="t"
              :value="t"
            ></el-option>
          </el-select>
          <el-select
            v-model="sortMode"
            placeholder="排序"
            size="small"
            class="frSelect"
          >
            <el-option
              v-for="o in SORT_OPTIONS"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            ></el-option>
          </el-select>
          <el-button
            v-if="filterActive"
            size="small"
            type="text"
            class="frClear"
            @click="clearReviewFilters"
          >清除筛选</el-button>
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
                <el-button size="mini" type="primary" plain @click="startSingleReview(item)">拷问</el-button>
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
          暂无复习节点{{ filterActive ? '（当前筛选）' : '' }}
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
                <el-button size="mini" type="warning" plain @click="startSingleReview(item)">拷问</el-button>
                <el-button size="mini" type="text" @click="onCards(item)">卡片</el-button>
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
                <span class="presetLabel">预设：</span>
                <el-button
                  size="mini"
                  v-for="p in presetList"
                  :key="p.id"
                  :type="p.id === activePresetId ? 'primary' : ''"
                  @click="addCycles = cyclesToStr(p.cycles)"
                >{{ p.name }}（{{ cyclesToStr(p.cycles) }}）</el-button>
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
              <span class="presetLabel">设为预设：</span>
              <el-button
                size="mini"
                v-for="p in presetList"
                :key="p.id"
                :type="p.id === activePresetId ? 'primary' : ''"
                @click="onApplyPreset(p)"
              >{{ p.name }}（{{ cyclesToStr(p.cycles) }}）</el-button>
            </div>
            <div class="presetManageRow">
              <span class="presetLabel">管理：</span>
              <el-button size="mini" type="success" plain @click="openPresetDialog()">＋ 新建预设</el-button>
              <el-button size="mini" v-if="activePresetId" plain @click="onClearActivePreset">取消使用预设</el-button>
            </div>
            <div class="presetListManage" v-if="presetList.length">
              <div class="presetItem" v-for="p in presetList" :key="p.id" :class="{ active: p.id === activePresetId }">
                <span class="presetName">{{ p.name }}</span>
                <span class="presetCycles">{{ cyclesToStr(p.cycles) }}</span>
                <span class="presetTag" v-if="p.id === activePresetId">使用中</span>
                <div class="presetOps">
                  <el-button size="mini" type="text" @click="openPresetDialog(p)">编辑</el-button>
                  <el-button size="mini" type="text" class="danger" @click="onDeletePreset(p)">删除</el-button>
                </div>
              </div>
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
              <div class="setTip" v-if="isDirectoryMode">
                当前使用本地工作目录（{{ directoryName || '本地文件夹' }}），复习节点已与对应思维导图一同保存在 <code>maps/&lt;导图名&gt;/review.json</code> 中。
              </div>
              <div class="setTip" v-else-if="!isServerAvailable">
                浏览器存储空间不足（约 5-10MB）会影响保存。导图多时可清理历史版本释放空间，或切换至本地工作目录模式。
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
            <div class="setLabel">复习功能快捷键</div>
            <div class="setRow glowEnabledRow">
              <div>
                <span>启用复习全局快捷键</span>
                <div class="setTip" style="margin-top: 4px;">开启后可在拷问页面、导图中使用键盘快速操作复习流程</div>
              </div>
              <el-switch v-model="shortcutConfig.enabled" @change="onToggleShortcutEnabled"></el-switch>
            </div>
            <div class="setRow" style="margin-top: 10px;">
              <el-button size="small" type="primary" plain @click="openShortcutDialog">管理快捷键绑定</el-button>
              <el-button size="small" @click="onResetShortcuts">恢复默认按键</el-button>
            </div>
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

    <!-- 快捷键配置对话框 -->
    <el-dialog
      title="复习快捷键设置"
      :visible.sync="shortcutDialogVisible"
      width="680px"
      append-to-body
    >
      <div class="shortcutConfigBox">
        <div class="scTopBar">
          <div class="scStatus">
            <span>全局快捷键总开关：</span>
            <el-switch v-model="shortcutConfig.enabled" @change="onToggleShortcutEnabled"></el-switch>
            <span class="scStatusText">{{ shortcutConfig.enabled ? '已开启' : '已关闭（所有快捷键不触发）' }}</span>
          </div>
          <el-button size="mini" type="text" @click="onResetShortcuts">恢复全部默认值</el-button>
        </div>
        <div class="scTip">
          💡 点击按键按钮后按下键盘组合键（如 Space、1、Alt + R），松开即可录制保存；按 Esc 取消录制。
        </div>

        <div class="scTable">
          <div class="scHeader">
            <span class="colAction">功能操作</span>
            <span class="colScope">生效范围</span>
            <span class="colBinding">当前绑定快捷键</span>
            <span class="colOps">操作</span>
          </div>
          <div
            class="scRow"
            v-for="item in shortcutActionDefs"
            :key="item.key"
          >
            <div class="colAction">
              <span class="actionIcon">{{ item.icon }}</span>
              <div class="actionInfo">
                <div class="actionName">{{ item.name }}</div>
                <div class="actionDesc">{{ item.desc }}</div>
              </div>
            </div>
            <div class="colScope">
              <el-tag size="mini" :type="item.scope === 'quiz' ? 'warning' : item.scope === 'map' ? 'success' : 'info'">
                {{ item.scope === 'quiz' ? '拷问页面' : item.scope === 'map' ? '思维导图' : '全局可用' }}
              </el-tag>
            </div>
            <div class="colBinding">
              <el-button
                size="mini"
                :type="recordingKey === item.key ? 'danger' : 'primary'"
                plain
                class="scRecordBtn"
                @keydown.native.prevent="onRecordKey($event, item.key)"
                @blur="onBlurRecord(item.key)"
                @click="startRecord(item.key)"
              >
                {{ recordingKey === item.key ? (tempRecorded || '按下按键...') : (shortcutConfig.shortcuts[item.key] || '未设置') }}
              </el-button>
            </div>
            <div class="colOps">
              <el-button
                size="mini"
                type="text"
                @click="onResetSingleShortcut(item.key)"
                :disabled="shortcutConfig.shortcuts[item.key] === item.defaultKey"
              >
                恢复默认
              </el-button>
            </div>
          </div>
        </div>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button size="small" type="primary" @click="shortcutDialogVisible = false">完成</el-button>
      </div>
    </el-dialog>

    <!-- 卡片管理对话框 (复用 Edit 组件) -->
    <CardManagerDialog></CardManagerDialog>

    <!-- 编辑周期/名称/标签 对话框 -->
    <el-dialog title="复习设置" :visible.sync="editVisible" width="420px" append-to-body>
      <div v-if="editing" class="editDialog">
        <el-form label-width="80px" size="small">
          <el-form-item label="名称">
            <el-input v-model="editName"></el-input>
          </el-form-item>
          <el-form-item label="周期">
            <el-input v-model="editCycles" placeholder="如 1,3,4"></el-input>
            <div class="presetRow">
              <span class="presetLabel">预设：</span>
              <el-button
                size="mini"
                v-for="p in presetList"
                :key="p.id"
                :type="p.id === activePresetId ? 'primary' : ''"
                @click="editCycles = cyclesToStr(p.cycles)"
              >{{ p.name }}（{{ cyclesToStr(p.cycles) }}）</el-button>
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

    <!-- 周期预设 新建/编辑 -->
    <el-dialog
      :title="presetEditId ? '编辑预设' : '新建预设'"
      :visible.sync="presetDialogVisible"
      width="420px"
      append-to-body
    >
      <el-form label-width="80px" size="small">
        <el-form-item label="名称">
          <el-input v-model="presetEditName" placeholder="如：期末冲刺"></el-input>
        </el-form-item>
        <el-form-item label="周期">
          <el-input v-model="presetEditCycles" placeholder="如：1,3,7,15"></el-input>
          <div class="tip">间隔天数序列，用逗号/横线分隔，如 1,3,7,15。</div>
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button size="small" @click="presetDialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" @click="onSavePreset">保存</el-button>
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
  getPresets,
  getActivePreset,
  addPreset,
  updatePreset,
  deletePreset,
  setActivePreset,
  clearActivePreset,
  exportReviewData,
  importReviewData,
  rateReview,
  RATING,
  getAllTags,
  todayStr,
  updateTags,
  updateFrequency,
  cardsToMarkdown,
  markdownToCards,
  syncReviewFromDirectory,
  flushReviewWrites,
  subscribeReviewSync
} from '@/review'
import CardManagerDialog from '@/pages/Edit/components/CardManagerDialog.vue'
import {
  REVIEW_ACTION_DEFS,
  getReviewShortcutConfig,
  saveReviewShortcutConfig,
  resetReviewShortcuts,
  setReviewShortcutsEnabled,
  formatKeyEventToShortcut,
  checkShortcutConflict,
  reviewShortcutDispatcher
} from '@/review/reviewShortcuts'
import { getFileList, getLocalConfig, readFileData, resumeDirectoryMode } from '@/api'
import * as directoryStorage from '@/api/directoryStorage'
import { buildParentMap, buildReviewGroups, getReviewFileKey, toDirectorySubjectList } from '@/review/tree'
import {
  STATUS_OPTIONS,
  DUE_OPTIONS,
  SORT_OPTIONS,
  applyReviewList
} from '@/review/listTools'
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
  components: {
    CardManagerDialog
  },
  data() {
    return {
      activeTab: 'today',
      keyword: '',
      filterFile: '',
      // 附加筛选 / 排序（「全部节点」列表用，会话态）
      fStatus: '',
      fDue: '',
      fTag: '',
      sortMode: 'urgency',
      dueList: [],
      allList: [],
      stats: { total: 0, learning: 0, mastered: 0, todayDone: 0, todayDue: 0 },
      addName: '',
      addCycles: '',
      addFileId: '',
      fileListForAdd: [],
      defaultCyclesStr: '',
      glowConfig: getReviewGlowConfig(),
      // 周期预设（统一来源于 review 数据层，可增删改）
      presetList: [],
      activePresetId: '',
      // 预设管理弹窗
      presetDialogVisible: false,
      presetEditId: '', // 空=新建
      presetEditName: '',
      presetEditCycles: '',
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
      currentCardIndex: 0, // 当前卡片下标
      showAnswer: false, // 是否显示答案
      reviewFilter: 'due', // due=今日到期 weak=薄弱 single=单个节点
      isSubmittingRate: false, // 防连点锁
      // 完成统计
      reviewFinished: false,
      finishSummary: {
        total: 0,
        remember: 0,
        fuzzy: 0,
        forgot: 0
      },
      // 快捷键设置弹窗与状态
      shortcutDialogVisible: false,
      shortcutConfig: getReviewShortcutConfig(),
      shortcutActionDefs: REVIEW_ACTION_DEFS,
      recordingKey: null,
      tempRecorded: ''
    }
  },
  computed: {
    // 导入的选项常量包装给模板（Vue2 模板不能直接访问 import 值）
    STATUS_OPTIONS() {
      return STATUS_OPTIONS
    },
    DUE_OPTIONS() {
      return DUE_OPTIONS
    },
    SORT_OPTIONS() {
      return SORT_OPTIONS
    },
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
    // 附加筛选 / 排序是否生效（含文件筛选与默认排序判断）
    filterActive() {
      return !!(
        this.fStatus ||
        this.fDue ||
        this.fTag ||
        this.filterFile ||
        this.sortMode !== 'urgency'
      )
    },
    // 已应用搜索 + 附加筛选 + 排序的列表
    appliedList() {
      return applyReviewList(this.filteredList, {
        status: this.fStatus,
        due: this.fDue,
        file: this.filterFile || '',
        tag: this.fTag,
        sort: this.sortMode
      })
    },
    // 按文件分组后的节点列表（应用搜索 + 筛选 + 排序 + 父子级层级）
    groupedList() {
      return this.withTreeGroups(this.appliedList)
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
    // 当前正在展示的卡片
    activeCard() {
      const cards = this.currentCards
      if (!cards.length) return null
      const idx = Math.max(0, Math.min(this.currentCardIndex, cards.length - 1))
      return cards[idx] || null
    },
    cardTypeText() {
      return type => CARD_TYPE_MAP[type] || type || '问答'
    },
    ...mapState({
      isDark: state => state.localConfig.isDark,
      isDirectoryMode: state => state.isDirectoryMode,
      directoryName: state => state.directoryName
    }),
    isServerAvailable() {
      return isServerAvailable()
    }
  },
  created() {
    // 支持从导图页“管理预设”带 tab 跳转：?tab=settings
    const qTab = this.$route && this.$route.query && this.$route.query.tab
    if (['today', 'all', 'weak', 'add', 'settings'].includes(qTab)) {
      this.activeTab = qTab
    }
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
    this.restoreDirectoryForReview()
    this.$bus.$on('review_data_change', this.refresh)
    this.$bus.$on('review_changed', this.refresh)
    this.$bus.$on('workspace_data_change', this.onWorkspaceChanged)
    this.$bus.$on('workspace_auto_save_error', this.onWorkspaceAutoSaveError)
    this._unsubscribeReviewSync = subscribeReviewSync(() => {
      if (this.isDirectoryMode) {
        syncReviewFromDirectory().then(() => this.refresh())
      } else {
        this.refresh()
      }
    })
    window.addEventListener('pagehide', this.onFlushBeforeLeave)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.initReviewShortcuts()
    reviewShortcutDispatcher.setScope('review_page')
  },
  beforeDestroy() {
    this.$bus.$off('review_data_change', this.refresh)
    this.$bus.$off('review_changed', this.refresh)
    this.$bus.$off('workspace_data_change', this.onWorkspaceChanged)
    this.$bus.$off('workspace_auto_save_error', this.onWorkspaceAutoSaveError)
    if (this._unsubscribeReviewSync) {
      this._unsubscribeReviewSync()
      this._unsubscribeReviewSync = null
    }
    window.removeEventListener('pagehide', this.onFlushBeforeLeave)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.unwatchDirectoryReauth()
    if (this._windowKeydownHandler) {
      window.removeEventListener('keydown', this._windowKeydownHandler)
      this._windowKeydownHandler = null
    }
    reviewShortcutDispatcher.setScope('none')
  },
  methods: {
    ...mapMutations(['setLocalConfig']),
    onFlushBeforeLeave() {
      if (this.isDirectoryMode) {
        flushReviewWrites()
      }
    },
    onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        this.onFlushBeforeLeave()
      } else if (document.visibilityState === 'visible' && this.isDirectoryMode) {
        syncReviewFromDirectory().then(() => this.refresh())
      }
    },
    async restoreDirectoryForReview() {
      try {
        if (this.isDirectoryMode && directoryStorage.getDirectoryHandleValue()) {
          await syncReviewFromDirectory()
          this.refresh()
          return
        }
        const res = await resumeDirectoryMode(false)
        if (!res) return
        if (res.ok) {
          this.$store.commit('setIsDirectoryMode', true)
          this.$store.commit('setDirectoryName', res.name || '')
          if (res.fileName) {
            this.$store.commit('setCurrentSmmFile', res.fileName)
          }
          this.refresh()
          return
        }
        if (res.needReauth || res.reason === 'reauth-error') {
          this.watchForDirectoryReauth()
        }
      } catch (e) {
        // 忽略
      }
    },
    watchForDirectoryReauth() {
      if (this._dirReauthBound) return
      this._dirReauthBound = true
      const attempt = async () => {
        this.unwatchDirectoryReauth()
        try {
          const res = await resumeDirectoryMode(true)
          if (res && res.ok) {
            this.$store.commit('setIsDirectoryMode', true)
            this.$store.commit('setDirectoryName', res.name || '')
            if (res.fileName) {
              this.$store.commit('setCurrentSmmFile', res.fileName)
            }
            this.refresh()
          }
        } catch (err) {
          // 忽略
        }
      }
      this._dirReauthHandler = attempt
      window.addEventListener('pointerdown', attempt, { capture: true, once: true })
      window.addEventListener('keydown', attempt, { capture: true, once: true })
    },
    unwatchDirectoryReauth() {
      if (!this._dirReauthBound) return
      this._dirReauthBound = false
      if (this._dirReauthHandler) {
        window.removeEventListener('pointerdown', this._dirReauthHandler, { capture: true })
        window.removeEventListener('keydown', this._dirReauthHandler, { capture: true })
        this._dirReauthHandler = null
      }
    },
    clearReviewFilters() {
      this.fStatus = ''
      this.fDue = ''
      this.fTag = ''
      this.filterFile = ''
      this.sortMode = 'urgency'
    },
    onGlowConfigChange() {
      this.glowConfig = normalizeReviewGlowConfig(this.glowConfig)
      this.setLocalConfig({ reviewGlow: { ...this.glowConfig } })
      this.$bus.$emit('review_glow_config_change', this.glowConfig)
    },
    withTreeGroups(list) {
      const parentMaps = {}
      ;(list || []).forEach(item => {
        if (!item.fileId || parentMaps[item.fileId]) return
        if (this.isDirectoryMode) {
          // 目录模式：正文在工作目录文件中；记录已自带 parentUid/path，
          // 分组仅需这些字段即可，无需读取整张导图文件。
          return
        }
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
    async refresh() {
      // 目录模式下把复习记录归一为现役科目导图的 fileId（<科目>.smm），
      // 让历史 fileId（浏览器旧代次）归并到同一科目组、并可被定位命中现役导图。
      // 仅做展示层派生，不写回存储。
      const rawDue = todayList()
      const rawAll = getNodeList()
      this.dueList = toDirectorySubjectList(rawDue, this.isDirectoryMode)
      this.allList = toDirectorySubjectList(rawAll, this.isDirectoryMode)
      this.stats = getStats()
      this.defaultCyclesStr = cyclesToStr(getDefaultCycles())
      this.allTags = getAllTags()
      this.presetList = getPresets()
      const active = getActivePreset()
      this.activePresetId = active ? active.id : ''
      // “添加复习”的可选文件：目录模式下列出工作目录中的导图
      if (this.isDirectoryMode) {
        try {
          const files = await directoryStorage.listMapFiles()
          this.fileListForAdd = (files || []).map(name => ({
            id: name,
            name: name.replace(/\.smm$/i, '')
          }))
        } catch (e) {
          this.fileListForAdd = []
        }
      } else {
        this.fileListForAdd = getFileList()
      }
      this.calcStorageUsage()
    },
    // 统计本应用各部分的存储占用（UTF-16 每字符 2 字节）
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
      if (this.isDirectoryMode) {
        try {
          const exported = exportReviewData()
          reviewBytes = exported ? exported.length * 2 : 0
        } catch (e) {
          // 忽略
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
    // ---------- 复习拷问模式 ----------
    // 启动多节点复习（今日或薄弱）
    startReview(type) {
      this.reviewFilter = type || 'due'
      const queue = (type === 'weak' ? this.weakListData : this.dueList).slice()
      if (!queue.length) {
        this.$message.info(type === 'weak' ? '当前没有薄弱节点需要复习' : '今日没有待复习项目')
        return
      }
      this.reviewQueue = queue
      this.reviewIndex = 0
      this.currentCardIndex = 0
      this.showAnswer = false
      this.reviewMode = true
      this.reviewFinished = false
      this.finishSummary = {
        total: 0,
        remember: 0,
        fuzzy: 0,
        forgot: 0
      }
      reviewShortcutDispatcher.setScope('quiz')
    },

    // 启动单个节点的拷问复习（从列表卡片/行直接进入）
    startSingleReview(item) {
      if (!item) return
      this.reviewFilter = 'single'
      this.reviewQueue = [item]
      this.reviewIndex = 0
      this.currentCardIndex = 0
      this.showAnswer = false
      this.reviewMode = true
      this.reviewFinished = false
      this.finishSummary = {
        total: 0,
        remember: 0,
        fuzzy: 0,
        forgot: 0
      }
      reviewShortcutDispatcher.setScope('quiz')
    },

    // 退出复习
    exitReview() {
      this.reviewMode = false
      this.reviewQueue = []
      this.reviewIndex = 0
      this.currentCardIndex = 0
      this.showAnswer = false
      reviewShortcutDispatcher.setScope('review_page')
      this.afterChange()
    },

    // 切换/显示/隐藏答案
    toggleAnswer() {
      this.showAnswer = !this.showAnswer
    },

    // 多卡片切换：上一张
    prevCard() {
      if (this.currentCardIndex > 0) {
        this.currentCardIndex -= 1
        this.showAnswer = false
      }
    },

    // 多卡片切换：下一张
    nextCard() {
      if (this.currentCardIndex < this.currentCards.length - 1) {
        this.currentCardIndex += 1
        this.showAnswer = false
      }
    },

    // 四级评价提交 (忘记、模糊、记得、熟练)
    rate(rating) {
      if (this.isSubmittingRate) return
      if (!this.showAnswer) {
        this.$message.warning('请先显示答案，回忆核对后再提交评价')
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

        // 下一项
        this.reviewIndex += 1
        if (this.reviewIndex >= this.reviewQueue.length) {
          // 本轮完成
          this.reviewMode = false
          this.reviewFinished = true
          this.reviewQueue = []
          reviewShortcutDispatcher.setScope('review_page')
          this.afterChange()
        } else {
          this.afterChange()
        }
      } finally {
        setTimeout(() => {
          this.isSubmittingRate = false
        }, 150)
      }
    },

    closeFinishSummary() {
      this.reviewFinished = false
      this.afterChange()
    },

    // 复习进度百分比
    reviewProgress() {
      if (!this.reviewQueue.length) return 0
      return Math.round((this.reviewIndex / this.reviewQueue.length) * 100)
    },

    // ---------- 快捷键系统设置与调度 ----------
    initReviewShortcuts() {
      // 注册拷问页面的快捷键动作
      reviewShortcutDispatcher.register('quiz', 'showAnswer', () => {
        if (this.reviewMode && this.currentReview) {
          this.toggleAnswer()
        }
      })
      reviewShortcutDispatcher.register('quiz', 'prevCard', () => {
        if (this.reviewMode && this.currentReview) {
          this.prevCard()
        }
      })
      reviewShortcutDispatcher.register('quiz', 'nextCard', () => {
        if (this.reviewMode && this.currentReview) {
          this.nextCard()
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateForgot', () => {
        if (this.reviewMode && this.currentReview && this.showAnswer) {
          this.rate(RATING.FORGOT)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateFuzzy', () => {
        if (this.reviewMode && this.currentReview && this.showAnswer) {
          this.rate(RATING.FUZZY)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateRemember', () => {
        if (this.reviewMode && this.currentReview && this.showAnswer) {
          this.rate(RATING.REMEMBER)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'rateMastered', () => {
        if (this.reviewMode && this.currentReview && this.showAnswer) {
          this.rate(RATING.MASTERED)
        }
      })
      reviewShortcutDispatcher.register('quiz', 'exitQuiz', () => {
        if (this.reviewMode) {
          this.exitReview()
        }
      })

      // 全局动作：进入今日复习
      reviewShortcutDispatcher.register('global', 'openQuiz', () => {
        if (!this.reviewMode && this.dueList.length > 0) {
          this.startReview('due')
          this.$message.success('已通过快捷键启动今日复习拷问')
        }
      })

      // 绑定 Alt + ? 打开快捷键配置
      this._windowKeydownHandler = e => {
        if (e.altKey && (e.key === '?' || e.key === '/' || e.keyCode === 191)) {
          e.preventDefault()
          this.openShortcutDialog()
        }
      }
      window.addEventListener('keydown', this._windowKeydownHandler)
    },

    openShortcutDialog() {
      this.shortcutConfig = getReviewShortcutConfig()
      this.recordingKey = null
      this.tempRecorded = ''
      this.shortcutDialogVisible = true
    },

    onToggleShortcutEnabled(val) {
      this.shortcutConfig = setReviewShortcutsEnabled(val)
      this.$bus.$emit('review_shortcuts_changed', this.shortcutConfig.shortcuts)
      this.$message.success(val ? '复习快捷键已全局开启' : '复习快捷键已全局关闭')
    },

    startRecord(key) {
      this.recordingKey = key
      this.tempRecorded = ''
      reviewShortcutDispatcher.setRecording(true)
    },

    onBlurRecord(key) {
      if (this.recordingKey === key) {
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
      }
    },

    onRecordKey(e, key) {
      // Esc 取消录制
      if (e.keyCode === 27) {
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
        return
      }
      const formatted = formatKeyEventToShortcut(e)
      this.tempRecorded = formatted

      // 如果按下了实际按键（非单纯修饰键）
      if (![16, 17, 18, 91, 93, 224].includes(e.keyCode)) {
        if (formatted) {
          // 冲突检测
          const conflict = checkShortcutConflict(key, formatted, this.shortcutConfig.shortcuts)
          if (conflict.hasConflict) {
            if (conflict.type === 'browser') {
              this.$message.warning(conflict.message)
            } else {
              this.$message.error(conflict.message)
              this.recordingKey = null
              this.tempRecorded = ''
              reviewShortcutDispatcher.setRecording(false)
              return
            }
          }

          const nextShortcuts = {
            ...this.shortcutConfig.shortcuts,
            [key]: formatted
          }
          this.shortcutConfig = saveReviewShortcutConfig({
            enabled: this.shortcutConfig.enabled,
            shortcuts: nextShortcuts
          })
          this.$bus.$emit('review_shortcuts_changed', this.shortcutConfig.shortcuts)
          this.$message.success(`已设置「${formatted}」`)
        }
        this.recordingKey = null
        this.tempRecorded = ''
        reviewShortcutDispatcher.setRecording(false)
      }
    },

    onResetShortcuts() {
      this.$confirm('确定将所有复习快捷键恢复为默认键位吗？', '恢复默认快捷键', {
        confirmButtonText: '恢复',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        const defaults = resetReviewShortcuts()
        this.shortcutConfig = getReviewShortcutConfig()
        this.$bus.$emit('review_shortcuts_changed', defaults)
        this.$message.success('已恢复全部默认复习快捷键')
      }).catch(() => {})
    },

    onResetSingleShortcut(key) {
      const def = REVIEW_ACTION_DEFS.find(d => d.key === key)
      if (!def) return
      const nextShortcuts = {
        ...this.shortcutConfig.shortcuts,
        [key]: def.defaultKey
      }
      this.shortcutConfig = saveReviewShortcutConfig({
        enabled: this.shortcutConfig.enabled,
        shortcuts: nextShortcuts
      })
      this.$bus.$emit('review_shortcuts_changed', this.shortcutConfig.shortcuts)
      this.$message.success(`「${def.name}」已恢复为默认键位：${def.defaultKey}`)
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
      this.afterChange()
    },
    // ---------- 周期预设管理 ----------
    // 使用某预设作为当前默认周期
    onApplyPreset(p) {
      setActivePreset(p.id)
      this.$message.success('已切换预设：' + p.name + '（' + cyclesToStr(p.cycles) + '）')
      this.afterChange()
    },
    onClearActivePreset() {
      clearActivePreset()
      this.$message.success('已取消预设，使用自定义周期')
      this.afterChange()
    },
    openPresetDialog(p) {
      this.presetEditId = p ? p.id : ''
      this.presetEditName = p ? p.name : ''
      this.presetEditCycles = p ? cyclesToStr(p.cycles) : ''
      this.presetDialogVisible = true
    },
    onSavePreset() {
      const name = this.presetEditName.trim()
      if (!name) {
        this.$message.warning('请输入预设名称')
        return
      }
      const parsed = parseCycles(this.presetEditCycles)
      if (!parsed.length) {
        this.$message.warning('周期格式不正确')
        return
      }
      if (this.presetEditId) {
        updatePreset(this.presetEditId, { name, cycles: parsed })
        this.$message.success('预设已更新')
      } else {
        addPreset({ name, cycles: parsed })
        this.$message.success('预设已创建')
      }
      this.presetDialogVisible = false
      this.afterChange()
    },
    onDeletePreset(p) {
      this.$confirm(`删除预设「${p.name}」？已加入复习的节点周期不受影响。`, '删除预设', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          deletePreset(p.id)
          this.$message.success('预设已删除')
          this.afterChange()
        })
        .catch(() => {})
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

        .cardTopBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;

          .stageBadge {
            font-size: 12px;
            font-weight: 600;
            color: #e6a23c;
          }
        }

        .cardFront {
          .cardType {
            display: inline-block;
            font-size: 11px;
            color: #409eff;
            background: #ecf5ff;
            border-radius: 3px;
            padding: 2px 8px;
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

      .actionPanel {
        margin-top: 16px;
        text-align: center;

        .unrevealedBar {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;

          .actionTip {
            font-size: 13px;
            color: #909399;
          }
        }

        .revealedBar {
          .ratingBar {
            display: flex;
            justify-content: center;
            gap: 14px;
            flex-wrap: wrap;

            .el-button {
              min-width: 110px;
              font-size: 14px;
              font-weight: 600;
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

      .shortcutHelpBar {
        margin-top: 24px;
        padding-top: 14px;
        border-top: 1px dashed #ebeef5;
        display: flex;
        justify-content: center;
        gap: 20px;
        flex-wrap: wrap;
        font-size: 12px;
        color: #909399;

        .helpItem {
          b {
            color: #409eff;
            background: #ecf5ff;
            padding: 1px 6px;
            border-radius: 3px;
            margin-right: 4px;
          }
        }
      }
    }
  }

  // 复习完成统计卡片
  .reviewFinishedWrap {
    display: flex;
    justify-content: center;
    padding: 40px 0;

    .finishedCard {
      background: #fff;
      border-radius: 12px;
      padding: 36px 40px;
      text-align: center;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);

      .finishIcon {
        font-size: 48px;
        margin-bottom: 12px;
      }

      .finishTitle {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 8px;
        color: #303133;
      }

      .finishDesc {
        font-size: 14px;
        color: #909399;
        margin: 0 0 24px;
      }

      .finishStats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        background: #f8fafc;
        border-radius: 8px;
        padding: 16px 8px;
        margin-bottom: 28px;

        .fStatItem {
          .num {
            font-size: 22px;
            font-weight: 700;
            color: #409eff;

            &.text-success {
              color: #67c23a;
            }
            &.text-warning {
              color: #e6a23c;
            }
            &.text-danger {
              color: #f56c6c;
            }
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
        gap: 16px;
      }
    }

    &.dark {
      .finishedCard {
        background: #363b3f;

        .finishTitle {
          color: #fff;
        }

        .finishStats {
          background: #2b2f33;
        }
      }
    }
  }

  // 快捷键配置对话框
  .shortcutConfigBox {
    .scTopBar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid #ebeef5;
      margin-bottom: 12px;

      .scStatus {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 600;

        .scStatusText {
          font-size: 13px;
          color: #909399;
          font-weight: normal;
        }
      }
    }

    .scTip {
      font-size: 12px;
      color: #909399;
      background: #f4f4f5;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 14px;
    }

    .scTable {
      border: 1px solid #ebeef5;
      border-radius: 6px;
      overflow: hidden;

      .scHeader,
      .scRow {
        display: flex;
        align-items: center;
        padding: 10px 14px;
      }

      .scHeader {
        background: #f5f7fa;
        font-weight: 600;
        font-size: 13px;
        color: #606266;
        border-bottom: 1px solid #ebeef5;
      }

      .scRow {
        border-bottom: 1px solid #f0f2f5;

        &:last-child {
          border-bottom: none;
        }

        &:hover {
          background: #fafafa;
        }
      }

      .colAction {
        flex: 2;
        display: flex;
        align-items: center;
        gap: 10px;

        .actionIcon {
          font-size: 18px;
        }

        .actionInfo {
          .actionName {
            font-weight: 600;
            font-size: 13px;
            color: #303133;
          }

          .actionDesc {
            font-size: 12px;
            color: #909399;
            margin-top: 2px;
          }
        }
      }

      .colScope {
        flex: 1;
        text-align: center;
      }

      .colBinding {
        flex: 1.5;
        text-align: center;

        .scRecordBtn {
          min-width: 100px;
          font-family: monospace;
          font-size: 13px;
          font-weight: 600;
        }
      }

      .colOps {
        flex: 1;
        text-align: right;
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
    margin-bottom: 10px;

    .rightOps {
      display: flex;
      gap: 8px;
    }
  }

  .filterRow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;

    .frSelect {
      width: 150px;
    }

    .frClear {
      margin-left: 4px;
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

      .presetManageRow {
        margin-top: 10px;
        display: flex;
        align-items: center;
        gap: 6px;

        .presetLabel {
          font-size: 12px;
          color: #909399;
        }
      }

      .presetListManage {
        margin-top: 10px;
        border-top: 1px dashed #ebeef5;

        .presetItem {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          font-size: 13px;

          .presetName {
            font-weight: 600;
          }

          .presetCycles {
            color: #909399;
            font-size: 12px;
          }

          .presetTag {
            font-size: 11px;
            color: #409eff;
            background: #ecf5ff;
            border-radius: 3px;
            padding: 1px 6px;
          }

          &.active {
            background: #f5f7fa;
            border-radius: 4px;
            padding-left: 6px;
          }

          .presetOps {
            margin-left: auto;

            .danger {
              color: #f56c6c;
            }
          }
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
