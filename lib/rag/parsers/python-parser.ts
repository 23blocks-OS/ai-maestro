/**
 * Python Code Parser
 * Uses regex-based parsing to extract classes, functions, imports, and decorators
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParserOptions, Language, ClassType } from './types'
import { codeId } from '../id'

// Regex patterns for Python
const PATTERNS = {
  // Class definition: class ClassName(ParentClass): or class ClassName:
  class: /^[ \t]*class\s+([A-Z][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?:/gm,

  // Function/method definition: def function_name(params): or async def function_name(params):
  function: /^[ \t]*(async\s+)?def\s+([a-z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*[^:]+)?:/gm,

  // Import statements
  import: /^[ \t]*import\s+([a-zA-Z0-9_.,\s]+)$/gm,
  fromImport: /^[ \t]*from\s+([a-zA-Z0-9_.]+)\s+import\s+([a-zA-Z0-9_,*\s()]+)$/gm,

  // Decorators
  decorator: /^[ \t]*@([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*(?:\([^)]*\))?$/gm,

  // Function calls
  functionCall: /(?:^|[^a-zA-Z0-9_])([a-z_][a-zA-Z0-9_]*)\s*\(/g,

  // Django/Flask specific patterns
  djangoView: /@(?:api_view|permission_classes|login_required)/,
  djangoModel: /class\s+([A-Z][a-zA-Z0-9_]*)\s*\(\s*models\.Model\s*\)/,
  flaskRoute: /@(?:app|blueprint)\.route\s*\(/,
  fastApiRoute: /@(?:app|router)\.(get|post|put|delete|patch)\s*\(/,
}

/**
 * Parse a Python file
 */
/**
 * Detect class type from file path and parent classes (Python/Django conventions)
 */
function detectPythonClassType(filePath: string, className: string, parentClasses: string[]): ClassType {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const parentSet = new Set(parentClasses)

  // Django conventions
  if (normalizedPath.includes('/models/') || normalizedPath.endsWith('/models.py') ||
      parentSet.has('Model') || parentSet.has('models.Model')) {
    return 'model'
  }
  if (normalizedPath.includes('/serializers/') || normalizedPath.endsWith('/serializers.py') ||
      className.endsWith('Serializer') || parentSet.has('Serializer')) {
    return 'serializer'
  }
  if (normalizedPath.includes('/views/') || normalizedPath.endsWith('/views.py') ||
      parentSet.has('View') || parentSet.has('APIView') || parentSet.has('ViewSet')) {
    return 'controller'
  }
  if (normalizedPath.includes('/tasks/') || normalizedPath.endsWith('/tasks.py') ||
      parentSet.has('Task') || parentSet.has('celery.Task')) {
    return 'job'
  }
  if (normalizedPath.includes('/middleware/') || className.endsWith('Middleware')) {
    return 'middleware'
  }
  if (normalizedPath.includes('/services/')) {
    return 'service'
  }
  if (normalizedPath.includes('/validators/') || className.endsWith('Validator')) {
    return 'validator'
  }
  if (normalizedPath.includes('/tests/') || normalizedPath.includes('/test_') ||
      className.startsWith('Test') || parentSet.has('TestCase')) {
    return 'test'
  }
  if (normalizedPath.includes('/migrations/')) {
    return 'migration'
  }
  if (normalizedPath.includes('/utils/') || normalizedPath.includes('/helpers/')) {
    return 'util'
  }

  return 'class'
}

export function parsePythonFile(filePath: string, content: string, projectPath: string): ParsedFile {
  const relativePath = path.relative(projectPath, filePath)
  const file_id = codeId.file(relativePath)
  const moduleName = extractModuleName(relativePath)
  const language: Language = 'py'

  const functions: ParsedFunction[] = []
  const classes: ParsedClass[] = []
  const imports: ParsedImport[] = []

  // Track current class context
  let currentClass: string | null = null
  const lines = content.split('\n')
  let inClass = false
  let classIndent = 0

  // Extract import statements
  let match
  const importPattern = new RegExp(PATTERNS.import.source, 'gm')
  while ((match = importPattern.exec(content)) !== null) {
    const modules = match[1].split(',').map(m => m.trim())
    for (const mod of modules) {
      imports.push({
        from_file: file_id,
        to_module: mod,
        imported_names: [],
      })
    }
  }

  // Extract from imports
  const fromImportPattern = new RegExp(PATTERNS.fromImport.source, 'gm')
  while ((match = fromImportPattern.exec(content)) !== null) {
    const modulePath = match[1]
    const names = match[2]
      .replace(/[()]/g, '')
      .split(',')
      .map(n => n.trim())
      .filter(n => n)

    imports.push({
      from_file: file_id,
      to_module: modulePath,
      imported_names: names,
    })
  }

  // Parse line by line for better context tracking
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.search(/\S/)

    // Check for class definition
    const classMatch = /^(\s*)class\s+([A-Z][a-zA-Z0-9_]*)\s*(?:\(([^)]*)\))?:/.exec(line)
    if (classMatch) {
      currentClass = classMatch[2]
      inClass = true
      classIndent = classMatch[1].length

      // Extract parent classes
      const parentClasses = classMatch[3]
        ? classMatch[3].split(',').map(p => p.trim()).filter(p => p)
        : []

      // Detect class type from file path (Python/Django conventions)
      const classType = detectPythonClassType(relativePath, currentClass, parentClasses)

      classes.push({
        class_id: codeId.component(relativePath, currentClass),
        name: currentClass,
        file_id,
        class_type: classType,
        parent_class: parentClasses[0], // Primary parent
        language,
        methods: [],
      })
    }

    // Check if we've exited the class (based on indentation)
    if (inClass && indent !== -1 && indent <= classIndent && !/^\s*$/.test(line) && !line.trim().startsWith('#')) {
      // Check if this is a new class or function at class level
      if (!classMatch && !/^\s*class\s/.test(line)) {
        inClass = false
        currentClass = null
      }
    }

    // Check for function/method definition
    const funcMatch = /^(\s*)(async\s+)?def\s+([a-z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/.exec(line)
    if (funcMatch) {
      const methodIndent = funcMatch[1].length
      const isAsync = !!funcMatch[2]
      const methodName = funcMatch[3]
      const params = funcMatch[4]

      // Determine if this is a method or standalone function
      const isMethod = inClass && methodIndent > classIndent
      const fullName = isMethod && currentClass ? `${currentClass}.${methodName}` : methodName

      // Check for decorators (look at previous lines)
      const decorators: string[] = []
      for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
        const prevLine = lines[j].trim()
        if (prevLine.startsWith('@')) {
          decorators.unshift(prevLine)
        } else if (prevLine && !prevLine.startsWith('#')) {
          break
        }
      }

      // Extract function body for call analysis
      const methodBody = extractFunctionBody(lines, i)
      const calls = extractFunctionCalls(methodBody)

      // Determine if it's exported (no leading underscore = public)
      const isExport = !methodName.startsWith('_')

      functions.push({
        fn_id: codeId.fn(relativePath, fullName),
        name: methodName,
        file_id,
        is_export: isExport,
        is_async: isAsync,
        language,
        calls,
        class_name: isMethod && currentClass ? currentClass : undefined,
      })

      // Add to class methods list
      if (isMethod && currentClass) {
        const classObj = classes.find(c => c.name === currentClass)
        if (classObj) {
          classObj.methods.push(methodName)
        }
      }
    }
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
 * Extract function body from lines starting at function definition
 */
function extractFunctionBody(lines: string[], startLine: number): string {
  const funcIndent = lines[startLine].search(/\S/)
  const bodyLines: string[] = []

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.search(/\S/)

    // Empty lines or comments are part of the body
    if (indent === -1 || line.trim().startsWith('#')) {
      bodyLines.push(line)
      continue
    }

    // If we hit something at same or lower indentation, we're done
    if (indent <= funcIndent) {
      break
    }

    bodyLines.push(line)

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
    // Filter out common keywords and built-ins
    if (!isPythonKeyword(name) && name.length > 1) {
      calls.add(name)
    }
  }

  // Match method calls (obj.method())
  const methodPattern = /\.([a-z_][a-zA-Z0-9_]*)\s*\(/g
  while ((match = methodPattern.exec(code)) !== null) {
    const name = match[1]
    if (!isPythonKeyword(name) && name.length > 1) {
      calls.add(name)
    }
  }

  return [...calls]
}

/**
 * Check if a word is a Python keyword or common built-in
 */
function isPythonKeyword(word: string): boolean {
  const keywords = new Set([
    // Keywords
    'if', 'else', 'elif', 'while', 'for', 'try', 'except', 'finally',
    'with', 'as', 'import', 'from', 'def', 'class', 'return', 'yield',
    'raise', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in',
    'is', 'lambda', 'global', 'nonlocal', 'assert', 'del', 'True',
    'False', 'None', 'async', 'await',
    // Common built-ins
    'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict',
    'set', 'tuple', 'bool', 'type', 'isinstance', 'issubclass',
    'hasattr', 'getattr', 'setattr', 'delattr', 'callable', 'super',
    'open', 'input', 'format', 'repr', 'sorted', 'reversed', 'enumerate',
    'zip', 'map', 'filter', 'any', 'all', 'min', 'max', 'sum', 'abs',
    'round', 'pow', 'divmod', 'hex', 'oct', 'bin', 'ord', 'chr',
    'iter', 'next', 'slice', 'object', 'property', 'staticmethod',
    'classmethod', 'vars', 'dir', 'id', 'hash', 'help', 'exec', 'eval',
    'compile', 'globals', 'locals', 'self', 'cls',
  ])
  return keywords.has(word)
}

/**
 * Extract module name from file path (Python convention)
 */
function extractModuleName(filePath: string): string {
  // Remove .py extension and convert path to module notation
  const withoutExt = filePath.replace(/\.py$/, '')
  return withoutExt.replace(/\//g, '.')
}

/**
 * Parse a Python project
 */
export async function parsePythonProject(
  projectPath: string,
  options: ParserOptions = {}
): Promise<ParsedFile[]> {
  console.log(`[PythonParser] Parsing project: ${projectPath}`)

  // Default patterns for Python projects
  const defaultPatterns = [
    '**/*.py',
  ]

  const defaultExcludes = [
    'venv/**',
    '.venv/**',
    'env/**',
    '.env/**',
    'node_modules/**',
    '__pycache__/**',
    '*.pyc',
    '.git/**',
    '.tox/**',
    '.pytest_cache/**',
    '.mypy_cache/**',
    'dist/**',
    'build/**',
    '*.egg-info/**',
    'migrations/**', // Django migrations
  ]

  const includePatterns = options.includePatterns || defaultPatterns
  const excludePatterns = options.excludePatterns || defaultExcludes

  // Find all Python files
  const files: string[] = []
  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: excludePatterns,
      absolute: true,
    })
    files.push(...matches)
  }

  console.log(`[PythonParser] Found ${files.length} Python files`)

  const parsedFiles: ParsedFile[] = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const relativePath = path.relative(projectPath, filePath)

    if (options.onProgress) {
      options.onProgress(relativePath, i + 1, files.length)
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parsePythonFile(filePath, content, projectPath)
      parsedFiles.push(parsed)
    } catch (err) {
      console.error(`[PythonParser] Failed to parse ${relativePath}:`, err)
    }
  }

  console.log(`[PythonParser] Parsed ${parsedFiles.length} files`)
  console.log(`[PythonParser] Total functions: ${parsedFiles.reduce((sum, f) => sum + f.functions.length, 0)}`)
  console.log(`[PythonParser] Total classes: ${parsedFiles.reduce((sum, f) => sum + f.classes.length, 0)}`)

  return parsedFiles
}
