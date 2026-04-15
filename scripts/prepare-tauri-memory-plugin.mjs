import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const resourcesRoot = path.join(repoRoot, '.tauri-resources')
const bundledNodeModulesRoot = path.join(resourcesRoot, 'node_modules')
const bundledPlugins = [
  {
    id: 'memory-clawmaster-powermem',
    sourceRoot: path.join(repoRoot, 'plugins', 'memory-clawmaster-powermem'),
    bundledRoot: path.join(resourcesRoot, 'memory-clawmaster-powermem'),
  },
  {
    id: 'openclaw-ernie-image',
    sourceRoot: path.join(repoRoot, 'plugins', 'openclaw-ernie-image'),
    bundledRoot: path.join(resourcesRoot, 'openclaw-ernie-image'),
  },
]
const bundledSkills = [
  {
    id: 'ernie-image',
    sourceRoot: path.join(repoRoot, 'bundled-skills', 'ernie-image'),
    bundledRoot: path.join(resourcesRoot, 'bundled-skills', 'ernie-image'),
  },
]
const builtinModuleNames = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
])

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function resolvePackageRoot(requesterPath, packageName) {
  let current = path.dirname(requesterPath)
  const packageSegments = packageName.split('/')
  while (true) {
    const manifestPath = path.join(current, 'node_modules', ...packageSegments, 'package.json')
    if (fs.existsSync(manifestPath)) {
      const manifest = readJson(manifestPath)
      if (manifest.name === packageName) {
        return {
          packageRoot: path.dirname(manifestPath),
          manifestPath,
          manifest,
        }
      }
    }
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`Unable to resolve package root for ${packageName}`)
    }
    current = parent
  }
}

async function copyPackageTree(packageName, requesterPath, copied) {
  if (builtinModuleNames.has(packageName)) {
    return
  }
  const resolved = resolvePackageRoot(requesterPath, packageName)
  const copyKey = resolved.packageRoot
  if (copied.has(copyKey)) {
    return
  }
  copied.add(copyKey)

  const destination = path.join(bundledNodeModulesRoot, ...packageName.split('/'))
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  await fsp.rm(destination, { recursive: true, force: true })
  await fsp.cp(resolved.packageRoot, destination, { recursive: true })

  const runtimeDependencies = {
    ...(resolved.manifest.dependencies ?? {}),
    ...(resolved.manifest.optionalDependencies ?? {}),
  }

  for (const dependencyName of Object.keys(runtimeDependencies)) {
    try {
      await copyPackageTree(dependencyName, resolved.manifestPath, copied)
    } catch (error) {
      if (dependencyName in (resolved.manifest.optionalDependencies ?? {})) {
        continue
      }
      throw error
    }
  }
}

async function main() {
  const copied = new Set()

  await fsp.rm(resourcesRoot, { recursive: true, force: true })
  await fsp.mkdir(bundledNodeModulesRoot, { recursive: true })
  for (const plugin of bundledPlugins) {
    const pluginManifest = readJson(path.join(plugin.sourceRoot, 'package.json'))
    await fsp.cp(plugin.sourceRoot, plugin.bundledRoot, {
      recursive: true,
      filter(source) {
        return !source.endsWith('.test.ts')
      },
    })

    const dependencies = {
      ...(pluginManifest.dependencies ?? {}),
      ...(pluginManifest.optionalDependencies ?? {}),
    }

    for (const packageName of Object.keys(dependencies)) {
      await copyPackageTree(packageName, path.join(repoRoot, 'package.json'), copied)
    }
  }

  for (const skill of bundledSkills) {
    await fsp.mkdir(path.dirname(skill.bundledRoot), { recursive: true })
    await fsp.cp(skill.sourceRoot, skill.bundledRoot, {
      recursive: true,
    })
  }

  console.log(
    `Prepared packaged resources at ${resourcesRoot} for ${bundledPlugins.length} plugin(s), ${bundledSkills.length} bundled skill(s), and ${copied.size} runtime package(s).`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
