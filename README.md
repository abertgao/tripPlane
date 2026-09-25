# tripPlane

行程与航班的前端测试站。当前是可点击的界面：概览、行程列表、行程详情、新建行程。数据在浏览器里，刷新后新建内容不会保留。

## 协作位置

| 项 | 值 |
|---|---|
| GitHub | `git@github.com:abertgao/tripPlane.git` |
| 分支 | `main` |
| 服务器目录 | `/home/ubuntu/projects/tripPlane` |
| 测试地址 | http://62.234.178.115:8802/ |

在这台机器上改代码，直接进入上面的目录。不要把仓库克隆到别的路径再开一份服务，8802 只给这一份用。

公网只开放 **http** 的 8802 端口。写成 https，或省略端口，都打不开这个站。

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
