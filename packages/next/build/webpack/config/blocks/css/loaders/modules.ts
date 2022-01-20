import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { ConfigurationContext } from '../../../utils'
import { getClientStyleLoader } from './client'
import { cssFileResolve } from './file-resolve'
import { getCssModuleLocalIdent } from './getCssModuleLocalIdent'

export function getCssModuleRuleActions(
  ctx: ConfigurationContext,
  postcss: any,
  preProcessors: readonly webpack5.RuleSetUseItem[] = []
): Partial<webpack5.RuleSetRule> {
  let type: webpack5.RuleSetRule['type'] = undefined
  const loaders: webpack5.RuleSetUseItem[] = []

  if (ctx.experimental.webpackCss) {
    type = 'css/module'
  } else {
    type = 'javascript/auto'
    if (ctx.isClient) {
      // Add appropriate development more or production mode style
      // loader
      loaders.push(
        getClientStyleLoader({
          isDevelopment: ctx.isDevelopment,
          assetPrefix: ctx.assetPrefix,
        })
      )
    }

    // Resolve CSS `@import`s and `url()`s
    loaders.push({
      loader: require.resolve('../../../../loaders/css-loader/src'),
      options: {
        postcss,
        importLoaders: 1 + preProcessors.length,
        // Use CJS mode for backwards compatibility:
        esModule: false,
        url: (url: string, resourcePath: string) =>
          cssFileResolve(url, resourcePath, ctx.experimental.urlImports),
        import: (url: string, _: any, resourcePath: string) =>
          cssFileResolve(url, resourcePath, ctx.experimental.urlImports),
        modules: {
          // Do not transform class names (CJS mode backwards compatibility):
          exportLocalsConvention: 'asIs',
          // Server-side (Node.js) rendering support:
          exportOnlyLocals: ctx.isServer,
          // Disallow global style exports so we can code-split CSS and
          // not worry about loading order.
          mode: 'pure',
          // Generate a friendly production-ready name so it's
          // reasonably understandable. The same name is used for
          // development.
          // TODO: Consider making production reduce this to a single
          // character?
          getLocalIdent: getCssModuleLocalIdent,
        },
      },
    })
  }

  // Compile CSS
  loaders.push({
    loader: require.resolve('../../../../loaders/postcss-loader/src'),
    options: {
      postcss,
    },
  })

  loaders.push(
    // Webpack loaders run like a stack, so we need to reverse the natural
    // order of preprocessors.
    ...preProcessors.slice().reverse()
  )

  return {
    type,
    use: loaders,
  }
}
