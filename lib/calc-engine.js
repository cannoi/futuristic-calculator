/**
 * Shared calculator engine — used by both frontend and AI tools.
 * Pure functions, no DOM.
 */
'use strict';

function sanitizeExpression(expr) {
  if (typeof expr !== 'string') return '';
  return expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeExpression(expr) {
  // Allow digits, operators, parentheses, decimal, percent, spaces
  return /^[\d\s+\-*/().%eE]+$/.test(expr);
}

/**
 * Evaluate a math expression safely (no eval of arbitrary code).
 * Supports + - * / ( ) % and unary minus.
 */
function evaluate(expression) {
  const expr = sanitizeExpression(expression);
  if (!expr) return { ok: false, error: 'Empty expression' };
  if (!isSafeExpression(expr)) return { ok: false, error: 'Invalid characters in expression' };

  try {
    // Handle percentage: 15% -> 0.15, or 100 * 15% -> 100 * 0.15
    let prepared = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    // Simple recursive descent or Function constructor with restricted scope
    // Using Function is safer than eval for pure math
    const fn = new Function('"use strict"; return (' + prepared + ')');
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result)) {
      return { ok: false, error: 'Result is not a finite number' };
    }
    // Round tiny floating errors
    const rounded = Math.round(result * 1e12) / 1e12;
    return { ok: true, value: rounded, expression: expr, verified: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Calculation error' };
  }
}

function percentage(value, pct) {
  const v = Number(value);
  const p = Number(pct);
  if (!isFinite(v) || !isFinite(p)) return { ok: false, error: 'Invalid numbers' };
  const result = (v * p) / 100;
  return { ok: true, value: Math.round(result * 1e12) / 1e12, expression: `${v} × ${p}%`, verified: true };
}

module.exports = {
  evaluate,
  percentage,
  sanitizeExpression,
  isSafeExpression,
};
