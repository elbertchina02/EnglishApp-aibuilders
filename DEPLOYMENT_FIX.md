# 部署问题修复指南

## ❌ 当前问题

部署失败，错误信息：
```
Failed to get the SHA of the commit in github.com/elbertchina02/EnglishApp-aibuilders/main.
```

**原因**：GitHub 仓库可能不存在，或者代码还没有推送到 GitHub。

## ✅ 解决步骤

### 步骤 1：创建 GitHub 仓库

1. 访问：https://github.com/new
2. **仓库名称**：`EnglishApp-aibuilders`（必须完全匹配）
3. **描述**：`English speaking and listening practice app for middle school students`
4. 选择：**Public**（推荐）或 **Private**
5. ⚠️ **重要**：**不要**勾选以下选项：
   - ❌ "Add a README file"
   - ❌ "Add .gitignore"
   - ❌ "Choose a license"
6. 点击 **"Create repository"**

### 步骤 2：推送代码到 GitHub

在项目目录中运行：

```bash
git push -u origin main
```

如果提示需要认证：

**方式一：使用 Personal Access Token（推荐）**

1. 访问：https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 名称：`EnglishApp Deployment`
4. 权限：勾选 `repo`（完整仓库权限）
5. 点击 "Generate token"
6. **复制 token**（只显示一次！）
7. 推送时：
   - 用户名：`elbertchina02`
   - 密码：粘贴刚才复制的 token

**方式二：使用 SSH**

```bash
# 检查是否有 SSH key
ls -al ~/.ssh

# 如果没有，创建一个
ssh-keygen -t ed25519 -C "your_email@example.com"

# 复制 public key
cat ~/.ssh/id_ed25519.pub

# 添加到 GitHub: https://github.com/settings/keys

# 更改远程 URL
git remote set-url origin git@github.com:elbertchina02/EnglishApp-aibuilders.git

# 推送
git push -u origin main
```

### 步骤 3：验证代码已推送

访问以下链接，确认能看到你的代码：
https://github.com/elbertchina02/EnglishApp-aibuilders

应该能看到：
- ✅ Dockerfile
- ✅ server.js
- ✅ package.json
- ✅ public/ 目录
- ✅ 所有其他文件

### 步骤 4：重新部署

代码推送成功后，重新提交部署请求：

```bash
curl -X POST "https://space.ai-builders.com/backend/v1/deployments" \
  -H "Authorization: Bearer sk_7b71f59a_3fda86b315eb6ba3f8aaad4be2ee5d8998c2" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url": "https://github.com/elbertchina02/EnglishApp-aibuilders",
    "service_name": "english-app",
    "branch": "main",
    "port": 8000
  }'
```

或者告诉我，我可以帮你重新部署。

## 📋 检查清单

在重新部署前，请确认：

- [ ] GitHub 仓库已创建（https://github.com/elbertchina02/EnglishApp-aibuilders）
- [ ] 所有代码已推送到 GitHub（包括 Dockerfile）
- [ ] 可以在 GitHub 网页上看到所有文件
- [ ] 仓库是 Public 或你有访问权限

## 🚀 部署成功后

部署成功后（状态变为 `HEALTHY`），你的应用将在以下地址可用：

**https://english-app.ai-builders.space/**

## 需要帮助？

如果遇到问题，请告诉我：
1. 是否已创建 GitHub 仓库？
2. 是否已推送代码？
3. 遇到的具体错误信息

