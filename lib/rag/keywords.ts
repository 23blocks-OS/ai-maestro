/**
 * Keyword Extraction Module
 * Extracts terms for lexical search and code symbols from markdown
 */

/**
 * Extract searchable terms from text
 * - Converts to lowercase
 * - Removes punctuation
 * - Filters by length (2-64 chars)
 */
export function extractTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[`"'.,;:(){}\[\]<>\-\+\*=\\/]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t.length <= 64)
    .filter((t, i, arr) => arr.indexOf(t) === i); // unique
}

/**
 * Extract code symbols from markdown fenced code blocks
 * Captures:
 * - Identifiers (function names, variables, classes)
 * - Import statements
 * - File names
 */
export function extractCodeSymbols(markdown: string): string[] {
  const fences = [
    ...markdown.matchAll(/```[\w+-]*\n([\s\S]*?)```/g),
  ].map((m) => m[1]);

  const symbols = new Set<string>();

  for (const code of fences) {
    // Extract identifiers (alphanumeric + underscore, 3+ chars)
    code.replace(/([A-Za-z_][A-Za-z0-9_]{2,})/g, (_, id) => {
      symbols.add(id);
      return '';
    });

    // Extract ES6/CommonJS imports
    code.replace(/from\s+['"]([^'"]+)['"]/g, (_, mod) => {
      symbols.add(mod);
      return '';
    });
    code.replace(/import\s+['"]([^'"]+)['"]/g, (_, mod) => {
      symbols.add(mod);
      return '';
    });
    code.replace(/require\(['"]([^'"]+)['"]\)/g, (_, mod) => {
      symbols.add(mod);
      return '';
    });

    // Extract file names (common extensions)
    code.replace(
      /([A-Za-z0-9_\-\/]+\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|php|swift))/g,
      (_, file) => {
        symbols.add(file);
        return '';
      }
    );

    // Extract Python imports
    code.replace(/import\s+([A-Za-z_][A-Za-z0-9_]*)/g, (_, mod) => {
      symbols.add(mod);
      return '';
    });
    code.replace(/from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import/g, (_, mod) => {
      symbols.add(mod);
      return '';
    });
  }

  return [...symbols].filter((s) => s.length >= 2);
}

/**
 * Extract API endpoints from text (HTTP methods + paths)
 */
export function extractApiEndpoints(text: string): Array<{
  method: string;
  path: string;
}> {
  const endpoints: Array<{ method: string; path: string }> = [];

  // Match patterns like: GET /api/users, POST /auth/login
  const pattern = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s\)'"]*)/gi;

  for (const match of text.matchAll(pattern)) {
    endpoints.push({
      method: match[1].toUpperCase(),
      path: match[2],
    });
  }

  return endpoints;
}

/**
 * Extract SQL table names from queries
 */
export function extractSqlTables(sql: string): string[] {
  const tables = new Set<string>();

  // FROM clause
  sql.replace(/\bFROM\s+([a-z0-9_."-]+)/gi, (_, table) => {
    tables.add(sanitizeIdentifier(table));
    return '';
  });

  // JOIN clauses
  sql.replace(/\bJOIN\s+([a-z0-9_."-]+)/gi, (_, table) => {
    tables.add(sanitizeIdentifier(table));
    return '';
  });

  // INSERT INTO
  sql.replace(/\bINSERT\s+INTO\s+([a-z0-9_."-]+)/gi, (_, table) => {
    tables.add(sanitizeIdentifier(table));
    return '';
  });

  // UPDATE
  sql.replace(/\bUPDATE\s+([a-z0-9_."-]+)/gi, (_, table) => {
    tables.add(sanitizeIdentifier(table));
    return '';
  });

  // DELETE FROM
  sql.replace(/\bDELETE\s+FROM\s+([a-z0-9_."-]+)/gi, (_, table) => {
    tables.add(sanitizeIdentifier(table));
    return '';
  });

  return [...tables];
}

/**
 * Remove SQL identifier quotes
 */
function sanitizeIdentifier(ident: string): string {
  return ident.replace(/["`]/g, '');
}

/**
 * Extract function/method names from code
 */
export function extractFunctionNames(code: string): string[] {
  const names = new Set<string>();

  // JavaScript/TypeScript functions
  code.replace(/function\s+([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    names.add(name);
    return '';
  });

  // Arrow functions assigned to variables
  code.replace(/(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\([^)]*\)\s*=>/g, (_, name) => {
    names.add(name);
    return '';
  });

  // Python def
  code.replace(/def\s+([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    names.add(name);
    return '';
  });

  // Go func
  code.replace(/func\s+([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    names.add(name);
    return '';
  });

  return [...names];
}
