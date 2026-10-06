# Futuristic Calculator

Một ứng dụng máy tính hiện đại, nhẹ, chạy trên Node.js.

## Universal AI + Feedback

Bản 1.3.1 đã **loại bỏ hoàn toàn hệ thống AI và Feedback cũ** và sử dụng:

- `ai-module/` — Universal AI Module
- `feedback-module/` — Universal Feedback Module

AI/Feedback chỉ có một hệ thống duy nhất trong app. Nút AI dùng ảnh robot trong module và mở panel chung gồm Chat, Feedback, Settings và Logs.

AI được kết nối với Calculator qua `appAdapter`, cung cấp:
- kiến thức về app
- live calculator context
- lịch sử kết quả gần đây
- các thao tác an toàn đã whitelist

API key AI và Feedback Hub ingest token chỉ được xử lý phía server.

Xem `INTEGRATION_GUIDE.md` và `INTEGRATION_PROMPT.md` để tích hợp module vào các app khác.

## Cấu hình

Sử dụng `.env`/SoloHost environment để tùy chỉnh cổng và các biến môi trường cần thiết. Không cần nhập Feedback Hub token ở giao diện người dùng.

## Kiểm tra

```bash
npm test
```

## Made with App Builder — Pi SoloHost
