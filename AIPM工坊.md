# AIPM 工坊使用说明

## 打开

双击 `~/Applications/AIPM 工坊.app`（访达 → 前往 → 个人 → 应用程序）。也可以把它拖到程序坞。

第一次打开要做两件事：

1. 在「设置」里填 DeepSeek API Key，或者登录 DeepSeek 账号。
2. 确认左侧工作区是「AIPM 工坊」（对应 `~/Documents/AIPM工坊`）。右侧「项目」面板只读当前工作区里的项目。

## 用法

- 新建或继续项目：在输入框说「新建项目」「继续上次的项目」，或输入 `/aipm-hub`。
- 直接做立项：输入 `/project-initiation`。
- 看进度和产出物：点右上角的侧栏按钮，选「项目进度」。点产出物文件可以在右侧预览 md 和 html。

## 各部分在哪

| 东西 | 位置 |
|---|---|
| 项目和产出物 | `~/Documents/AIPM工坊/<项目名>/`，每个阶段一个子文件夹，进度在 `aipm.json` |
| 所有 skill | `deepseek zhijian/aipm-skills/`（GitHub 私有仓库 aipm-skills） |
| 工坊源码 | `deepseek zhijian/deepseek-harness/`（GitHub 私有仓库 aipm-workbench，`main` 分支） |
| 工坊数据（会话、设置、密钥） | `~/.aipm-studio/`，和官方 DeepSeek Harness 的 `~/.dsh/` 分开 |

`~/.aipm-studio/skills` 和 `~/.dsh/skills` 都是指向 `aipm-skills/` 的链接，在 `aipm-skills/` 里改或新建 skill 都会马上生效，不用重启。

## 加新 skill

在 `aipm-skills/` 里新建一个文件夹（比如 `prd/`），写好 `SKILL.md` 就能用，详见 `aipm-skills/README.md`。

## 改了工坊源码之后

```bash
cd "$HOME/Documents/deepseek zhijian/deepseek-harness" && export PATH="$HOME/.local/node/bin:$PATH" && pnpm run build
```

然后退出工坊再重新打开。

## 已知限制

- 这是本地构建，没有 Apple 签名，也不会自动更新。应用依赖 `deepseek-harness` 源码目录，别移动或删除它。
- 启动时会占用本机 9222、9229、9230 三个调试端口。
- 官方版本更新后想合并进来：在源码目录 `git fetch upstream && git merge upstream/master`，处理冲突后重新构建。
