# 内容编辑指南

所有需要日常增删改的个人内容都在 `content/` 目录下，修改后在 `npm run dev` 中会自动热更新，构建时由 Vite 自动打包。

```text
content/
├── profile.md                 # 个人简介与外链
├── articles/                  # 文章（一个 .md 文件，或一个带 index.md + 配图的文件夹）
├── photos/                    # 相册（一个子文件夹 = 一个相册）
├── videos/videos.yaml         # 视频列表与封面
└── music/tracks.yaml          # 音乐列表与本地音频
```

## 1. 修改个人简介与链接

编辑 `content/profile.md`：

- 顶部的 `name`、`role`、`links` 控制昵称与链接（可自由增删 `label` 和 `url`）。
- 下方正文支持 Markdown 段落，会显示在「电脑 → 认识一下」里。

## 2. 新增或编辑文章

在 `content/articles/` 中新建一个 `.md` 文件（推荐命名 `YYYY-MM-DD-slug.md`）：

```markdown
---
title: 文章标题
date: 2026-11-20
category: work
---

正文支持常见 Markdown：标题、加粗、斜体、列表、引用、代码块、链接和图片。
```

- `category` 默认为 `work`（显示在「电脑 → 文章」）；也可按需设为 `gaming` 或 `culture`。
- 如文章需要配图，可建一个文件夹 `content/articles/my-post/`，放入 `index.md` 和图片，在正文里直接写 `![说明](./photo.jpg)`。
- 设为 `draft: true` 或文件名以 `_` 开头时不会发布，也不会被打进生产构建产物 `dist/`（仅由草稿引用的配图同样不会被打包）。
- 默认按 `date` 从新到旧排序；如需手动置顶，可添加数字 `order`（越小越靠前）。

## 3. 新增相册或照片

在 `content/photos/` 下新建一个子文件夹，把照片拖进去即可：

```text
content/photos/kyoto-2026/
├── album.yaml   # 可选；不写也能直接显示
├── 01-鸭川.jpg
└── 02-清水寺.jpg
```

- **零配置**：不写 `album.yaml` 时，文件夹名会作为相册标题，图片按文件名自然排序，第一张自动做封面。
- **自定义标题与顺序**：在相册文件夹中放一个 `album.yaml`（支持 `title`、`cover`、`order`、`date`、`draft` 与 `photos` 列表）。放入文件夹但未写进 `photos` 的新图片会自动追加在末尾；若想只显示列表里的照片，可加 `includeUnlisted: false`。

## 4. 修改视频与音乐

- **视频**：编辑 `content/videos/videos.yaml`。填写 `url` 会直接跳转到该链接，留空则按标题搜索哔哩哔哩。封面图可直接放在 `content/videos/` 目录中写文件名，或填相对路径 / 网络图片地址。
- **音乐**：将音频文件放进 `content/music/` 并在 `content/music/tracks.yaml` 中登记。
