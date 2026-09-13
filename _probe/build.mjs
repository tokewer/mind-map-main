// 用 esbuild 把真实源码（api/index.js、directoryStorage.js、store.js、Edit.vue 等）
// 打包成可在 Node 中运行的探针 bundle，只替换浏览器 API 与第三方 UI。
import { build } from '../web/node_modules/esbuild/lib/main.js'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const webSrc = path.resolve(here, '../web/src')
const stub = name => path.join(here, 'stubs', name)

const EXACT = {
  vue: stub('vue.mjs'),
  vuex: stub('vuex.mjs'),
  'element-ui': stub('element-ui.mjs'),
  'simple-mind-map': stub('mindmap.mjs'),
  'simple-mind-map/src/utils/index': stub('smm-utils.mjs'),
  'simple-mind-map/example/exampleData': stub('example.mjs'),
  'simple-mind-map-plugin-themes': stub('theme-plugin.mjs'),
  '@/config/icon': stub('icon.mjs'),
  '@/utils/handleClipboardText': stub('misc.mjs'),
  '@/utils': stub('misc.mjs'),
  '@/api/directoryStorage': path.join(webSrc, 'api/directoryStorage.js'),
  '@/api': path.join(webSrc, 'api/index.js')
}

const PATTERNS = [
  [/^simple-mind-map\/src\/plugins\//, () => stub('misc.mjs')],
  [/directoryIndexedDB$/, () => stub('idb.mjs')],
  [/@\/api\/directoryIndexedDB$/, () => stub('idb.mjs')]
]

// 除 Edit.vue / FileBar.vue 外，其它 .vue 组件一律用桩替换
const KEEP_VUE = ['Edit.vue', 'FileBar.vue', 'HistoryDialog.vue', 'ReviewFloat.vue', 'Toolbar.vue']

const vuePlugin = {
  name: 'probe-vue',
  setup(b) {
    // 抽取 <script> 内容作为模块，支持 import 与 export default
    b.onLoad({ filter: /\.vue$/ }, async args => {
      const src = await fs.promises.readFile(args.path, 'utf8')
      const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(src)
      if (!m) return { contents: 'export default {}', loader: 'js' }
      let code = m[1]
      // 模板里用到的 require('...svg') 等保持原样交给 loader 处理
      return { contents: code, loader: 'js', resolveDir: path.dirname(args.path) }
    })
  }
}

const aliasPlugin = {
  name: 'probe-alias',
  setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      const p = args.path
      if (EXACT[p]) return { path: EXACT[p] }
      for (const [re, get] of PATTERNS) {
        if (re.test(p)) return { path: get() }
      }
      if (p.endsWith('.vue')) {
        const base = p.split('/').pop()
        if (!KEEP_VUE.includes(base)) return { path: stub('empty-vue.mjs') }
      }
      // 兜底解析 @/ 别名到 web/src，并补全扩展名 / 目录 index.js
      if (p.startsWith('@/')) {
        const base = path.join(webSrc, p.slice(2))
        const cands = [base, base + '.js', base + '.vue', path.join(base, 'index.js')]
        for (const cand of cands) {
          if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return { path: cand }
        }
        return { path: base }
      }
      if (p.endsWith('.svg') || p.endsWith('.png') || p.endsWith('.less') || p.endsWith('.css')) {
        return { path: stub('misc.mjs') }
      }
      return null
    })
  }
}

const out = path.join(here, 'bundle.mjs')

await build({
  entryPoints: [path.join(here, 'entry.js')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'warning',
  loader: { '.jpg': 'dataurl' },
  plugins: [vuePlugin, aliasPlugin],
  banner: { js: '/* 自动生成的探针 bundle，勿手改 */' }
})
console.log('bundle 已生成 ->', out)
