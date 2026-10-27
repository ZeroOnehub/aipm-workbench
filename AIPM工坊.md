# 拾阶使用说明

## 打开

双击 `~/Applications/拾阶.app`（访达 → 前往 → 个人 → 应用程序）。也可以把它拖到程序坞。

第一次打开要做两件事：

1. 在「设置」里填 DeepSeek API Key，或者登录 DeepSeek 账号。
2. 确认左侧工作区是「拾阶」（对应 `~/Documents/project/AI Workbench/workspace`）。右侧「项目」面板只读当前工作区里的项目。

## 用法

- **从首页开始**：新会话的输入框下面先列出最近的项目（最多 3 个），每个显示当前阶段和「几件等你拍板 / 卡住 / 待验证」，点项目就接着上次的进度走，点「看全部待处理」打开项目面板。再往下是六张阶段卡片，点一张就把这个阶段的开场指令放进输入框，补一句话再发送。
- 新建或继续项目：在输入框说「新建项目」「继续上次的项目」，或输入 `/aipm-hub`。
- 直接做某一步：输入 `/project-initiation`（立项）、`/prd`（PRD）等 skill 名。
- 看进度和产出物：点右上角的侧栏按钮，选「项目」。面板顶部是总进度，下面是六个阶段的时间线，点产出物文件可以在旁边预览或编辑 md 和 html。
- **待处理**：面板总进度下面列出等你拍板、卡住、待验证的事（来自 `aipm.json` 的 `pending`，以及带待验证项通过、卡住的站）。点「去处理」把这件事放进输入框，补一句你的决定或新证据再发送。
- **证据构成**：每份 md 产出物后面有一条小色条，绿色是硬证据（用户原话、行为数据、实测、公开资料），黄色是线索，红色是冲突，紫色是测算、模拟、AI 推断这类还不能当依据的。打开文档后，正文里的证据标签会按同样的颜色高亮，顶部有完整的统计。
- 阶段不用按顺序走：总控会按最危险的假设推荐下一步，比如 PRD 还没写完就先做 AI 可行性小样。

## 各部分在哪

| 东西 | 位置 |
|---|---|
| 项目和产出物 | `~/Documents/project/AI Workbench/workspace/<项目名>/`，每个阶段一个子文件夹，进度在 `aipm.json` |
| 全部 22 个 skill（总控、立项、PRD、原型、架构方案、研发交接与上线检查、代码对照验收、评测、复盘） | `~/Documents/project/AIPM Skill Pack/skills/`（GitHub 仓库 aipm-skill-pack），通过 `workspace/.dsh/skills` 链接接入 |
| 本地个人 skill（课堂笔记、写作，不上传） | `~/Documents/project/AI Workbench/aipm-skills/`（只在本机） |
| 工坊源码 | `~/Documents/project/AI Workbench/aipm-workbench/`（GitHub 仓库 aipm-workbench，`main` 分支） |
| 工坊数据（会话、设置、密钥） | `~/.aipm-studio/`，和官方 DeepSeek Harness 的 `~/.dsh/` 分开 |

在 Skill Pack 里改或新建 skill 会马上生效，不用重启。`~/.aipm-studio/skills` 和 `~/.dsh/skills` 指向本地的 `aipm-skills/`，那里只放不上传的个人 skill（课堂笔记、写作）。总控和立项只在工作区的 `.dsh/skills` 里，换了工作区要重新运行 Skill Pack 的 `install.sh --workspace`。

## 加新 skill

要公开的放进 `AIPM Skill Pack/skills/`，只自己用、不上传的放进 `aipm-skills/`。新建一个文件夹（比如 `prd/`），写好 `SKILL.md` 就能用，名字只能用小写字母、数字和连字符，并且和文件夹同名。详见 Skill Pack 的 README。

## 改了工坊源码之后

```bash
cd "$HOME/Documents/project/AI Workbench/aipm-workbench" && export PATH="$HOME/.local/node/bin:$PATH" && pnpm run build
```

然后退出工坊再重新打开。

在 VS Code 或其他 Electron 应用的终端里启动时，先执行 `unset ELECTRON_RUN_AS_NODE`，否则 Electron 会报 `bad option: --remote-debugging-port`。

## 换图标

```bash
apps/desktop/scripts/set-aipm-icon.sh ~/Downloads/logo.png
```

脚本会生成桌面图标 `apps/desktop/resources/aipm.icns`、PNG，以及应用内首页和侧栏使用的标志。已经带透明圆角的图片加 `--no-mask`，然后重新构建。下次启动时 App 会带上新图标；程序坞图标没变的话，运行 `killall Dock`。Logo 提示词见 `~/Documents/project/AI Workbench/Logo提示词.md`。

## 已知限制

- 这是本地构建，没有 Apple 签名，也不会自动更新。应用依赖源码目录，别移动或删除它；要移动的话，移动后重新运行一次 `pnpm run start:desktop` 生成 App，并更新 `~/Applications` 里的快捷方式。
- 会话按工作目录路径存放在 `~/.aipm-studio/sessions/` 下。移动工作区文件夹后，旧会话需要迁移（2026-10-20 已迁移一次，迁移前的备份在 `~/.aipm-studio/backups/`）。
- 启动时会占用本机 9222、9229、9230 三个调试端口。
- 官方版本更新后想合并进来：在源码目录 `git fetch upstream && git merge upstream/master`，处理冲突后重新构建。
