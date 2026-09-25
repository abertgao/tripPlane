# tripPlane

行程与航班的前端测试站。当前是可点击的界面：概览、行程列表、行程详情、新建行程。数据在浏览器里，刷新后新建内容不会保留。

## 协作位置

| 项 | 值 |
|---|---|
| GitHub | `git@github.com:abertgao/tripPlane.git` |
| 共享目录 | `/home/ubuntu/projects/tripPlane` |
| 共享分支 | `main` |
| 共享测试地址 | http://62.234.178.115:8802/ |
| abert 的测试目录 | `/home/ubuntu/projects/tripPlane-abert` |
| abert 的分支 / 端口 | `abert` · http://62.234.178.115:8803/ |
| sofia 的测试目录 | `/home/ubuntu/projects/tripPlane-sofia` |
| sofia 的分支 / 端口 | `sofia` · http://62.234.178.115:8804/ |

三份目录是同一个仓库的三个工作区。共享目录保持 `main`，用来看合并后的结果。个人改动写在自己的目录和分支里，推上去再合并进 `main`。

8802、8803、8804 都只用 **http**。安全组需要分别放行，省略端口或写成 https 都打不开。

## 自动发布

GitHub 在 `main` 或 `master` 被推送时，会调用 http://62.234.178.115:8802/hooks/github 。服务器校验签名后拉取对应分支，构建并发布到 http://62.234.178.115:8802/ 。

当前仓库的共享分支是 `main`。abert、sofia 的推送不会发布，只有合并进 `main` 或 `master` 才会。

共享目录里不要手改文件。这里如果有未提交改动，或本地提交还没推送，这次发布会跳过，避免把正在写的内容盖掉。

手动发布：

```bash
bash /home/ubuntu/projects/tripPlane/scripts/pull-and-deploy.sh
```

## 个人目录启动

需要 Node 22（这台机器在 `/home/ubuntu/.nvm/versions/node/v22.22.3/bin`）。

```bash
cd /home/ubuntu/projects/tripPlane-abert   # 或 tripPlane-sofia
npm install
npm run dev
```

改完自己目录里的 `src/` 后，刷新对应端口即可。

## 目录

- `src/` 页面与样式
- `deploy/nginx-tripplane.conf` 备用的 80 端口 Host 转发，当前测试入口是 8802，不依赖这条
