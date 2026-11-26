# 红课题本

用于《习近平新时代中国特色社会主义思想概论》2026 秋季题库的桌面练习工具。题库含 70 道单选和 30 道多选，题干、选项和答案随程序提供。

## 下载

前往 [Releases](https://github.com/RetakeTheory/red-coursebook/releases) 下载对应系统的文件。

| 系统 | 使用方法 |
| --- | --- |
| Windows x64 | 双击 `RedCoursebook-Windows-x64.exe`。界面使用系统的 Microsoft Edge WebView2 运行时。 |
| macOS 14 或更新版本 | 解压 `RedCoursebook-macOS-universal.zip`，打开「红课题本.app」。同一个包支持 Apple Silicon 和 Intel。 |

## 作答

- **练习模式**可选全部、单选或多选。单选点选后立即显示答案，多选点「确认答案」后判题。
- **测试模式**每次随机抽取 14 道单选和 6 道多选，同一套卷中题目不重复。每题 3 分，满分 60 分，多选须与原题答案完全一致。全部作答后可交卷并逐题复盘。
- **错题本**收录练习和已交卷测试中的错题。重练答对后移出。
- 开始作答前可选择**打乱选项顺序**。屏幕上的字母会随选项重新排列，本轮返回题目或重开程序时沿用相同顺序。
- 右侧答题卡可以跳题，同时显示答题进度与用时。测试从开卷计时至交卷。练习记录、未完成测试和显示偏好保存在当前设备。

## 构建

使用 Node.js 22 或更新版本、npm 和 Python 3。从项目根目录运行下列命令。准备脚本会校验指定版本的框架下载文件，也可传入已有的官方压缩包路径。

```sh
npm ci
python prepare_runtime.py
npm test
npm run build
```

Windows 可执行文件位于 `build/dist/RedCoursebook/`。在 macOS 上可用以下命令生成通用应用包，命令需要 Pillow 和系统的 `codesign`。在 Windows 上打包 Mac 应用时，另需将 `rcodesign.exe` 加入 PATH 或放在 `build/` 内。

```sh
python -m pip install Pillow
python package_mac.py
```

结构化题库位于 `site/bank.json`。原题号分别按单选和多选编号。重新导入相同结构的 Word 题库可运行 `python import_bank.py "题库.docx"`。

## 鸣谢与许可

开发制作为 **reshi**，题库提供者为 **Miraitowa**。本项目软件采用 [MIT License](LICENSE)。题库按提供的课程材料整理，鸣谢头像由提供者提供。第三方组件的许可随程序保留。
