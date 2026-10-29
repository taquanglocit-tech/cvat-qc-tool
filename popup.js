// popup.js - Xử lý bật/tắt quyền extension trên domain CVAT

document.addEventListener('DOMContentLoaded', async () => {
  const originText = document.getElementById('originText');
  const statusBadge = document.getElementById('statusBadge');
  const statusLabel = document.getElementById('statusLabel');
  const toggleBtn = document.getElementById('toggleBtn');
  const injectBtn = document.getElementById('injectBtn');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    originText.textContent = 'Không nhận diện được tab';
    toggleBtn.disabled = true;
    return;
  }

  let origin = null;
  try {
    const url = new URL(tab.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      origin = url.origin;
    }
  } catch { /* URL không hợp lệ */ }

  if (!origin) {
    originText.textContent = 'Trang này không hỗ trợ (chỉ http/https)';
    statusLabel.textContent = 'Không hỗ trợ';
    toggleBtn.disabled = true;
    return;
  }

  originText.textContent = origin;

  async function checkActive() {
    const origins = await CVATQCRegister.getOrigins();
    const hasInStorage = origins.includes(origin);
    const hasPermission = await chrome.permissions.contains({
      origins: [CVATQCRegister.originToPermission(origin)],
    });
    return hasInStorage && hasPermission;
  }

  async function updateUI() {
    const isActive = await checkActive();
    if (isActive) {
      statusLabel.textContent = 'Đang hoạt động';
      statusBadge.className = 'status-badge active';
      toggleBtn.textContent = 'Tắt trên domain này';
      toggleBtn.className = '';
      toggleBtn.disabled = false;
      injectBtn.style.display = 'flex';
    } else {
      statusLabel.textContent = 'Chưa kích hoạt';
      statusBadge.className = 'status-badge inactive';
      toggleBtn.textContent = 'Kích hoạt trên domain này';
      toggleBtn.className = 'primary';
      toggleBtn.disabled = false;
      injectBtn.style.display = 'none';
    }
  }

  toggleBtn.addEventListener('click', async () => {
    toggleBtn.disabled = true;
    const isActive = await checkActive();
    const origins = await CVATQCRegister.getOrigins();
    const perm = { origins: [CVATQCRegister.originToPermission(origin)] };

    try {
      if (isActive) {
        const next = origins.filter((o) => o !== origin);
        await chrome.storage.local.set({ origins: next });
        try { await chrome.permissions.remove(perm); } catch {}
      } else {
        const granted = await chrome.permissions.request(perm);
        if (!granted) {
          toggleBtn.disabled = false;
          return;
        }
        const next = [...new Set([...origins, origin])];
        await chrome.storage.local.set({ origins: next });
      }

      await CVATQCRegister.syncContentScripts();
      await updateUI();

      if (!isActive && tab.id) {
        await injectNow(tab.id);
      }
    } catch (err) {
      console.error(err);
      alert('Thao tác thất bại: ' + (err.message || err));
    } finally {
      toggleBtn.disabled = false;
    }
  });

  async function injectNow(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/bridge-main.js'],
        world: 'MAIN',
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CVATQCRegister.CONTENT_SCRIPT_FILES,
      });
    } catch (err) {
      console.warn('Lỗi khi tiêm script trực tiếp:', err);
    }
  }

  injectBtn.addEventListener('click', async () => {
    if (!tab.id) return;
    injectBtn.disabled = true;
    try {
      await injectNow(tab.id);
      window.close();
    } finally {
      injectBtn.disabled = false;
    }
  });

  await updateUI();
});
