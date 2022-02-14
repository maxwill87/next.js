/* eslint-env jest */
/* global browserName */
import cheerio from 'cheerio'
import fs, { existsSync } from 'fs-extra'
import globOriginal from 'glob'
import {
  renderViaHTTP,
  waitFor,
  getPageFileFromPagesManifest,
  check,
  nextBuild,
  nextStart,
  findPort,
  killApp,
  fetchViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import {
  BUILD_MANIFEST,
  PAGES_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from 'next/constants'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join, sep } from 'path'
import dynamicImportTests from './dynamic'
import processEnv from './process-env'
import security from './security'
import { promisify } from 'util'

const glob = promisify(globOriginal)

const appDir = join(__dirname, '../')
let appPort
let app

const context = {}

describe('Production Usage', () => {
  let output = ''
  beforeAll(async () => {
    let opts = {
      stderr: true,
      stdout: true,
    }
    if (process.env.TEST_WASM) {
      opts.env = {
        NODE_OPTIONS: '--no-addons',
      }
    }
    await fs.remove(join(appDir, '.next', 'cache', 'images'))
    const result = await nextBuild(appDir, undefined, opts)

    appPort = await findPort()
    context.appPort = appPort
    app = await nextStart(appDir, appPort)
    output = (result.stderr || '') + (result.stdout || '')
    console.log(output)

    if (result.code !== 0) {
      throw new Error(`Failed to build, exited with code ${result.code}`)
    }
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should not show target deprecation warning', () => {
    expect(output).not.toContain(
      'The `target` config is deprecated and will be removed in a future version'
    )
  })

  it('should contain generated page count in output', async () => {
    const pageCount = 40
    expect(output).toContain(`Generating static pages (0/${pageCount})`)
    expect(output).toContain(
      `Generating static pages (${pageCount}/${pageCount})`
    )
    // we should only have 4 segments and the initial message logged out
    expect(output.match(/Generating static pages/g).length).toBe(5)
  })

  it('should output traces', async () => {
    const serverTrace = await fs.readJSON(
      join(appDir, '.next/next-server.js.nft.json')
    )

    expect(serverTrace.version).toBe(1)
    expect(
      serverTrace.files.some((file) =>
        file.includes('next/dist/server/send-payload.js')
      )
    ).toBe(true)
    expect(
      serverTrace.files.some((file) =>
        file.includes('next/dist/server/normalize-page-path.js')
      )
    ).toBe(true)
    expect(
      serverTrace.files.some((file) =>
        file.includes('next/dist/server/render.js')
      )
    ).toBe(true)
    expect(
      serverTrace.files.some((file) =>
        file.includes('next/dist/server/load-components.js')
      )
    ).toBe(true)

    if (process.platform !== 'win32') {
      expect(
        serverTrace.files.some((file) =>
          file.includes('next/dist/compiled/webpack/bundle5.js')
        )
      ).toBe(false)
      expect(
        serverTrace.files.some((file) => file.includes('node_modules/sharp'))
      ).toBe(false)
    }

    const checks = [
      {
        page: '/_app',
        tests: [
          /webpack-runtime\.js/,
          /node_modules\/react\/index\.js/,
          /node_modules\/react\/package\.json/,
          /node_modules\/react\/cjs\/react\.production\.min\.js/,
        ],
        notTests: [/\0/, /\?/, /!/],
      },
      {
        page: '/client-error',
        tests: [
          /webpack-runtime\.js/,
          /chunks\/.*?\.js/,
          /node_modules\/react\/index\.js/,
          /node_modules\/react\/package\.json/,
          /node_modules\/react\/cjs\/react\.production\.min\.js/,
          /node_modules\/next/,
          /next\/link\.js/,
          /next\/dist\/shared\/lib\/router\/utils\/resolve-rewrites\.js/,
          /next\/error\.js/,
        ],
        notTests: [/\0/, /\?/, /!/],
      },
      {
        page: '/dynamic',
        tests: [
          /webpack-runtime\.js/,
          /chunks\/.*?\.js/,
          /node_modules\/react\/index\.js/,
          /node_modules\/react\/package\.json/,
          /node_modules\/react\/cjs\/react\.production\.min\.js/,
          /node_modules\/next/,
          /next\/link\.js/,
          /next\/dist\/shared\/lib\/router\/utils\/resolve-rewrites\.js/,
        ],
        notTests: [/\0/, /\?/, /!/],
      },
      {
        page: '/index',
        tests: [
          /webpack-runtime\.js/,
          /chunks\/.*?\.js/,
          /node_modules\/react\/index\.js/,
          /node_modules\/react\/package\.json/,
          /node_modules\/react\/cjs\/react\.production\.min\.js/,
          /node_modules\/next/,
          /next\/link\.js/,
          /next\/dist\/shared\/lib\/router\/utils\/resolve-rewrites\.js/,
          /node_modules\/nanoid\/index\.js/,
          /node_modules\/nanoid\/url-alphabet\/index\.js/,
          /node_modules\/es5-ext\/array\/#\/clear\.js/,
        ],
        notTests: [
          /next\/dist\/pages\/_error\.js/,
          /next\/error\.js/,
          /\0/,
          /\?/,
          /!/,
        ],
      },
      {
        page: '/counter',
        tests: [
          /webpack-runtime\.js/,
          /chunks\/.*?\.js/,
          /node_modules\/react\/index\.js/,
          /node_modules\/react\/package\.json/,
          /node_modules\/react\/cjs\/react\.production\.min\.js/,
          /node_modules\/react\/cjs\/react\.development\.js/,
          /node_modules\/next/,
          /next\/router\.js/,
          /next\/dist\/shared\/lib\/router\/utils\/resolve-rewrites\.js/,
        ],
        notTests: [/\0/, /\?/, /!/],
      },
      {
        page: '/next-import',
        tests: [
          /webpack-runtime\.js/,
          /chunks\/.*?\.js/,
          /node_modules\/react\/index\.js/,
          /node_modules\/react\/package\.json/,
          /node_modules\/react\/cjs\/react\.production\.min\.js/,
          /node_modules\/next/,
          /next\/link\.js/,
          /next\/dist\/shared\/lib\/router\/utils\/resolve-rewrites\.js/,
        ],
        notTests: [
          /next\/dist\/server\/next\.js/,
          /next\/dist\/bin/,
          /\0/,
          /\?/,
          /!/,
        ],
      },
    ]

    for (const check of checks) {
      const contents = await fs.readFile(
        join(appDir, '.next/server/pages/', check.page + '.js.nft.json'),
        'utf8'
      )
      const { version, files } = JSON.parse(contents)
      expect(version).toBe(1)
      expect([...new Set(files)].length).toBe(files.length)

      expect(
        check.tests.every((item) => {
          if (files.some((file) => item.test(file))) {
            return true
          }
          console.error(`Failed to find ${item} in`, files)
          return false
        })
      ).toBe(true)

      if (sep === '/') {
        expect(
          check.notTests.some((item) => {
            if (files.some((file) => item.test(file))) {
              console.error(`Found unexpected ${item} in`, files)
              return true
            }
            return false
          })
        ).toBe(false)
      }
    }
  })

  it('should not contain currentScript usage for publicPath', async () => {
    const globResult = await glob('webpack-*.js', {
      cwd: join(appDir, '.next/static/chunks'),
    })

    if (!globResult || globResult.length !== 1) {
      throw new Error('could not find webpack-hash.js chunk')
    }

    const content = await fs.readFile(
      join(appDir, '.next/static/chunks', globResult[0]),
      'utf8'
    )

    expect(content).not.toContain('.currentScript')
  })

  describe('With basic usage', () => {
    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)
    })

    if (browserName === 'internet explorer') {
      it('should handle bad Promise polyfill', async () => {
        const browser = await webdriver(appPort, '/bad-promise')
        expect(await browser.eval('window.didRender')).toBe(true)
      })

      it('should polyfill RegExp successfully', async () => {
        const browser = await webdriver(appPort, '/regexp-polyfill')
        expect(await browser.eval('window.didRender')).toBe(true)
        // wait a second for the script to be loaded
        await waitFor(1000)

        expect(await browser.eval('window.isSticky')).toBe(true)
        expect(await browser.eval('window.isMatch1')).toBe(true)
        expect(await browser.eval('window.isMatch2')).toBe(false)
      })
    }

    it('should polyfill Node.js modules', async () => {
      const browser = await webdriver(appPort, '/node-browser-polyfills')
      await browser.waitForCondition('window.didRender')

      const data = await browser
        .waitForElementByCss('#node-browser-polyfills')
        .text()
      const parsedData = JSON.parse(data)

      expect(parsedData.vm).toBe(105)
      expect(parsedData.hash).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
      )
      expect(parsedData.path).toBe('/hello/world/test.txt')
      expect(parsedData.buffer).toBe('hello world')
      expect(parsedData.stream).toBe(true)
    })

    it('should allow etag header support', async () => {
      const url = `http://localhost:${appPort}`
      const etag = (await fetchViaHTTP(url, '/')).headers.get('ETag')

      const headers = { 'If-None-Match': etag }
      const res2 = await fetchViaHTTP(url, '/', undefined, { headers })
      expect(res2.status).toBe(304)
    })

    it('should allow etag header support with getStaticProps', async () => {
      const url = `http://localhost:${appPort}`
      const etag = (await fetchViaHTTP(url, '/fully-static')).headers.get(
        'ETag'
      )

      const headers = { 'If-None-Match': etag }
      const res2 = await fetchViaHTTP(url, '/fully-static', undefined, {
        headers,
      })
      expect(res2.status).toBe(304)
    })

    it('should allow etag header support with getServerSideProps', async () => {
      const url = `http://localhost:${appPort}`
      const etag = (await fetchViaHTTP(url, '/fully-dynamic')).headers.get(
        'ETag'
      )

      const headers = { 'If-None-Match': etag }
      const res2 = await fetchViaHTTP(url, '/fully-dynamic', undefined, {
        headers,
      })
      expect(res2.status).toBe(304)
    })

    it('should have X-Powered-By header support', async () => {
      const url = `http://localhost:${appPort}`
      const header = (await fetchViaHTTP(url, '/')).headers.get('X-Powered-By')

      expect(header).toBe('Next.js')
    })

    it('should render 404 for routes that do not exist', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, '/abcdefghijklmno')
      const text = await res.text()
      const $html = cheerio.load(text)
      expect($html('html').text()).toMatch(/404/)
      expect(text).toMatch(/"statusCode":404/)
      expect(res.status).toBe(404)
    })

    it('should render 404 for /_next/static route', async () => {
      const html = await renderViaHTTP(appPort, '/_next/static')
      expect(html).toMatch(/This page could not be found/)
    })

    it('should render 200 for POST on page', async () => {
      const res = await fetchViaHTTP(
        `http://localhost:${appPort}`,
        '/about',
        undefined,
        {
          method: 'POST',
        }
      )
      expect(res.status).toBe(200)
    })

    it('should render 404 for POST on missing page', async () => {
      const res = await fetchViaHTTP(
        `http://localhost:${appPort}`,
        '/fake-page',
        undefined,
        {
          method: 'POST',
        }
      )
      expect(res.status).toBe(404)
    })

    it('should render 404 for _next routes that do not exist', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, '/_next/abcdef')
      expect(res.status).toBe(404)
    })

    it('should render 404 even if the HTTP method is not GET or HEAD', async () => {
      const url = `http://localhost:${appPort}`
      const methods = ['POST', 'PUT', 'DELETE']
      for (const method of methods) {
        const res = await fetchViaHTTP(url, '/_next/abcdef', undefined, {
          method,
        })
        expect(res.status).toBe(404)
      }
    })

    it('should render 404 for dotfiles in /static', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, '/static/.env')
      expect(res.status).toBe(404)
    })

    it('should return 405 method on static then GET and HEAD', async () => {
      const res = await fetchViaHTTP(
        `http://localhost:${appPort}`,
        '/static/data/item.txt',
        undefined,
        {
          method: 'POST',
        }
      )
      expect(res.headers.get('allow').includes('GET')).toBe(true)
      expect(res.status).toBe(405)
    })

    it('should return 412 on static file when If-Unmodified-Since is provided and file is modified', async () => {
      const buildManifest = require(join(
        __dirname,
        '../.next/build-manifest.json'
      ))

      const files = buildManifest.pages['/']

      for (const file of files) {
        const res = await fetchViaHTTP(
          `http://localhost:${appPort}`,
          `/_next/${file}`,
          undefined,
          {
            method: 'GET',
            headers: { 'if-unmodified-since': 'Fri, 12 Jul 2019 20:00:13 GMT' },
          }
        )
        expect(res.status).toBe(412)
      }
    })

    it('should return 200 on static file if If-Unmodified-Since is invalid date', async () => {
      const buildManifest = require(join(
        __dirname,
        '../.next/build-manifest.json'
      ))

      const files = buildManifest.pages['/']

      for (const file of files) {
        const res = await fetchViaHTTP(
          `http://localhost:${appPort}`,
          `/_next/${file}`,
          undefined,
          {
            method: 'GET',
            headers: { 'if-unmodified-since': 'nextjs' },
          }
        )
        expect(res.status).toBe(200)
      }
    })

    it('should set Content-Length header', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, '/')
      expect(res.headers.get('Content-Length')).toBeDefined()
    })

    it('should set Cache-Control header', async () => {
      const buildManifest = require(join('../.next', BUILD_MANIFEST))
      const reactLoadableManifest = require(join(
        '../.next',
        REACT_LOADABLE_MANIFEST
      ))
      const url = `http://localhost:${appPort}`

      const resources = new Set()

      const manifestKey = Object.keys(reactLoadableManifest).find((item) => {
        return item
          .replace(/\\/g, '/')
          .endsWith('dynamic/css.js -> ../../components/dynamic-css/with-css')
      })

      // test dynamic chunk
      reactLoadableManifest[manifestKey].files.forEach((f) => {
        resources.add('/' + f)
      })

      // test main.js runtime etc
      for (const item of buildManifest.pages['/']) {
        resources.add('/' + item)
      }

      const cssStaticAssets = await recursiveReadDir(
        join(__dirname, '..', '.next', 'static'),
        /\.css$/
      )
      expect(cssStaticAssets.length).toBeGreaterThanOrEqual(1)
      expect(cssStaticAssets[0]).toMatch(/[\\/]css[\\/]/)
      const mediaStaticAssets = await recursiveReadDir(
        join(__dirname, '..', '.next', 'static'),
        /\.svg$/
      )
      expect(mediaStaticAssets.length).toBeGreaterThanOrEqual(1)
      expect(mediaStaticAssets[0]).toMatch(/[\\/]media[\\/]/)
      ;[...cssStaticAssets, ...mediaStaticAssets].forEach((asset) => {
        resources.add(`/static${asset.replace(/\\+/g, '/')}`)
      })

      const responses = await Promise.all(
        [...resources].map((resource) =>
          fetchViaHTTP(url, join('/_next', resource))
        )
      )

      responses.forEach((res) => {
        try {
          expect(res.headers.get('Cache-Control')).toBe(
            'public, max-age=31536000, immutable'
          )
        } catch (err) {
          err.message = res.url + ' ' + err.message
          throw err
        }
      })
    })

    it('should set correct Cache-Control header for static 404s', async () => {
      // this is to fix where 404 headers are set to 'public, max-age=31536000, immutable'
      const res = await fetchViaHTTP(
        `http://localhost:${appPort}`,
        `/_next//static/common/bad-static.js`
      )

      expect(res.status).toBe(404)
      expect(res.headers.get('Cache-Control')).toBe(
        'no-cache, no-store, max-age=0, must-revalidate'
      )
    })

    it('should block special pages', async () => {
      const urls = ['/_document', '/_app']
      for (const url of urls) {
        const html = await renderViaHTTP(appPort, url)
        expect(html).toMatch(/404/)
      }
    })

    it('should not contain customServer in NEXT_DATA', async () => {
      const html = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(html)
      expect('customServer' in JSON.parse($('#__NEXT_DATA__').text())).toBe(
        false
      )
    })
  })

  describe('API routes', () => {
    it('should work with pages/api/index.js', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, `/api`)
      const body = await res.text()
      expect(body).toEqual('API index works')
    })

    it('should work with pages/api/hello.js', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, `/api/hello`)
      const body = await res.text()
      expect(body).toEqual('API hello works')
    })

    it('should work with dynamic params and search string', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetchViaHTTP(url, `/api/post-1?val=1`)
      const body = await res.json()

      expect(body).toEqual({ val: '1', post: 'post-1' })
    })
  })

  describe('With navigation', () => {
    it('should navigate via client side', async () => {
      const browser = await webdriver(appPort, '/')
      const text = await browser
        .elementByCss('a')
        .click()
        .waitForElementByCss('.about-page')
        .elementByCss('div')
        .text()

      expect(text).toBe('About Page')
      await browser.close()
    })

    it('should navigate to nested index via client side', async () => {
      const browser = await webdriver(appPort, '/another')
      await browser.eval('window.beforeNav = 1')

      const text = await browser
        .elementByCss('a')
        .click()
        .waitForElementByCss('.index-page')
        .elementByCss('p')
        .text()

      expect(text).toBe('Hello World')
      expect(await browser.eval('window.beforeNav')).toBe(1)
      await browser.close()
    })

    it('should set title by routeChangeComplete event', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.eval(function setup() {
        window.next.router.events.on(
          'routeChangeComplete',
          function handler(url) {
            window.routeChangeTitle = document.title
            window.routeChangeUrl = url
          }
        )
        window.next.router.push('/with-title')
      })
      await browser.waitForElementByCss('#with-title')

      const title = await browser.eval(`window.routeChangeTitle`)
      const url = await browser.eval(`window.routeChangeUrl`)
      expect(title).toBe('hello from title')
      expect(url).toBe('/with-title')
    })

    it('should reload page successfully (on bad link)', async () => {
      const browser = await webdriver(appPort, '/to-nonexistent')
      await browser.eval(function setup() {
        window.__DATA_BE_GONE = 'true'
      })
      await browser.waitForElementByCss('#to-nonexistent-page')
      await browser.click('#to-nonexistent-page')
      await browser.waitForElementByCss('.about-page')

      const oldData = await browser.eval(`window.__DATA_BE_GONE`)
      expect(oldData).toBeFalsy()
    })

    it('should reload page successfully (on bad data fetch)', async () => {
      const browser = await webdriver(appPort, '/to-shadowed-page')
      await browser.eval(function setup() {
        window.__DATA_BE_GONE = 'true'
      })
      await browser.waitForElementByCss('#to-shadowed-page').click()
      await browser.waitForElementByCss('.about-page')

      const oldData = await browser.eval(`window.__DATA_BE_GONE`)
      expect(oldData).toBeFalsy()
    })
  })

  it('should navigate to external site and back', async () => {
    const browser = await webdriver(appPort, '/external-and-back')
    const initialText = await browser.elementByCss('p').text()
    expect(initialText).toBe('server')

    await browser
      .elementByCss('a')
      .click()
      .waitForElementByCss('input')
      .back()
      .waitForElementByCss('p')

    await waitFor(1000)
    const newText = await browser.elementByCss('p').text()
    expect(newText).toBe('server')
  })

  it('should navigate to page with CSS and back', async () => {
    const browser = await webdriver(appPort, '/css-and-back')
    const initialText = await browser.elementByCss('p').text()
    expect(initialText).toBe('server')

    await browser
      .elementByCss('a')
      .click()
      .waitForElementByCss('input')
      .back()
      .waitForElementByCss('p')

    await waitFor(1000)
    const newText = await browser.elementByCss('p').text()
    expect(newText).toBe('client')
  })

  it('should navigate to external site and back (with query)', async () => {
    const browser = await webdriver(appPort, '/external-and-back?hello=world')
    const initialText = await browser.elementByCss('p').text()
    expect(initialText).toBe('server')

    await browser
      .elementByCss('a')
      .click()
      .waitForElementByCss('input')
      .back()
      .waitForElementByCss('p')

    await waitFor(1000)
    const newText = await browser.elementByCss('p').text()
    expect(newText).toBe('server')
  })

  it('should change query correctly', async () => {
    const browser = await webdriver(appPort, '/query?id=0')
    let id = await browser.elementByCss('#q0').text()
    expect(id).toBe('0')

    await browser.elementByCss('#first').click().waitForElementByCss('#q1')

    id = await browser.elementByCss('#q1').text()
    expect(id).toBe('1')

    await browser.elementByCss('#second').click().waitForElementByCss('#q2')

    id = await browser.elementByCss('#q2').text()
    expect(id).toBe('2')
  })

  describe('Runtime errors', () => {
    it('should render a server side error on the client side', async () => {
      const browser = await webdriver(appPort, '/error-in-ssr-render')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      // this makes sure we don't leak the actual error to the client side in production
      expect(text).toMatch(/Internal Server Error\./)
      const headingText = await browser.elementByCss('h1').text()
      // This makes sure we render statusCode on the client side correctly
      expect(headingText).toBe('500')
      await browser.close()
    })

    it('should render a client side component error', async () => {
      const browser = await webdriver(appPort, '/error-in-browser-render')
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(
        /Application error: a client-side exception has occurred/
      )
      await browser.close()
    })

    it('should call getInitialProps on _error page during a client side component error', async () => {
      const browser = await webdriver(
        appPort,
        '/error-in-browser-render-status-code'
      )
      await waitFor(2000)
      const text = await browser.elementByCss('body').text()
      expect(text).toMatch(/This page could not be found\./)
      await browser.close()
    })
  })

  describe('Misc', () => {
    it('should handle already finished responses', async () => {
      const html = await renderViaHTTP(appPort, '/finish-response')
      expect(html).toBe('hi')
    })

    it('should allow to access /static/ and /_next/', async () => {
      // This is a test case which prevent the following issue happening again.
      // See: https://github.com/vercel/next.js/issues/2617
      await renderViaHTTP(appPort, '/_next/')
      await renderViaHTTP(appPort, '/static/')
      const data = await renderViaHTTP(appPort, '/static/data/item.txt')
      expect(data).toBe('item')
    })

    it('Should allow access to public files', async () => {
      const data = await renderViaHTTP(appPort, '/data/data.txt')
      const file = await renderViaHTTP(appPort, '/file')
      const legacy = await renderViaHTTP(appPort, '/static/legacy.txt')
      expect(data).toBe('data')
      expect(file).toBe('test')
      expect(legacy).toMatch(`new static folder`)
    })

    // TODO: do we want to normalize this for firefox? It seems in
    // the latest version of firefox the window state is not reset
    // when navigating back from a hard navigation. This might be
    // a bug as other browsers do not behave this way.
    if (browserName !== 'firefox') {
      it('should reload the page on page script error', async () => {
        const browser = await webdriver(appPort, '/counter')
        const counter = await browser
          .elementByCss('#increase')
          .click()
          .click()
          .elementByCss('#counter')
          .text()
        expect(counter).toBe('Counter: 2')

        // When we go to the 404 page, it'll do a hard reload.
        // So, it's possible for the front proxy to load a page from another zone.
        // Since the page is reloaded, when we go back to the counter page again,
        // previous counter value should be gone.
        const counterAfter404Page = await browser
          .elementByCss('#no-such-page')
          .click()
          .waitForElementByCss('h1')
          .back()
          .waitForElementByCss('#counter-page')
          .elementByCss('#counter')
          .text()
        expect(counterAfter404Page).toBe('Counter: 0')

        await browser.close()
      })
    }

    it('should have default runtime values when not defined', async () => {
      const html = await renderViaHTTP(appPort, '/runtime-config')
      expect(html).toMatch(/found public config/)
      expect(html).toMatch(/found server config/)
    })

    it('should not have runtimeConfig in __NEXT_DATA__', async () => {
      const html = await renderViaHTTP(appPort, '/runtime-config')
      const $ = cheerio.load(html)
      const script = $('#__NEXT_DATA__').html()
      expect(script).not.toMatch(/runtimeConfig/)
    })

    it('should add autoExport for auto pre-rendered pages', async () => {
      for (const page of ['/', '/about']) {
        const html = await renderViaHTTP(appPort, page)
        const $ = cheerio.load(html)
        const data = JSON.parse($('#__NEXT_DATA__').html())
        expect(data.autoExport).toBe(true)
      }
    })

    it('should not add autoExport for non pre-rendered pages', async () => {
      for (const page of ['/query']) {
        const html = await renderViaHTTP(appPort, page)
        const $ = cheerio.load(html)
        const data = JSON.parse($('#__NEXT_DATA__').html())
        expect(!!data.autoExport).toBe(false)
      }
    })

    it('should add prefetch tags when Link prefetch prop is used', async () => {
      const browser = await webdriver(appPort, '/prefetch')

      if (browserName === 'internet explorer') {
        // IntersectionObserver isn't present so we need to trigger manually
        await waitFor(1000)
        await browser.eval(`(function() {
          window.next.router.prefetch('/')
          window.next.router.prefetch('/process-env')
          window.next.router.prefetch('/counter')
          window.next.router.prefetch('/about')
        })()`)
      }

      await waitFor(2000)

      if (browserName === 'safari') {
        const elements = await browser.elementsByCss('link[rel=preload]')
        // optimized preloading uses defer instead of preloading and prefetches
        // aren't generated client-side since safari does not support prefetch
        expect(elements.length).toBe(0)
      } else {
        const elements = await browser.elementsByCss('link[rel=prefetch]')
        expect(elements.length).toBe(4)

        for (const element of elements) {
          const rel = await element.getAttribute('rel')
          const as = await element.getAttribute('as')
          expect(rel).toBe('prefetch')
          expect(as).toBe('script')
        }
      }
      await browser.close()
    })

    // This is a workaround to fix https://github.com/vercel/next.js/issues/5860
    // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
    it('It does not add a timestamp to link tags with prefetch attribute', async () => {
      const browser = await webdriver(appPort, '/prefetch')
      const links = await browser.elementsByCss('link[rel=prefetch]')

      for (const element of links) {
        const href = await element.getAttribute('href')
        expect(href).not.toMatch(/\?ts=/)
      }
      const scripts = await browser.elementsByCss('script[src]')

      for (const element of scripts) {
        const src = await element.getAttribute('src')
        expect(src).not.toMatch(/\?ts=/)
      }
      await browser.close()
    })

    if (browserName === 'chrome') {
      it('should reload the page on page script error with prefetch', async () => {
        const browser = await webdriver(appPort, '/counter')
        if (global.browserName !== 'chrome') return
        const counter = await browser
          .elementByCss('#increase')
          .click()
          .click()
          .elementByCss('#counter')
          .text()
        expect(counter).toBe('Counter: 2')

        // Let the browser to prefetch the page and error it on the console.
        await waitFor(3000)

        // When we go to the 404 page, it'll do a hard reload.
        // So, it's possible for the front proxy to load a page from another zone.
        // Since the page is reloaded, when we go back to the counter page again,
        // previous counter value should be gone.
        const counterAfter404Page = await browser
          .elementByCss('#no-such-page-prefetch')
          .click()
          .waitForElementByCss('h1')
          .back()
          .waitForElementByCss('#counter-page')
          .elementByCss('#counter')
          .text()
        expect(counterAfter404Page).toBe('Counter: 0')

        await browser.close()
      })
    }
  })

  it('should not expose the compiled page file in development', async () => {
    const url = `http://localhost:${appPort}`
    await fetchViaHTTP(`${url}`, `/stateless`) // make sure the stateless page is built
    const clientSideJsRes = await fetchViaHTTP(
      `${url}`,
      '/_next/development/static/development/pages/stateless.js'
    )
    expect(clientSideJsRes.status).toBe(404)
    const clientSideJsBody = await clientSideJsRes.text()
    expect(clientSideJsBody).toMatch(/404/)

    const serverSideJsRes = await fetchViaHTTP(
      `${url}`,
      '/_next/development/server/static/development/pages/stateless.js'
    )
    expect(serverSideJsRes.status).toBe(404)
    const serverSideJsBody = await serverSideJsRes.text()
    expect(serverSideJsBody).toMatch(/404/)
  })

  it('should not put backslashes in pages-manifest.json', () => {
    // Whatever platform you build on, pages-manifest.json should use forward slash (/)
    // See: https://github.com/vercel/next.js/issues/4920
    const pagesManifest = require(join('..', '.next', 'server', PAGES_MANIFEST))

    for (let key of Object.keys(pagesManifest)) {
      expect(key).not.toMatch(/\\/)
      expect(pagesManifest[key]).not.toMatch(/\\/)
    }
  })

  it('should handle failed param decoding', async () => {
    const html = await renderViaHTTP(appPort, '/invalid-param/%DE~%C7%1fY/')
    expect(html).toMatch(/400/)
    expect(html).toMatch(/Bad Request/)
  })

  it('should replace static pages with HTML files', async () => {
    const pages = ['/about', '/another', '/counter', '/dynamic', '/prefetch']
    for (const page of pages) {
      const file = getPageFileFromPagesManifest(appDir, page)

      expect(file.endsWith('.html')).toBe(true)
    }
  })

  it('should not replace non-static pages with HTML files', async () => {
    const pages = ['/api', '/external-and-back', '/finish-response']

    for (const page of pages) {
      const file = getPageFileFromPagesManifest(appDir, page)

      expect(file.endsWith('.js')).toBe(true)
    }
  })

  it('should handle AMP correctly in IE', async () => {
    const browser = await webdriver(appPort, '/some-amp')
    const text = await browser.elementByCss('p').text()
    expect(text).toBe('Not AMP')
  })

  it('should warn when prefetch is true', async () => {
    if (global.browserName !== 'chrome') return
    let browser
    try {
      browser = await webdriver(appPort, '/development-logs')
      const browserLogs = await browser.log('browser')
      let found = false
      browserLogs.forEach((log) => {
        if (log.message.includes('Next.js auto-prefetches automatically')) {
          found = true
        }
      })
      expect(found).toBe(false)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should not emit profiling events', async () => {
    expect(existsSync(join(appDir, '.next', 'profile-events.json'))).toBe(false)
  })

  it('should not emit stats', async () => {
    expect(existsSync(join(appDir, '.next', 'next-stats.json'))).toBe(false)
  })

  it('should contain the Next.js version in window export', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/about')
      const version = await browser.eval('window.next.version')
      expect(version).toBeTruthy()
      expect(version).toBe(require('next/package.json').version)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should clear all core performance marks', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/fully-dynamic')

      const currentPerfMarks = await browser.eval(
        `window.performance.getEntriesByType('mark')`
      )
      const allPerfMarks = [
        'beforeRender',
        'afterHydrate',
        'afterRender',
        'routeChange',
      ]

      allPerfMarks.forEach((name) =>
        expect(currentPerfMarks).not.toContainEqual(
          expect.objectContaining({ name })
        )
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should not clear custom performance marks', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/mark-in-head')

      const customMarkFound = await browser.eval(
        `window.performance.getEntriesByType('mark').filter(function(e) {
          return e.name === 'custom-mark'
        }).length === 1`
      )
      expect(customMarkFound).toBe(true)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should have defer on all script tags', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    let missing = false

    for (const script of $('script').toArray()) {
      // application/json doesn't need async
      if (
        script.attribs.type === 'application/json' ||
        script.attribs.src.includes('polyfills')
      ) {
        continue
      }

      if (script.attribs.defer !== '' || script.attribs.async === '') {
        missing = true
      }
    }
    expect(missing).toBe(false)
  })

  it('should only have one DOCTYPE', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/^<!DOCTYPE html><html/)
  })

  if (global.browserName !== 'internet explorer') {
    it('should preserve query when hard navigating from page 404', async () => {
      const browser = await webdriver(appPort, '/')
      await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push({
          pathname: '/non-existent',
          query: { hello: 'world' }
        })
      })()`)

      await check(
        () => browser.eval('document.documentElement.innerHTML'),
        /page could not be found/
      )

      expect(await browser.eval('window.beforeNav')).toBeFalsy()
      expect(await browser.eval('window.location.hash')).toBe('')
      expect(await browser.eval('window.location.search')).toBe('?hello=world')
      expect(await browser.eval('window.location.pathname')).toBe(
        '/non-existent'
      )
    })
  }

  it('should remove placeholder for next/image correctly', async () => {
    const browser = await webdriver(context.appPort, '/')

    await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push('/static-image')
      })()`)
    await browser.waitForElementByCss('#static-image')

    expect(await browser.eval('window.beforeNav')).toBe(1)

    await check(
      () => browser.elementByCss('img').getComputedCss('background-image'),
      'none'
    )

    await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push('/')
      })()`)
    await browser.waitForElementByCss('.index-page')
    await waitFor(1000)

    await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push('/static-image')
      })()`)
    await browser.waitForElementByCss('#static-image')

    expect(await browser.eval('window.beforeNav')).toBe(1)

    await check(
      () =>
        browser
          .elementByCss('#static-image')
          .getComputedCss('background-image'),
      'none'
    )

    for (let i = 0; i < 5; i++) {
      expect(
        await browser
          .elementByCss('#static-image')
          .getComputedCss('background-image')
      ).toBe('none')
      await waitFor(500)
    }
  })

  dynamicImportTests(context, (p, q) => renderViaHTTP(context.appPort, p, q))

  processEnv(context)
  if (browserName !== 'safari') security(context)
})
