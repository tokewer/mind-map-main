//  布局结构图片映射
export const layoutImgMap = {
  logicalStructure: require('../assets/img/structures/logicalStructure.jpg'),
  logicalStructureLeft: require('../assets/img/structures/logicalStructureLeft.jpg'),
  mindMap: require('../assets/img/structures/mindMap.jpg'),
  organizationStructure: require('../assets/img/structures/organizationStructure.jpg'),
  catalogOrganization: require('../assets/img/structures/catalogOrganization.jpg'),
  timeline: require('../assets/img/structures/timeline.jpg'),
  timeline2: require('../assets/img/structures/timeline2.jpg'),
  fishbone: require('../assets/img/structures/fishbone.jpg'),
  fishbone2: require('../assets/img/structures/fishbone2.jpg'),
  rightFishbone: require('../assets/img/structures/rightFishbone.jpg'),
  rightFishbone2: require('../assets/img/structures/rightFishbone2.jpg'),
  verticalTimeline: require('../assets/img/structures/verticalTimeline.jpg'),
  verticalTimeline2: require('../assets/img/structures/verticalTimeline2.jpg'),
  verticalTimeline3: require('../assets/img/structures/verticalTimeline3.jpg')
}

// 公式列表（按分类组织，供公式侧边栏按类展示 + 搜索）。
// 说明：KaTeX 的 mhchem 扩展未在本项目加载，因此化学式统一用 \mathrm{} 书写，
// 不使用 \ce{}，否则会渲染成红色报错文本。新增公式前后请用 KaTeX 实际渲染校验。
export const formulaGroups = [
  {
    name: '基础与上下标',
    list: [
      'a^2',
      'a_2',
      'a^{2+2}',
      'a_{i,j}',
      'x_2^3',
      'x_{i}^{2}',
      'a^{b^{c}}',
      '{}^{14}_{6}\\mathrm{C}',
      '\\overbrace{1+2+\\cdots+100}',
      '\\underbrace{a+b+\\cdots+z}_{26}'
    ]
  },
  {
    name: '分数与根式',
    list: [
      '\\frac{1}{2}=0.5',
      '\\frac{a}{b}',
      '\\dfrac{a}{b}',
      '\\tfrac{1}{2}',
      '\\cfrac{1}{1+\\cfrac{1}{2}}',
      '\\frac{\\partial f}{\\partial x}',
      '\\sqrt{3}',
      '\\sqrt[n]{3}',
      '\\sqrt{x^2+y^2}'
    ]
  },
  {
    name: '求和 · 连乘 · 极限',
    list: [
      '\\sum_{k=1}^N k^2',
      '\\sum_{i=1}^{n} a_i',
      '\\prod_{i=1}^{n} a_i',
      '\\lim_{n \\to \\infty}x_n',
      '\\lim_{t\\to n}T',
      '\\lim_{x \\to 0}\\frac{\\sin x}{x}=1'
    ]
  },
  {
    name: '积分与微分',
    list: [
      '\\int_{-N}^{N} e^x\\, dx',
      '\\int_{a}^{b} f(x)\\, dx',
      '\\iint_D f(x,y)\\,dx\\,dy',
      '\\oint_C \\vec{F}\\cdot d\\vec{r}',
      '\\frac{d}{dx}f(x)',
      "f'(x)=\\lim_{h \\to 0}\\frac{f(x+h)-f(x)}{h}",
      '\\nabla \\cdot \\vec{E}',
      '\\dot{x}',
      '\\ddot{x}'
    ]
  },
  {
    name: '希腊字母',
    list: [
      '\\alpha',
      '\\beta',
      '\\gamma',
      '\\delta',
      '\\epsilon',
      '\\varepsilon',
      '\\theta',
      '\\lambda',
      '\\mu',
      '\\pi',
      '\\rho',
      '\\sigma',
      '\\tau',
      '\\phi',
      '\\varphi',
      '\\omega',
      '\\Delta',
      '\\Sigma',
      '\\Gamma',
      '\\Theta',
      '\\Lambda',
      '\\Phi',
      '\\Psi',
      '\\Omega'
    ]
  },
  {
    name: '三角 · 对数 · 指数',
    list: [
      '\\sin\\theta',
      '\\cos\\theta',
      '\\tan\\theta',
      '\\arcsin x',
      '\\sin^2\\theta+\\cos^2\\theta=1',
      '\\log X',
      '\\log_{10}',
      '\\log_\\alpha X',
      '\\ln x',
      'e^{i\\pi}+1=0',
      'e^{x}=\\sum_{n=0}^{\\infty}\\frac{x^n}{n!}'
    ]
  },
  {
    name: '关系与运算符',
    list: [
      '\\pm',
      '\\mp',
      '\\times',
      '\\div',
      '\\cdot',
      '\\ast',
      '\\leq',
      '\\geq',
      '\\neq',
      '\\approx',
      '\\equiv',
      '\\propto',
      '\\sim',
      '\\infty',
      '\\partial',
      '\\forall',
      '\\exists',
      '\\because',
      '\\therefore'
    ]
  },
  {
    name: '集合与数系',
    list: [
      'x \\in A',
      'x \\notin A',
      'A \\subset B',
      'A \\subseteq B',
      'A \\cup B',
      'A \\cap B',
      '\\emptyset',
      'A \\setminus B',
      '\\mathbb{R}',
      '\\mathbb{N}',
      '\\mathbb{Z}',
      '\\mathbb{Q}',
      '\\mathbb{C}'
    ]
  },
  {
    name: '箭头',
    list: [
      '\\to',
      '\\rightarrow',
      '\\leftarrow',
      '\\leftrightarrow',
      '\\Rightarrow',
      '\\Leftarrow',
      '\\Leftrightarrow',
      '\\uparrow',
      '\\downarrow',
      '\\mapsto',
      '\\longrightarrow',
      'f\\colon A \\to B'
    ]
  },
  {
    name: '括号 · 取模 · 标注',
    list: [
      '\\left( \\frac{a}{b} \\right)',
      '\\left[ \\frac{a}{b} \\right]',
      '\\left\\{ \\frac{a}{b} \\right\\}',
      '\\left| x \\right|',
      '\\langle x, y \\rangle',
      '\\lfloor x \\rfloor',
      '\\lceil x \\rceil',
      '\\binom{n}{k}',
      '\\overline{AB}',
      '\\underline{x}',
      '\\vec{a}',
      '\\hat{a}',
      '\\tilde{a}',
      '\\bar{x}',
      '\\dot{a}'
    ]
  },
  {
    name: '矩阵与行列式',
    list: [
      '\\begin{matrix}x & y \\\\z & v\\end{matrix}',
      '\\begin{pmatrix}a & b \\\\c & d\\end{pmatrix}',
      '\\begin{bmatrix}a & b \\\\c & d\\end{bmatrix}',
      '\\begin{vmatrix}a & b \\\\c & d\\end{vmatrix}',
      '\\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}',
      '\\begin{array}{c|c} a & b \\\\ \\hline c & d \\end{array}',
      '\\mathbf{A}\\vec{x}=\\lambda\\vec{x}'
    ]
  },
  {
    name: '分段函数与方程组',
    list: [
      '\\begin{cases}3x + 5y +  z \\\\7x - 2y + 4z \\\\-6x + 3y + 2z\\end{cases}',
      'f(x)=\\begin{cases} x^2 & x>0 \\\\ -x & x\\leq 0 \\end{cases}',
      '\\begin{cases} x + y = 1 \\\\ x - y = 3 \\end{cases}',
      '\\begin{aligned} a &= b + c \\\\ d &= e + f \\end{aligned}',
      '\\left|\\begin{array}{ccc} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{array}\\right|'
    ]
  },
  {
    name: '物理常用',
    list: [
      '\\vec{F} = m\\vec{a}',
      'E = mc^2',
      'v = \\frac{\\Delta s}{\\Delta t}',
      'P = \\frac{F}{S}',
      'W = Fs\\cos\\theta',
      '\\frac{1}{2}mv^2',
      'F = G\\frac{m_1 m_2}{r^2}',
      'U = IR',
      '\\lambda = \\frac{v}{f}',
      '\\rho = \\frac{m}{V}'
    ]
  },
  {
    name: '化学常用',
    list: [
      '\\mathrm{H_2O}',
      '\\mathrm{CO_2}',
      '\\mathrm{CO_2 + H_2O \\rightarrow H_2CO_3}',
      '\\mathrm{2H_2 + O_2} \\xrightarrow{\\text{点燃}} \\mathrm{2H_2O}',
      '\\mathrm{SO_4^{2-}}',
      '\\mathrm{Fe^{3+}}',
      '\\mathrm{NH_4^+}',
      '\\mathrm{CH_3COOH \\rightleftharpoons CH_3COO^- + H^+}',
      '\\mathrm{CaCO_3} \\xrightarrow{\\text{高温}} \\mathrm{CaO + CO_2\\uparrow}',
      '\\mathrm{2Al + 6HCl \\rightarrow 2AlCl_3 + 3H_2\\uparrow}'
    ]
  },
  {
    name: '文本与空格',
    list: [
      '\\text{文字}',
      'x\\ \\text{和}\\ y',
      'a \\quad b',
      'a \\qquad b',
      '\\text{当 } x > 0 \\text{ 时}'
    ]
  }
]

// 扁平公式列表：按分类展开后的全部公式（供统计/校验/其他调用方使用）
export const formulaList = formulaGroups.reduce((acc, group) => acc.concat(group.list), [])

// 支持某种连线类型的结构
export const supportLineStyleLayoutsMap = {
  curve: [
    'logicalStructure',
    'logicalStructureLeft',
    'mindMap',
    'verticalTimeline',
    'organizationStructure'
  ],
  direct: [
    'logicalStructure',
    'logicalStructureLeft',
    'mindMap',
    'organizationStructure',
    'verticalTimeline'
  ]
}

// 直线模式支持设置圆角的结构
export const supportLineRadiusLayouts = [
  'logicalStructure',
  'logicalStructureLeft',
  'mindMap',
  'verticalTimeline'
]

// 支持只显示底边直线风格的结构
export const supportNodeUseLineStyleLayouts = [
  'logicalStructure',
  'logicalStructureLeft',
  'mindMap',
  'catalogOrganization',
  'organizationStructure'
]

// 支持曲线模式下，根节点样式和其他节点样式保持一致的结构
export const supportRootLineKeepSameInCurveLayouts = [
  'logicalStructure',
  'logicalStructureLeft',
  'mindMap',
  'organizationStructure'
]

// 彩虹线条配置
export const rainbowLinesOptions = [
  {
    value: 'close'
  },
  {
    value: 'colors1',
    list: [
      'rgb(255, 213, 73)',
      'rgb(255, 136, 126)',
      'rgb(107, 225, 141)',
      'rgb(151, 171, 255)',
      'rgb(129, 220, 242)',
      'rgb(255, 163, 125)',
      'rgb(152, 132, 234)'
    ]
  },
  {
    value: 'colors2',
    list: [
      'rgb(248, 93, 93)',
      'rgb(255, 151, 84)',
      'rgb(255, 214, 69)',
      'rgb(73, 205, 140)',
      'rgb(64, 192, 255)',
      'rgb(84, 110, 214)',
      'rgb(164, 93, 220)'
    ]
  },
  {
    value: 'colors3',
    list: [
      'rgb(140, 240, 231)',
      'rgb(74, 210, 255)',
      'rgb(65, 168, 243)',
      'rgb(49, 128, 205)',
      'rgb(188, 226, 132)',
      'rgb(113, 215, 123)',
      'rgb(120, 191, 109)'
    ]
  },
  {
    value: 'colors4',
    list: [
      'rgb(169, 98, 99)',
      'rgb(245, 125, 123)',
      'rgb(254, 183, 168)',
      'rgb(251, 218, 171)',
      'rgb(138, 163, 181)',
      'rgb(131, 127, 161)',
      'rgb(84, 83, 140)'
    ]
  },
  {
    value: 'colors5',
    list: [
      'rgb(255, 229, 142)',
      'rgb(254, 158, 41)',
      'rgb(248, 119, 44)',
      'rgb(232, 82, 80)',
      'rgb(182, 66, 98)',
      'rgb(99, 54, 99)',
      'rgb(65, 40, 82)'
    ]
  },
  {
    value: 'colors6',
    list: [
      'rgb(171, 227, 209)',
      'rgb(107, 201, 196)',
      'rgb(55, 170, 169)',
      'rgb(18, 135, 131)',
      'rgb(74, 139, 166)',
      'rgb(75, 105, 150)',
      'rgb(57, 75, 133)'
    ]
  }
]
