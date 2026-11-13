// 在页面绘制前恢复主题，避免深浅色闪烁。
// 单独拆成文件而不是内联在 index.html 里：生产环境开了 CSP（script-src 'self'），
// 内联脚本会被拦掉，页面就会先闪一下默认主题。
;(function applySavedTheme() {
  try {
    var saved = localStorage.getItem('chat-blog-theme')
    var theme = saved === 'light' || saved === 'dark' ? saved : 'dark'
    document.documentElement.dataset.theme = theme
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
})()
