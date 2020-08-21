import {
  createRenderer,
  createHydrationRenderer,
  warn,
  RootRenderFunction,
  CreateAppFunction,
  Renderer,
  HydrationRenderer,
  App,
  RootHydrateFunction
} from '@vue/runtime-core'
import { nodeOps } from './nodeOps' // 【操作dom节点】的一些封装方法
import { patchProp, forcePatchProp } from './patchProp' // 【操作dom元素的property】的封装方法 class style ...
// Importing from the compiler, will be tree-shaken in prod
// 从 shared 引用的一些公用方法， 在prod模式下会做tree-shaking处理，未用到的模块会自动删除减小代码体积
import { isFunction, isString, isHTMLTag, isSVGTag, extend } from '@vue/shared'

declare module '@vue/reactivity' {
  export interface RefUnwrapBailTypes {
    // Note: if updating this, also update `types/refBail.d.ts`.
    runtimeDOMBailTypes: Node | Window
  }
}
// 将操作dom和操作dom属性的方法集合
const rendererOptions = extend({ patchProp, forcePatchProp }, nodeOps)

// lazy create the renderer - this makes core renderer logic tree-shakable
// in case the user only imports reactivity utilities from Vue.
/** renderer是渲染器，包含 render 和 createApp 方法， 用于渲染vnode和生成vue示例
 * 这里做了延时创建，用户只引用了 reactivity（响应式） 模块 的时候，会通过
 * tree-shaking 删除多余代码 
 * 【怎么做的延时创建?】
 */
let renderer: Renderer<Element> | HydrationRenderer

let enabledHydration = false

/**
 * 获取 已有的 renderer 实例，如果没创建则直接创建 【 <Node, Element>是ts中的泛型语法，可以先不管只关注传参就行】
 * createRenderer 返回的是一个包含 render方法和 createApp方法的对象 
 * return {
    render,
    hydrate, // 暂时忽略
    createApp: createAppAPI(render, hydrate)
  } 
  所以 renderer 就是一个 含有 render 和 createApp方法 的对象
 */ 
function ensureRenderer() {
  return renderer || (renderer = createRenderer<Node, Element>(rendererOptions))
}

function ensureHydrationRenderer() {
  renderer = enabledHydration
    ? renderer
    : createHydrationRenderer(rendererOptions)
  enabledHydration = true
  return renderer as HydrationRenderer
}

// use explicit type casts here to avoid import() calls in rolled-up d.ts
export const render = ((...args) => {
  ensureRenderer().render(...args)
}) as RootRenderFunction<Element>

export const hydrate = ((...args) => {
  ensureHydrationRenderer().hydrate(...args)
}) as RootHydrateFunction

// 创建vue实例
export const createApp = ((...args) => {
  // 调用 renderer 对象的 createApp 方法 来创建vue实例对象，该对象继承自App，含有一些vue实例基本的属性和方法，例如 mount 和 use（use比较常用）
  const app = ensureRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }

  const { mount } = app
  /**
   *  重写app的 mount 方法
   *  原因： 不同平台、环境的mount方法是不同的，例如在web浏览器平台，最终渲染的是dom对象，而在小程序或者weex中，就是其他的类型和处理逻辑。
   *        例如这里的mount中就用到了web里才有的 innerHTML ， removeAttribute 等属性和方法
   *        而 app 原有的 mount 方法，是公用的 创建vnode ，渲染vnode的流程
   *        与平台严格相关的业务逻辑就放在这里重写的mount方法里
   * */ 
  app.mount = (containerOrSelector: Element | string): any => {
    // 兼容传进来的类型是 string 或者 dom元素
    const container = normalizeContainer(containerOrSelector)
    if (!container) return
    const component = app._component
    // 如果app中没有render函数或者template模板 ， 则使用 container 的 innerHTML作为模板
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML
    }
    // clear content before mounting
    container.innerHTML = ''
    // 调用app 原有的mount方法（也就是上面说的公用的统一方法），来做 创建vnode 和 渲染vnode 
    // 创建vnode 使用的是 【vnode/createVNode】 方法 ， 渲染vnode 使用的是 【renderer/render】 方法
    const proxy = mount(container)
    container.removeAttribute('v-cloak')
    container.setAttribute('data-v-app', '')
    return proxy
  }

  return app
}) as CreateAppFunction<Element>

export const createSSRApp = ((...args) => {
  const app = ensureHydrationRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }

  const { mount } = app
  app.mount = (containerOrSelector: Element | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (container) {
      return mount(container, true)
    }
  }

  return app
}) as CreateAppFunction<Element>

function injectNativeTagCheck(app: App) {
  // Inject `isNativeTag`
  // this is used for component name validation (dev only)
  Object.defineProperty(app.config, 'isNativeTag', {
    value: (tag: string) => isHTMLTag(tag) || isSVGTag(tag),
    writable: false
  })
}

function normalizeContainer(container: Element | string): Element | null {
  if (isString(container)) {
    const res = document.querySelector(container)
    if (__DEV__ && !res) {
      warn(`Failed to mount app: mount target selector returned null.`)
    }
    return res
  }
  return container
}

// SFC CSS utilities
export { useCssModule } from './helpers/useCssModule'
export { useCssVars } from './helpers/useCssVars'

// DOM-only components
export { Transition, TransitionProps } from './components/Transition'
export {
  TransitionGroup,
  TransitionGroupProps
} from './components/TransitionGroup'

// **Internal** DOM-only runtime directive helpers
export {
  vModelText,
  vModelCheckbox,
  vModelRadio,
  vModelSelect,
  vModelDynamic
} from './directives/vModel'
export { withModifiers, withKeys } from './directives/vOn'
export { vShow } from './directives/vShow'

// re-export everything from core
// h, Component, reactivity API, nextTick, flags & types
export * from '@vue/runtime-core'
