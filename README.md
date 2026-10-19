# Winters' Blog

这是一个使用 Hexo 生成、由 GitHub Pages 托管的个人技术博客。当前分类包括：

- Agent 学习笔记
- DevOps

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run server
```

浏览器打开 `http://localhost:4000`。

## 新建文章

```bash
npm run new -- "文章标题"
```

新文件会出现在 `source/_posts/`。打开文件，在头部选择分类：

```yaml
categories:
  - Agent 学习笔记
```

或者：

```yaml
categories:
  - DevOps
```

一篇文章只需要选择一个主分类。`tags` 可以填写更具体的主题，例如 `Tool Use`、`Kubernetes` 或 `GitHub Actions`。

## 吉他谱专栏

站点的「吉他谱」专栏在 `/guitar/`，内容来自独立仓库 [guitar_sheet](https://github.com/winters1900/guitar_sheet)（PDF + `sheets.json` 清单）。

- 在线新增：打开 `/guitar/upload/`，粘贴一个仅授权谱库 Contents 读写、博客 Actions 读写的 GitHub fine-grained token（只保存在浏览器 localStorage），选择 PDF 并填写信息后提交即可，提交后会自动触发博客重新发布。
- 构建同步：GitHub Actions 构建时会先克隆 `guitar_sheet`，再执行 `node scripts/sync-guitar.mjs .guitar-src`，把 PDF 同步到 `source/guitar/sheets/`、把清单写入 `source/_data/guitar_sheets.json`。
- 本地手动同步：先克隆 `guitar_sheet` 到相邻目录，再执行 `npm run sync:guitar -- ../guitar_sheet`。
- 专栏用本地托管的 PDF.js 懒加载每份谱的首页作为缩略图（`themes/winters/source/js/vendor/`），无第三方 CDN 依赖。

## 构建

```bash
npm run build
```

生成结果位于 `public/`，该目录不提交到 Git。推送到 `main` 后，GitHub Actions 会自动构建并部署站点。

## 目录说明

- `source/_posts/`：Markdown 文章
- `source/images/`：站点公共图片
- `scaffolds/`：新文章模板
- `themes/winters/`：博客主题
- `_config.yml`：Hexo 全局配置
- `.github/workflows/pages.yml`：GitHub Pages 自动部署
