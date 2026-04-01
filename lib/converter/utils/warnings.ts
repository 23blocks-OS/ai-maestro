/**
 * Warning collector for tracking lossy conversion details.
 * Ported from crucible's utils/warnings.js.
 */

export class WarningCollector {
  private warnings: string[] = []

  /** Add a warning message */
  add(message: string): void {
    this.warnings.push(message)
  }

  /** Add a lossy field warning */
  lossyField(elementName: string, fieldName: string, reason: string): void {
    this.warnings.push(`[${elementName}] Field '${fieldName}' lost: ${reason}`)
  }

  /** Add a lossy element warning */
  lossyElement(elementType: string, elementName: string, reason: string): void {
    this.warnings.push(`[${elementType}:${elementName}] ${reason}`)
  }

  /** Add a format conversion warning */
  formatChange(elementName: string, from: string, to: string): void {
    this.warnings.push(`[${elementName}] Format changed: ${from} → ${to}`)
  }

  /** Get all collected warnings */
  getWarnings(): string[] {
    return [...this.warnings]
  }

  /** Check if any warnings were collected */
  hasWarnings(): boolean {
    return this.warnings.length > 0
  }

  /** Clear all warnings */
  clear(): void {
    this.warnings = []
  }
}
