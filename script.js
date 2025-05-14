// TabLeaf 主脚本

// DOM 元素
const bookmarksTree = document.getElementById('bookmarks-tree');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const exportButton = document.getElementById('export-button');

// 存储所有书签数据
let allBookmarks = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 获取书签数据 (兼容Chrome和Safari)
  function loadBookmarks() {
    // 先尝试Chrome API
    if (typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getTree) {
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        if (chrome.runtime.lastError) {
          trySafariAPI();
          return;
        }
        allBookmarks = bookmarkTreeNodes;
        renderBookmarks(bookmarkTreeNodes);
      });
    } else {
      trySafariAPI();
    }
  }

  function trySafariAPI() {
    // Safari浏览器特殊处理
    if (typeof safari !== 'undefined' && safari.extension) {
      // Safari可能需要延迟加载
      setTimeout(() => {
        if (safari.extension.bookmarks && safari.extension.bookmarks.getTree) {
          try {
            safari.extension.bookmarks.getTree((bookmarkTreeNodes) => {
              allBookmarks = bookmarkTreeNodes;
              renderBookmarks(bookmarkTreeNodes);
            });
          } catch (e) {
        showBookmarkError('Safari bookmark API call failed');
          }
        } else {
          showBookmarkError('Safari bookmark API not available');
        }
      }, 500); // 给Safari一些初始化时间
    } else {
      showBookmarkError('Unsupported bookmark API');
    }
  }

  function showBookmarkError(message = '') {
    console.error('Failed to load bookmarks:', message);
    
    // 检查本地是否有存储的书签
    const localBookmarks = localStorage.getItem('tabLeafBookmarks');
    const hasLocalBookmarks = localBookmarks && JSON.parse(localBookmarks).length > 0;
    
    bookmarksTree.innerHTML = `
      <div class="no-bookmarks">
        <h3>Failed to load bookmarks</h3>
        <p>${message || 'Browser does not support bookmarks or permission not granted'}</p>
        
        <div class="solutions">
          <p>Please choose an action:</p>
          ${hasLocalBookmarks ? `
            <button id="load-local" class="action-btn">Load local backup</button>
            <button id="delete-local" class="action-btn danger">Delete local backup</button>
          ` : ''}
          <button id="import-bookmarks" class="action-btn">Import bookmarks</button>
          <button id="retry-button" class="action-btn">Retry loading</button>
        </div>
      </div>
    `;
    
    document.getElementById('retry-button').addEventListener('click', loadBookmarks);
    
    if (hasLocalBookmarks) {
      document.getElementById('load-local').addEventListener('click', () => {
        const bookmarks = JSON.parse(localBookmarks);
        allBookmarks = bookmarks;
        renderBookmarks(bookmarks);
        // 自动保存到本地
        localStorage.setItem('tabLeafBookmarks', JSON.stringify(bookmarks));
      });
    }
    
    document.getElementById('import-bookmarks').addEventListener('click', importBookmarks);
    
    if (hasLocalBookmarks) {
      document.getElementById('delete-local').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete the local backup? This cannot be undone!')) {
            localStorage.removeItem('tabLeafBookmarks');
            showMessage('Local backup deleted');
          showBookmarkError(message);
        }
      });
    }
  }

  /**
   * 导入书签文件
   */
  function importBookmarks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.json';
    
    input.onchange = e => {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onload = event => {
        try {
          let bookmarks;
          if (file.name.endsWith('.json')) {
            bookmarks = JSON.parse(event.target.result);
          } else {
            // 解析HTML书签文件
            const parser = new DOMParser();
            const doc = parser.parseFromString(event.target.result, 'text/html');
            bookmarks = parseHtmlBookmarks(doc);
          }
          
          if (bookmarks && bookmarks.length > 0) {
            allBookmarks = bookmarks;
            renderBookmarks(bookmarks);
            // 保存到本地存储
            localStorage.setItem('tabLeafBookmarks', JSON.stringify(bookmarks));
            showMessage('Bookmarks imported successfully!');
          } else {
            showMessage('Unable to parse bookmark file');
          }
        } catch (error) {
          console.error('Failed to import bookmarks:', error);
          showMessage('Import failed: ' + error.message);
        }
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  }

  /**
   * 解析HTML书签文件
   */
  function parseHtmlBookmarks(doc) {
    const bookmarks = [];
    
    // 检查是否是Safari格式
    const isSafariFormat = doc.querySelector('meta[name="Generator"]')?.content.includes('Safari');
    
    // Chrome/Firefox书签文件通常使用DL列表结构
    function parseFolder(dtElement, parentFolder = {title: '', children: []}) {
      const elements = isSafariFormat 
        ? dtElement.querySelectorAll('dt, > a') 
        : dtElement.querySelectorAll('dt');
      
      elements.forEach(dt => {
        const a = dt.querySelector('a');
        if (a) {
          // 书签项
          parentFolder.children.push({
            title: a.textContent.trim(),
            url: a.getAttribute('href'),
            dateAdded: Date.now()
          });
        } else {
          // 文件夹
          const h3 = dt.querySelector('h3');
          if (h3) {
            const folder = {
              title: h3.textContent.trim(),
              children: [],
              dateAdded: Date.now()
            };
            const nextDL = dt.querySelector('dl');
            if (nextDL) {
              parseFolder(nextDL, folder);
            }
            parentFolder.children.push(folder);
          }
        }
      });
      
      return parentFolder;
    }
    
    // 查找根元素
    let rootElement;
    if (isSafariFormat) {
      // Safari书签通常以H1作为根节点
      const h1Elements = doc.querySelectorAll('h1');
      if (h1Elements.length > 0) {
        // 查找相邻的DL元素
        let nextSibling = h1Elements[0].nextElementSibling;
        while (nextSibling) {
          if (nextSibling.tagName === 'DL') {
            rootElement = nextSibling;
            break;
          }
          nextSibling = nextSibling.nextElementSibling;
        }
      }
    } else {
      // Chrome/Firefox格式
      rootElement = doc.querySelector('dl');
    }

    if (rootElement) {
      const rootFolder = parseFolder(rootElement);
      if (rootFolder.children.length > 0) {
        bookmarks.push(rootFolder);
      }
    }
    
    // 如果没有找到标准结构，尝试其他格式
    if (bookmarks.length === 0) {
      const links = doc.querySelectorAll('a');
      links.forEach(link => {
        if (link.href && !link.href.startsWith('javascript:')) {
          bookmarks.push({
            title: link.textContent.trim(),
            url: link.href,
            dateAdded: Date.now()
          });
        }
      });
    }
    
    return bookmarks.length > 0 ? bookmarks : null;
  }

  /**
   * 显示操作消息
   */
  function showMessage(msg) {
    const msgEl = document.createElement('div');
    msgEl.className = 'status-message';
    msgEl.textContent = msg;
    bookmarksTree.appendChild(msgEl);
    setTimeout(() => msgEl.remove(), 3000);
  }

  // 初始加载
  loadBookmarks();

  // 绑定搜索事件
  searchButton.addEventListener('click', performSearch);
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  
  // 绑定导出事件
  exportButton.addEventListener('click', exportPage);
});

/**
 * 渲染书签树
 * @param {Array} bookmarkNodes - 书签节点数组
 * @param {HTMLElement} container - 容器元素，默认为bookmarksTree
 */
function renderBookmarks(bookmarkNodes, container = bookmarksTree) {
  // 清空容器
  container.innerHTML = '';
  
  if (!bookmarkNodes || bookmarkNodes.length === 0) {
    container.innerHTML = '<div class="no-bookmarks">No bookmarks found</div>';
    return;
  }

  // 遍历书签节点
  bookmarkNodes.forEach(node => {
    // 跳过根节点
    if (node.id === '0') {
      // 根节点通常包含"书签栏"和"其他书签"
      if (node.children && node.children.length > 0) {
        renderBookmarks(node.children, container);
      }
      return;
    }

    // 处理文件夹
    if (node.children) {
      const folderElement = document.createElement('div');
      folderElement.className = 'folder';
      
      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-header';
      folderHeader.innerHTML = `
        <i class="fas fa-folder folder-icon"></i>
        <i class="fas fa-caret-down toggle-icon"></i>
        <span class="folder-name">${escapeHtml(node.title)}</span>
      `;
      
      // 添加折叠/展开功能
      folderHeader.addEventListener('click', () => {
        folderElement.classList.toggle('collapsed');
      });
      
      folderElement.appendChild(folderHeader);
      
      // 创建文件夹内容容器
      const folderContent = document.createElement('div');
      folderContent.className = 'folder-content';
      
      // 递归渲染子节点
      if (node.children && node.children.length > 0) {
        renderBookmarks(node.children, folderContent);
      }
      
      folderElement.appendChild(folderContent);
      container.appendChild(folderElement);
    } 
    // 处理书签
    else {
      const bookmarkElement = document.createElement('a');
      bookmarkElement.className = 'bookmark-item';
      bookmarkElement.href = node.url;
      bookmarkElement.target = '_blank';
      bookmarkElement.rel = 'noopener noreferrer';
      
      // 获取网站图标
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(node.url).hostname}`;
      
      bookmarkElement.innerHTML = `
        <img class="bookmark-icon" src="${faviconUrl}" alt="icon">
        <span class="bookmark-title">${escapeHtml(node.title)}</span>
      `;
      
      container.appendChild(bookmarkElement);
    }
  });
}

/**
 * 执行搜索
 */
function performSearch() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  
  if (searchTerm === '') {
    // 如果搜索词为空，显示所有书签
    renderBookmarks(allBookmarks);
    return;
  }
  
  // 搜索结果
  const searchResults = [];
  
  // 递归搜索书签
  function searchBookmarks(nodes) {
    if (!nodes) return;
    
    nodes.forEach(node => {
      // 如果是文件夹，递归搜索其子节点
      if (node.children) {
        searchBookmarks(node.children);
      } 
      // 如果是书签，检查标题和URL是否匹配搜索词
      else if (node.url) {
        if (
          node.title.toLowerCase().includes(searchTerm) ||
          node.url.toLowerCase().includes(searchTerm)
        ) {
          searchResults.push(node);
        }
      }
    });
  }
  
  // 开始搜索
  searchBookmarks(allBookmarks);
  
  // 显示搜索结果
  bookmarksTree.innerHTML = '';
  
  if (searchResults.length === 0) {
    bookmarksTree.innerHTML = `<div class="no-bookmarks">No bookmarks found matching "${escapeHtml(searchTerm)}"</div>`;
    return;
  }
  
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'search-results-header';
  resultsHeader.innerHTML = `<h2>Search results: ${searchResults.length} matches</h2>`;
  bookmarksTree.appendChild(resultsHeader);
  
  // 创建搜索结果容器
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'search-results';
  
  // 渲染搜索结果
  searchResults.forEach(bookmark => {
    const bookmarkElement = document.createElement('a');
    bookmarkElement.className = 'bookmark-item';
    bookmarkElement.href = bookmark.url;
    bookmarkElement.target = '_blank';
    bookmarkElement.rel = 'noopener noreferrer';
    
    // 获取网站图标
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`;
    
    // 高亮显示匹配的文本
    let highlightedTitle = escapeHtml(bookmark.title);
    if (bookmark.title.toLowerCase().includes(searchTerm)) {
      const regex = new RegExp(`(${escapeHtml(searchTerm)})`, 'gi');
      highlightedTitle = highlightedTitle.replace(regex, '<span class="highlight">$1</span>');
    }
    
    bookmarkElement.innerHTML = `
      <img class="bookmark-icon" src="${faviconUrl}" alt="icon">
      <span class="bookmark-title">${highlightedTitle}</span>
    `;
    
    resultsContainer.appendChild(bookmarkElement);
  });
  
  bookmarksTree.appendChild(resultsContainer);
}

/**
 * 转义HTML特殊字符
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 导出当前页面为HTML文件
 */
function exportPage() {
  // 获取SVG图标内容
  const folderSvg = `<?xml version="1.0" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg t="1746898668700" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4373" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16"><path d="M918.673 883H104.327C82.578 883 65 867.368 65 848.027V276.973C65 257.632 82.578 242 104.327 242h814.346C940.422 242 958 257.632 958 276.973v571.054C958 867.28 940.323 883 918.673 883z" fill="#FFE9B4" p-id="4374"></path><path d="M512 411H65V210.37C65 188.597 82.598 171 104.371 171h305.92c17.4 0 32.71 11.334 37.681 28.036L512 411z" fill="#FFB02C" p-id="4375"></path><path d="M918.673 883H104.327C82.578 883 65 865.42 65 843.668V335.332C65 313.58 82.578 296 104.327 296h814.346C940.422 296 958 313.58 958 335.332v508.336C958 865.32 940.323 883 918.673 883z" fill="#FFCA28" p-id="4376"></path></svg>`;
  
  // TabLeaf Logo SVG (原始文件很大)
  const tabLeafSvg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="60px" height="60px" viewBox="0 0 60 60" enable-background="new 0 0 60 60" xml:space="preserve">  <image id="image0" width="60" height="60" x="0" y="0"
    xlink:href="data:image/png;base64,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" />
</svg>`;
  
  // 替换HTML中的Font Awesome图标引用
  let bookmarksHtml = document.querySelector('.bookmarks-container').innerHTML;
  
  // 替换文件夹图标
  bookmarksHtml = bookmarksHtml.replace(/<i class="fas fa-folder folder-icon"><\/i>/g, folderSvg);
  
  // 创建一个新的HTML文档
  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TabLeaf - My Bookmark Navigation</title>
  <style>
    ${document.querySelector('link[href="styles.css"]') ? getStyleContent() : ''}
    /* 内联图标样式 */
    .folder-icon { width: 16px; height: 16px; margin-right: 5px; vertical-align: middle; }
    .fas.fa-caret-down { transition: transform 0.3s; }
    .collapsed .fas.fa-caret-down { transform: rotate(-90deg); }
    .logo-icon { width: 32px; height: 32px; margin-right: 10px; vertical-align: middle; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        ${tabLeafSvg}
        <h1>TabLeaf - My Bookmarks</h1>
      </div>
    </header>

    <main>
      <div class="bookmarks-container">
        ${bookmarksHtml}
      </div>
    </main>

    <footer>
      <p>TabLeaf - The exported file of my bookmarks (${new Date().toLocaleDateString()})</p>
    </footer>
  </div>

  <script>
    // 简化版脚本，仅保留折叠/展开功能
    document.querySelectorAll('.folder-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('collapsed');
      });
    });
  </script>
</body>
</html>`;

  // 创建Blob对象
  const blob = new Blob([htmlContent], { type: 'text/html' });
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TabLeaf-Bookmarks_${new Date().toLocaleDateString().replace(/\//g, '-')}.html`;
  
  // 触发下载
  document.body.appendChild(a);
  a.click();
  
  // 清理
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 获取样式内容
 * @returns {string} CSS样式内容
 */
function getStyleContent() {
  // 获取所有样式规则
  let cssText = '';
  const styleSheets = document.styleSheets;
  
  try {
    for (let i = 0; i < styleSheets.length; i++) {
      const sheet = styleSheets[i];
      // 只处理内部样式表
      if (sheet.href && sheet.href.includes('styles.css')) {
        const rules = sheet.cssRules || sheet.rules;
        for (let j = 0; j < rules.length; j++) {
          cssText += rules[j].cssText + '\n';
        }
      }
    }
  } catch (e) {
    console.error('获取样式内容时出错:', e);
  }
  
  return cssText;
}

/**
 * 清除搜索
 */
function clearSearch() {
  searchInput.value = '';
  renderBookmarks(allBookmarks);
}
