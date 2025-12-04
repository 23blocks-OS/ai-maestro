/**
 * TypeScript/JavaScript Code Parser
 * Uses ts-morph to extract code graph data (files, functions, imports, calls)
 */

import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph'
import * as path from 'path'
import { codeId } from './id'

export interface ParsedFile {
  file_id: string
  path: string
  moduleName: string
  functions: ParsedFunction[]
  components: ParsedComponent[]
  imports: ParsedImport[]
}

export interface ParsedFunction {
  fn_id: string
  name: string
  file_id: string
  is_export: boolean
  lang: 'ts' | 'tsx' | 'js' | 'jsx'
  calls: string[] // Function names called within this function
}

export interface ParsedComponent {
  component_id: string
  name: string
  file_id: string
  calls: string[] // Functions/hooks called within component
}

export interface ParsedImport {
  from_file: string
  to_module: string
  imported_names: string[]
}

/**
 * Initialize ts-morph project
 */
export function createTsMorphProject(projectPath: string): Project {
  return new Project({
    tsConfigFilePath: path.join(projectPath, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  })
}

/**
 * Parse a single TypeScript/JavaScript file
 */
export function parseFile(sourceFile: SourceFile, projectPath: string): ParsedFile {
  const filePath = path.relative(projectPath, sourceFile.getFilePath())
  const file_id = codeId.file(filePath)
  const moduleName = extractModuleName(filePath)

  const functions: ParsedFunction[] = []
  const components: ParsedComponent[] = []
  const imports: ParsedImport[] = []

  // Extract imports
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue()
    const importedNames = importDecl.getNamedImports().map((ni) => ni.getName())

    imports.push({
      from_file: file_id,
      to_module: moduleSpecifier,
      imported_names: importedNames,
    })
  }

  // Extract functions
  for (const funcDecl of sourceFile.getFunctions()) {
    const name = funcDecl.getName()
    if (!name) continue

    const is_export = funcDecl.isExported()
    const fn_id = codeId.fn(filePath, name)
    const calls = extractFunctionCalls(funcDecl)

    functions.push({
      fn_id,
      name,
      file_id,
      is_export,
      lang: getFileLanguage(filePath),
      calls,
    })
  }

  // Extract arrow functions assigned to variables
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const name = varDecl.getName()
    const initializer = varDecl.getInitializer()

    if (initializer && Node.isArrowFunction(initializer)) {
      const varStatement = varDecl.getFirstAncestorByKind(SyntaxKind.VariableStatement)
      const is_export = varStatement?.hasModifier(SyntaxKind.ExportKeyword) || false

      const fn_id = codeId.fn(filePath, name)
      const calls = extractFunctionCalls(initializer)

      functions.push({
        fn_id,
        name,
        file_id,
        is_export,
        lang: getFileLanguage(filePath),
        calls,
      })
    }
  }

  // Extract React components (function components)
  for (const funcDecl of sourceFile.getFunctions()) {
    const name = funcDecl.getName()
    if (!name) continue

    // Check if it returns JSX
    const returnType = funcDecl.getReturnType()
    const returnTypeText = returnType.getText()

    if (returnTypeText.includes('JSX.Element') || returnTypeText.includes('React.')) {
      const component_id = codeId.component(filePath, name)
      const calls = extractFunctionCalls(funcDecl)

      components.push({
        component_id,
        name,
        file_id,
        calls,
      })
    }
  }

  // Extract class components
  for (const classDecl of sourceFile.getClasses()) {
    const name = classDecl.getName()
    if (!name) continue

    const baseClass = classDecl.getBaseClass()
    if (baseClass && baseClass.getText().includes('Component')) {
      const component_id = codeId.component(filePath, name)
      const calls: string[] = []

      // Extract calls from render method
      const renderMethod = classDecl.getMethod('render')
      if (renderMethod) {
        calls.push(...extractFunctionCalls(renderMethod))
      }

      components.push({
        component_id,
        name,
        file_id,
        calls,
      })
    }
  }

  return {
    file_id,
    path: filePath,
    moduleName,
    functions,
    components,
    imports,
  }
}

/**
 * Extract function calls from a function/method
 */
function extractFunctionCalls(node: Node): string[] {
  const calls: string[] = []

  node.forEachDescendant((child) => {
    if (Node.isCallExpression(child)) {
      const expression = child.getExpression()

      // Direct function call: foo()
      if (Node.isIdentifier(expression)) {
        calls.push(expression.getText())
      }

      // Method call: obj.foo()
      if (Node.isPropertyAccessExpression(expression)) {
        const name = expression.getName()
        calls.push(name)
      }
    }
  })

  return [...new Set(calls)] // Unique calls only
}

/**
 * Extract module name from file path
 * Examples:
 * - lib/rag/embeddings.ts → lib/rag
 * - app/api/agents/route.ts → app/api/agents
 * - components/SessionList.tsx → components
 */
function extractModuleName(filePath: string): string {
  const dir = path.dirname(filePath)
  return dir === '.' ? '' : dir
}

/**
 * Get file language based on extension
 */
function getFileLanguage(filePath: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  const ext = path.extname(filePath)
  if (ext === '.tsx') return 'tsx'
  if (ext === '.ts') return 'ts'
  if (ext === '.jsx') return 'jsx'
  return 'js'
}

/**
 * Parse entire project
 */
export async function parseProject(
  projectPath: string,
  options: {
    includePatterns?: string[] // e.g., ['lib/**/*.ts', 'app/**/*.tsx']
    excludePatterns?: string[] // e.g., ['node_modules/**', '.next/**']
    onProgress?: (filePath: string, index: number, total: number) => void
  } = {}
): Promise<ParsedFile[]> {
  console.log(`[CodeParser] Parsing project: ${projectPath}`)

  const project = createTsMorphProject(projectPath)
  let sourceFiles = project.getSourceFiles()

  // Apply include patterns
  if (options.includePatterns && options.includePatterns.length > 0) {
    sourceFiles = sourceFiles.filter((sf) => {
      const relativePath = path.relative(projectPath, sf.getFilePath())
      return options.includePatterns!.some((pattern) => {
        // Simple glob matching
        const regex = new RegExp(
          '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
        )
        return regex.test(relativePath)
      })
    })
  }

  // Apply exclude patterns
  if (options.excludePatterns && options.excludePatterns.length > 0) {
    sourceFiles = sourceFiles.filter((sf) => {
      const relativePath = path.relative(projectPath, sf.getFilePath())
      return !options.excludePatterns!.some((pattern) => {
        const regex = new RegExp(
          '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$'
        )
        return regex.test(relativePath)
      })
    })
  }

  console.log(`[CodeParser] Found ${sourceFiles.length} source files`)

  const parsedFiles: ParsedFile[] = []

  for (let i = 0; i < sourceFiles.length; i++) {
    const sourceFile = sourceFiles[i]
    const relativePath = path.relative(projectPath, sourceFile.getFilePath())

    if (options.onProgress) {
      options.onProgress(relativePath, i + 1, sourceFiles.length)
    }

    try {
      const parsed = parseFile(sourceFile, projectPath)
      parsedFiles.push(parsed)
    } catch (err) {
      console.error(`[CodeParser] Failed to parse ${relativePath}:`, err)
    }
  }

  console.log(`[CodeParser] Parsed ${parsedFiles.length} files`)
  console.log(`[CodeParser] Total functions: ${parsedFiles.reduce((sum, f) => sum + f.functions.length, 0)}`)
  console.log(`[CodeParser] Total components: ${parsedFiles.reduce((sum, f) => sum + f.components.length, 0)}`)

  return parsedFiles
}

/**
 * Parse specific files (for incremental updates)
 */
export async function parseFiles(
  projectPath: string,
  filePaths: string[]
): Promise<ParsedFile[]> {
  console.log(`[CodeParser] Parsing ${filePaths.length} files`)

  const project = createTsMorphProject(projectPath)
  const parsedFiles: ParsedFile[] = []

  for (const filePath of filePaths) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectPath, filePath)

    try {
      const sourceFile = project.addSourceFileAtPath(absolutePath)
      const parsed = parseFile(sourceFile, projectPath)
      parsedFiles.push(parsed)
    } catch (err) {
      console.error(`[CodeParser] Failed to parse ${filePath}:`, err)
    }
  }

  return parsedFiles
}

/**
 * Alias for unified parser interface
 */
export const parseTypeScriptProject = parseProject
