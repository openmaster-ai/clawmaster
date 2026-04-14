import { getConfig, ocr } from './lib.mjs'

function printConfigGuide() {
  console.log(`
============================================================
HOW TO GET YOUR API CREDENTIALS
============================================================

1. Visit: https://paddleocr.com
2. Log in with your Baidu account
3. Open your model's API call example page
4. Copy the API URL from the example request
5. Copy your access token from the same API setup page

Set environment variables:
  export PADDLEOCR_OCR_API_URL=https://your-api-url.paddleocr.com/ocr
  export PADDLEOCR_ACCESS_TOKEN=your_token_here
  export PADDLEOCR_OCR_TIMEOUT=120  # optional

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
  console.log('PaddleOCR Text Recognition - Smoke Test')
  console.log('='.repeat(60))

  console.log('\n[1/3] Checking dependencies...')
  console.log(`  + node: ${process.version}`)
  console.log('  + fetch: builtin')

  console.log('\n[2/3] Checking configuration...')
  try {
    const { apiUrl, token } = getConfig()
    console.log(`  + PADDLEOCR_OCR_API_URL: ${apiUrl}`)
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
    || 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/doc/imgs/11.jpg'
  console.log(`  Test image: ${testUrl}`)

  const result = await ocr({ fileUrl: testUrl })
  if (!result.ok) {
    const errorMessage = result.error && result.error.message ? result.error.message : 'Unknown error'
    console.log(`\n  X API call failed: ${errorMessage}`)
    if (errorMessage.includes('Authentication')) {
      console.log('\n  Hint: Check if your token is correct and not expired.')
      console.log('        Get a new token from your API call example page.')
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
  console.log('  node paddleocr-text-recognition/scripts/ocr_caller.mjs --file-url "URL" --pretty')
  console.log('  node paddleocr-text-recognition/scripts/ocr_caller.mjs --file-path "image.png" --pretty')
  console.log('  Results are auto-saved to the system temp directory; the caller prints the saved path.')

  return 0
}

main().then((code) => process.exit(code))
