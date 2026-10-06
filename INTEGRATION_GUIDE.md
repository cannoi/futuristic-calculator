# UNIVERSAL AI + FEEDBACK MODULE — INTEGRATION GUIDE
Version 1.2.0 — Pi SoloHost / generic Node web apps

## 1. Mục tiêu

Một app chỉ có:

- **1 AI system**
- **1 Feedback system**
- **1 AI entry point**

Nếu app đã có AI/Feedback, hãy nâng cấp hoặc adapter hóa hệ thống hiện tại. Không tạo `AI2`, `Feedback2`, `/api/ai2`, panel2 hoặc provider2.

UI/business logic hiện tại của app phải được giữ nguyên. Module chỉ thêm một AI entry point và panel.

## 2. Kiến trúc chuẩn

```text
Existing App UI / Business Logic
          │
          └── AI button (one only)
                  │
                  ▼
             AI Panel Widget
       ┌──────────┼───────────┐
       │          │           │
      Chat     Feedback    Settings/Logs
       │          │
       ▼          ▼
 Universal AI  Universal Feedback
       │          │
       ▼          ▼
 Cloud/Local  Feedback Hub
       │
       ▼
 App Adapter → context / knowledge / safe actions
```

## 3. Universal AI Widget — 4 kiểu

File:

- `ai-module/client/ai-widget.js`
- `ai-module/client/ai-widget.css`
- `ai-module/assets/ai-icon.png`

Icon trong module là **ảnh AI do chủ app cung cấp**, không thay bằng emoji/icon CSS.

### Variant A — Floating

Nút tròn góc màn hình, phù hợp app phổ thông:

```js
UniversalAIWidget.create({
  variant: 'floating',
  iconUrl: '/ai-module/assets/ai-icon.png',
  title: 'AI Assistant',
  getContext: () => appAdapter.getContext()
});
```

### Variant B — Corner

Nút tab ở cạnh màn hình:

```js
UniversalAIWidget.create({
  variant: 'corner',
  iconUrl: '/ai-module/assets/ai-icon.png'
});
```

### Variant C — Dock

Nút lớn hơn dạng dock/floating card:

```js
UniversalAIWidget.create({
  variant: 'dock',
  iconUrl: '/ai-module/assets/ai-icon.png'
});
```

### Variant D — Inline

Đặt vào một vị trí UI mà app đã dành sẵn:

```js
UniversalAIWidget.create({
  variant: 'inline',
  iconUrl: '/ai-module/assets/ai-icon.png',
  mount: 'inline',
  target: document.querySelector('#existing-ai-slot')
});
```

Widget sử dụng **Shadow DOM** để CSS của module không phá CSS của app chủ.

Không bắt buộc app phải thay đổi layout hiện tại.

## 4. Nếu app đã có nút AI

Không tạo nút thứ hai.

Dùng nút hiện tại làm trigger:

```js
UniversalAIWidget.create({
  variant: 'floating',
  button: document.querySelector('#existing-ai-button')
});
```

Widget sẽ dùng panel chung và ẩn trigger nội bộ.

## 5. App Adapter — cầu nối duy nhất

Host app chỉ cần cung cấp:

```js
const appAdapter = {
  knowledge: `
    APP NAME:
    PURPOSE:
    FEATURES:
    SCREENS:
    BUTTONS:
    USER WORKFLOWS:
    LIMITATIONS:
    COMMON ERRORS:
  `,

  async getContext() {
    return {
      screen: getCurrentScreen(),
      selectedItem: getSelectedItem(),
      currentValue: getCurrentValue(),
      recentResults: getRecentResults()
    };
  },

  actions: [
    {name:'open_settings', description:'Open app settings'},
    {name:'refresh', description:'Refresh current data'},
    {name:'delete_item', description:'Delete selected item', requiresConfirmation:true}
  ],

  async executeAction(action) {
    switch(action.name) {
      case 'open_settings': return {ok:true};
      case 'refresh': return await refreshApp();
      case 'delete_item': return await deleteSelectedItemSafely(action.args);
      default: return {ok:false,error:'Action not allowed'};
    }
  }
};
```

AI **không được truy cập DOM/raw filesystem/secrets trực tiếp**.

## 6. AI hiểu app và thay thế tài liệu hướng dẫn

Cung cấp ba lớp context:

### Static Knowledge

- app làm gì
- màn hình
- nút
- workflow
- giới hạn
- lỗi thường gặp
- ý nghĩa dữ liệu

### Live Context

```json
{
  "screen":"calculator",
  "expression":"15% of 2000000",
  "result":300000,
  "verified":true
}
```

### Recent Conversation

Module giữ lịch sử chat ngắn ở client để AI nhớ ngữ cảnh gần nhất.

Nếu app cần lịch sử lâu dài, host có thể lưu lịch sử riêng và truyền phần cần thiết vào adapter. Không mặc định ghi toàn bộ hội thoại vào log.

## 7. Explain Result

Khi app tạo kết quả, host nên giữ một `recentResults` chuẩn.

```js
window.dispatchEvent(new CustomEvent('app:result', {
  detail: {
    type: 'calculation',
    input: '15% của 2 triệu',
    result: 300000,
    verified: true
  }
}));
```

AI phải ưu tiên kết quả đã xác thực từ app thay vì tự tính lại.

## 8. Automation

Luồng bắt buộc:

```text
User request
  ↓
AI proposes action
  ↓
Whitelist check
  ↓
Argument validation
  ↓
Confirmation nếu cần
  ↓
Host executes
  ↓
Host returns {ok:true/false}
  ↓
AI reports actual result
```

Không bao giờ cho model:

- shell
- Docker
- arbitrary URL fetch
- filesystem write
- secrets
- token/key access
- arbitrary JavaScript execution

## 9. Provider architecture — discovery first

`model: auto` **không bao giờ được chuyển thành model ID hard-code**.

Luồng:

```text
Provider
 ↓
List models
 ↓
Filter usable text/chat models
 ↓
Select from returned list
 ↓
Generate
```

Nếu model đã lưu trả 404:

```text
404 model
 ↓
Refresh discovery
 ↓
Choose another returned model
 ↓
Retry ONE time
 ↓
Save recovered model nếu model cũ không phải auto
```

Không retry vô hạn.

### Gemini

Module dùng `v1beta/models` + `generateContent` và gửi API key bằng `x-goog-api-key`, không đặt key trong query string.

Điều này tránh lỗi kiểu:

```text
models/gemini-1.5-flash is not found...
```

vì module không còn giả định model cũ.

### OpenAI-compatible

Discovery qua `/models`, generation qua `/chat/completions`.

Áp dụng cho:

- OpenAI
- DeepSeek
- OpenRouter
- Groq
- Mistral
- xAI
- Custom
- Local

### Anthropic

Discovery qua `/v1/models`, generation qua `/messages`.

## 10. Settings

Settings trong AI Panel:

- Provider
- API key
- Base URL
- Model
- Mode
- Refresh models
- Test connection

API key chỉ lưu server-side.

Sau Save, browser chỉ nhận:

```json
{
  "hasKey": true,
  "maskedKey": "sk-a…1234"
}
```

Không trả full key.

## 11. Test Connection

`POST /api/ai/test` kiểm tra:

1. provider endpoint
2. authentication
3. model discovery
4. chọn được model usable
5. latency

Không bắt buộc phát sinh một lượt generation có tính phí.

## 12. Logs

`GET /api/logs`

Ghi:

- server start
- provider/model
- model refresh
- connection test
- AI errors
- action result
- feedback errors

Không ghi:

- API key
- Feedback ingest token
- password
- Authorization header
- secret trong URL

## 13. Feedback trong AI Panel

Feedback không mở một hệ thống UI thứ hai.

Tab:

```text
Chat | Feedback | Settings | Logs
```

Feedback module cung cấp:

- notice
- unread badge
- mark read
- bug
- improvement
- question
- rating
- message
- offline queue
- donate/support từ Feedback Hub

Không hard-code wallet/QR/payment/support account.

## 14. Unread badge

Nút AI hiển thị số notice chưa đọc.

```text
AI icon
   └── 3
```

Khi người dùng mark-read:

```text
3 → 2 → 1 → 0
```

Khi 0, badge tự ẩn.

Module cũng hỗ trợ `unread_count` nếu Feedback Hub trả field này.

## 15. Feedback token

Token chỉ nằm server-side.

Không trả qua:

```text
/api/feedback/config
```

`publicConfig()` chỉ trả identity công khai.

Nếu source/module ZIP được public, token nhúng trong source vẫn phải được coi là credential và nên rotate.

## 16. Feedback offline

Nếu Hub không kết nối:

- feedback được queue tối đa 20 item ở browser
- khi online lại, module tự flush
- feedback đã gửi thành công bị xóa khỏi queue

Không queue API key/token.

## 17. Server mount

AI:

```js
const {createAIService}=require('./ai-module/server/ai-service');
const {mountAIRoutes}=require('./ai-module/server/routes');

const ai=createAIService({
  appName:'My App',
  dataDir:path.join(process.cwd(),'data'),
  adapter:appAdapter
});

mountAIRoutes(app, ai, {
  authorize:req => req.user?.authenticated === true
});
```

Nếu app đã có authentication, **bắt buộc dùng `authorize`** cho Settings, Logs và AI endpoints.

Feedback:

```js
const {createFeedbackService,mountFeedbackRoutes}=require('./feedback-module/server/feedback-service');
const fb=createFeedbackService({appId:'my-app',appName:'My App',version:'1.0.0'});
mountFeedbackRoutes(app,fb);
```

## 18. Static files

Serve:

```text
ai-module/client/ai-module.js
ai-module/client/ai-widget.js
ai-module/client/ai-widget.css
ai-module/assets/ai-icon.png
feedback-module/client/feedback-module.js
```

## 19. Integration checklist

### Before integration

- [ ] App already has AI? Adapter existing AI; do not create duplicate.
- [ ] App already has Feedback? Adapter existing Feedback; do not create duplicate.
- [ ] Existing UI preserved.
- [ ] Existing business logic preserved.
- [ ] Existing routes checked for collisions.

### AI

- [ ] `appAdapter.knowledge`
- [ ] `getContext()`
- [ ] safe `actions`
- [ ] `executeAction()` validation
- [ ] one AI button
- [ ] widget variant selected
- [ ] static assets served
- [ ] authentication applied to AI routes

### Provider

- [ ] model = auto by default
- [ ] discovery works
- [ ] test connection works
- [ ] stale model 404 recovery works
- [ ] no hard-coded model dependency
- [ ] API key never reaches browser

### Feedback

- [ ] Hub identity configured server-side
- [ ] ingest token never reaches browser
- [ ] unread badge
- [ ] mark-read
- [ ] feedback send
- [ ] offline queue
- [ ] donate/support loaded from Hub

### Final

- [ ] syntax test
- [ ] provider mock test
- [ ] feedback security test
- [ ] ZIP integrity test
- [ ] no missing files
- [ ] no duplicate AI/Feedback routes
- [ ] no duplicate AI buttons
