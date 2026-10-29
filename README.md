# CVAT 3D QC Master Tool (Chrome Extension)
**Công cụ kiểm định chất lượng gán nhãn 3D LiDAR & Cuboid chuyên dụng cho xe tự lái trên CVAT**

---

## 🌟 ĐẶC ĐIỂM THIẾT KẾ & TÍNH NĂNG CỐT LÕI

### 1. Thanh trượt Cỡ hạt Point (Point Size Slider - Chuẩn Guideline 1x)
* **Ý nghĩa thực tế theo QC Guideline:**
  * Khi hiển thị trên màn hình, mỗi hạt LiDAR có kích thước đường kính $D$ và bán kính $R = D/2$.
  * Guideline dự án quy định: **Hạt point không được bị một nửa nằm ra ngoài Cuboid ở kích thước chuẩn 1x**.
  * Bất kỳ hạt điểm nào nằm cấn ở mép vách của Cuboid mà tâm hoặc phần thân hạt bị vách cắt ngang (khoảng cách tới vách $\le R_{1x}$) $\rightarrow$ Lập tức đổi sang **màu Xanh Lơ Cyan (`#00D9F2`)**.
* **Điều chỉnh linh hoạt:**
  * Mặc định chốt cứng ở chuẩn **`1.0x`** của CVAT.
  * Có thể kéo thanh trượt từ `0.5x` đến `3.0x` với các nút chọn nhanh: `[0.5x]`, `[1.0x]`, `[1.5x]`, `[2.0x]`. Khi kéo, bán kính quét tự động co giãn theo đúng kích thước hạt mà bạn quan sát.

### 2. Thanh trượt Ngưỡng khoảng cách ngoài d (Near-Miss Distance Slider)
* **Ý nghĩa:** Khi người gán nhãn vô tình kéo box bị hụt (ví dụ quên cản trước/sau hoặc gương chiếu hậu), các điểm này nằm hoàn toàn bên ngoài vách.
* **Cơ chế:** Kéo thanh trượt khoảng cách $d$ (từ `0.01m` đến `0.60m`, mặc định `0.15m = 15cm`):
  * Mọi điểm nằm **hoàn toàn bên ngoài box** nhưng trong cự ly $\le d$ sẽ ngay lập tức được **tô màu Cam Neon (`#FF7A00`)**.
  * Có các nút chọn nhanh: `[5cm]`, `[15cm]`, `[30cm]`.

### 3. Phát hiện & Đổi màu thông minh khi Cuboid đè nhau (3D Overlap)
* **Thuật toán cắt 3D:** Sử dụng thuật toán cắt đa giác phẳng Sutherland-Hodgman trên mặt phẳng đáy kết hợp kiểm tra độ cao trục Z để tính chính xác thể tích giao nhau $V_{\cap}$ và hệ số $IoU_{3D}$.
* **Đổi màu tương phản động (Dynamic Contrast Color):**
  * **Chế độ `Color by Label`:** Hai box cùng class (cùng màu gốc) $\rightarrow$ Phần giao nhau đổi sang màu bù $180^\circ$ trên vòng tròn HSL (Hồng cánh sen / Tím rực), nổi bật hoàn toàn trên nền màu class.
  * **Chế độ `Color by Instance / Group`:** Hai box có 2 màu khác nhau $\rightarrow$ Phần giao nhau đổi sang màu tương phản thứ 3 cách xa nhất cả 2 màu (không bị chìm vào màu nào).
  * **Khung Wireframe 3D:** Tự động dựng khung lăng trụ giao nhau trực tiếp trong Three.js scene để quan sát ở cả 4 góc nhìn.

### 4. Thiết kế Kéo Thả Tự Do (Draggable Dock) & Né Thanh Tua Frame CVAT
* **Né Player của CVAT:** Vị trí mặc định đặt ở góc trên bên phải (`top: 60px; right: 24px`), chừa hoàn toàn khoảng không gian chính giữa cho thanh trượt tua frame của CVAT.
* **Tay nắm kéo thả tự do:** Bấm giữ chuột trái vào biểu tượng `⋮⋮` hoặc tiêu đề `3D QC MASTER` để kéo dock đến bất kỳ góc nào trên màn hình.
* **Tự động nhớ vị trí:** Tọa độ vị trí được lưu vào `localStorage`, không lo bị nhảy vị trí khi đổi frame hay F5.

### 5. Bảng quét lỗi tự động toàn Job (Pre-flight QA Inspector)
* Bấm nút **"Quét lỗi Job"** (hoặc phím tắt `Alt + S`):
  * Rà soát tự động toàn bộ hàng trăm frame trong RAM.
  * Phát hiện: Hộp đè nhau, xe co giãn kích thước thất thường, xe nhảy vọt vị trí bất thường.
  * Bấm vào dòng lỗi bất kỳ $\rightarrow$ CVAT tự nhảy đến frame đó và focus vào đúng xe bị lỗi.

---

## ⌨️ BẢNG PHÍM TẮT DÀNH CHO QC

| Phím tắt | Tác dụng |
| :--- | :--- |
| **`Alt + Q`** | Thu nhỏ / Mở rộng thanh dock QC |
| **`Alt + S`** | Bật quét tự động toàn bộ lỗi trong Job |

---

## 🛠 HƯỚNG DẪN TẢI LẠI TRÊN TRÌNH DUYỆT

1. Mở trang `chrome://extensions/` trên Chrome/Edge.
2. Tìm **CVAT 3D QC Master Tool** và bấm nút **Tải lại (biểu tượng xoay vòng tròn 🔄)**.
3. Quay lại tab CVAT và bấm `F5` để tải lại trang.
