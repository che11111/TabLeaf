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
  // 获取书签数据
  chrome.bookmarks.getTree((bookmarkTreeNodes) => {
    allBookmarks = bookmarkTreeNodes;
    renderBookmarks(bookmarkTreeNodes);
  });

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
    container.innerHTML = '<div class="no-bookmarks">没有找到书签</div>';
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
        <img class="bookmark-icon" src="${faviconUrl}" alt="图标">
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
    bookmarksTree.innerHTML = `<div class="no-bookmarks">没有找到与 "${escapeHtml(searchTerm)}" 相关的书签</div>`;
    return;
  }
  
  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'search-results-header';
  resultsHeader.innerHTML = `<h2>搜索结果: ${searchResults.length} 个匹配项</h2>`;
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
      <img class="bookmark-icon" src="${faviconUrl}" alt="图标">
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
  const tabLeafSvg = `
`;
  
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
  <title>TabLeaf - 我的收藏夹导航</title>
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
        <h1>TabLeaf - 我的收藏夹</h1>
      </div>
    </header>

    <main>
      <div class="bookmarks-container">
        ${bookmarksHtml}
      </div>
    </main>

    <footer>
      <p>TabLeaf - 我的收藏夹导出文件 (${new Date().toLocaleDateString()})</p>
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
  a.download = `TabLeaf收藏夹_${new Date().toLocaleDateString().replace(/\//g, '-')}.html`;
  
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