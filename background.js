// 监听扩展图标点击事件 (兼容Chrome和Safari)
if (typeof chrome !== 'undefined' && chrome.action) {
  // Chrome浏览器
  chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({
      url: 'tab.html'
    });
  });
} else if (typeof safari !== 'undefined' && safari.extension) {
  // Safari浏览器
  safari.extension.toolbarItems[0].addEventListener('command', () => {
    safari.application.activeBrowserWindow.openTab().url = safari.extension.baseURI + 'tab.html';
  });
}
