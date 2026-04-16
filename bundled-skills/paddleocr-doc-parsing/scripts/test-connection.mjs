#!/usr/bin/env node

import { runAndExit } from './common.mjs'

await runAndExit('test', process.argv.slice(2))
