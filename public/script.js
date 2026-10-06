/* ===== Original Calculator (preserved) ===== */
let current = '0';
let history = '';
const calcHistory = []; // local history for AI context

function update() {
  document.getElementById('result').innerText = current;
  document.getElementById('history').innerText = history;
}
function appendNum(n) {
  if (current === '0') current = n;
  else current += n;
  update();
}
function appendOp(op) {
  history = current + ' ' + op;
  current = '0';
  update();
}
function clearAll() {
  current = '0';
  history = '';
  update();
}
function deleteLast() {
  current = current.slice(0, -1) || '0';
  update();
}
function calculate() {
  try {
    const expr = (history ? history + ' ' : '') + current;
    let h = history.replace(/×/g, '*').replace(/÷/g, '/');
    const result = eval(h + current).toString();
    calcHistory.push({ expr: expr.trim(), result, ts: Date.now() });
    if (calcHistory.length > 40) calcHistory.shift();
    current = result;
    history = '';
  } catch {
    current = 'Error';
  }
  update();
}


/* ===== Universal AI + Feedback Module integration =====
 * The calculator UI/business logic above is preserved. The old AI/Feedback
 * implementation has been removed; the universal modules own all AI,
 * Feedback, Settings and Logs UI.
 */
function applyUniversalAiActions(actions) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || !a.ok) continue;
    switch (a.action) {
      case 'clear_all':
        clearAll();
        break;
      case 'set_result':
        if (a.value != null) {
          current = String(a.value);
          history = '';
          update();
        }
        break;
      case 'set_expression':
        if (a.value != null) {
          history = String(a.value);
          current = '0';
          update();
        }
        break;
      default:
        break;
    }
  }
}

function calculatorAiContext() {
  return {
    screen: 'calculator',
    expression: (history ? history + ' ' : '') + current,
    result: current === 'Error' ? null : current,
    calcHistory: calcHistory.slice(-10),
  };
}

window.addEventListener('DOMContentLoaded', () => {
  if (!window.UniversalAIWidget) return;

  window.UniversalAIWidget.create({
    variant: 'floating',
    iconUrl: '/ai-module/assets/ai-icon.png',
    title: 'AI Assistant',
    getContext: calculatorAiContext,
    onActions: applyUniversalAiActions,
  });
});
