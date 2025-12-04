/**
 * Unified Parser Interface
 * Auto-detects project type and uses appropriate parser
 */

import * as fs from 'fs'
import * as path from 'path'
import { ParsedFile, ProjectType, ParserOptions } from './types'
import { parseRubyProject } from './ruby-parser'
import { parsePythonProject } from './python-parser'
import { ParsedFile as TSParsedFile } from '../code-parser'

// Re-export types
export * from './types'
export { parseRubyFile, parseRubyProject } from './ruby-parser'
export { parsePythonFile, parsePythonProject } from './python-parser'

// Union type for both parser outputs
export type AnyParsedFile = ParsedFile | TSParsedFile

/**
 * Detect project type based on marker files
 */
export function detectProjectType(projectPath: string): ProjectType {
  const markers = {
    typescript: ['package.json', 'tsconfig.json'],
    javascript: ['package.json'],
    ruby: ['Gemfile', 'Rakefile', 'config.ru', '.ruby-version'],
    python: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile', 'poetry.lock'],
  }

  // Check for TypeScript first (more specific)
  if (markers.typescript.some(f => fileExists(projectPath, f))) {
    // Verify it's TypeScript by checking for tsconfig.json or .ts files
    if (fileExists(projectPath, 'tsconfig.json')) {
      return 'typescript'
    }
    // Check package.json for TypeScript dependency
    const packageJsonPath = path.join(projectPath, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
          return 'typescript'
        }
      } catch {
        // Ignore parse errors
      }
      // Has package.json but no TypeScript
      return 'javascript'
    }
  }

  // Check for Ruby
  if (markers.ruby.some(f => fileExists(projectPath, f))) {
    return 'ruby'
  }

  // Check for Python
  if (markers.python.some(f => fileExists(projectPath, f))) {
    return 'python'
  }

  // Check for JavaScript (package.json without TypeScript)
  if (fileExists(projectPath, 'package.json')) {
    return 'javascript'
  }

  return 'unknown'
}

/**
 * Helper to check if file exists
 */
function fileExists(basePath: string, fileName: string): boolean {
  return fs.existsSync(path.join(basePath, fileName))
}

/**
 * Get detailed project info
 */
export interface ProjectInfo {
  type: ProjectType
  framework?: string
  name?: string
  version?: string
}

export function getProjectInfo(projectPath: string): ProjectInfo {
  const type = detectProjectType(projectPath)
  const info: ProjectInfo = { type }

  switch (type) {
    case 'typescript':
    case 'javascript': {
      const packageJsonPath = path.join(projectPath, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
          info.name = pkg.name
          info.version = pkg.version

          // Detect framework
          const deps = { ...pkg.dependencies, ...pkg.devDependencies }
          if (deps.next) info.framework = 'nextjs'
          else if (deps.react) info.framework = 'react'
          else if (deps.vue) info.framework = 'vue'
          else if (deps.angular) info.framework = 'angular'
          else if (deps.express) info.framework = 'express'
          else if (deps.nx) info.framework = 'nx'
        } catch {
          // Ignore
        }
      }
      break
    }

    case 'ruby': {
      // Check for Rails
      if (fileExists(projectPath, 'config/application.rb') ||
          fileExists(projectPath, 'bin/rails')) {
        info.framework = 'rails'
      } else if (fileExists(projectPath, 'config.ru')) {
        // Check Gemfile for framework
        const gemfilePath = path.join(projectPath, 'Gemfile')
        if (fs.existsSync(gemfilePath)) {
          const gemfile = fs.readFileSync(gemfilePath, 'utf-8')
          if (gemfile.includes('sinatra')) info.framework = 'sinatra'
          else if (gemfile.includes('hanami')) info.framework = 'hanami'
        }
      }
      break
    }

    case 'python': {
      // Check for Django
      if (fileExists(projectPath, 'manage.py')) {
        info.framework = 'django'
      } else {
        // Check requirements for framework
        const reqPath = path.join(projectPath, 'requirements.txt')
        if (fs.existsSync(reqPath)) {
          const reqs = fs.readFileSync(reqPath, 'utf-8').toLowerCase()
          if (reqs.includes('flask')) info.framework = 'flask'
          else if (reqs.includes('fastapi')) info.framework = 'fastapi'
          else if (reqs.includes('django')) info.framework = 'django'
        }
      }
      break
    }
  }

  return info
}

/**
 * Parse project using auto-detected parser
 */
export async function parseProject(
  projectPath: string,
  options: ParserOptions = {}
): Promise<{ files: AnyParsedFile[]; projectInfo: ProjectInfo }> {
  const projectInfo = getProjectInfo(projectPath)

  console.log(`[Parser] Detected project type: ${projectInfo.type}${projectInfo.framework ? ` (${projectInfo.framework})` : ''}`)

  let files: AnyParsedFile[] = []

  switch (projectInfo.type) {
    case 'ruby':
      files = await parseRubyProject(projectPath, options)
      break

    case 'python':
      files = await parsePythonProject(projectPath, options)
      break

    case 'typescript':
    case 'javascript': {
      // Use existing TypeScript parser from code-parser.ts
      // We'll import it dynamically to avoid circular dependencies
      const { parseTypeScriptProject } = await import('../code-parser')
      files = await parseTypeScriptProject(projectPath, options)
      break
    }

    case 'unknown': {
      console.warn(`[Parser] Unknown project type for ${projectPath}, attempting TypeScript parser`)
      try {
        const { parseTypeScriptProject } = await import('../code-parser')
        files = await parseTypeScriptProject(projectPath, options)
      } catch (err) {
        console.error(`[Parser] Failed to parse unknown project type:`, err)
      }
      break
    }
  }

  return { files, projectInfo }
}

/**
 * Parse multiple project types in a monorepo
 */
export async function parseMonorepo(
  rootPath: string,
  subprojects: string[],
  options: ParserOptions = {}
): Promise<{ files: AnyParsedFile[]; projects: ProjectInfo[] }> {
  const allFiles: AnyParsedFile[] = []
  const projects: ProjectInfo[] = []

  for (const subproject of subprojects) {
    const projectPath = path.join(rootPath, subproject)
    if (!fs.existsSync(projectPath)) {
      console.warn(`[Parser] Subproject not found: ${projectPath}`)
      continue
    }

    const { files, projectInfo } = await parseProject(projectPath, options)
    allFiles.push(...files)
    projects.push({ ...projectInfo, name: subproject })
  }

  return { files: allFiles, projects }
}
