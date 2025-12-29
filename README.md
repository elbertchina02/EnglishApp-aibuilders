# 英语口语听力练习应用

English Speaking & Listening Practice App for Middle School Students

## 功能特点

- 🎤 **语音录音**：使用浏览器内置的 MediaRecorder API 进行录音
- 📝 **语音转文字**：通过 AI Builders API 将语音转换为文字
- 💬 **AI对话**：使用 DeepSeek 模型进行英语对话练习
- 🔊 **文本转语音**：使用 Web Speech Synthesis API 朗读 AI 回复
- 📚 **对话历史**：保存完整的对话历史，形成连贯的练习会话

## 技术栈

- **后端**：Node.js + Express
- **前端**：HTML + CSS + JavaScript (Vanilla JS)
- **API**：AI Builders API
  - `/v1/audio/transcriptions` - 语音转文字
  - `/v1/chat/completions` - AI对话（使用 deepseek 模型）

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件（参考 `.env.example`）：

```env
AI_BUILDER_TOKEN=your_token_here
PORT=3000
```

**重要**：请确保 `.env` 文件已添加到 `.gitignore` 中，不要将 token 提交到代码仓库。

### 3. 启动服务器

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

### 4. 访问应用

打开浏览器访问：`http://localhost:3000`

## 使用说明

1. **允许麦克风权限**：首次使用时，浏览器会请求麦克风权限，请点击"允许"

2. **开始录音**：点击"开始录音"按钮，开始说话

3. **停止录音**：说完后点击"停止录音"按钮

4. **查看对话**：系统会自动：
   - 将你的语音转换为文字
   - 发送给 AI 获取回复
   - 朗读 AI 的回复
   - 在对话区域显示完整的对话历史

5. **继续对话**：可以继续点击"开始录音"进行下一轮对话

## 浏览器兼容性

- ✅ Chrome/Edge（推荐）
- ✅ Firefox
- ⚠️ Safari（部分功能可能受限）

## 项目结构

```
.
├── server.js              # Express 后端服务器
├── package.json           # 项目配置和依赖
├── .env                  # 环境变量（不提交到git）
├── .env.example          # 环境变量示例
├── .gitignore           # Git 忽略文件
├── README.md            # 项目说明文档
└── public/              # 前端静态文件
    ├── index.html       # 主页面
    ├── styles.css       # 样式文件
    └── app.js          # 前端逻辑
```

## API 端点

### POST /api/transcribe
语音转文字接口

**请求**：
- Content-Type: multipart/form-data
- Body: audio file (audio/webm)

**响应**：
```json
{
  "text": "transcribed text",
  "detected_language": "en",
  ...
}
```

### POST /api/chat
AI对话接口

**请求**：
```json
{
  "messages": [
    {"role": "system", "content": "..."},
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
        "role": "assistant",
        "content": "AI response"
      }
    }
  ]
}
```

## 注意事项

1. **麦克风权限**：应用需要访问麦克风权限才能录音
2. **网络连接**：需要稳定的网络连接来调用 AI Builders API
3. **Token安全**：请妥善保管 `AI_BUILDER_TOKEN`，不要泄露或提交到代码仓库
4. **浏览器支持**：建议使用 Chrome 或 Edge 浏览器以获得最佳体验

## 开发说明

### 添加新功能

- 修改 `public/app.js` 添加前端功能
- 修改 `server.js` 添加后端 API 端点
- 修改 `public/styles.css` 调整样式

### 调试

- 打开浏览器开发者工具查看控制台日志
- 服务器日志会显示 API 调用错误信息

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

