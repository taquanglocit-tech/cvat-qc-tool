// qc-dock.js - Giao diện Thanh công cụ nổi QC (Floating QC Dock) & Bảng lỗi (Issue Drawer)
// Thiết kế chuẩn Ant Design Dark của CVAT, không dùng Emoji, biểu tượng Vector kỹ thuật tối giản
// Hỗ trợ Kéo thả tự do (Draggable) né thanh trượt frame của CVAT & Tự động nhớ vị trí (localStorage)

(() => {
  const QC = (globalThis.CVAT3DQC ||= {});
  const { h, svg } = QC.ui;

  const STORAGE_POS_KEY = 'cvat_3d_qc_dock_pos_v1';

  const CSS = `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      pointer-events: none !important;
    }
    * { box-sizing: border-box; }

    /* Thanh dock chính nổi - Vị trí mặc định ở góc trên bên phải để né thanh trượt frame của CVAT */
    .qc-dock {
      pointer-events: auto !important;
      position: fixed;
      top: 60px;
      right: 24px;
      left: auto;
      z-index: 2147483000;
      background: #141414;
      color: #d9d9d9;
      border: 1px solid #303030;
      border-radius: 6px;
      padding: 6px 12px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      line-height: 1.4;
      user-select: none;
    }

    .qc-dock.is-dragging {
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85);
      border-color: #177ddc;
    }

    .qc-dock.minimized {
      padding: 4px 8px;
      gap: 8px;
    }

    .qc-dock.minimized .qc-expanded-content {
      display: none !important;
    }

    /* Tay nắm kéo thả (Drag Handle) */
    .qc-drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      color: #595959;
      padding: 2px 4px;
      border-radius: 3px;
      transition: color 0.15s, background 0.15s;
    }
    .qc-drag-handle:hover {
      color: #177ddc;
      background: #262626;
    }
    .qc-drag-handle:active {
      cursor: grabbing;
    }

    /* Tiêu đề & Logo Dock */
    .qc-title-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: #fff;
      font-size: 12px;
      border-right: 1px solid #303030;
      padding-right: 10px;
    }
    .qc-title-wrap .qc-icon {
      color: #177ddc;
    }

    /* Hộp chọn Đối tượng mục tiêu (Target Box Selector) */
    .qc-target-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }

    .qc-target-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #1f1f1f;
      border: 1px solid #303030;
      border-radius: 4px;
      padding: 3px 7px;
      font-size: 11px;
      color: #d9d9d9;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
      max-width: 140px;
    }
    .qc-target-badge:hover {
      background: #262626;
      border-color: #177ddc;
      color: #fff;
    }
    .qc-target-badge.active {
      background: #111d2c;
      border-color: #177ddc;
      color: #177ddc;
    }
    .qc-target-badge.is-new {
      animation: qc-pulse-border 0.8s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes qc-pulse-border {
      0% { box-shadow: 0 0 0 0 rgba(23, 125, 220, 0.7); border-color: #177ddc; }
      50% { box-shadow: 0 0 0 5px rgba(23, 125, 220, 0); border-color: #177ddc; }
      100% { box-shadow: 0 0 0 0 rgba(23, 125, 220, 0); }
    }

    .qc-target-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #595959;
      transition: background 0.2s ease;
    }

    .qc-target-text {
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-variant-numeric: tabular-nums;
    }

    .qc-target-arrow {
      color: #8c8c8c;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      transition: transform 0.15s ease;
    }
    .qc-target-badge.active .qc-target-arrow {
      transform: rotate(180deg);
      color: #177ddc;
    }

    .qc-target-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 150px;
      max-width: 220px;
      max-height: 220px;
      overflow-y: auto;
      background: #141414;
      border: 1px solid #303030;
      border-radius: 4px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
      z-index: 2147483020;
      padding: 4px 0;
    }
    .qc-target-dropdown.hidden {
      display: none !important;
    }

    .qc-target-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      font-size: 11px;
      color: #bfbfbf;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
    }
    .qc-target-item:hover {
      background: #1f1f1f;
      color: #fff;
    }
    .qc-target-item.selected {
      background: #111d2c;
      color: #177ddc;
      font-weight: 600;
    }
    .qc-target-item-empty {
      padding: 8px 10px;
      color: #595959;
      font-size: 11px;
      text-align: center;
    }

    /* Các cụm điều khiển */
    .qc-group {
      display: flex;
      align-items: center;
      gap: 6px;
      border-right: 1px solid #303030;
      padding-right: 10px;
    }

    .qc-label {
      font-size: 11px;
      color: #8c8c8c;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .qc-value-badge {
      font-family: monospace;
      font-weight: 600;
      color: #fff;
      background: #262626;
      border: 1px solid #434343;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 11px;
      min-width: 42px;
      text-align: center;
    }

    /* Slider điều khiển */
    .qc-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 80px;
      height: 4px;
      border-radius: 2px;
      background: #303030;
      outline: none;
      cursor: pointer;
    }
    .qc-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #177ddc;
      border: 2px solid #fff;
      cursor: pointer;
      transition: transform 0.1s;
    }
    .qc-slider::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Nút bấm nhanh Preset */
    .qc-preset-btn {
      background: #1f1f1f;
      border: 1px solid #303030;
      color: #a6a6a6;
      border-radius: 3px;
      padding: 1px 5px;
      font-size: 10px;
      cursor: pointer;
    }
    .qc-preset-btn:hover {
      background: #262626;
      border-color: #177ddc;
      color: #fff;
    }
    .qc-preset-btn.active {
      background: #177ddc;
      border-color: #177ddc;
      color: #fff;
    }

    /* Checkbox & Màu sắc */
    .qc-check-label {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      cursor: pointer;
      color: #bfbfbf;
    }
    .qc-check-label:hover {
      color: #fff;
    }
    .qc-check-label input {
      cursor: pointer;
    }
    .qc-color-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    /* Thẻ thống kê HUD thời gian thực */
    .qc-hud-stats {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      background: #1a1a1a;
      border: 1px solid #303030;
      border-radius: 4px;
      padding: 2px 8px;
    }
    .qc-stat-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .qc-stat-val {
      font-weight: 600;
    }
    .qc-stat-val.warning {
      color: #fa8c16;
      font-weight: 700;
    }
    .qc-stat-val.danger {
      color: #f5222d;
      font-weight: 700;
    }

    /* Nút hành động chính */
    button.qc-btn {
      background: #262626;
      color: #d9d9d9;
      border: 1px solid #434343;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    button.qc-btn:hover {
      background: #303030;
      border-color: #177ddc;
      color: #fff;
    }
    button.qc-btn.primary {
      background: #177ddc;
      border-color: #177ddc;
      color: #fff;
    }
    button.qc-btn.primary:hover {
      background: #1668b5;
    }

    .qc-icon-btn {
      background: transparent;
      border: none;
      color: #8c8c8c;
      cursor: pointer;
      padding: 2px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .qc-icon-btn:hover {
      color: #fff;
      background: #262626;
    }

    /* Ngăn kéo / Modal danh sách lỗi QA (Issue Drawer) */
    .qc-drawer {
      pointer-events: auto !important;
      position: fixed;
      top: 60px;
      right: 24px;
      width: 360px;
      max-height: calc(100vh - 120px);
      background: #141414;
      border: 1px solid #303030;
      border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75);
      z-index: 2147483010;
      display: flex;
      flex-direction: column;
      font-size: 12px;
    }
    .qc-drawer.hidden {
      display: none !important;
    }
    .qc-drawer-header {
      padding: 10px 14px;
      border-bottom: 1px solid #303030;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      color: #fff;
    }
    .qc-drawer-body {
      overflow-y: auto;
      max-height: 500px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .qc-issue-card {
      background: #1f1f1f;
      border: 1px solid #303030;
      border-radius: 4px;
      padding: 8px 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .qc-issue-card:hover {
      background: #262626;
      border-color: #177ddc;
    }
    .qc-issue-card.severity-high {
      border-left: 3px solid #f5222d;
    }
    .qc-issue-card.severity-medium {
      border-left: 3px solid #faad14;
    }
    .qc-issue-title {
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .qc-issue-frame-tag {
      font-family: monospace;
      font-size: 11px;
      background: #141414;
      border: 1px solid #303030;
      border-radius: 3px;
      padding: 1px 5px;
      color: #177ddc;
    }
    .qc-issue-desc {
      font-size: 11px;
      color: #8c8c8c;
    }

    /* Nút Cài đặt trên Dock */
    .qc-settings-btn {
      background: #1f1f1f;
      border: 1px solid #303030;
      color: #a6a6a6;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .qc-settings-btn:hover {
      background: #262626;
      border-color: #177ddc;
      color: #fff;
    }
    .qc-settings-btn.active {
      background: #111d2c;
      border-color: #177ddc;
      color: #177ddc;
    }

    /* Bảng Cài đặt nổi (Settings Popover) */
    .qc-popover {
      pointer-events: auto !important;
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      width: 360px;
      background: #141414;
      border: 1px solid #303030;
      border-radius: 6px;
      padding: 12px 14px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 12px;
      z-index: 2147483010;
      color: #d9d9d9;
    }
    .qc-popover.hidden {
      display: none !important;
    }
    .qc-popover-header {
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #262626;
      padding-bottom: 6px;
      font-size: 12px;
    }
    .qc-popover-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .qc-popover-section-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #8c8c8c;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .qc-popover-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .qc-popover-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 12px;
    }
  `;

  class QCDock {
    constructor() {
      this.host = null;
      this.root = null;
      this.dockEl = null;
      this.settingsBtnEl = null;
      this.popoverEl = null;
      this.targetBadgeEl = null;
      this.targetDropdownEl = null;
      this.isMinimized = false;
      this.isSettingsOpen = false;
      this.isTargetMenuOpen = false;
      this.lastTargetId = null;

      this.settings = {
        enabled: true,
        outerThreshold: 0.15,   // Ngưỡng lọt ngoài hoàn toàn d (m)
        pointSize: 1.0,         // Kích thước hạt Point (mặc định 1.0x theo guideline CVAT)
        filterGround: true,     // Lọc mặt đất ở đáy hộp
        bottomTolerance: 0.05,  // Dung sai đáy hộp (5cm = 0.05m)
        highlightMissed: true,  // Tô màu điểm lọt ngoài hoàn toàn (Cam Neon)
        highlightBoundary: true,// Tô màu điểm bị lòi quá nửa ra ngoài (Xanh Lơ)
        highlightInnerEdge: true, // Cảnh báo điểm mép trong mấp mé sát vách (Vàng Chanh)
        highlightOverlap: true, // Tô màu & vẽ wireframe chồng lấn
        activeOnly: true,       // Soi theo box đang chọn
      };

      try {
        const savedSettings = localStorage.getItem('cvat_3d_qc_settings_v1');
        if (savedSettings) {
          Object.assign(this.settings, JSON.parse(savedSettings));
        }
      } catch {}

      this.latestStats = {
        insideCount: 0,
        innerEdgeCount: 0,
        boundaryCount: 0,
        nearMissedCount: 0,
        overlapCount: 0,
      };

      this.issues = [];
      this.isDrawerOpen = false;

      this.init();
    }

    init() {
      this.host = document.createElement('div');
      this.host.id = 'cvat-3d-qc-root';
      this.root = this.host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = CSS;
      this.root.appendChild(style);

      this.render();
      document.body.appendChild(this.host);

      // Khôi phục vị trí đã lưu và thiết lập kéo thả
      this.restorePositionAndSetupDrag();

      // Đóng bảng cài đặt & menu chọn box khi click ra ngoài
      document.addEventListener('mousedown', (e) => {
        const path = e.composedPath();
        if (this.isSettingsOpen && !path.includes(this.dockEl)) {
          this.toggleSettings(false);
        }
        if (this.isTargetMenuOpen && !path.includes(this.targetBadgeEl) && !path.includes(this.targetDropdownEl)) {
          this.toggleTargetMenu(false);
        }
      });

      // Lắng nghe sự kiện cập nhật từ bridge
      QC.bridge.onEvent((payload) => {
        if (payload.type === 'qc-state-updated') {
          if (payload.stats) {
            this.latestStats = payload.stats;
            this.updateHUD();
          }
        }
      });
    }

    // Thiết lập kéo thả và lưu vị trí vào localStorage
    restorePositionAndSetupDrag() {
      const dock = this.dockEl;
      if (!dock) return;

      // 1. Khôi phục vị trí đã lưu
      try {
        const saved = localStorage.getItem(STORAGE_POS_KEY);
        if (saved) {
          const { left, top } = JSON.parse(saved);
          if (Number.isFinite(left) && Number.isFinite(top)) {
            // Đảm bảo không nằm ngoài viền màn hình
            const pad = 8;
            const maxLeft = Math.max(pad, window.innerWidth - 120);
            const maxTop = Math.max(pad, window.innerHeight - 40);
            const clLeft = Math.max(pad, Math.min(left, maxLeft));
            const clTop = Math.max(pad, Math.min(top, maxTop));

            dock.style.left = `${clLeft}px`;
            dock.style.top = `${clTop}px`;
            dock.style.right = 'auto';
          }
        }
      } catch (err) {
        console.warn('Không đọc được vị trí dock cũ:', err);
      }

      // 2. Lắng nghe kéo thả chuột trên tay nắm và tiêu đề
      const handle = dock.querySelector('.qc-drag-handle');
      const titleWrap = dock.querySelector('.qc-title-wrap');
      const dragTargets = [handle, titleWrap].filter(Boolean);

      let isDragging = false;
      let startX = 0, startY = 0;
      let initialLeft = 0, initialTop = 0;

      const onMouseDown = (e) => {
        // Chỉ kéo bằng chuột trái và không click vào nút con
        if (e.button !== 0 || e.target.closest('button, input')) return;
        isDragging = true;
        dock.classList.add('is-dragging');

        const rect = dock.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;

        dock.style.left = `${initialLeft}px`;
        dock.style.top = `${initialTop}px`;
        dock.style.right = 'auto';

        const onMouseMove = (ev) => {
          if (!isDragging) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          const pad = 6;
          const maxLeft = window.innerWidth - dock.offsetWidth - pad;
          const maxTop = window.innerHeight - dock.offsetHeight - pad;

          const newLeft = Math.max(pad, Math.min(initialLeft + dx, maxLeft));
          const newTop = Math.max(pad, Math.min(initialTop + dy, maxTop));

          dock.style.left = `${newLeft}px`;
          dock.style.top = `${newTop}px`;
        };

        const onMouseUp = () => {
          if (!isDragging) return;
          isDragging = false;
          dock.classList.remove('is-dragging');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);

          // Lưu vị trí mới vào localStorage
          const finalRect = dock.getBoundingClientRect();
          try {
            localStorage.setItem(STORAGE_POS_KEY, JSON.stringify({
              left: Math.round(finalRect.left),
              top: Math.round(finalRect.top),
            }));
          } catch {}
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      };

      for (const t of dragTargets) {
        t.addEventListener('mousedown', onMouseDown);
      }
    }

    syncSettings() {
      try {
        localStorage.setItem('cvat_3d_qc_settings_v1', JSON.stringify(this.settings));
      } catch {}
      QC.bridge.updateQCSettings(this.settings).then((res) => {
        if (res?.stats) {
          this.latestStats = res.stats;
          this.updateHUD();
        }
      }).catch(console.error);
    }

    toggleSettings(open) {
      this.isSettingsOpen = open !== undefined ? open : !this.isSettingsOpen;
      if (this.popoverEl) {
        this.popoverEl.classList.toggle('hidden', !this.isSettingsOpen);
        if (this.isSettingsOpen && this.dockEl) {
          const rect = this.dockEl.getBoundingClientRect();
          if (rect.bottom > window.innerHeight - 340) {
            this.popoverEl.style.top = 'auto';
            this.popoverEl.style.bottom = 'calc(100% + 8px)';
          } else {
            this.popoverEl.style.top = 'calc(100% + 8px)';
            this.popoverEl.style.bottom = 'auto';
          }
        }
      }
      if (this.settingsBtnEl) {
        this.settingsBtnEl.classList.toggle('active', this.isSettingsOpen);
      }
    }

    toggleTargetMenu(open) {
      this.isTargetMenuOpen = open !== undefined ? open : !this.isTargetMenuOpen;
      if (this.targetDropdownEl) {
        this.targetDropdownEl.classList.toggle('hidden', !this.isTargetMenuOpen);
      }
      if (this.targetBadgeEl) {
        this.targetBadgeEl.classList.toggle('active', this.isTargetMenuOpen);
      }
    }

    renderTargetDropdownItems(boxes, currentTarget) {
      if (!this.targetDropdownEl) return;
      this.targetDropdownEl.innerHTML = '';

      if (!boxes || boxes.length === 0) {
        const empty = h('div', { className: 'qc-target-item-empty' }, 'Không có cuboid ở frame này');
        this.targetDropdownEl.appendChild(empty);
        return;
      }

      for (const b of boxes) {
        const isSelected = currentTarget && currentTarget.clientID === b.clientID;
        const item = h('div', {
          className: `qc-target-item ${isSelected ? 'selected' : ''}`,
          onClick: (e) => {
            e.stopPropagation();
            this.toggleTargetMenu(false);
            QC.bridge.selectBox(b.clientID).catch(console.error);
          },
        },
          h('span', { className: 'qc-target-dot', style: { background: b.color || '#177ddc' } }),
          h('span', { style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `#${b.clientID} ${b.labelName}`),
          isSelected ? svg('check', 11) : null
        );
        this.targetDropdownEl.appendChild(item);
      }
    }

    updateHUD() {
      if (!this.root) return;
      const insideEl = this.root.getElementById('stat-inside');
      const innerEdgeEl = this.root.getElementById('stat-inner-edge');
      const boundEl = this.root.getElementById('stat-boundary');
      const missedEl = this.root.getElementById('stat-missed');
      const overlapEl = this.root.getElementById('stat-overlap');

      if (insideEl) insideEl.textContent = this.latestStats.insideCount ?? 0;
      if (innerEdgeEl) innerEdgeEl.textContent = this.latestStats.innerEdgeCount ?? 0;
      if (boundEl) boundEl.textContent = this.latestStats.boundaryCount ?? 0;
      if (missedEl) {
        missedEl.textContent = this.latestStats.nearMissedCount ?? 0;
        missedEl.className = `qc-stat-val ${(this.latestStats.nearMissedCount ?? 0) > 0 ? 'warning' : ''}`;
      }
      if (overlapEl) {
        overlapEl.textContent = this.latestStats.overlapCount ?? 0;
        overlapEl.className = `qc-stat-val ${(this.latestStats.overlapCount ?? 0) > 0 ? 'danger' : ''}`;
      }

      // Cập nhật Target Box Selector Badge
      const dotEl = this.root.getElementById('qc-target-dot');
      const textEl = this.root.getElementById('qc-target-text');
      const target = this.latestStats.targetBox;
      const boxes = this.latestStats.availableBoxes || [];

      if (dotEl && textEl) {
        if (!this.settings.activeOnly) {
          textEl.textContent = `Tất cả box (${boxes.length})`;
          dotEl.style.background = '#177ddc';
        } else if (target) {
          textEl.textContent = `#${target.clientID} ${target.labelName}`;
          dotEl.style.background = target.color || '#177ddc';

          if (this.lastTargetId !== target.clientID) {
            this.lastTargetId = target.clientID;
            if (this.targetBadgeEl) {
              this.targetBadgeEl.classList.remove('is-new');
              void this.targetBadgeEl.offsetWidth;
              this.targetBadgeEl.classList.add('is-new');
            }
          }
        } else {
          textEl.textContent = 'Chưa chọn box';
          dotEl.style.background = '#595959';
          this.lastTargetId = null;
        }
      }

      // Cập nhật danh sách trong dropdown
      if (this.targetDropdownEl) {
        this.renderTargetDropdownItems(boxes, target);
      }
    }

    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      if (this.dockEl) {
        this.dockEl.classList.toggle('minimized', this.isMinimized);
      }
      if (this.isMinimized && this.isSettingsOpen) {
        this.toggleSettings(false);
      }
    }

    async handleScanJob() {
      const scanBtn = this.root.getElementById('qc-scan-btn');
      if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.textContent = 'Đang quét...';
      }

      try {
        const res = await QC.scanner.runJobScan();
        this.issues = res.issues || [];
        this.isDrawerOpen = true;
        this.renderDrawer();
      } catch (err) {
        alert('Lỗi quét Job: ' + (err.message || err));
      } finally {
        if (scanBtn) {
          scanBtn.disabled = false;
          scanBtn.innerHTML = '';
          scanBtn.appendChild(svg('checklist', 13));
          scanBtn.appendChild(document.createTextNode(' Quét lỗi Job'));
        }
      }
    }

    renderDrawer() {
      let drawer = this.root.querySelector('.qc-drawer');
      if (!drawer) {
        drawer = h('div', { className: 'qc-drawer' });
        this.root.appendChild(drawer);
      }

      drawer.innerHTML = '';
      if (!this.isDrawerOpen) {
        drawer.classList.add('hidden');
        return;
      }
      drawer.classList.remove('hidden');

      const header = h('div', { className: 'qc-drawer-header' },
        h('span', {}, `Danh sách lỗi kiểm tra (${this.issues.length})`),
        h('button', {
          className: 'qc-icon-btn',
          onClick: () => {
            this.isDrawerOpen = false;
            this.renderDrawer();
          },
        }, svg('close', 14))
      );

      const body = h('div', { className: 'qc-drawer-body' });

      if (this.issues.length === 0) {
        body.appendChild(h('div', {
          style: { padding: '20px', textAlign: 'center', color: '#8c8c8c' },
        }, 'Không phát hiện lỗi bất thường nào trong Job này'));
      } else {
        for (const item of this.issues) {
          const card = h('div', {
            className: `qc-issue-card severity-${(item.severity || 'low').toLowerCase()}`,
            onClick: () => {
              QC.bridge.jumpToFrame(item.frame);
              if (item.clientID) QC.bridge.focusObject(item.clientID);
            },
          },
            h('div', { className: 'qc-issue-title' },
              h('span', {}, item.title),
              h('span', { className: 'qc-issue-frame-tag' }, `F#${item.frame}`)
            ),
            h('div', { className: 'qc-issue-desc' }, item.desc)
          );
          body.appendChild(card);
        }
      }

      drawer.appendChild(header);
      drawer.appendChild(body);
    }

    buildSettingsPopover() {
      const popover = h('div', { className: `qc-popover ${this.isSettingsOpen ? '' : 'hidden'}` });

      // Tiêu đề bảng cài đặt
      const header = h('div', { className: 'qc-popover-header' },
        h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, svg('settings', 14), 'Cài đặt thông số QC 3D'),
        h('button', {
          className: 'qc-icon-btn',
          title: 'Đóng bảng cài đặt',
          onClick: (e) => {
            e.stopPropagation();
            this.toggleSettings(false);
          },
        }, svg('close', 13))
      );

      // --- MỤC 1: HÌNH HỌC & NGƯỠNG KIỂM TRA ---
      const sec1Title = h('div', { className: 'qc-popover-section-title' }, svg('slider', 12), 'Hình học & Ngưỡng kiểm tra');

      // 1.1 Ngưỡng ngoài d (0.01 - 0.60m)
      const outerValBadge = h('span', { className: 'qc-value-badge' }, `${this.settings.outerThreshold.toFixed(2)}m`);
      let updateOuterPreset = null;
      const outerSlider = h('input', {
        type: 'range',
        className: 'qc-slider',
        min: '0.01',
        max: '0.60',
        step: '0.01',
        value: this.settings.outerThreshold,
        onInput: (e) => {
          this.settings.outerThreshold = parseFloat(e.target.value);
          outerValBadge.textContent = `${this.settings.outerThreshold.toFixed(2)}m`;
          updateOuterPreset?.(this.settings.outerThreshold);
          this.syncSettings();
        },
      });

      const setOuterThreshold = (val) => {
        this.settings.outerThreshold = val;
        outerSlider.value = val;
        outerValBadge.textContent = `${val.toFixed(2)}m`;
        updateOuterPreset?.(val);
        this.syncSettings();
      };

      const preset05 = h('button', { className: 'qc-preset-btn', onClick: () => setOuterThreshold(0.05) }, '5cm');
      const preset15 = h('button', { className: 'qc-preset-btn active', onClick: () => setOuterThreshold(0.15) }, '15cm');
      const preset30 = h('button', { className: 'qc-preset-btn', onClick: () => setOuterThreshold(0.30) }, '30cm');

      updateOuterPreset = (val) => {
        [preset05, preset15, preset30].forEach((btn) => btn.classList.remove('active'));
        if (Math.abs(val - 0.05) < 0.005) preset05.classList.add('active');
        else if (Math.abs(val - 0.15) < 0.005) preset15.classList.add('active');
        else if (Math.abs(val - 0.30) < 0.005) preset30.classList.add('active');
      };

      const rowOuter = h('div', { className: 'qc-popover-row' },
        h('span', { className: 'qc-label', title: 'Khoảng cách bắt điểm lọt ngoài' }, 'Ngưỡng ngoài:'),
        outerSlider,
        outerValBadge,
        preset05, preset15, preset30
      );

      // 1.2 Chuẩn Point (0.1x - 5.0x)
      const pointValBadge = h('span', { className: 'qc-value-badge' }, `${this.settings.pointSize.toFixed(1)}x (${(this.settings.pointSize * 1.5).toFixed(1)}cm)`);
      let updatePointPreset = null;
      const pointSlider = h('input', {
        type: 'range',
        className: 'qc-slider',
        min: '0.1',
        max: '5.0',
        step: '0.1',
        value: this.settings.pointSize,
        onInput: (e) => {
          this.settings.pointSize = parseFloat(e.target.value);
          pointValBadge.textContent = `${this.settings.pointSize.toFixed(1)}x (${(this.settings.pointSize * 1.5).toFixed(1)}cm)`;
          updatePointPreset?.(this.settings.pointSize);
          this.syncSettings();
        },
      });

      const setPointSize = (val) => {
        this.settings.pointSize = val;
        pointSlider.value = val;
        pointValBadge.textContent = `${val.toFixed(1)}x (${(val * 1.5).toFixed(1)}cm)`;
        updatePointPreset?.(val);
        this.syncSettings();
      };

      const preset05x = h('button', { className: 'qc-preset-btn', title: 'Cỡ hạt 0.5x (bán kính 0.8cm)', onClick: () => setPointSize(0.5) }, '0.5x');
      const preset10x = h('button', { className: 'qc-preset-btn active', title: 'Chuẩn 1.0x (nửa hạt 1.5cm = chuẩn CVAT)', onClick: () => setPointSize(1.0) }, '1.0x');
      const preset20x = h('button', { className: 'qc-preset-btn', title: 'Cỡ hạt 2.0x (bán kính 3.0cm)', onClick: () => setPointSize(2.0) }, '2.0x');
      const preset50x = h('button', { className: 'qc-preset-btn', title: 'Cỡ hạt 5.0x (bán kính 7.5cm)', onClick: () => setPointSize(5.0) }, '5.0x');

      updatePointPreset = (val) => {
        [preset05x, preset10x, preset20x, preset50x].forEach((btn) => btn.classList.remove('active'));
        if (Math.abs(val - 0.5) < 0.05) preset05x.classList.add('active');
        else if (Math.abs(val - 1.0) < 0.05) preset10x.classList.add('active');
        else if (Math.abs(val - 2.0) < 0.05) preset20x.classList.add('active');
        else if (Math.abs(val - 5.0) < 0.05) preset50x.classList.add('active');
      };

      const rowPoint = h('div', { className: 'qc-popover-row' },
        h('span', { className: 'qc-label', title: 'Hệ số kích thước hạt Point cho công thức tính QC' }, 'Chuẩn Point:'),
        pointSlider,
        pointValBadge,
        preset05x, preset10x, preset20x, preset50x
      );

      // 1.3 Dung sai đáy & Mặt đất (0.00m - 0.15m)
      const bottomValBadge = h('span', { className: 'qc-value-badge' }, `${(this.settings.bottomTolerance * 100).toFixed(0)}cm`);
      let updateBottomPreset = null;
      const bottomSlider = h('input', {
        type: 'range',
        className: 'qc-slider',
        min: '0.00',
        max: '0.15',
        step: '0.01',
        value: this.settings.bottomTolerance,
        onInput: (e) => {
          this.settings.bottomTolerance = parseFloat(e.target.value);
          bottomValBadge.textContent = `${(this.settings.bottomTolerance * 100).toFixed(0)}cm`;
          updateBottomPreset?.(this.settings.bottomTolerance);
          this.syncSettings();
        },
      });

      const setBottomTolerance = (val) => {
        this.settings.bottomTolerance = val;
        bottomSlider.value = val;
        bottomValBadge.textContent = `${(val * 100).toFixed(0)}cm`;
        updateBottomPreset?.(val);
        this.syncSettings();
      };

      const presetBot0 = h('button', { className: 'qc-preset-btn', title: 'Tắt bù trừ đáy (0cm)', onClick: () => setBottomTolerance(0.00) }, '0cm');
      const presetBot5 = h('button', { className: 'qc-preset-btn active', title: 'Chuẩn 5cm (bỏ qua điểm mặt đường)', onClick: () => setBottomTolerance(0.05) }, '5cm');
      const presetBot10 = h('button', { className: 'qc-preset-btn', title: 'Đường dốc 10cm', onClick: () => setBottomTolerance(0.10) }, '10cm');

      updateBottomPreset = (val) => {
        [presetBot0, presetBot5, presetBot10].forEach((btn) => btn.classList.remove('active'));
        if (Math.abs(val - 0.00) < 0.005) presetBot0.classList.add('active');
        else if (Math.abs(val - 0.05) < 0.005) presetBot5.classList.add('active');
        else if (Math.abs(val - 0.10) < 0.005) presetBot10.classList.add('active');
      };

      const rowBottom = h('div', { className: 'qc-popover-row' },
        h('span', { className: 'qc-label', title: 'Khoảng cách bỏ qua điểm mặt đường ngay dưới đáy hộp' }, 'Dung sai đáy:'),
        bottomSlider,
        bottomValBadge,
        presetBot0, presetBot5, presetBot10
      );

      const sec1 = h('div', { className: 'qc-popover-section' },
        sec1Title,
        rowOuter,
        rowPoint,
        rowBottom
      );

      // --- MỤC 2: CÁC LỚP CẢNH BÁO HIỂN THỊ ---
      const sec2Title = h('div', { className: 'qc-popover-section-title' }, svg('box', 12), 'Lớp hiển thị & Bộ lọc');

      const checkMissed = h('label', { className: 'qc-check-label', title: 'Tô màu điểm lọt ngoài hoàn toàn khỏi hộp' },
        h('input', {
          type: 'checkbox',
          checked: this.settings.highlightMissed,
          onChange: (e) => { this.settings.highlightMissed = e.target.checked; this.syncSettings(); },
        }),
        h('span', { className: 'qc-color-dot', style: { background: '#ff7a00' } }),
        'Lọt ngoài'
      );

      const checkBound = h('label', { className: 'qc-check-label', title: 'Lỗi cứng: Tâm hạt nằm ngoài vách hộp (hơn một nửa hạt thò ra ngoài)' },
        h('input', {
          type: 'checkbox',
          checked: this.settings.highlightBoundary,
          onChange: (e) => { this.settings.highlightBoundary = e.target.checked; this.syncSettings(); },
        }),
        h('span', { className: 'qc-color-dot', style: { background: '#00d9f2' } }),
        'Nửa ngoài'
      );

      const checkInnerEdge = h('label', { className: 'qc-check-label', title: 'Cảnh báo mềm: Tâm hạt nằm trong nhưng sát mép vách' },
        h('input', {
          type: 'checkbox',
          checked: this.settings.highlightInnerEdge,
          onChange: (e) => { this.settings.highlightInnerEdge = e.target.checked; this.syncSettings(); },
        }),
        h('span', { className: 'qc-color-dot', style: { background: '#ffe600' } }),
        'Mép trong'
      );

      const checkOverlap = h('label', { className: 'qc-check-label', title: 'Tô màu & vẽ wireframe hộp chồng lấn' },
        h('input', {
          type: 'checkbox',
          checked: this.settings.highlightOverlap,
          onChange: (e) => { this.settings.highlightOverlap = e.target.checked; this.syncSettings(); },
        }),
        svg('overlap', 13),
        'Trùng lặp'
      );

      const checkGround = h('label', {
        className: 'qc-check-label',
        title: 'Bỏ qua các điểm mặt đường tiếp xúc ở đáy hộp theo dung sai (không tô cam/xanh)',
      },
        h('input', {
          type: 'checkbox',
          checked: this.settings.filterGround,
          onChange: (e) => { this.settings.filterGround = e.target.checked; this.syncSettings(); },
        }),
        svg('ground', 13),
        'Lọc mặt đất đáy'
      );

      const checkActiveOnly = h('label', {
        className: 'qc-check-label',
        title: 'Chỉ phân tích các điểm quanh box đang chọn (khuyên dùng để tăng tốc & tập trung)',
      },
        h('input', {
          type: 'checkbox',
          checked: this.settings.activeOnly,
          onChange: (e) => {
            this.settings.activeOnly = e.target.checked;
            this.syncSettings();
          },
        }),
        svg('crosshair', 13),
        'Chỉ box đang chọn'
      );

      const sec2Grid = h('div', { className: 'qc-popover-grid' },
        checkMissed,
        checkBound,
        checkInnerEdge,
        checkOverlap,
        checkGround,
        checkActiveOnly
      );

      const sec2 = h('div', { className: 'qc-popover-section' },
        sec2Title,
        sec2Grid
      );

      popover.appendChild(header);
      popover.appendChild(sec1);
      popover.appendChild(sec2);

      return popover;
    }

    render() {
      const dock = h('div', { className: `qc-dock ${this.isMinimized ? 'minimized' : ''}` });
      this.dockEl = dock;

      // Cụm 0: Tay nắm kéo thả (Grip Handle)
      const dragHandle = h('div', {
        className: 'qc-drag-handle',
        title: 'Giữ chuột và kéo để di chuyển thanh dock bất kỳ đâu',
      }, svg('grip', 14));

      // Cụm 1: Logo & Tiêu đề
      const titleWrap = h('div', {
        className: 'qc-title-wrap',
        style: { cursor: 'grab' },
        title: 'Giữ chuột để kéo di chuyển',
      },
        svg('radar', 16),
        h('span', {}, '3D QC')
      );

      // Cụm 1.5: Hộp chọn Đối tượng đang soi (Target Box Selector Badge)
      const targetDot = h('span', { id: 'qc-target-dot', className: 'qc-target-dot' });
      const targetText = h('span', { id: 'qc-target-text', className: 'qc-target-text' }, 'Chưa chọn box');
      const targetArrow = h('span', { className: 'qc-target-arrow' }, svg('chevronDown', 10));

      const targetBadge = h('div', {
        className: 'qc-target-badge qc-expanded-content',
        title: 'Nhấp để chọn nhanh đối tượng cần soi điểm trong frame hiện tại',
        onClick: (e) => {
          e.stopPropagation();
          this.toggleTargetMenu();
        },
      }, targetDot, targetText, targetArrow);
      this.targetBadgeEl = targetBadge;

      const targetDropdown = h('div', { className: 'qc-target-dropdown hidden' });
      this.targetDropdownEl = targetDropdown;

      const targetWrap = h('div', { className: 'qc-target-wrap' }, targetBadge, targetDropdown);

      // Cụm 2: Nút Cài đặt (Mở Popover gom nhóm)
      const settingsBtn = h('button', {
        className: 'qc-settings-btn qc-expanded-content',
        title: 'Mở bảng cài đặt thông số QC 3D (Ngưỡng, Chuẩn point, Dung sai đáy & Lớp cảnh báo)',
        onClick: (e) => {
          e.stopPropagation();
          this.toggleSettings();
        },
      }, svg('settings', 13), 'Cài đặt');
      this.settingsBtnEl = settingsBtn;

      // Cụm 3: HUD Thống kê thời gian thực
      const hud = h('div', { className: 'qc-hud-stats qc-expanded-content' },
        h('div', { className: 'qc-stat-item', title: 'Điểm nằm an toàn bên trong' }, 'Trong:', h('span', { id: 'stat-inside', className: 'qc-stat-val' }, '0')),
        h('div', { className: 'qc-stat-item', title: 'Điểm mép trong (Vàng Chanh) - tâm ở trong nhưng sát mép vách' }, 'Chớm:', h('span', { id: 'stat-inner-edge', className: 'qc-stat-val', style: { color: '#ffe600' } }, '0')),
        h('div', { className: 'qc-stat-item', title: 'Điểm nửa ngoài (Xanh Lơ) - tâm ở ngoài lòi quá bán' }, 'Lòi:', h('span', { id: 'stat-boundary', className: 'qc-stat-val', style: { color: '#00d9f2' } }, '0')),
        h('div', { className: 'qc-stat-item', title: 'Điểm lọt ngoài hoàn toàn (Cam)' }, 'Lọt:', h('span', { id: 'stat-missed', className: 'qc-stat-val' }, '0')),
        h('div', { className: 'qc-stat-item', title: 'Điểm nằm trong thể tích tranh chấp (Chồng lấn)' }, 'Đè:', h('span', { id: 'stat-overlap', className: 'qc-stat-val' }, '0'))
      );

      // Cụm 4: Nút Quét lỗi Job & Nút Thu nhỏ
      const scanBtn = h('button', {
        id: 'qc-scan-btn',
        className: 'qc-btn primary qc-expanded-content',
        onClick: () => this.handleScanJob(),
      }, svg('checklist', 13), 'Quét lỗi');

      const minBtn = h('button', {
        className: 'qc-icon-btn',
        title: 'Thu nhỏ / Mở rộng dock (Alt + Q)',
        onClick: () => this.toggleMinimize(),
      }, svg(this.isMinimized ? 'maximize' : 'minimize', 14));

      // Bảng Cài đặt nổi (Popover)
      const popover = this.buildSettingsPopover();
      this.popoverEl = popover;

      dock.appendChild(dragHandle);
      dock.appendChild(titleWrap);
      dock.appendChild(targetWrap);
      dock.appendChild(settingsBtn);
      dock.appendChild(hud);
      dock.appendChild(scanBtn);
      dock.appendChild(minBtn);
      dock.appendChild(popover);

      this.root.appendChild(dock);
      this.renderDrawer();
    }
  }

  QC.QCDock = QCDock;
})();
