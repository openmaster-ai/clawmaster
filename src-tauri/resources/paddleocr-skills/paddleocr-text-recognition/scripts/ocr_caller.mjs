import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ocr } from './lib.mjs'

function formatTimestamp(date) {
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())
  const second = pad(date.getSeconds())
  const ms = pad(date.getMilliseconds(), 3)
  const micro = ms + pad(Math.floor(Math.random() * 1000), 3)
  return `${year}${month}${day}_${hour}${minute}${second}_${micro}`
}

function getDefaultOutputPath() {
  const timestamp = formatTimestamp(new Date())
  const shortId = Math.random().toString(16).slice(2, 10)
  return path.join(
    os.tmpdir(),
    'paddleocr',
    'text-recognition',
    'results',
    `result_${timestamp}_${shortId}.json`,
  )
}

function resolveOutputPath(outputArg) {
  if (outputArg) {
    const expanded = outputArg.startsWith('~')
      ? path.join(os.homedir(), outputArg.slice(1))
      : outputArg
    return path.resolve(expanded)
  }
  return path.resolve(getDefaultOutputPath())
}

function parseArgs(argv) {
  const args = {
    fileUrl: null,
    filePath: null,
    fileType: null,
    pretty: false,
    output: null,
    stdout: false,
  }

  const takeValue = (value) => {
    if (value === undefined || value === null) return null
    return String(value)
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--file-url' || arg === '--file-url=') {
      const value = arg.includes('=') ? arg.split('=')[1] : argv[++i]
      args.fileUrl = takeValue(value)
      continue
    }
    if (arg.startsWith('--file-url=')) {
      args.fileUrl = takeValue(arg.slice('--file-url='.length))
      continue
    }
    if (arg === '--file-path' || arg === '--file-path=') {
      const value = arg.includes('=') ? arg.split('=')[1] : argv[++i]
      args.filePath = takeValue(value)
      continue
    }
    if (arg.startsWith('--file-path=')) {
      args.filePath = takeValue(arg.slice('--file-path='.length))
      continue
    }
    if (arg === '--file-type' || arg === '--file-type=') {
      const value = arg.includes('=') ? arg.split('=')[1] : argv[++i]
      args.fileType = value !== undefined ? Number(value) : null
      continue
    }
    if (arg.startsWith('--file-type=')) {
      args.fileType = Number(arg.slice('--file-type='.length))
      continue
    }
    if (arg === '--pretty') {
      args.pretty = true
      continue
    }
    if (arg === '--stdout') {
      args.stdout = true
      continue
    }
    if (arg === '--output' || arg === '-o' || arg === '--output=') {
      const value = arg.includes('=') ? arg.split('=')[1] : argv[++i]
      args.output = takeValue(value)
      continue
    }
    if (arg.startsWith('--output=')) {
      args.output = takeValue(arg.slice('--output='.length))
      continue
    }
  }

  return args
}

function printUsageAndExit() {
  console.error('Usage:')
  console.error('  node scripts/ocr_caller.mjs --file-url "URL" [--pretty] [--output path | --stdout]')
  console.error('  node scripts/ocr_caller.mjs --file-path "path" [--pretty] [--output path | --stdout]')
  process.exit(2)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if ((args.fileUrl && args.filePath) || (!args.fileUrl && !args.filePath)) {
    printUsageAndExit()
  }

  if (args.stdout && args.output) {
    console.error('Error: --stdout and --output cannot be used together.')
    process.exit(2)
  }

  const result = await ocr({
    fileUrl: args.fileUrl,
    filePath: args.filePath,
    fileType: Number.isFinite(args.fileType) ? args.fileType : null,
    useDocUnwarping: false,
    useDocOrientationClassify: false,
    visualize: false,
  })

  const indent = args.pretty ? 2 : null
  const jsonOutput = JSON.stringify(result, null, indent)

  if (args.stdout) {
    process.stdout.write(jsonOutput + '\n')
  } else {
    const outputPath = resolveOutputPath(args.output)
    try {
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, jsonOutput, 'utf8')
      console.error(`Result saved to: ${outputPath}`)
    } catch (err) {
      console.error(`Error: Cannot write to ${outputPath}: ${err && err.message ? err.message : err}`)
      process.exit(5)
    }
  }

  process.exit(result.ok ? 0 : 1)
}

main()
