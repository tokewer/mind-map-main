<template>
  <el-dialog
    class="saveImageDialog"
    :class="{ isMobile: isMobile, isDark: isDark }"
    :title="$t('saveImage.title')"
    :visible.sync="dialogVisible"
    :width="isMobile ? '90%' : '800px'"
    :top="isMobile ? '20px' : '15vh'"
  >
    <div class="saveImageContainer" :class="{ isDark: isDark }">
      <!-- 保存选项 -->
      <div class="optionsBox">
        <div class="sectionTitle">{{ $t('saveImage.options') }}</div>

        <!-- 保存类型选择 -->
        <div class="optionItem">
          <div class="optionName">{{ $t('saveImage.type') }}</div>
          <div class="optionValue">
            <el-radio-group v-model="saveType">
              <el-radio label="single">{{ $t('saveImage.single') }}</el-radio>
              <el-radio label="all">{{ $t('saveImage.all') }}</el-radio>
              <el-radio label="selected">{{ $t('saveImage.selected') }}</el-radio>
            </el-radio-group>
          </div>
        </div>

        <!-- 图片格式选择 -->
        <div class="optionItem" v-if="saveType === 'single'">
          <div class="optionName">{{ $t('saveImage.format') }}</div>
          <div class="optionValue">
            <el-radio-group v-model="imageFormat">
              <el-radio label="png">PNG</el-radio>
              <el-radio label="jpg">JPG</el-radio>
              <el-radio label="webp">WebP</el-radio>
            </el-radio-group>
          </div>
        </div>

        <!-- 压缩选项 -->
        <div class="optionItem">
          <div class="optionName">{{ $t('saveImage.compression') }}</div>
          <div class="optionValue">
            <el-slider
              v-model="compression"
              :min="1"
              :max="100"
              :step="1"
              :show-tooltip="false"
              :marks="compressionMarks"
            ></el-slider>
            <div class="compressionValue">{{ compression }}%</div>
          </div>
        </div>

        <!-- 图片尺寸 -->
        <div class="optionItem">
          <div class="optionName">{{ $t('saveImage.size') }}</div>
          <div class="optionValue">
            <el-select v-model="imageSize" placeholder="选择尺寸">
              <el-option
                v-for="size in sizeOptions"
                :key="size.value"
                :label="size.label"
                :value="size.value"
              ></el-option>
            </el-select>
          </div>
        </div>

        <!-- 导出选项 -->
        <div class="optionItem">
          <div class="optionName">{{ $t('saveImage.exportOptions') }}</div>
          <div class="optionValue">
            <div class="checkboxItem">
              <el-checkbox v-model="includeText">{{ $t('saveImage.includeText') }}</el-checkbox>
            </div>
            <div class="checkboxItem">
              <el-checkbox v-model="transparentBg">{{ $t('saveImage.transparentBg') }}</el-checkbox>
            </div>
            <div class="checkboxItem">
              <el-checkbox v-model="highQuality">{{ $t('saveImage.highQuality') }}</el-checkbox>
            </div>
          </div>
        </div>
      </div>

      <!-- 图片预览 -->
      <div class="previewBox" v-if="showPreview">
        <div class="sectionTitle">{{ $t('saveImage.preview') }}</div>
        <div class="previewContent">
          <div class="previewImage" v-if="previewUrl">
            <img :src="previewUrl" alt="预览图片" />
          </div>
          <div class="previewInfo" v-if="imageInfo">
            <div class="infoItem">
              <span class="infoLabel">{{ $t('saveImage.originalSize') }}:</span>
              <span class="infoValue">{{ imageInfo.width }} × {{ imageInfo.height }}</span>
            </div>
            <div class="infoItem">
              <span class="infoLabel">{{ $t('saveImage.fileSize') }}:</span>
              <span class="infoValue">{{ formatFileSize(imageInfo.size) }}</span>
            </div>
            <div class="infoItem">
              <span class="infoLabel">{{ $t('saveImage.compressedSize') }}:</span>
              <span class="infoValue">{{ formatFileSize(compressedSize) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 按钮组 -->
      <div class="btnBox">
        <el-button @click="cancel" size="small">{{ $t('dialog.cancel') }}</el-button>
        <el-button type="primary" @click="save" size="small" :loading="saving">
          {{ $t('saveImage.save') }}
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { mapState } from 'vuex'
import { isMobile } from 'simple-mind-map/src/utils/index'
import { compressImage, getImageInfo, resizeImage } from '@/utils/imageCompressor'

export default {
  data() {
    return {
      dialogVisible: false,
      saveType: 'single', // single, all, selected
      imageFormat: 'png',
      compression: 80,
      imageSize: 'original',
      includeText: true,
      transparentBg: false,
      highQuality: false,
      saving: false,
      previewUrl: '',
      imageInfo: null,
      compressedSize: 0,
      isMobile: isMobile(),
      compressionMarks: {
        1: '最低',
        50: '中等',
        100: '最高'
      },
      sizeOptions: [
        { value: 'original', label: '原始尺寸' },
        { value: '1024', label: '1024px' },
        { value: '800', label: '800px' },
        { value: '640', label: '640px' },
        { value: '320', label: '320px' }
      ]
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    }),
    showPreview() {
      return this.saveType === 'single' && this.previewUrl
    }
  },
  created() {
    this.$bus.$on('showSaveImage', this.handleShowSaveImage)
  },
  beforeDestroy() {
    this.$bus.$off('showSaveImage', this.handleShowSaveImage)
    this.revokeUrl()
  },
  methods: {
    handleShowSaveImage() {
      this.dialogVisible = true
      this.resetOptions()
    },

    resetOptions() {
      this.saveType = 'single'
      this.imageFormat = 'png'
      this.compression = 80
      this.imageSize = 'original'
      this.includeText = true
      this.transparentBg = false
      this.highQuality = false
      this.previewUrl = ''
      this.imageInfo = null
      this.compressedSize = 0
    },

    revokeUrl() {
      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl)
        this.previewUrl = ''
      }
    },

    formatFileSize(bytes) {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    },

    async generatePreview() {
      if (this.saveType !== 'single') return

      try {
        // 获取当前激活的节点
        const activeNode = this.mindMap.renderer.activeNode
        if (!activeNode) {
          this.$message.warning(this.$t('saveImage.noActiveNode'))
          return
        }

        // 生成预览图片
        const result = await this.mindMap.exporter.png(
          'preview',
          false,
          this.transparentBg,
          activeNode,
          !this.transparentBg
        )

        // 创建原始预览URL
        const originalBlob = new Blob([result], { type: 'image/png' })
        this.previewUrl = URL.createObjectURL(originalBlob)

        // 获取原始图片信息
        const img = new Image()
        img.src = this.previewUrl
        await new Promise(resolve => {
          img.onload = () => {
            this.imageInfo = {
              width: img.width,
              height: img.height,
              size: originalBlob.size
            }

            // 应用压缩和尺寸调整
            const compressionOptions = {
              quality: this.compression / 100,
              format: 'image/png'
            }

            if (this.imageSize !== 'original') {
              const maxWidth = parseInt(this.imageSize)
              const maxHeight = parseInt(this.imageSize)
              compressionOptions.maxWidth = maxWidth
              compressionOptions.maxHeight = maxHeight
            }

            compressImage(originalBlob, compressionOptions).then(compressedBlob => {
              this.compressedSize = compressedBlob.size
              resolve()
            }).catch(() => {
              this.compressedSize = originalBlob.size
              resolve()
            })
          }
        })
      } catch (error) {
        console.error('生成预览失败:', error)
        this.$message.error(this.$t('saveImage.previewError'))
      }
    },

    async save() {
      this.saving = true
      try {
        if (this.saveType === 'single') {
          await this.saveSingleImage()
        } else if (this.saveType === 'all') {
          await this.saveAllImages()
        } else if (this.saveType === 'selected') {
          await this.saveSelectedImages()
        }

        this.$message.success(this.$t('saveImage.saveSuccess'))
        this.cancel()
      } catch (error) {
        console.error('保存失败:', error)
        this.$message.error(this.$t('saveImage.saveError'))
      } finally {
        this.saving = false
      }
    },

    async saveSingleImage() {
      if (!this.previewUrl) {
        await this.generatePreview()
      }

      // 获取当前激活的节点
      const activeNode = this.mindMap.renderer.activeNode
      if (!activeNode) {
        throw new Error(this.$t('saveImage.noActiveNode'))
      }

      // 生成图片
      let result
      if (this.imageFormat === 'png') {
        result = await this.mindMap.exporter.png(
          'image',
          false,
          this.transparentBg,
          activeNode,
          !this.transparentBg
        )
      } else if (this.imageFormat === 'jpg') {
        result = await this.mindMap.exporter.jpg(
          'image',
          false,
          this.transparentBg,
          activeNode,
          !this.transparentBg
        )
      } else if (this.imageFormat === 'webp') {
        // WebP 格式需要特殊处理
        result = await this.mindMap.exporter.png(
          'image',
          false,
          this.transparentBg,
          activeNode,
          !this.transparentBg
        )
      }

      // 转换为Blob以便压缩
      const blob = new Blob([result], { type: `image/${this.imageFormat}` })

      // 应用压缩
      const compressionOptions = {
        quality: this.compression / 100,
        format: `image/${this.imageFormat}`
      }

      // 如果设置了尺寸限制，则调整尺寸
      if (this.imageSize !== 'original') {
        const maxWidth = parseInt(this.imageSize)
        const maxHeight = parseInt(this.imageSize)
        compressionOptions.maxWidth = maxWidth
        compressionOptions.maxHeight = maxHeight
      }

      let compressedBlob
      try {
        compressedBlob = await compressImage(blob, compressionOptions)
      } catch (error) {
        console.error('压缩失败:', error)
        // 如果压缩失败，使用原始图片
        compressedBlob = blob
      }

      // 下载文件
      const fileName = `${this.$t('saveImage.defaultFileName')}.${this.imageFormat}`
      this.downloadFile(compressedBlob, fileName)
    },

    async saveAllImages() {
      // 收集所有图片节点
      const imageNodes = []
      this.mindMap.renderer.walk(node => {
        if (node.data.image) {
          imageNodes.push(node)
        }
      })

      if (imageNodes.length === 0) {
        throw new Error(this.$t('saveImage.noImagesFound'))
      }

      // 批量导出图片
      for (let i = 0; i < imageNodes.length; i++) {
        const node = imageNodes[i]
        const result = await this.mindMap.exporter.png(
          `image_${i}`,
          false,
          this.transparentBg,
          node,
          !this.transparentBg
        )
        const fileName = `image_${i + 1}.png`
        this.downloadFile(result, fileName)

        // 添加延迟避免浏览器阻止下载
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    },

    async saveSelectedImages() {
      // 收集选中的图片节点
      const selectedNodes = this.mindMap.renderer.getSelectedNodes()
      const imageNodes = selectedNodes.filter(node => node.data.image)

      if (imageNodes.length === 0) {
        throw new Error(this.$t('saveImage.noSelectedImages'))
      }

      // 批量导出选中的图片
      for (let i = 0; i < imageNodes.length; i++) {
        const node = imageNodes[i]
        const result = await this.mindMap.exporter.png(
          `selected_${i}`,
          false,
          this.transparentBg,
          node,
          !this.transparentBg
        )
        const fileName = `selected_${i + 1}.png`
        this.downloadFile(result, fileName)

        // 添加延迟避免浏览器阻止下载
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    },

    downloadFile(data, fileName) {
      let blob
      let url

      if (data instanceof Blob) {
        blob = data
      } else {
        blob = new Blob([data], { type: 'image/png' })
      }

      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },

    cancel() {
      this.dialogVisible = false
      this.revokeUrl()
    }
  }
}
</script>

<style lang="less" scoped>
.saveImageDialog {
  .saveImageContainer {
    &.isDark {
      .optionsBox, .previewBox {
        background-color: #363b3f;
        color: #fff;

        .sectionTitle {
          color: hsla(0, 0%, 100%, 0.9);
        }

        .optionItem {
          .optionName {
            color: hsla(0, 0%, 100%, 0.7);
          }
        }
      }
    }
  }
}

.saveImageDialog {
  &.isDark {
    /deep/ .el-dialog__body {
      .el-checkbox__label {
        color: hsla(0, 0%, 100%, 0.8);
      }
    }
  }

  /deep/ .el-dialog {
    border-radius: 10px;
    overflow: hidden;

    .el-dialog__header {
      display: none;
    }
  }

  /deep/ .el-dialog__body {
    padding: 20px;

    .el-checkbox__input.is-checked + .el-checkbox__label {
      color: #409eff !important;
    }

    .el-checkbox {
      .el-checkbox__label {
        color: #1a1a1a;
      }
    }
  }

  .saveImageContainer {
    .optionsBox, .previewBox {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .sectionTitle {
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 15px;
    }

    .optionItem {
      margin-bottom: 20px;

      &:last-child {
        margin-bottom: 0;
      }

      .optionName {
        font-size: 14px;
        color: #666;
        margin-bottom: 8px;
      }

      .optionValue {
        .checkboxItem {
          margin-bottom: 8px;

          &:last-child {
            margin-bottom: 0;
          }
        }
      }
    }

    .previewBox {
      .previewContent {
        display: flex;
        gap: 20px;
        align-items: flex-start;

        .previewImage {
          flex-shrink: 0;
          width: 200px;
          height: 200px;
          border: 1px solid #ddd;
          border-radius: 4px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: #fff;

          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
        }

        .previewInfo {
          flex: 1;

          .infoItem {
            margin-bottom: 8px;
            font-size: 14px;

            .infoLabel {
              color: #666;
              margin-right: 8px;
            }

            .infoValue {
              color: #333;
              font-weight: 500;
            }
          }
        }
      }
    }

    .btnBox {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
  }

  &.isMobile {
    .saveImageContainer {
      .optionsBox, .previewBox {
        padding: 15px;
      }

      .previewBox {
        .previewContent {
          flex-direction: column;

          .previewImage {
            width: 100%;
            height: 150px;
          }
        }
      }
    }
  }
}
</style>