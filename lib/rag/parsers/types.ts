/**
 * Common types for all code parsers
 */

export type ProjectType = 'typescript' | 'javascript' | 'ruby' | 'python' | 'unknown'

export type Language =
  | 'ts' | 'tsx' | 'js' | 'jsx'  // TypeScript/JavaScript
  | 'rb' | 'erb'                  // Ruby
  | 'py'                          // Python

// Class/component types for better categorization
export type ClassType =
  | 'model'           // Database model (Rails ActiveRecord, Django Model)
  | 'serializer'      // API serializers (Rails AMS, DRF)
  | 'controller'      // HTTP controllers (Rails, Django views)
  | 'job'             // Background jobs (Sidekiq, Celery)
  | 'mailer'          // Email handlers
  | 'service'         // Service objects
  | 'concern'         // Rails concerns/mixins
  | 'helper'          // View helpers
  | 'validator'       // Custom validators
  | 'middleware'      // Middleware
  | 'component'       // React/Vue components
  | 'hook'            // React hooks
  | 'context'         // React context
  | 'store'           // State management (Redux, Vuex)
  | 'util'            // Utility classes
  | 'test'            // Test files
  | 'migration'       // Database migrations
  | 'class'           // Generic class (default)

export interface ParsedFile {
  file_id: string
  path: string
  moduleName: string
  language: Language
  functions: ParsedFunction[]
  classes: ParsedClass[]
  imports: ParsedImport[]
}

export interface ParsedFunction {
  fn_id: string
  name: string
  file_id: string
  is_export: boolean
  is_async: boolean
  language: Language
  calls: string[]
  class_name?: string  // For methods
}

export interface ParsedClass {
  class_id: string
  name: string
  file_id: string
  class_type: ClassType  // Type of class (model, serializer, controller, etc.)
  parent_class?: string
  includes?: string[]  // Included modules (Ruby: include/extend/prepend)
  associations?: ClassAssociation[]  // Rails: belongs_to, has_many, etc.
  serializes?: string  // For serializers: which model they serialize
  language: Language
  methods: string[]  // Method names
}

export interface ClassAssociation {
  type: 'belongs_to' | 'has_many' | 'has_one' | 'has_and_belongs_to_many'
  target: string  // The associated model name
}

export interface ParsedImport {
  from_file: string
  to_module: string
  imported_names: string[]
}

export interface ParseStats {
  filesIndexed: number
  functionsIndexed: number
  classesIndexed: number
  importsIndexed: number
  callsIndexed: number
  durationMs: number
}

export interface ParserOptions {
  includePatterns?: string[]
  excludePatterns?: string[]
  onProgress?: (filePath: string, index: number, total: number) => void
}

export interface CodeParser {
  name: string
  supportedExtensions: string[]
  parseProject(projectPath: string, options?: ParserOptions): Promise<ParsedFile[]>
  parseFile(filePath: string, content: string, projectPath: string): ParsedFile
}
