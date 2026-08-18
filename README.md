# Roadmap Studio

一个无需登录、数据保存在浏览器本地的交互式 Roadmap 时间表。

主要功能：

- 自由添加、编辑和删除任务
- 自定义 Roadmap 的开始与结束日期
- 拖动任务条调整任务时间和持续时长
- 调整任务名称列宽
- JSON 导入与导出
- 导出可完整容纳时间线的长图

## 使用 GitHub Pages 发布

本仓库已经包含生成好的 `docs` 文件夹，可以直接通过 GitHub Pages 发布，不需要在 GitHub 上运行构建命令。

1. 将本压缩包解压。
2. 把解压后 `roadmap-planner` 文件夹里面的所有文件上传到 GitHub 仓库根目录。不要只上传 `docs/index.html`。
3. 打开 GitHub 仓库的 **Settings → Pages**。
4. 在 **Build and deployment** 中把 **Source** 设为 **Deploy from a branch**。
5. Branch 选择 **main**，文件夹选择 **/docs**，然后点击 **Save**。
6. 等待 GitHub 完成发布，然后打开 `https://你的用户名.github.io/roadmap/`。

`docs/.nojekyll` 已包含在仓库中，用于避免 GitHub Pages 的默认处理影响静态文件。`docs/index.html` 和 `docs/assets` 必须一起上传。

> 当前 GitHub Pages 路径按仓库名 `roadmap` 配置。如果更换仓库名，请修改 `vite.pages.config.ts` 中的 `base`，然后运行 `npm run build:pages` 重新生成 `docs`。

## 本地开发

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

生成 GitHub Pages 文件：

```bash
npm run build:pages
```

生成结果会写入 `docs`，并自动包含 `.nojekyll`。
