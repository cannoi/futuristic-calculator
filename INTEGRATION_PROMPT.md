# COPY/PASTE PROMPT FOR AI CODE

Bạn đang tích hợp **Universal AI + Feedback Module v1.2.0** vào một app hiện có.

MỤC TIÊU:
- Không xây lại app.
- Không thay đổi UI/business logic hiện tại.
- Không tạo AI2/Feedback2.
- Chỉ có một AI entry point.
- AI phải hiểu app qua App Adapter.
- Feedback nằm trong cùng AI Panel.

BẮT BUỘC:
1. Quét source app trước.
2. Tìm AI/Feedback hiện tại. Nếu đã có, nâng cấp/adapt thay vì tạo hệ thống song song.
3. Đọc `INTEGRATION_GUIDE.md`, `SECURITY.md` và `example/app-adapter.js`.
4. Tạo `appAdapter` gồm `knowledge`, `getContext`, `actions`, `executeAction`.
5. Chỉ whitelist action an toàn. Action destructive phải confirmation.
6. Không đưa API key/Hub token/secrets vào browser hoặc AI context.
7. Dùng `model: auto`; không hard-code model provider.
8. Serve 4 file AI widget + icon và Feedback client.
9. Chọn một widget variant: floating/corner/dock/inline.
10. Nếu app có nút AI sẵn, dùng lại nút đó.
11. Mount server routes vào HTTP server hiện tại.
12. Dùng `authorize` nếu app có authentication.
13. Giữ nguyên tất cả phần còn lại của app.
14. Sau tích hợp chạy syntax + smoke + provider mock + security + ZIP integrity.
15. Báo cáo rõ file đã sửa/thêm, file không thay đổi, test đã chạy và lỗi còn lại.

LUỒNG AI:
User → AI Panel → Universal AI → Provider discovery → model → response → App Adapter.

LUỒNG AUTOMATION:
AI proposal → whitelist → validate args → confirmation nếu cần → executeAction → kết quả thật.

LUỒNG FEEDBACK:
AI Panel → Feedback → server proxy → Feedback Hub.

Không được gửi Feedback ingest token xuống browser.
