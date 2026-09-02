/**
 * 图片压缩工具
 */

/**
 * 压缩图片
 * @param {File|Blob|string} image - 图片文件、Blob或DataURL
 * @param {Object} options - 压缩选项
 * @param {number} options.quality - 压缩质量 (0-1)
 * @param {number} options.maxWidth - 最大宽度
 * @param {number} options.maxHeight - 最大高度
 * @param {string} options.format - 输出格式 (png, jpeg, webp)
 * @returns {Promise<Blob>}
 */
export const compressImage = (image, options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      quality = 0.8,
      maxWidth = Infinity,
      maxHeight = Infinity,
      format = 'image/jpeg'
    } = options

    const img = new Image()
    let createdUrl = ''

    // 处理不同类型的输入
    if (typeof image === 'string') {
      img.src = image
    } else if (image instanceof Blob) {
      // File 是 Blob 的子类，这里一并处理
      createdUrl = URL.createObjectURL(image)
      img.src = createdUrl
    } else {
      reject(new Error('不支持的图片类型'))
      return
    }

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      // 计算压缩后的尺寸
      let { width, height } = img
      const ratio = width / height

      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          width = maxWidth
          height = width / ratio
        } else {
          height = maxHeight
          width = height * ratio
        }
      }

      canvas.width = width
      canvas.height = height

      // 绘制图片
      ctx.drawImage(img, 0, 0, width, height)

      // 转换为Blob
      canvas.toBlob(
        (blob) => {
          // 释放临时创建的URL
          if (createdUrl) URL.revokeObjectURL(createdUrl)
          if (typeof image === 'string' && image.startsWith('blob:')) {
            URL.revokeObjectURL(image)
          }
          resolve(blob)
        },
        format,
        quality
      )
    }

    img.onerror = (error) => {
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      reject(error)
    }
  })
}

/**
 * 获取图片信息
 * @param {File|Blob|string} image - 图片文件、Blob或DataURL
 * @returns {Promise<Object>}
 */
export const getImageInfo = (image) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    let createdUrl = ''

    if (typeof image === 'string') {
      img.src = image
    } else if (image instanceof Blob) {
      createdUrl = URL.createObjectURL(image)
      img.src = createdUrl
    } else {
      reject(new Error('不支持的图片类型'))
      return
    }

    img.onload = () => {
      const info = {
        width: img.width,
        height: img.height,
        aspectRatio: img.width / img.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      }

      // 获取文件大小
      if (image instanceof Blob) {
        info.size = image.size
      } else if (image.startsWith('data:')) {
        // 对于DataURL，估算大小
        const base64Length = image.split(',')[1].length
        info.size = (base64Length * 3) / 4
      }

      // 释放URL
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      if (typeof image === 'string' && image.startsWith('blob:')) {
        URL.revokeObjectURL(image)
      }

      resolve(info)
    }

    img.onerror = (error) => {
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      reject(error)
    }
  })
}

/**
 * 调整图片尺寸
 * @param {File|Blob|string} image - 图片文件、Blob或DataURL
 * @param {Object} options - 调整选项
 * @param {number} options.width - 目标宽度
 * @param {number} options.height - 目标高度
 * @param {boolean} options.keepAspectRatio - 是否保持宽高比
 * @param {string} options.format - 输出格式
 * @returns {Promise<Blob>}
 */
export const resizeImage = (image, options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      width,
      height,
      keepAspectRatio = true,
      format = 'image/jpeg'
    } = options

    const img = new Image()
    let createdUrl = ''

    if (typeof image === 'string') {
      img.src = image
    } else if (image instanceof Blob) {
      createdUrl = URL.createObjectURL(image)
      img.src = createdUrl
    } else {
      reject(new Error('不支持的图片类型'))
      return
    }

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      let targetWidth = width
      let targetHeight = height

      if (keepAspectRatio) {
        const ratio = img.width / img.height
        if (width / height > ratio) {
          targetWidth = height * ratio
        } else {
          targetHeight = width / ratio
        }
      }

      canvas.width = targetWidth
      canvas.height = targetHeight

      // 绘制图片
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

      // 转换为Blob
      canvas.toBlob(
        (blob) => {
          // 释放临时创建的URL
          if (createdUrl) URL.revokeObjectURL(createdUrl)
          if (typeof image === 'string' && image.startsWith('blob:')) {
            URL.revokeObjectURL(image)
          }
          resolve(blob)
        },
        format
      )
    }

    img.onerror = (error) => {
      if (createdUrl) URL.revokeObjectURL(createdUrl)
      reject(error)
    }
  })
}

/**
 * 批量压缩图片
 * @param {Array} images - 图片数组
 * @param {Object} options - 压缩选项
 * @returns {Promise<Array>}
 */
export const batchCompressImages = (images, options = {}) => {
  return Promise.all(
    images.map(image => compressImage(image, options))
  )
}

/**
 * 转换图片格式
 * @param {File|Blob|string} image - 图片文件、Blob或DataURL
 * @param {string} format - 目标格式
 * @param {number} quality - 质量 (仅对jpeg/webp有效)
 * @returns {Promise<Blob>}
 */
export const convertImageFormat = (image, format = 'image/jpeg', quality = 0.8) => {
  return compressImage(image, { format, quality })
}