<template>
  <span class="fileBar" v-if="!isMobile">
    <el-popover
      v-model="popoverVisible"
      placement="bottom-start"
      width="340"
      trigger="click"
      popper-class="fileBarPopover"
    >
      <!-- 面板内容 -->
      <div class="fileBarPanel" :class="{ dark: isDark }">
        <!-- 工作目录模式 -->
        <div class="dirSection" v-if="isDirectoryMode">
          <div class="dirInfo">
            <span class="dirIcon el-icon-folder"></span>
            <span class="dirName">{{ directoryName }}</span>
            <span
              class="dirStatus"
              :class="saveStatus"
              v-if="saveStatusText"
              >{{ saveStatusText }}</span
            >
          </div>
          <div class="dirActions">
            <el-button size="mini" type="primary" plain @click="onCreate">新建导图</el-button>
            <el-button size="mini" @click="onSelectDirectory">切换目录</el-button>
            <el-button size="mini" @click="onExitDirectory">退出</el-button>
          </div>
        </div>
        <div class="dirSection" v-else>
          <div class="dirInfo">
            <span class="dirTip">导图以 .smm 文件保存在本地文件夹，图片外置到 images/</span>
          </div>
          <div class="dirActions">
            <el-button size="mini" type="primary" @click="onSelectDirectory">选择工作目录</el-button>
          </div>
        </div>

        <div class="panelActions">
          <el-button size="mini" type="primary" plain @click="onCreate">新建文件</el-button>
          <el-button size="mini" @click="onOpenLocal">打开本地文件</el-button>
          <el-button size="mini" type="success" plain @click="onSaveWorkspace">保存工作区</el-button>
          <el-button size="mini" @click="onOpenWorkspace">打开工作区</el-button>
          <input
            ref="workspaceInput"
            type="file"
            accept=".smmw.json,.json"
            style="display: none;"
            @change="onWorkspaceInput"
          />
          <el-button size="mini" @click="onHistory">历史版本</el-button>
          <el-button size="mini" @click="onTrash">回收站</el-button>
          <el-button size="mini" @click="onReview">复习页</el-button>
        </div>
        <div class="fileList">
          <div
            class="fileItem"
            :class="{ active: f.id === currentId, dark: isDark }"
            v-for="f in fileList"
            :key="f.id"
            @click="onSwitch(f.id)"
          >
            <span class="fileIcon el-icon-document"></span>
            <span class="fileInfo">
              <span class="fileName">{{ f.name }}</span>
              <span class="fileTime">{{ formatTime(f.updatedAt) }}</span>
            </span>
            <span class="fileOps" @click.stop>
              <i class="el-icon-edit-outline" @click="onRename(f)"></i>
              <i class="el-icon-delete" @click="onDelete(f)"></i>
            </span>
          </div>
        </div>
      </div>
      <!-- 触发按钮 -->
      <div slot="reference" class="toolbarBtn">
        <span class="icon iconfont iconwenjian"></span>
        <span class="text">{{ $t('toolbar.files') }}</span>
      </div>
    </el-popover>
  </span>
</template>

<script>
import { mapState } from 'vuex'
import {
  getFileList,
  getCurrentFileId,
  setCurrentFileId,
  createFile,
  renameFile,
  deleteFile,
  readFileData,
  flushStore,
  clearDataCache,
  flushDirectoryStore
} from '@/api'
import * as directoryStorage from '@/api/directoryStorage'
import { renameFileForReviews } from '@/review'
import {
  saveWorkspaceFile,
  openWorkspaceFile,
  applyOpenedWorkspace,
  isWorkspaceAutoSaveEnabled,
  scheduleWorkspaceAutoSave
} from '@/api/workspace'

const pad = n => String(n).padStart(2, '0')

export default {
  name: 'FileBar',
  data() {
    return {
      popoverVisible: false,
      fileList: [],
      currentId: '',
      saveStatus: ''
    }
  },
  computed: {
    isMobile() {
      return window.innerWidth < 768
    },
    ...mapState({
      isDark: state => state.localConfig.isDark,
      isDirectoryMode: state => state.isDirectoryMode,
      directoryName: state => state.directoryName,
      currentSmmFile: state => state.currentSmmFile
    }),
    saveStatusText() {
      if (!this.isDirectoryMode) return ''
      const map = {
        saving: this.$t('directory.saving'),
        saved: this.$t('directory.saved'),
        error: this.$t('directory.saveError')
      }
      return map[this.saveStatus] || ''
    }
  },
  created() {
    this.refresh()
    this.$bus.$on('setData', this.refresh)
    this.$bus.$on('workspace_data_change', this.onWorkspaceChanged)
    this.$bus.$on('workspace_auto_save_error', this.onWorkspaceAutoSaveError)
    this.$bus.$on('directory_save_status', this.onDirectorySaveStatus)
    this.$bus.$on('directory_error', this.onDirectoryError)
  },
  beforeDestroy() {
    this.$bus.$off('setData', this.refresh)
    this.$bus.$off('workspace_data_change', this.onWorkspaceChanged)
    this.$bus.$off('workspace_auto_save_error', this.onWorkspaceAutoSaveError)
    this.$bus.$off('directory_save_status', this.onDirectorySaveStatus)
    this.$bus.$off('directory_error', this.onDirectoryError)
  },
  methods: {
    async refresh() {
      if (this.isDirectoryMode) {
        const files = await directoryStorage.listMapFiles()
        this.fileList = (files || []).map(name => ({
          id: name,
          name: name.replace(/\.smm$/i, ''),
          fileName: name,
          updatedAt: Date.now()
        }))
        this.currentId = this.currentSmmFile || ''
        return
      }
      this.fileList = getFileList()
      this.currentId = getCurrentFileId()
    },
    formatTime(t) {
      if (!t) return ''
      const d = new Date(t)
      const now = new Date()
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      if (sameDay) return hm
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
    },
    async onSwitch(id) {
      if (id === this.currentId) {
        this.popoverVisible = false
        return
      }
      if (this.isDirectoryMode) {
        await this.saveBeforeFileChange()
        const opened = await directoryStorage.openMapFile(id)
        if (!opened || !opened.ok) {
          this.$message.warning((opened && opened.message) || '文件打开失败')
          return
        }
        clearDataCache()
        this.$store.commit('setCurrentSmmFile', opened.fileName)
        this.$bus.$emit('setData', opened.data)
        this.refresh()
        this.popoverVisible = false
        this.$message.success('已切换到：' + opened.fileName)
        return
      }
      this.saveBeforeFileChange() // 先强制保存当前文件（含本地磁盘文件）
      this.exitLocalFileMode()
      setCurrentFileId(id)
      clearDataCache() // 清除旧文件内存缓存
      const data = readFileData(id)
      this.$bus.$emit('setData', data)
      this.refresh()
      this.popoverVisible = false
      this.$message.success('已切换到：' + (getFileList().find(f => f.id === id) || {}).name)
    },
    // 切换/新建/删除文件前：先把节流中的待写数据落盘；
    // 工作目录模式则触发一次强制写入并等待完成
    async saveBeforeFileChange() {
      if (this.isDirectoryMode) {
        await flushDirectoryStore()
        return
      }
      if (this.$store.state.isHandleLocalFile) {
        // 本地磁盘文件：立即写出（绕过 1s 防抖），并等待完成
        try {
          this.$bus.$emit('flush_local_file')
        } catch (error) {
          console.log(error)
        }
      } else {
        flushStore()
      }
    },
    // 若正处于"本地磁盘文件"模式，切回应用内多文件模式
    exitLocalFileMode() {
      if (this.$store.state.isHandleLocalFile) {
        this.$store.commit('setIsHandleLocalFile', false)
      }
    },
    async onCreate() {
      if (this.isDirectoryMode) {
        if (!directoryStorage.getDirectoryHandleValue()) {
          this.$message.warning('请先选择工作目录')
          return
        }
        this.$prompt('请输入新导图文件名', '新建导图', {
          confirmButtonText: '创建',
          cancelButtonText: '取消',
          inputValue: '新建思维导图',
          inputValidator: v => (v && v.trim() ? true : '文件名不能为空')
        })
          .then(async ({ value }) => {
            const res = await directoryStorage.createMapFile(value.trim(), undefined)
            if (!res || !res.ok) {
              this.$message.warning((res && res.message) || '创建失败')
              return
            }
            await this.saveBeforeFileChange()
            const opened = await directoryStorage.openMapFile(res.fileName)
            if (opened && opened.ok) {
              clearDataCache()
              this.$store.commit('setCurrentSmmFile', opened.fileName)
              this.$bus.$emit('setData', opened.data)
            }
            this.refresh()
            this.$message.success('已新建导图：' + res.fileName)
          })
          .catch(() => {})
        return
      }
      this.$prompt('请输入新文件名', '新建文件', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValue: '新建思维导图',
        inputValidator: v => (v && v.trim() ? true : '文件名不能为空')
      })
        .then(async ({ value }) => {
          await this.saveBeforeFileChange()
          this.exitLocalFileMode()
          const file = createFile(value.trim())
          setCurrentFileId(file.id)
          clearDataCache()
          this.$bus.$emit('setData', readFileData(file.id))
          this.refresh()
          this.$message.success('已新建文件：' + file.name)
        })
        .catch(() => {})
    },
    onRename(f) {
      if (this.isDirectoryMode) {
        this.$prompt('请输入新文件名', '重命名', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputValue: f.name,
          inputValidator: v => (v && v.trim() ? true : '文件名不能为空')
        })
          .then(async ({ value }) => {
            const res = await directoryStorage.renameMapFile(f.id, value.trim())
            if (!res || !res.ok) {
              this.$message.warning((res && res.message) || '重命名失败')
              return
            }
            if (this.currentSmmFile === f.id) {
              this.$store.commit('setCurrentSmmFile', res.fileName)
            }
            this.refresh()
            this.$message.success('已重命名')
          })
          .catch(() => {})
        return
      }
      this.$prompt('请输入新文件名', '重命名', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: f.name,
        inputValidator: v => (v && v.trim() ? true : '文件名不能为空')
      })
        .then(({ value }) => {
          renameFile(f.id, value.trim())
          renameFileForReviews(f.id, value.trim()) // 同步复习记录的文件名
          this.refresh()
        })
        .catch(() => {})
    },
    onDelete(f) {
      if (this.isDirectoryMode) {
        if (this.fileList.length <= 1) {
          this.$message.warning('至少保留一个文件')
          return
        }
        this.$confirm(`确定删除「${f.name}」吗？该文件的复习关联不受影响。`, '删除文件', {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        })
          .then(async () => {
            const wasCurrent = f.id === this.currentId
            if (wasCurrent) {
              await this.saveBeforeFileChange()
            }
            const res = await directoryStorage.deleteMapFile(f.id)
            if (!res || !res.ok) {
              this.$message.warning((res && res.message) || '删除失败')
              return
            }
            clearDataCache()
            if (wasCurrent) {
              this.$store.commit('setCurrentSmmFile', '')
              const files = await directoryStorage.listMapFiles()
              if (files && files.length) {
                const opened = await directoryStorage.openMapFile(files[0])
                if (opened && opened.ok) {
                  this.$store.commit('setCurrentSmmFile', opened.fileName)
                  this.$bus.$emit('setData', opened.data)
                }
              }
            }
            this.refresh()
            this.$message.success('已删除')
          })
          .catch(() => {})
        return
      }
      if (this.fileList.length <= 1) {
        this.$message.warning('至少保留一个文件')
        return
      }
      this.$confirm(`确定删除「${f.name}」吗？该文件的复习关联不受影响。`, '删除文件', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(async () => {
          const wasCurrent = f.id === this.currentId
          if (wasCurrent) {
            await this.saveBeforeFileChange()
          }
          this.exitLocalFileMode()
          deleteFile(f.id)
          clearDataCache()
          if (wasCurrent) {
            const newId = getCurrentFileId()
            this.$bus.$emit('setData', readFileData(newId))
          }
          this.refresh()
          this.$message.success('已删除')
        })
        .catch(() => {})
    },

    // ---------- 工作目录模式 ----------

    // 选择/切换工作目录；空目录时自动把 localStorage 已有导图迁移进来
    async onSelectDirectory() {
      this.popoverVisible = false
      if (this.isDirectoryMode) {
        await this.saveBeforeFileChange()
      }
      const res = await directoryStorage.openDirectoryPicker()
      if (!res.ok) {
        if (!res.cancelled && !res.unsupported) {
          this.$message.warning((res && res.message) || '选择工作目录失败')
        }
        return
      }
      this.$store.commit('setIsDirectoryMode', true)
      this.$store.commit('setDirectoryName', res.name)
      clearDataCache()
      const files = await directoryStorage.listMapFiles()
      let target = files && files.length ? files[0] : ''
      if (!target) {
        const migrated = await this.migrateLocalStorageFiles()
        if (migrated) {
          const after = await directoryStorage.listMapFiles()
          target = after && after.length ? after[0] : ''
          this.$message.success(`已从浏览器存储迁移 ${migrated} 个导图`)
        }
      }
      if (target) {
        const opened = await directoryStorage.openMapFile(target)
        if (opened && opened.ok) {
          this.$store.commit('setCurrentSmmFile', opened.fileName)
          this.$bus.$emit('setData', opened.data)
        }
      } else {
        // 完全空目录：新建默认导图
        const created = await directoryStorage.createMapFile('我的思维导图', undefined)
        if (created && created.ok) {
          const opened = await directoryStorage.openMapFile(created.fileName)
          if (opened && opened.ok) {
            this.$store.commit('setCurrentSmmFile', opened.fileName)
            this.$bus.$emit('setData', opened.data)
          }
        }
      }
      this.refresh()
      this.$message.success('工作目录已就绪：' + res.name)
    },

    // 把 localStorage 中的多文件导图迁移为 maps/ 下的 .smm
    async migrateLocalStorageFiles() {
      const list = getFileList()
      if (!list || !list.length) return 0
      let count = 0
      for (const f of list) {
        const data = readFileData(f.id)
        if (!data || !data.root) continue
        const name = f.name + '.smm'
        const res = await directoryStorage.createMapFile(name, data)
        if (res && res.ok) count++
      }
      return count
    },

    async onExitDirectory() {
      this.popoverVisible = false
      this.$confirm(
        '退出工作目录模式？当前导图会先保存到工作目录，之后回到浏览器内置存储。',
        '退出工作目录',
        {
          confirmButtonText: '保存并退出',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
        .then(async () => {
          await this.saveBeforeFileChange()
          await directoryStorage.leaveDirectoryMode()
          this.$store.commit('setIsDirectoryMode', false)
          this.$store.commit('setDirectoryName', '')
          this.$store.commit('setCurrentSmmFile', '')
          this.$store.commit('setDirectorySaveStatus', '')
          clearDataCache()
          this.exitLocalFileMode()
          const newId = getCurrentFileId()
          this.$bus.$emit('setData', readFileData(newId))
          this.refresh()
          this.$message.success('已退出工作目录模式')
        })
        .catch(() => {})
    },

    onDirectorySaveStatus(status) {
      this.saveStatus = status || ''
    },

    onDirectoryError(message) {
      this.$message.error(message)
    },

    async onSaveWorkspace() {
      try {
        await this.saveBeforeFileChange()
        await saveWorkspaceFile()
        this.$message.success(isWorkspaceAutoSaveEnabled() ? '工作区已保存，后续编辑将自动保存' : '工作区已下载')
      } catch (error) {
        if (String(error && error.name).toLowerCase() !== 'aborterror') {
          this.$message.error('工作区保存失败：' + (error.message || '浏览器不支持或没有写入权限'))
        }
      }
    },
    onOpenWorkspace() {
      this.popoverVisible = false
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
          await this.confirmWorkspaceReload()
        }).catch(() => {})
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
      this.$confirm('打开工作区会覆盖当前浏览器中的导图和复习数据，是否继续？', '确认导入', {
        confirmButtonText: '覆盖并打开',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const result = await openWorkspaceFile(file)
        if (!result.ok) {
          this.$message.error(result.message || '工作区打开失败')
          return
        }
        const applied = await applyOpenedWorkspace(result)
        if (!applied.ok) {
          this.$message.error(applied.message || '工作区导入失败')
          return
        }
        await this.confirmWorkspaceReload()
      }).catch(() => {})
    },
    confirmWorkspaceReload() {
      return new Promise(resolve => {
        this.$confirm('工作区已导入，页面将重新加载以应用全部数据。', '导入成功', {
          confirmButtonText: '重新加载',
          cancelButtonText: '稍后',
          type: 'success'
        }).then(() => {
          window.location.reload()
          resolve()
        }).catch(() => resolve())
      })
    },
    onWorkspaceChanged() {
      if (isWorkspaceAutoSaveEnabled()) scheduleWorkspaceAutoSave()
    },
    onWorkspaceAutoSaveError(message) {
      this.$message.warning(message)
    },
    onOpenLocal() {
      this.popoverVisible = false
      this.$bus.$emit('open_local_file')
    },
    onHistory() {
      this.popoverVisible = false
      this.$bus.$emit('open_history_dialog')
    },
    onTrash() {
      this.popoverVisible = false
      this.$bus.$emit('open_trash')
    },
    onReview() {
      this.popoverVisible = false
      const route = this.$router.resolve({ path: '/review' })
      window.open(route.href, '_blank', 'noopener,noreferrer')
    }
  }
}
</script>

<style lang="less" scoped>
.fileBar {
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

    .icon {
      margin-right: 4px;
    }
  }
}
.fileBarPanel {
  &.dark {
    .fileList .fileItem {
      background: #363b3f;
      color: #fff;
      border-bottom-color: rgba(255, 255, 255, 0.08);

      &:hover {
        background: #40464b;
      }
    }
  }
}
.panelActions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.dirSection {
  padding: 8px 10px;
  background: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 10px;

  .dirInfo {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 13px;
    color: #606266;

    .dirIcon {
      color: #e6a23c;
      font-size: 15px;
    }

    .dirName {
      font-weight: 600;
      color: #303133;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dirTip {
      color: #909399;
      font-size: 12px;
      line-height: 1.5;
    }

    .dirStatus {
      font-size: 12px;
      margin-left: auto;
      flex-shrink: 0;

      &.saving {
        color: #e6a23c;
      }

      &.saved {
        color: #67c23a;
      }

      &.error {
        color: #f56c6c;
      }
    }
  }

  .dirActions {
    display: flex;
    gap: 6px;
  }

  &.dark {
    background: #2b2f33;
  }
}
.fileList {
  max-height: 320px;
  overflow-y: auto;

  .fileItem {
    display: flex;
    align-items: center;
    padding: 8px 10px;
    border-radius: 6px;
    cursor: pointer;
    border-bottom: 1px solid #f0f2f5;

    &:hover {
      background: #f5f7fa;
    }

    &.active {
      background: #ecf5ff;

      .fileName {
        color: #409eff;
        font-weight: 600;
      }
    }

    .fileIcon {
      color: #909399;
      margin-right: 8px;
    }

    .fileInfo {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      .fileName {
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .fileTime {
        font-size: 11px;
        color: #909399;
      }
    }

    .fileOps {
      display: none;
      gap: 8px;
      color: #909399;

      i {
        cursor: pointer;
        font-size: 14px;

        &:hover {
          color: #409eff;
        }
      }

      .el-icon-delete:hover {
        color: #f56c6c;
      }
    }

    &:hover .fileOps {
      display: flex;
    }
  }
}
</style>
