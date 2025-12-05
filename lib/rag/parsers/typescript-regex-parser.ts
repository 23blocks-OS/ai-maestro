/**
 * Regex-based TypeScript/JavaScript Parser
 *
 * A lightweight parser that uses regex instead of ts-morph.
 * More stable for large projects, Angular, and React Native that may crash ts-morph.
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParserOptions, Language, ClassType } from './types'
import { codeId } from '../id'

// Regex patterns for TypeScript/JavaScript
const PATTERNS = {
  // Import statements
  importFrom: /^[ \t]*import\s+(?:(?:\{([^}]*)\})|(?:(\*\s+as\s+\w+))|(?:(\w+)))(?:\s*,\s*(?:\{([^}]*)\}))?\s+from\s+['"]([^'"]+)['"]/gm,
  importSideEffect: /^[ \t]*import\s+['"]([^'"]+)['"]/gm,

  // Export statements
  exportNamed: /^[ \t]*export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/gm,
  exportDefault: /^[ \t]*export\s+default\s+(?:(?:function|class)\s+)?(\w+)?/gm,

  // Function declarations
  functionDecl: /^[ \t]*(export\s+)?(async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/gm,
  arrowFunction: /^[ \t]*(export\s+)?(const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(async\s+)?\s*(?:\([^)]*\)|[\w]+)\s*(?::\s*[^=]+)?\s*=>/gm,

  // Class declarations
  classDecl: /^[ \t]*(export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+(?:<[^>]*>)?))?(?:\s+implements\s+([^\{]+))?\s*\{/gm,

  // Method declarations (inside classes)
  methodDecl: /^[ \t]*(public|private|protected)?\s*(async\s+)?(?:static\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/gm,

  // Angular decorators
  angularComponent: /@Component\s*\(\s*\{/g,
  angularService: /@Injectable\s*\(/g,
  angularModule: /@NgModule\s*\(/g,
  angularPipe: /@Pipe\s*\(/g,
  angularDirective: /@Directive\s*\(/g,

  // React patterns
  reactComponent: /(?:function|const)\s+(\w+)\s*[^{]*\{[^}]*return\s*\(?<[A-Z]/,
  reactHook: /^[ \t]*(export\s+)?(const|function)\s+(use[A-Z]\w+)/gm,

  // Function calls
  functionCall: /(?:^|[^a-zA-Z0-9_])([a-z_][a-zA-Z0-9_]*)\s*\(/g,
  methodCall: /\.([a-z_][a-zA-Z0-9_]*)\s*\(/g,
}

/**
 * Detect class type from file path and decorators (Angular/TypeScript conventions)
 */
function detectTSClassType(filePath: string, className: string, content: string, parentClass?: string): ClassType {
  const normalizedPath = filePath.replace(/\\/g, '/')

  // Angular conventions
  if (PATTERNS.angularComponent.test(content)) return 'component'
  if (PATTERNS.angularService.test(content)) return 'service'
  if (PATTERNS.angularModule.test(content)) return 'class' // Module is a special Angular concept
  if (PATTERNS.angularPipe.test(content)) return 'util'
  if (PATTERNS.angularDirective.test(content)) return 'component'

  // React/React Native conventions
  if (className.startsWith('use') && /^use[A-Z]/.test(className)) return 'hook'
  if (normalizedPath.includes('/hooks/') || normalizedPath.endsWith('.hook.ts')) return 'hook'
  if (normalizedPath.includes('/context/') || className.endsWith('Context')) return 'context'
  if (normalizedPath.includes('/store/') || normalizedPath.includes('/redux/')) return 'store'

  // Generic conventions
  if (normalizedPath.includes('/components/') || normalizedPath.endsWith('.component.ts')) return 'component'
  if (normalizedPath.includes('/services/') || normalizedPath.endsWith('.service.ts')) return 'service'
  if (normalizedPath.includes('/controllers/') || normalizedPath.endsWith('.controller.ts')) return 'controller'
  if (normalizedPath.includes('/middleware/')) return 'middleware'
  if (normalizedPath.includes('/utils/') || normalizedPath.includes('/helpers/')) return 'util'
  if (normalizedPath.includes('/models/') || normalizedPath.endsWith('.model.ts')) return 'model'
  if (normalizedPath.includes('/__tests__/') || normalizedPath.includes('.test.') || normalizedPath.includes('.spec.')) return 'test'

  return 'class'
}

/**
 * Get file language from extension
 */
function getLanguage(filePath: string): Language {
  const ext = path.extname(filePath)
  if (ext === '.tsx') return 'tsx'
  if (ext === '.ts') return 'ts'
  if (ext === '.jsx') return 'jsx'
  return 'js'
}

/**
 * Extract module name from file path
 */
function extractModuleName(filePath: string): string {
  const dir = path.dirname(filePath)
  return dir === '.' ? '' : dir
}

/**
 * Extract function body from lines starting at function definition
 */
function extractFunctionBody(lines: string[], startLine: number): string {
  let braceCount = 0
  let started = false
  const bodyLines: string[] = []

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]

    for (const char of line) {
      if (char === '{') {
        braceCount++
        started = true
      } else if (char === '}') {
        braceCount--
      }
    }

    bodyLines.push(line)

    if (started && braceCount === 0) {
      break
    }

    // Safety limit
    if (bodyLines.length > 500) break
  }

  return bodyLines.join('\n')
}

/**
 * Extract function calls from code
 */
function extractFunctionCalls(code: string): string[] {
  const calls = new Set<string>()

  // Match function calls
  const callPattern = /(?:^|[^a-zA-Z0-9_])([a-z_][a-zA-Z0-9_]*)\s*\(/g
  let match

  while ((match = callPattern.exec(code)) !== null) {
    const name = match[1]
    if (!isJSKeyword(name) && name.length > 1) {
      calls.add(name)
    }
  }

  // Match method calls (obj.method())
  const methodPattern = /\.([a-z_][a-zA-Z0-9_]*)\s*\(/g
  while ((match = methodPattern.exec(code)) !== null) {
    const name = match[1]
    if (!isJSKeyword(name) && name.length > 1) {
      calls.add(name)
    }
  }

  return [...calls]
}

/**
 * Check if a word is a JavaScript/TypeScript keyword
 */
function isJSKeyword(word: string): boolean {
  const keywords = new Set([
    // Keywords
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
    'instanceof', 'void', 'this', 'super', 'class', 'extends', 'implements',
    'import', 'export', 'from', 'as', 'default', 'function', 'const', 'let',
    'var', 'async', 'await', 'yield', 'true', 'false', 'null', 'undefined',
    'in', 'of', 'get', 'set', 'static', 'public', 'private', 'protected',
    // Common built-ins
    'console', 'log', 'warn', 'error', 'info', 'debug', 'trace',
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Function',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    'require', 'module', 'exports',
    // Common methods
    'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every',
    'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat',
    'join', 'split', 'replace', 'match', 'test', 'exec',
    'then', 'catch', 'finally', 'resolve', 'reject',
  ])
  return keywords.has(word)
}

/**
 * Parse a TypeScript/JavaScript file using regex
 */
export function parseTypeScriptFile(filePath: string, content: string, projectPath: string): ParsedFile {
  const relativePath = path.relative(projectPath, filePath)
  const file_id = codeId.file(relativePath)
  const moduleName = extractModuleName(relativePath)
  const language = getLanguage(relativePath)

  const functions: ParsedFunction[] = []
  const classes: ParsedClass[] = []
  const imports: ParsedImport[] = []

  const lines = content.split('\n')

  // Extract imports
  let match
  const importFromPattern = new RegExp(PATTERNS.importFrom.source, 'gm')
  while ((match = importFromPattern.exec(content)) !== null) {
    const namedImports1 = match[1] // { x, y }
    const namespaceImport = match[2] // * as x
    const defaultImport = match[3] // x
    const namedImports2 = match[4] // additional named imports after default
    const modulePath = match[5]

    const importedNames: string[] = []
    if (namedImports1) {
      importedNames.push(...namedImports1.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(n => n))
    }
    if (namespaceImport) {
      const asName = namespaceImport.match(/\*\s+as\s+(\w+)/)?.[1]
      if (asName) importedNames.push(asName)
    }
    if (defaultImport) {
      importedNames.push(defaultImport)
    }
    if (namedImports2) {
      importedNames.push(...namedImports2.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(n => n))
    }

    imports.push({
      from_file: file_id,
      to_module: modulePath,
      imported_names: importedNames,
    })
  }

  // Extract function declarations
  const functionPattern = new RegExp(PATTERNS.functionDecl.source, 'gm')
  while ((match = functionPattern.exec(content)) !== null) {
    const isExport = !!match[1]
    const isAsync = !!match[2]
    const name = match[3]

    // Find function body
    const lineIndex = content.substring(0, match.index).split('\n').length - 1
    const body = extractFunctionBody(lines, lineIndex)
    const calls = extractFunctionCalls(body)

    functions.push({
      fn_id: codeId.fn(relativePath, name),
      name,
      file_id,
      is_export: isExport,
      is_async: isAsync,
      language,
      calls,
    })
  }

  // Extract arrow functions
  const arrowPattern = new RegExp(PATTERNS.arrowFunction.source, 'gm')
  while ((match = arrowPattern.exec(content)) !== null) {
    const isExport = !!match[1]
    const name = match[3]
    const isAsync = !!match[4]

    // Find function body
    const lineIndex = content.substring(0, match.index).split('\n').length - 1
    const body = extractFunctionBody(lines, lineIndex)
    const calls = extractFunctionCalls(body)

    functions.push({
      fn_id: codeId.fn(relativePath, name),
      name,
      file_id,
      is_export: isExport,
      is_async: isAsync,
      language,
      calls,
    })
  }

  // Extract classes
  const classPattern = new RegExp(PATTERNS.classDecl.source, 'gm')
  while ((match = classPattern.exec(content)) !== null) {
    const isExport = !!match[1]
    const className = match[2]
    const parentClass = match[3]?.replace(/<[^>]*>/g, '') // Remove generics

    // Find class body for method extraction
    const lineIndex = content.substring(0, match.index).split('\n').length - 1
    const classBody = extractFunctionBody(lines, lineIndex)

    // Extract method names
    const methods: string[] = []
    const methodPattern = /^[ \t]*(public|private|protected)?\s*(async\s+)?(?:static\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)/gm
    let methodMatch
    while ((methodMatch = methodPattern.exec(classBody)) !== null) {
      const methodName = methodMatch[3]
      if (methodName && !['constructor', 'if', 'for', 'while', 'switch'].includes(methodName)) {
        methods.push(methodName)

        // Also add method as a function
        functions.push({
          fn_id: codeId.fn(relativePath, `${className}.${methodName}`),
          name: methodName,
          file_id,
          is_export: isExport,
          is_async: !!methodMatch[2],
          language,
          calls: [], // Could extract calls from method body
          class_name: className,
        })
      }
    }

    const classType = detectTSClassType(relativePath, className, classBody, parentClass)

    classes.push({
      class_id: codeId.component(relativePath, className),
      name: className,
      file_id,
      class_type: classType,
      parent_class: parentClass,
      language,
      methods,
    })
  }

  return {
    file_id,
    path: relativePath,
    moduleName,
    language,
    functions,
    classes,
    imports,
  }
}

/**
 * Parse a TypeScript/JavaScript project using regex (safe for Angular/React Native)
 */
export async function parseTypeScriptProjectRegex(
  projectPath: string,
  options: ParserOptions = {}
): Promise<ParsedFile[]> {
  console.log(`[TypeScriptRegexParser] Parsing project: ${projectPath}`)

  // Default patterns for TypeScript projects
  const defaultPatterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
  ]

  const defaultExcludes = [
    'node_modules/**',
    '.next/**',
    '.nuxt/**',
    'dist/**',
    'build/**',
    '.git/**',
    'coverage/**',
    '**/*.d.ts',
    '**/*.min.js',
    '**/vendor/**',
    'android/**',
    'ios/**',
    '.expo/**',
    '__mocks__/**',
  ]

  const includePatterns = options.includePatterns || defaultPatterns
  const excludePatterns = options.excludePatterns || defaultExcludes

  // Find all TypeScript/JavaScript files
  const files: string[] = []
  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: excludePatterns,
      absolute: true,
    })
    files.push(...matches)
  }

  console.log(`[TypeScriptRegexParser] Found ${files.length} source files`)

  const parsedFiles: ParsedFile[] = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const relativePath = path.relative(projectPath, filePath)

    if (options.onProgress) {
      options.onProgress(relativePath, i + 1, files.length)
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseTypeScriptFile(filePath, content, projectPath)
      parsedFiles.push(parsed)
    } catch (err) {
      console.error(`[TypeScriptRegexParser] Failed to parse ${relativePath}:`, err)
    }
  }

  console.log(`[TypeScriptRegexParser] Parsed ${parsedFiles.length} files`)
  console.log(`[TypeScriptRegexParser] Total functions: ${parsedFiles.reduce((sum, f) => sum + f.functions.length, 0)}`)
  console.log(`[TypeScriptRegexParser] Total classes: ${parsedFiles.reduce((sum, f) => sum + f.classes.length, 0)}`)

  return parsedFiles
}
