# 富恩資產管理有限公司三段式落地頁

这是一个可独立部署到 GitHub Pages 的静态项目。

- `index.html`：品牌介绍页
- `loan.html`：贷款金额选择页
- `apply.html`：贷款评估申请页
- `admin.html`：客户名单后台
- `styles.css`：三个前台页面共用样式

## 页面链路

`index.html` → `loan.html` → `apply.html`

申请表单与后台目前连接到“湾湾贷款”项目使用的同一个 Supabase 数据源。

## GitHub Pages

把本目录作为新仓库根目录上传，然后在仓库的 `Settings → Pages` 中选择从主分支根目录发布。

发布后入口如下：

- 前台：`https://你的账号.github.io/仓库名/`
- 后台：`https://你的账号.github.io/仓库名/admin.html`
