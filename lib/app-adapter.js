'use strict';

const { evaluate } = require('./calc-engine');

const ALLOWED = new Set(['clear_all', 'set_result', 'set_expression']);

const adapter = {
  knowledge: `
APP NAME: Futuristic Calculator
PURPOSE: A lightweight futuristic calculator for common arithmetic.
FEATURES:
- Basic arithmetic: addition, subtraction, multiplication and division.
- Decimal numbers, delete and clear.
- Verified calculation engine shared by the app and AI integration.
- AI Assistant is provided by the Universal AI Module (Chat | Feedback | Settings | Logs).
- Feedback, provider settings and logs are provided by the Universal AI + Feedback Modules.
USER WORKFLOWS:
- Enter numbers and operators, then press = to calculate.
- AC clears the current calculation.
- DEL removes the last digit.
- AI can explain the current result or help the user understand how to use the calculator.
LIMITATIONS:
- AI must never invent calculator capabilities.
- Calculator results should be treated as authoritative when the live context marks them verified.
SAFE ACTIONS:
- clear_all: clear the calculator.
- set_result: put a verified numeric value into the display.
- set_expression: place an expression into the calculator for the user to review.
`,
  actions: [
    { name: 'clear_all', description: 'Clear the calculator display and current expression.', requiresConfirmation: false },
    { name: 'set_result', description: 'Set a numeric result in the calculator display.', requiresConfirmation: false },
    { name: 'set_expression', description: 'Put a safe arithmetic expression into the calculator for the user to review.', requiresConfirmation: false },
  ],
  async getContext(context = {}) {
    return {
      screen: 'calculator',
      expression: context.expression || '',
      result: context.result ?? null,
      calcHistory: Array.isArray(context.calcHistory) ? context.calcHistory.slice(-10) : [],
    };
  },
  async executeAction(action) {
    const name = String(action?.name || '');
    const args = action?.args || {};
    if (!ALLOWED.has(name)) {
      return { ok: false, error: 'Action not allowed' };
    }
    if (name === 'clear_all') return { ok: true, action: name };
    if (name === 'set_result') {
      const value = Number(args.value);
      if (!Number.isFinite(value)) return { ok: false, error: 'set_result requires a finite number' };
      return { ok: true, action: name, value: String(value) };
    }
    const expression = String(args.expression || args.value || '');
    const checked = evaluate(expression);
    if (!checked.ok) return { ok: false, error: checked.error };
    return { ok: true, action: name, value: checked.expression, verifiedResult: checked.value };
  },
  async localReply(message, live) {
    const m = String(message || '').toLowerCase();
    const expr = live && live.expression ? String(live.expression) : '';
    const result = live && live.result != null ? String(live.result) : '';
    if (/cách dùng|hướng dẫn|help|how to|hướng dẫn sử dụng|sử dụng/.test(m)) {
      return 'Máy tính: nhập số → chọn +, −, ×, ÷ → nhập số tiếp → nhấn =. AC xóa hết, DEL xóa ký tự cuối. Nút robot góc phải: Chat, Feedback, Settings, Logs.';
    }
    if (/kết quả|result|hiện tại|đang hiện|expression|biểu thức/.test(m)) {
      if (expr || result) {
        return 'Biểu thức/hiển thị hiện tại: ' + (expr || '(trống)') + (result ? ' · kết quả: ' + result : '') + '. Kết quả từ máy tính là chuẩn, AI không tự tính lại nếu không chắc.';
      }
      return 'Chưa có biểu thức trên màn hình. Nhập số và phép tính rồi hỏi lại.';
    }
    if (/feedback|góp ý|donate|ủng hộ|báo lỗi|bug/.test(m)) {
      return 'Tab Feedback trong nút robot: gửi bug/ý tưởng. Tài khoản ủng hộ chỉ hiện sau khi sync từ Feedback Hub (không hard-code trong app).';
    }
    if (/setting|api key|provider|cài đặt|cấu hình/.test(m)) {
      return 'Tab Settings: chọn OpenAI, Gemini, DeepSeek, Anthropic, OpenRouter, Groq, Mistral, xAI, Custom hoặc Local. Custom/Local cần Base URL. Lưu rồi Check token. Chưa có key thì Chat vẫn trả lời hướng dẫn offline.';
    }
    if (/logs|nhật ký/.test(m)) {
      return 'Tab Logs xem nhật ký phía server (không chứa API key).';
    }
    if (/clear|xóa|ac/.test(m)) {
      return 'Nhấn AC trên máy tính để xóa, hoặc nhờ AI action clear_all.';
    }
    return 'Mình là hướng dẫn viên Futuristic Calculator. Hỏi cách dùng, biểu thức hiện tại, Feedback, Settings hoặc Logs. Chưa cấu hình API key thì phần này vẫn trả lời offline.';
  },
};

module.exports = adapter;
