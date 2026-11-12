const extensionApi = globalThis.browser ?? globalThis.chrome;

if (extensionApi?.action?.onClicked) {
  extensionApi.action.onClicked.addListener(() => {
    const createdTab = extensionApi.tabs.create({
      url: extensionApi.runtime.getURL('tab.html')
    });

    createdTab?.catch?.((error) => {
      console.error('Unable to open TabLeaf:', error);
    });
  });
}
