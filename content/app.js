// app.js - Điểm khởi động chính của CVAT 3D QC Master Tool (world: ISOLATED)

(() => {
  const QC = (globalThis.CVAT3DQC ||= {});
  if (QC.booted) return;
  QC.booted = true;

  console.log('[CVAT 3D QC Master] Đang khởi chạy Extension...');

  // Khởi tạo Thanh công cụ nổi QC
  let dockInstance = null;
  function startQC() {
    if (!dockInstance && QC.QCDock) {
      dockInstance = new QC.QCDock();
      QC.dock = dockInstance;
      console.log('[CVAT 3D QC Master] Khởi tạo thành công Floating QC Dock!');
    }
  }

  // Đợi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startQC);
  } else {
    startQC();
  }

  // Bổ sung phím tắt QC tiện dụng
  window.addEventListener('keydown', (e) => {
    // Alt + Q: Thu nhỏ / Mở rộng thanh Dock
    if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      dockInstance?.toggleMinimize();
    }
    // Alt + S: Quét nhanh lỗi Job
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      dockInstance?.handleScanJob();
    }
  });
})();
