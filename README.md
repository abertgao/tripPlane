# tripPlane

行程与航班的前端测试站。当前是可点击的界面：概览、行程列表、行程详情、新建行程。数据在浏览器里，刷新后新建内容不会保留。

## 合作模式

两个人在同一台机器上开发，共用一个 Git 仓库，各自使用独立目录和端口。合并进 `main` 之后，由 GitHub 钩子自动发布共享页面。

仓库：`git@github.com:abertgao/tripPlane.git`（私有，需先把合作者加进仓库）

| 角色 | 目录 | 分支 | 地址 | 用途 |
|---|---|---|---|---|
| 共享发布 | `/home/ubuntu/projects/tripPlane` | `main` | http://62.234.178.115:8802/ | 只看合并后的结果 |
| abert | `/home/ubuntu/projects/tripPlane-abert` | `abert` | http://62.234.178.115:8803/ | abert 开发调试 |
| sofia | `/home/ubuntu/projects/tripPlane-sofia` | `sofia` | http://62.234.178.115:8804/ | sofia 开发调试 |

8802、8803、8804 都只用 **http**。省略端口或写成 https 打不开。

### 各自开发

在自己的目录里改代码，用自己的分支提交。abert 以 8803 为准，sofia 以 8804 为准。

```bash
cd /home/ubuntu/projects/tripPlane-abert   # sofia 则进入 tripPlane-sofia
git status
git add -A
git commit -m "说明这次改了什么"
git push -u origin HEAD
```

开始做下一轮之前，先把已发布的 `main` 合进自己的分支，避免后来冲突堆在一起：

```bash
git fetch origin
git merge origin/main
```

个人目录如果还没装依赖：

```bash
export PATH="/home/ubuntu/.nvm/versions/node/v22.22.3/bin:$PATH"
npm install
npm run dev
```

改完 `src/` 后刷新自己的端口即可。`npm run dev` 已经绑在各自端口上，不要改去占用 8802。

### 合并并发布

共享目录保持干净的 `main`，不要在里面手改功能。日常把自己的分支合并进 `main` 时，在 GitHub 上合并。服务器发现 `main` 比本地新，才会自动拉取、构建并更新 8802。

abert、sofia 分支上的推送不会发布。只有 `main` 或 `master` 被推送时，GitHub 才调用 http://62.234.178.115:8802/hooks/github 。当前使用的共享分支是 `main`。

若合并是直接在共享目录里完成并推送的，服务器已经和 GitHub 一致，钩子不会再次构建。这时补一次手动发布：

```bash
bash /home/ubuntu/projects/tripPlane/scripts/deploy-tripplane.sh
```

共享目录里若有未提交改动，或本地 `main` 还有没推送的提交，自动发布会跳过，避免盖掉正在写的内容。

### 钩子做了什么

1. 校验 GitHub 推送签名
2. 只接受 `main` 和 `master`
3. 拉取该分支
4. 构建页面，发布到 8802

abert 和 sofia 的目录不在这次发布范围内。

## 目录

- `src/` 页面与样式
- `scripts/github-webhook.py` 接收 GitHub 推送
- `scripts/pull-and-deploy.sh` 拉取后按需发布
- `scripts/deploy-tripplane.sh` 构建并重启 8802
- `deploy/` systemd 与 Nginx 配置
