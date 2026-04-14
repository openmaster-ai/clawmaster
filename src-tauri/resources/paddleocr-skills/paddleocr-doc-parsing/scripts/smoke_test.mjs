import { parseDocument, getConfig } from './lib.mjs'

function printConfigGuide() {
  console.log(`
============================================================
HOW TO GET YOUR API CREDENTIALS
============================================================

1. Visit: https://www.paddleocr.com
2. Open your model's API page and sign in
3. Open your model's Example Code section
4. In Example Code, copy the API URL value
5. In Example Code, copy the Access Token value

Set environment variables:
  export PADDLEOCR_DOC_PARSING_API_URL=https://your-api-url.paddleocr.com/layout-parsing
  export PADDLEOCR_ACCESS_TOKEN=your_token_here
  export PADDLEOCR_DOC_PARSING_TIMEOUT=600  # optional

============================================================
`)
}

function parseArgs(argv) {
  const args = { testUrl: null, skipApiTest: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--skip-api-test') {
      args.skipApiTest = true
      continue
    }
    if (arg === '--test-url' || arg === '--test-url=') {
      const value = arg.includes('=') ? arg.split('=')[1] : argv[++i]
      args.testUrl = value
      continue
    }
    if (arg.startsWith('--test-url=')) {
      args.testUrl = arg.slice('--test-url='.length)
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.log('='.repeat(60))
  console.log('PaddleOCR Document Parsing - Smoke Test')
  console.log('='.repeat(60))

  console.log('\n[1/3] Checking dependencies...')
  console.log(`  + node: ${process.version}`)
  console.log('  + fetch: builtin')

  console.log('\n[2/3] Checking configuration...')
  try {
    const { apiUrl, token } = getConfig()
    console.log(`  + PADDLEOCR_DOC_PARSING_API_URL: ${apiUrl}`)
    const masked = token.length > 12 ? `${token.slice(0, 8)}...${token.slice(-4)}` : '***'
    console.log(`  + PADDLEOCR_ACCESS_TOKEN: ${masked}`)
  } catch (err) {
    console.log(`  X ${err.message || err}`)
    printConfigGuide()
    return 1
  }

  if (args.skipApiTest) {
    console.log('\n[3/3] Skipping API connectivity test (--skip-api-test)')
    console.log('\n' + '='.repeat(60))
    console.log('Configuration Check Complete!')
    console.log('='.repeat(60))
    return 0
  }

  console.log('\n[3/3] Testing API connectivity...')
  const testUrl = args.testUrl
    || 'https://paddle-model-ecology.bj.bcebos.com/paddlex/imgs/demo_image/pp_structure_v3_demo.png'
  console.log(`  Test document: ${testUrl}`)

  const result = await parseDocument({ fileUrl: testUrl })
  if (!result.ok) {
    const errorMessage = result.error && result.error.message ? result.error.message : 'Unknown error'
    console.log(`\n  X API call failed: ${errorMessage}`)
    if (errorMessage.includes('Authentication')) {
      console.log('\n  Hint: Check if your token is correct and not expired.')
      console.log('        Get a new token from the PaddleOCR page example code section.')
    }
    return 1
  }

  console.log('  + API call successful!')

  const text = result.text || ''
  if (text) {
    let preview = text.slice(0, 200).replace(/\n/g, ' ')
    if (text.length > 200) preview += '...'
    console.log(`\n  Preview: ${preview}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('Smoke Test PASSED')
  console.log('='.repeat(60))
  console.log('\nNext steps:')
  console.log('  node paddleocr-doc-parsing/scripts/vl_caller.mjs --file-url "URL"')
  console.log('  node paddleocr-doc-parsing/scripts/vl_caller.mjs --file-path "doc.pdf"')
  console.log('  Results are auto-saved to the system temp directory; the caller prints the saved path.')

  return 0
}

main().then((code) => process.exit(code))
