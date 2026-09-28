# Googology Wiki 离线版

[Googology Wiki（中文大数 wiki）](https://wiki.googology.top) 的离线静态存档，共 **546 个页面**，抓取时间 **2026-08-31**。

原本是一个 38 MB 的单文件 HTML，直接放进 GitHub 既难以上传、也无法增量更新；这里把它重构成按需加载的静态站点，**最大单文件仅 2.2 MB**，可以正常推到 GitHub 并用 GitHub Pages 直接访问。

## 目录结构

```
index.html               入口页面（几 KB，只含骨架）
assets/
  style.css              样式（含深色模式）
  app.js                 路由 / 渲染 / 搜索 / 分片加载
  vendor/mathjax.js      MathJax 公式渲染（2.2 MB，仅在页面含公式时才下载）
  img/xx/<sha1>.png      页面图片（base64 还原后按内容哈希去重）
data/
  index.json             页面索引：[{id, 标题, 命名空间, 所属分片}, …]
  chunks/NNN.json        页面正文分片（27 个，每个约 1 MB）
tools/                   构建脚本（把原始单文件 HTML 重新拆成上面的结构）
.nojekyll                让 Pages 不要忽略以下划线开头的文件
```

## 部署到 GitHub Pages

1. 新建仓库，把本目录内容推到 `main` 分支（仓库约 36 MB）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存。
3. 一分钟后访问 `https://<用户名>.github.io/<仓库名>/` 即可。

> 也可以直接用仓库里的 `.github/workflows/pages.yml`（推送即自动部署）。两种方式选一种即可。
>
> 所有资源都使用**相对路径**，部署在 `/<仓库名>/` 子路径下无需改任何配置。

## 本地预览

因为用 `fetch` 读取分片，必须经 HTTP 访问，双击打开 `index.html` 会因 `file://` 跨源限制失效：

```bash
cd 本目录
python3 -m http.server 8000
# 打开 http://127.0.0.1:8000/
```

## 功能

- **首页**：按命名空间分组列出全部 546 个页面，输入关键词即时过滤标题。
- **按需加载**：点进页面时才下载对应分片，已下载的分片缓存在内存中。
- **全文搜索**：在全部页面正文中查找并高亮片段（首次会下载全部分片，约 29 MB）。
- **随机页面**：一键跳到随机条目。
- **公式渲染**：MathJax 按需加载，未用到公式的页面不会产生额外流量。
- **深色模式**：跟随系统设置。

## 从原始单文件重新构建

```bash
python3 tools/build.py /path/to/googology_wiki.html .
```

只依赖 Python 3 标准库，无第三方包。想调整分片大小改 `tools/build.py` 里的 `TARGET_CHUNK_BYTES` 即可。

## 说明

- 图片按内容 SHA-1 去重：140 处引用实际只有 76 个图片文件。
- 页面内的外部链接（知乎、OEIS、arXiv 等）保持原样，需要联网访问。
- 内容为第三方 wiki 的存档，版权归原作者与原站所有。
