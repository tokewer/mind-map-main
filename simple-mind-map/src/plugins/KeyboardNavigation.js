import { bfsWalk } from '../utils'
import { CONSTANTS } from '../constants/constant'

//  键盘导航插件
class KeyboardNavigation {
  //  构造函数
  constructor(opt) {
    this.opt = opt
    this.mindMap = opt.mindMap

    this.addShortcut()
  }

  addShortcut() {
    this.onLeftKeyUp = this.onLeftKeyUp.bind(this)
    this.onUpKeyUp = this.onUpKeyUp.bind(this)
    this.onRightKeyUp = this.onRightKeyUp.bind(this)
    this.onDownKeyUp = this.onDownKeyUp.bind(this)

    this.mindMap.keyCommand.addShortcut(
      CONSTANTS.KEY_DIR.LEFT,
      this.onLeftKeyUp
    )
    this.mindMap.keyCommand.addShortcut(CONSTANTS.KEY_DIR.UP, this.onUpKeyUp)
    this.mindMap.keyCommand.addShortcut(
      CONSTANTS.KEY_DIR.RIGHT,
      this.onRightKeyUp
    )
    this.mindMap.keyCommand.addShortcut(
      CONSTANTS.KEY_DIR.DOWN,
      this.onDownKeyUp
    )
  }

  removeShortcut() {
    this.mindMap.keyCommand.removeShortcut(
      CONSTANTS.KEY_DIR.LEFT,
      this.onLeftKeyUp
    )
    this.mindMap.keyCommand.removeShortcut(CONSTANTS.KEY_DIR.UP, this.onUpKeyUp)
    this.mindMap.keyCommand.removeShortcut(
      CONSTANTS.KEY_DIR.RIGHT,
      this.onRightKeyUp
    )
    this.mindMap.keyCommand.removeShortcut(
      CONSTANTS.KEY_DIR.DOWN,
      this.onDownKeyUp
    )
  }

  onLeftKeyUp() {
    this.onKeyup(CONSTANTS.KEY_DIR.LEFT)
  }

  onUpKeyUp() {
    this.onKeyup(CONSTANTS.KEY_DIR.UP)
  }

  onRightKeyUp() {
    this.onKeyup(CONSTANTS.KEY_DIR.RIGHT)
  }

  onDownKeyUp() {
    this.onKeyup(CONSTANTS.KEY_DIR.DOWN)
  }

  //  处理按键事件
  onKeyup(dir) {
    if (this.mindMap.renderer.activeNodeList.length > 0) {
      this.focus(dir)
    } else {
      let root = this.mindMap.renderer.root
      this.mindMap.execCommand('GO_TARGET_NODE', root)
    }
  }

  // 聚焦到符合方向和层级关系的下一个节点。
  // 上下：按层级分组 + 稳定的线性顺序，每次只移动相邻的一个节点（不依赖几何距离）。
  // 左右：只允许在父节点 / 直接子节点之间切换，不跨层乱跳。
  focus(dir) {
    const current = this.mindMap.renderer.activeNodeList[0]
    if (!current) return

    // 上下方向：同级线性导航，直接定位到线性顺序上的相邻节点
    if (dir === CONSTANTS.KEY_DIR.UP || dir === CONSTANTS.KEY_DIR.DOWN) {
      const target = this.getSameLevelAdjacentNode(current, dir)
      if (target) {
        this.mindMap.execCommand('GO_TARGET_NODE', target)
      }
      return
    }

    // 左右方向：父子层级切换，保持原有父子关系行为
    const currentRect = this.getNodeRect(current)
    const currentCenter = this.getCenter(currentRect)
    const candidates = [current.parent, ...(current.children || [])].filter(Boolean)

    const isInDirection = node => {
      const center = this.getCenter(this.getNodeRect(node))
      if (dir === CONSTANTS.KEY_DIR.LEFT) return center.x < currentCenter.x
      if (dir === CONSTANTS.KEY_DIR.RIGHT) return center.x > currentCenter.x
      return false
    }

    const targetNode = candidates
      .filter(isInDirection)
      .map(node => ({
        node,
        rect: this.getNodeRect(node)
      }))
      .sort((a, b) => {
        const ac = this.getCenter(a.rect)
        const bc = this.getCenter(b.rect)
        return Math.abs(ac.x - currentCenter.x) - Math.abs(bc.x - currentCenter.x)
      })[0]

    // 没有符合方向的父子节点时，保持当前选择，不跨层级跳转。
    if (targetNode) {
      this.mindMap.execCommand('GO_TARGET_NODE', targetNode.node)
    }
  }

  // 获取当前节点所在层级的线性顺序上、相邻的节点。
  // 同一层级（跨父节点）的所有节点按树的先序遍历建立稳定顺序；
  // ↑ 取前一个、↓ 取后一个；到达层级首尾时返回 null（保持当前选择，不跨层级跳转）。
  getSameLevelAdjacentNode(current, dir) {
    const level = this.getNodeLevel(current)
    const allNodes = []

    // 按先序遍历收集该层级全部节点，顺序稳定，不随布局/缩放变化
    this.collectNodesAtLevel(this.mindMap.renderer.root, level, allNodes)

    const index = allNodes.findIndex(node => node.uid === current.uid)
    if (index === -1) return null

    const targetIndex = dir === CONSTANTS.KEY_DIR.UP ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= allNodes.length) return null

    return allNodes[targetIndex]
  }

  // 获取节点的层级（根节点为0），递归向上累加
  getNodeLevel(node, level = 0) {
    if (node === this.mindMap.renderer.root) {
      return level
    }
    return this.getNodeLevel(node.parent, level + 1)
  }

  // 收集指定层级的所有节点
  collectNodesAtLevel(node, targetLevel, result, currentLevel = 0) {
    if (currentLevel === targetLevel) {
      result.push(node)
    }

    if (Array.isArray(node.children)) {
      node.children.forEach(child => {
        this.collectNodesAtLevel(child, targetLevel, result, currentLevel + 1)
      })
    }
  }

  //  1.简单算法
  getFocusNodeBySimpleAlgorithm({
    currentActiveNode,
    currentActiveNodeRect,
    dir,
    checkNodeDis
  }) {
    // 遍历节点树
    bfsWalk(this.mindMap.renderer.root, node => {
      // 跳过当前聚焦的节点
      if (node.uid === currentActiveNode.uid) return
      // 当前遍历到的节点的位置信息
      let rect = this.getNodeRect(node)
      let { left, top, right, bottom } = rect
      let match = false
      // 按下了左方向键
      if (dir === CONSTANTS.KEY_DIR.LEFT) {
        // 判断节点是否在当前节点的左侧
        match = right <= currentActiveNodeRect.left
        // 按下了右方向键
      } else if (dir === CONSTANTS.KEY_DIR.RIGHT) {
        // 判断节点是否在当前节点的右侧
        match = left >= currentActiveNodeRect.right
        // 按下了上方向键
      } else if (dir === CONSTANTS.KEY_DIR.UP) {
        // 判断节点是否在当前节点的上面
        match = bottom <= currentActiveNodeRect.top
        // 按下了下方向键
      } else if (dir === CONSTANTS.KEY_DIR.DOWN) {
        // 判断节点是否在当前节点的下面
        match = top >= currentActiveNodeRect.bottom
      }
      // 符合要求，判断是否是最近的节点
      if (match) {
        checkNodeDis(rect, node)
      }
    })
  }

  //  2.阴影算法
  getFocusNodeByShadowAlgorithm({
    currentActiveNode,
    currentActiveNodeRect,
    dir,
    checkNodeDis
  }) {
    bfsWalk(this.mindMap.renderer.root, node => {
      if (node.uid === currentActiveNode.uid) return
      let rect = this.getNodeRect(node)
      let { left, top, right, bottom } = rect
      let match = false
      if (dir === CONSTANTS.KEY_DIR.LEFT) {
        match =
          left < currentActiveNodeRect.left &&
          top < currentActiveNodeRect.bottom &&
          bottom > currentActiveNodeRect.top
      } else if (dir === CONSTANTS.KEY_DIR.RIGHT) {
        match =
          right > currentActiveNodeRect.right &&
          top < currentActiveNodeRect.bottom &&
          bottom > currentActiveNodeRect.top
      } else if (dir === CONSTANTS.KEY_DIR.UP) {
        match =
          top < currentActiveNodeRect.top &&
          left < currentActiveNodeRect.right &&
          right > currentActiveNodeRect.left
      } else if (dir === CONSTANTS.KEY_DIR.DOWN) {
        match =
          bottom > currentActiveNodeRect.bottom &&
          left < currentActiveNodeRect.right &&
          right > currentActiveNodeRect.left
      }
      if (match) {
        checkNodeDis(rect, node)
      }
    })
  }

  //  3.区域算法
  getFocusNodeByAreaAlgorithm({
    currentActiveNode,
    currentActiveNodeRect,
    dir,
    checkNodeDis
  }) {
    // 当前聚焦节点的中心点
    let cX = (currentActiveNodeRect.right + currentActiveNodeRect.left) / 2
    let cY = (currentActiveNodeRect.bottom + currentActiveNodeRect.top) / 2
    bfsWalk(this.mindMap.renderer.root, node => {
      if (node.uid === currentActiveNode.uid) return
      let rect = this.getNodeRect(node)
      let { left, top, right, bottom } = rect
      // 遍历到的节点的中心点
      let ccX = (right + left) / 2
      let ccY = (bottom + top) / 2
      // 节点的中心点坐标和当前聚焦节点的中心点坐标的差值
      let offsetX = ccX - cX
      let offsetY = ccY - cY
      if (offsetX === 0 && offsetY === 0) return
      let match = false
      if (dir === CONSTANTS.KEY_DIR.LEFT) {
        match = offsetX <= 0 && offsetX <= offsetY && offsetX <= -offsetY
      } else if (dir === CONSTANTS.KEY_DIR.RIGHT) {
        match = offsetX > 0 && offsetX >= -offsetY && offsetX >= offsetY
      } else if (dir === CONSTANTS.KEY_DIR.UP) {
        match = offsetY <= 0 && offsetY < offsetX && offsetY < -offsetX
      } else if (dir === CONSTANTS.KEY_DIR.DOWN) {
        match = offsetY > 0 && -offsetY < offsetX && offsetY > offsetX
      }
      if (match) {
        checkNodeDis(rect, node)
      }
    })
  }

  //  获取节点的位置信息
  getNodeRect(node) {
    let { scaleX, scaleY, translateX, translateY } =
      this.mindMap.draw.transform()
    let { left, top, width, height } = node
    return {
      right: (left + width) * scaleX + translateX,
      bottom: (top + height) * scaleY + translateY,
      left: left * scaleX + translateX,
      top: top * scaleY + translateY
    }
  }

  //  获取两个节点的距离
  getDistance(node1Rect, node2Rect) {
    let center1 = this.getCenter(node1Rect)
    let center2 = this.getCenter(node2Rect)
    return Math.sqrt(
      Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2)
    )
  }

  //  获取节点的中心点
  getCenter({ left, right, top, bottom }) {
    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2
    }
  }

  // 插件被移除前做的事情
  beforePluginRemove() {
    this.removeShortcut()
  }

  // 插件被卸载前做的事情
  beforePluginDestroy() {
    this.removeShortcut()
  }
}

KeyboardNavigation.instanceName = 'keyboardNavigation'

export default KeyboardNavigation
