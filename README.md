# English Learning App for Middle School Students

一个帮助初中生练习英语口语和听力的 Web 应用。学生可以通过语音与 AI 进行英语对话练习。

## 功能特点

- 🎤 **语音输入**：点击按钮录制语音，自动转换为文字
- 💬 **AI 对话**：使用 DeepSeek AI 进行智能对话
- 🔊 **语音播放**：AI 回复自动转换为语音播放
- 📱 **移动端支持**：完美支持手机和平板设备
- 🌐 **在线访问**：无需安装，浏览器直接使用

## 在线访问

访问地址：https://english-app.ai-builders.space/

## 技术栈

### 前端
- HTML5 / CSS3 / JavaScript
- MediaRecorder API（录音）
- HTML5 Audio API（播放）

### 后端
- Node.js + Express
- AI Builders API
  - 语音转文字：`/v1/audio/transcriptions`
  - AI 对话：`/v1/chat/completions` (DeepSeek)
  - 文字转语音：Google TTS API

### 部署
- Docker
- AI Builders Platform (Koyeb)

## 本地开发

### 前置要求

- Node.js 18+
- npm

### 安装步骤

1. 克隆仓库
```bash
git clone https://github.com/elbertchina02/EnglishApp-aibuilders.git
cd EnglishApp-aibuilders
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量

创建 `.env` 文件：
```bash
AI_BUILDER_TOKEN=your_api_token_here
PORT=3000
```

4. 启动开发服务器
```bash
npm run dev
```

5. 访问应用
```
http://localhost:3000
```

## 项目结构

```
EnglishApp-aibuilders/
├── public/              # 前端静态文件
│   ├── index.html      # 主页面
│   ├── app.js          # 前端逻辑
│   └── styles.css      # 样式文件
├── server.js           # Express 后端服务器
├── package.json        # 项目依赖
├── Dockerfile          # Docker 配置
└── README.md           # 项目文档
```

## API 端点

### `/api/transcribe` (POST)
将音频文件转换为文字

**请求**：
- Content-Type: `multipart/form-data`
- Body: `audio` 文件（WebM 格式）

**响应**：
```json
{
  "text": "转录的文字内容"
}
```

### `/api/chat` (POST)
与 AI 进行对话

**请求**：
```json
{
  "message": "用户消息",
  "history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**响应**：
```json
{
  "choices": [
    {
      "message": {
        "content": "AI 的回复"
      }
    }
  ]
}
```

### `/api/tts` (POST)
将文字转换为语音

**请求**：
```json
{
  "text": "要转换的文字"
}
```

**响应**：
- Content-Type: `audio/mpeg`
- Body: MP3 音频数据

### `/health` (GET)
健康检查端点

**响应**：
```json
{
  "status": "ok"
}
```

## 部署

应用已配置为自动部署到 AI Builders Platform。每次推送到 `main` 分支都会触发新的部署。

### 手动部署

```bash
# 提交代码
git add .
git commit -m "Your commit message"
git push origin main

# 等待 5-10 分钟部署完成
```

### Docker 构建

```bash
# 构建镜像
docker build -t english-app .

# 运行容器
docker run -p 8000:8000 -e AI_BUILDER_TOKEN=your_token english-app
```

## 版本历史

- **v1.1.9** - 移除 uuid 依赖，修复 package-lock.json
- **v1.1.8** - 改用 Google TTS API，移除 gtts 依赖
- **v1.1.7** - 改进 Dockerfile，添加健康检查
- **v1.1.6** - 添加 Python 依赖支持
- **v1.1.5** - 添加版本控制显示
- **v1.1.0** - 实现后端 TTS，改善移动端兼容性
- **v1.0.0** - 初始版本

## 常见问题

### 移动端没有声音？
- 确保手机音量已打开
- 尝试点击"播放声音"按钮手动播放
- 检查浏览器是否允许自动播放音频

### 录音不工作？
- 确保浏览器已授予麦克风权限
- 使用 HTTPS 或 localhost（HTTP 可能不支持录音）

### 部署失败？
- 检查 `package-lock.json` 是否已提交
- 确保所有依赖都在 `package.json` 中
- 查看 Koyeb 控制台的构建日志

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 作者

GitHub: [@elbertchina02](https://github.com/elbertchina02)

## 致谢

- AI Builders Platform - 提供部署和 API 服务
- DeepSeek - 提供 AI 对话模型
- Google TTS - 提供文字转语音服务
