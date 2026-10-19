/**
 * CSV formula injection (CWE-1236) protection.
 *
 * Spreadsheet apps evaluate cells that start with = + - @ (and tab / carriage return).
 * A supplier called "=HYPERLINK(...)" or "-cmd|' /C calc'!A0" becomes active content
 * when the export is opened in Excel. The standard mitigation is to prefix such cells
 * with a single quote, which Excel and Sheets display as text.
 *
 * Trade-off: prefixing every value that starts with + or - would also mangle negative
 * numbers ("-12.5") and international phone numbers ("+44 20 7946 0000"). Those values
 * can only evaluate to a number or an error: without letters there is no function name
 * and no cell reference. So + and - are escaped only when the rest of the value contains
 * something other than digits, spaces and + - ( ) . , /. = and @ are always escaped.
 */
export const FORMULA_TRIGGER = /^(?:[=@\t\r]|[+-](?=[\s\S]*[^\d\s+\-().,/]))/;

export function needsFormulaEscape(value: string): boolean {
  return FORMULA_TRIGGER.test(value);
}

export function escapeFormula(value: string): string {
  return needsFormulaEscape(value) ? `'${value}` : value;
}
