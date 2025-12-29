# GitHub 仓库设置指南

## 步骤 1：在 GitHub 上创建仓库

1. 访问 https://github.com/new
2. 仓库名称：`EnglishApp-aibuilders`
3. 描述：`English speaking and listening practice app for middle school students`
4. 选择：**Public** 或 **Private**（根据你的需要）
5. **不要**勾选 "Initialize this repository with a README"（因为我们已经有了）
6. 点击 "Create repository"

## 步骤 2：推送代码到 GitHub

### 方式一：使用 HTTPS（推荐，简单）

```bash
git push -u origin main
```

如果提示输入用户名和密码：
- **用户名**：`elbertchina02`
- **密码**：使用 GitHub Personal Access Token（不是 GitHub 密码）

#### 如何创建 Personal Access Token：
1. 访问：https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 名称：`EnglishApp-aibuilders`
4. 权限：勾选 `repo`（完整仓库权限）
5. 点击 "Generate token"
6. **复制 token**（只显示一次！）
7. 推送时，密码处粘贴这个 token

### 方式二：使用 SSH（更安全，推荐长期使用）

#### 2.1 检查是否已有 SSH key

```bash
ls -al ~/.ssh
```

如果看到 `id_rsa.pub` 或 `id_ed25519.pub`，说明已有 SSH key。

#### 2.2 如果没有 SSH key，创建一个：

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

按 Enter 使用默认路径，可以设置密码或留空。

#### 2.3 复制 SSH public key

```bash
cat ~/.ssh/id_ed25519.pub
```

#### 2.4 添加到 GitHub

1. 访问：https://github.com/settings/keys
2. 点击 "New SSH key"
3. Title：`MacBook Pro`（或任何描述性名称）
4. Key：粘贴刚才复制的 public key
5. 点击 "Add SSH key"

#### 2.5 更改远程仓库 URL 为 SSH

```bash
git remote set-url origin git@github.com:elbertchina02/EnglishApp-aibuilders.git
```

#### 2.6 推送代码

```bash
git push -u origin main
```

## 验证

推送成功后，访问以下链接应该能看到你的代码：

https://github.com/elbertchina02/EnglishApp-aibuilders

## 后续操作

推送成功后，你可以：

1. **查看代码**：在 GitHub 网页上浏览你的代码
2. **继续开发**：本地修改后使用以下命令推送：
   ```bash
   git add .
   git commit -m "描述你的更改"
   git push
   ```
3. **部署**：可以使用 AI Builders 的部署 API 将应用部署到云端

## 故障排除

### 如果推送失败：

1. **确认仓库已创建**：访问 https://github.com/elbertchina02/EnglishApp-aibuilders 确认仓库存在
2. **检查远程 URL**：
   ```bash
   git remote -v
   ```
3. **重新添加远程**（如果需要）：
   ```bash
   git remote remove origin
   git remote add origin https://github.com/elbertchina02/EnglishApp-aibuilders.git
   ```

### 如果遇到认证问题：

- **HTTPS**：确保使用 Personal Access Token 而不是密码
- **SSH**：确保 SSH key 已添加到 GitHub，并测试连接：
  ```bash
  ssh -T git@github.com
  ```

