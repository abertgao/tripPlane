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

## 本机启动

需要 Node 22（这台机器在 `/home/ubuntu/.nvm/versions/node/v22.22.3/bin`）。

```bash
cd /home/ubuntu/projects/tripPlane
npm install
npm run dev
```

开发服务监听 `0.0.0.0:8802`。改完 `src/` 后刷新页面即可。

## 目录

- `src/` 页面与样式
- `deploy/nginx-tripplane.conf` 备用的 80 端口 Host 转发，当前测试入口是 8802，不依赖这条
