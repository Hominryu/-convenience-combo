import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const promoCss = css.match(/\.promo-search\s*\{[^}]*\}/s)?.[0] ?? ''
const productCss = css.slice(css.indexOf('.product-list'), css.indexOf('.empty'))

assert.match(app, /setTimeout\(\(\) => setDebouncedQuery\(query\), 250\)/, 'search must be debounced')
assert.match(app, /총 \{promoProducts\.length\}개/, 'result count must be exposed')
assert.match(app, /aria-label="검색어 초기화"/, 'clear search control must be accessible')
assert.match(app, /scrollIntoView\(\{ behavior: 'smooth'/, 'scroll-to-top must be smooth')
assert.doesNotMatch(promoCss, /position:\s*(sticky|fixed)/, 'search/filter must remain in document flow')
assert.doesNotMatch(productCss, /overflow-y:\s*(auto|scroll)|height:\s*calc\(/, 'product list must not create nested scrolling')
assert.doesNotMatch(css, /\.flow-notice\s*\{[^}]*position:\s*(sticky|fixed)/s, 'notice must remain in document flow')
assert.match(css, /min-height:\s*100dvh/, 'dynamic viewport units should be used for minimum page height')

console.log('mobile promotion scroll structure tests passed')
