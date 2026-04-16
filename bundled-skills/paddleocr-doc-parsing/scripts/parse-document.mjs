#!/usr/bin/env node

import { runAndExit } from './common.mjs'

await runAndExit('parse', process.argv.slice(2))
