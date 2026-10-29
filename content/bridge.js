// bridge.js - Cầu nối phía Content Script (world: ISOLATED)
// Giao tiếp bất đồng bộ an toàn với bridge-main.js (world: MAIN) qua CustomEvent

(() => {
  const QC = (globalThis.CVAT3DQC ||= {});

  const REQ = 'cvat-qc:req';
  const RES = 'cvat-qc:res';
  const EVT = 'cvat-qc:evt';

  let reqSeq = 0;
  const pending = new Map();
  const listeners = new Set();

  document.addEventListener(RES, (e) => {
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      const resolver = pending.get(data.id);
      if (!resolver) return;
      pending.delete(data.id);
      if (data.error) resolver.reject(new Error(data.error));
      else resolver.resolve(data.result);
    } catch (err) {
      console.error('[CVAT 3D QC] Lỗi phân giải phản hồi:', err);
    }
  });

  document.addEventListener(EVT, (e) => {
    try {
      const data = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail;
      for (const fn of listeners) {
        try { fn(data); } catch (err) { console.error(err); }
      }
    } catch (err) {
      console.error('[CVAT 3D QC] Lỗi xử lý sự kiện:', err);
    }
  });

  function call(method, params = {}, timeoutMs = 15000) {
    const id = ++reqSeq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout gọi lệnh [${method}] sau ${timeoutMs}ms`));
        }
      }, timeoutMs);

      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      document.dispatchEvent(new CustomEvent(REQ, { detail: JSON.stringify({ id, method, params }) }));
    });
  }

  function onEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  const bridge = {
    call,
    onEvent,
    ping: () => call('ping', {}, 2000),
    getAnnotationState: () => call('getAnnotationState'),
    updateQCSettings: (settings) => call('updateQCSettings', { settings }),
    jumpToFrame: (frame) => call('jumpToFrame', { frame }),
    focusObject: (clientID) => call('focusObject', { clientID }),
    selectBox: (clientID) => call('selectBox', { clientID }),
    getAllFramesAnnotations: () => call('getAllFramesAnnotations', {}, 30000),
    resetPointColors: () => call('resetPointColors'),
  };

  QC.bridge = bridge;
})();
