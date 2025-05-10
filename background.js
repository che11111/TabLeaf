// 监听扩展图标点击事件
chrome.action.onClicked.addListener(() => {
  // 在新标签页中打开tab.html
  chrome.tabs.create({
    url: 'tab.html'
  });
});