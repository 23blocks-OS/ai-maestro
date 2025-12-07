/**
 * Ruby/Rails Code Parser
 * Uses regex-based parsing to extract classes, modules, methods, and requires
 */

import * as fs from 'fs'
import * as path from 'path'
import { glob } from 'glob'
import { ParsedFile, ParsedFunction, ParsedClass, ParsedImport, ParserOptions, Language, ClassAssociation, ClassType } from './types'
import { codeId } from '../id'

// Regex patterns for Ruby
const PATTERNS = {
  // Class definition: class ClassName < ParentClass or class ClassName
  class: /^[ \t]*class\s+([A-Z][a-zA-Z0-9_]*)\s*(?:<\s*([A-Z][a-zA-Z0-9_:]*))?\s*$/gm,

  // Module definition: module ModuleName
  module: /^[ \t]*module\s+([A-Z][a-zA-Z0-9_]*)\s*$/gm,

  // Method definition: def method_name or def self.method_name
  method: /^[ \t]*def\s+(self\.)?([a-z_][a-zA-Z0-9_]*[!?=]?)\s*(?:\(([^)]*)\))?\s*$/gm,

  // Require/require_relative
  require: /^[ \t]*require(?:_relative)?\s+['"]([^'"]+)['"]\s*$/gm,

  // Include/extend (for tracking mixins)
  include: /^[ \t]*(?:include|extend|prepend)\s+([A-Z][a-zA-Z0-9_:]*)\s*$/gm,

  // Method calls (simplified)
  methodCall: /(?:^|[^a-zA-Z0-9_])([a-z_][a-zA-Z0-9_]*[!?]?)\s*(?:\(|$|[^a-zA-Z0-9_=])/g,

  // Rails specific patterns
  railsController: /class\s+([A-Z][a-zA-Z0-9_]*)Controller\s*</,
  railsModel: /class\s+([A-Z][a-zA-Z0-9_]*)\s*<\s*(?:ApplicationRecord|ActiveRecord::Base)/,
  railsJob: /class\s+([A-Z][a-zA-Z0-9_]*)Job\s*</,
  railsMailer: /class\s+([A-Z][a-zA-Z0-9_]*)Mailer\s*</,
}

/**
 * Detect class type from file path (Rails conventions)
 */
function detectClassType(filePath: string, className: string): ClassType {
  const normalizedPath = filePath.replace(/\\/g, '/')

  // Rails app directory conventions
  if (normalizedPath.includes('/app/models/') || normalizedPath.includes('/models/concerns/')) {
    return 'model'
  }
  if (normalizedPath.includes('/app/serializers/') || className.endsWith('Serializer')) {
    return 'serializer'
  }
  if (normalizedPath.includes('/app/controllers/') || className.endsWith('Controller')) {
    return 'controller'
  }
  if (normalizedPath.includes('/app/jobs/') || className.endsWith('Job')) {
    return 'job'
  }
  if (normalizedPath.includes('/app/mailers/') || className.endsWith('Mailer')) {
    return 'mailer'
  }
  if (normalizedPath.includes('/app/services/') || normalizedPath.includes('/services/')) {
    return 'service'
  }
  if (normalizedPath.includes('/concerns/')) {
    return 'concern'
  }
  if (normalizedPath.includes('/app/helpers/') || className.endsWith('Helper')) {
    return 'helper'
  }
  if (normalizedPath.includes('/app/validators/') || className.endsWith('Validator')) {
    return 'validator'
  }
  if (normalizedPath.includes('/app/middleware/') || normalizedPath.includes('/middleware/')) {
    return 'middleware'
  }
  if (normalizedPath.includes('/spec/') || normalizedPath.includes('/test/')) {
    return 'test'
  }
  if (normalizedPath.includes('/db/migrate/')) {
    return 'migration'
  }
  if (normalizedPath.includes('/lib/')) {
    return 'util'
  }

  return 'class'
}

/**
 * Parse a Ruby file
 */
export function parseRubyFile(filePath: string, content: string, projectPath: string): ParsedFile {
  const relativePath = path.relative(projectPath, filePath)
  const file_id = codeId.file(relativePath)
  const moduleName = extractModuleName(relativePath)
  const language: Language = relativePath.endsWith('.erb') ? 'erb' : 'rb'

  const functions: ParsedFunction[] = []
  const classes: ParsedClass[] = []
  const imports: ParsedImport[] = []

  // Track current class/module context
  let currentClass: string | null = null
  const lines = content.split('\n')
  let inClass = false
  let classIndent = 0

  // Extract requires
  let match
  const requirePattern = new RegExp(PATTERNS.require.source, 'gm')
  while ((match = requirePattern.exec(content)) !== null) {
    imports.push({
      from_file: file_id,
      to_module: match[1],
      imported_names: [],
    })
  }

  // Extract includes (as a form of import)
  const includePattern = new RegExp(PATTERNS.include.source, 'gm')
  while ((match = includePattern.exec(content)) !== null) {
    imports.push({
      from_file: file_id,
      to_module: match[1],
      imported_names: ['*'],
    })
  }

  // Parse line by line for better context tracking
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.search(/\S/)

    // Check for class definition
    const classMatch = /^(\s*)class\s+([A-Z][a-zA-Z0-9_]*)\s*(?:<\s*([A-Z][a-zA-Z0-9_:]*))?/.exec(line)
    if (classMatch) {
      currentClass = classMatch[2]
      inClass = true
      classIndent = classMatch[1].length

      // Detect class type from path and naming
      const classType = detectClassType(relativePath, currentClass)

      // Detect serializer relationship by naming convention
      let serializes: string | undefined
      if (currentClass.endsWith('Serializer')) {
        serializes = currentClass.replace(/Serializer$/, '')
      }

      classes.push({
        class_id: codeId.component(relativePath, currentClass),
        name: currentClass,
        file_id,
        class_type: classType,
        parent_class: classMatch[3] || undefined,
        includes: [],
        associations: [],
        serializes,
        language,
        methods: [],
      })
    }

    // Check for module definition
    const moduleMatch = /^(\s*)module\s+([A-Z][a-zA-Z0-9_]*)/.exec(line)
    if (moduleMatch) {
      currentClass = moduleMatch[2]
      inClass = true
      classIndent = moduleMatch[1].length

      // Modules in concerns are typically mixins
      const classType = detectClassType(relativePath, currentClass)

      classes.push({
        class_id: codeId.component(relativePath, currentClass),
        name: currentClass,
        file_id,
        class_type: classType,
        includes: [],
        language,
        methods: [],
      })
    }

    // Check for include/extend/prepend within a class
    if (inClass && currentClass) {
      const includeMatch = /^\s*(?:include|extend|prepend)\s+([A-Z][a-zA-Z0-9_:]*)/.exec(line)
      if (includeMatch) {
        const classObj = classes.find(c => c.name === currentClass)
        if (classObj && classObj.includes) {
          classObj.includes.push(includeMatch[1])
        }
      }

      // Check for Rails associations
      const associationMatch = /^\s*(belongs_to|has_many|has_one|has_and_belongs_to_many)\s+:([a-z_]+)/.exec(line)
      if (associationMatch) {
        const classObj = classes.find(c => c.name === currentClass)
        if (classObj && classObj.associations) {
          const assocType = associationMatch[1] as ClassAssociation['type']
          const targetSnakeCase = associationMatch[2]
          // Convert snake_case to PascalCase for model name
          const target = targetSnakeCase
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('')
          // For has_many, singularize (simple version)
          const singularTarget = assocType === 'has_many' || assocType === 'has_and_belongs_to_many'
            ? target.replace(/s$/, '').replace(/ies$/, 'y')
            : target

          classObj.associations.push({
            type: assocType,
            target: singularTarget,
          })
        }
      }
    }

    // Check for end of class/module
    if (inClass && /^\s*end\s*$/.test(line) && indent <= classIndent) {
      inClass = false
      currentClass = null
    }

    // Check for method definition
    const methodMatch = /^(\s*)def\s+(self\.)?([a-z_][a-zA-Z0-9_]*[!?=]?)/.exec(line)
    if (methodMatch) {
      const methodName = methodMatch[3]
      const isClassMethod = !!methodMatch[2]
      const fullName = currentClass ? `${currentClass}#${methodName}` : methodName

      // Extract method body for call analysis
      const methodBody = extractMethodBody(lines, i)
      const calls = extractMethodCalls(methodBody)

      functions.push({
        fn_id: codeId.fn(relativePath, fullName),
        name: methodName,
        file_id,
        is_export: true, // Ruby methods are public by default
        is_async: false,
        language,
        calls,
        class_name: currentClass || undefined,
      })

      // Add to class methods list
      if (currentClass) {
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
 * Extract method body from lines starting at method definition
 */
function extractMethodBody(lines: string[], startLine: number): string {
  const methodIndent = lines[startLine].search(/\S/)
  const bodyLines: string[] = []

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.search(/\S/)

    // End of method
    if (indent !== -1 && indent <= methodIndent && /^\s*end\s*$/.test(line)) {
      break
    }

    bodyLines.push(line)

    // Safety limit
    if (bodyLines.length > 500) break
  }

  return bodyLines.join('\n')
}

/**
 * Extract method calls from code
 */
function extractMethodCalls(code: string): string[] {
  const calls = new Set<string>()

  // Common method call patterns
  const patterns = [
    /\.([a-z_][a-zA-Z0-9_]*[!?]?)\s*(?:\(|$|[^a-zA-Z0-9_=])/g,  // obj.method
    /(?:^|[^.a-zA-Z0-9_])([a-z_][a-zA-Z0-9_]*[!?]?)\s*\(/g,      // method(
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(code)) !== null) {
      const name = match[1]
      // Filter out common keywords and operators
      if (!isRubyKeyword(name) && name.length > 1) {
        calls.add(name)
      }
    }
  }

  return [...calls]
}

/**
 * Check if a word is a Ruby keyword
 */
function isRubyKeyword(word: string): boolean {
  const keywords = new Set([
    'if', 'else', 'elsif', 'end', 'unless', 'case', 'when', 'while', 'until',
    'for', 'do', 'begin', 'rescue', 'ensure', 'raise', 'return', 'yield',
    'break', 'next', 'redo', 'retry', 'self', 'super', 'nil', 'true', 'false',
    'and', 'or', 'not', 'in', 'then', 'defined', 'new', 'class', 'module',
    'def', 'undef', 'alias', 'private', 'protected', 'public', 'attr',
    'attr_reader', 'attr_writer', 'attr_accessor', 'puts', 'print', 'p',
  ])
  return keywords.has(word)
}

/**
 * Extract module name from file path (Rails convention)
 */
function extractModuleName(filePath: string): string {
  const dir = path.dirname(filePath)
  return dir === '.' ? '' : dir
}

/**
 * Parse a Ruby/Rails project
 */
export async function parseRubyProject(
  projectPath: string,
  options: ParserOptions = {}
): Promise<ParsedFile[]> {
  console.log(`[RubyParser] Parsing project: ${projectPath}`)

  // Default patterns for Rails projects
  const defaultPatterns = [
    'app/**/*.rb',
    'lib/**/*.rb',
    'config/**/*.rb',
  ]

  const defaultExcludes = [
    'vendor/**',
    'node_modules/**',
    'tmp/**',
    'log/**',
    '.git/**',
    'coverage/**',
  ]

  const includePatterns = options.includePatterns || defaultPatterns
  const excludePatterns = options.excludePatterns || defaultExcludes

  // Find all Ruby files
  const files: string[] = []
  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: excludePatterns,
      absolute: true,
    })
    files.push(...matches)
  }

  console.log(`[RubyParser] Found ${files.length} Ruby files`)

  const parsedFiles: ParsedFile[] = []

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const relativePath = path.relative(projectPath, filePath)

    if (options.onProgress) {
      options.onProgress(relativePath, i + 1, files.length)
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const parsed = parseRubyFile(filePath, content, projectPath)
      parsedFiles.push(parsed)
    } catch (err) {
      console.error(`[RubyParser] Failed to parse ${relativePath}:`, err)
    }
  }

  console.log(`[RubyParser] Parsed ${parsedFiles.length} files`)
  console.log(`[RubyParser] Total methods: ${parsedFiles.reduce((sum, f) => sum + f.functions.length, 0)}`)
  console.log(`[RubyParser] Total classes: ${parsedFiles.reduce((sum, f) => sum + f.classes.length, 0)}`)

  return parsedFiles
}
