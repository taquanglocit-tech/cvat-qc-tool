// background.js - Service worker quản lý cấp quyền và khởi tạo CVAT 3D QC Tool

importScripts('register.js');

chrome.runtime.onInstalled.addListener(() => {
  CVATQCRegister.syncContentScripts().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  CVATQCRegister.syncContentScripts().catch(console.error);
});
