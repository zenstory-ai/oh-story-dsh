# 黑岩短篇：采集与分析

作者选了黑岩才读本文。**黑岩需要登录**：先用 `/browser-cdp` 启动 Chrome，请作者在 Chrome 里手动登录 `manage.zhangwenpindu.cn`，脚本再从 Cookie 取 Bearer token 调后端接口；未登录会报错提示。采集失败就跳过黑岩继续其他平台，报告里说明结论不含它。

## 页面与命令

书库列表：manage.zhangwenpindu.cn/books/booklist

`node scripts/heiyan-booklist-scraper.js --channel male|female|all --pages N --outdir {输出目录}`（每页 20 条；`--detail` 逐本取标签和简介，较慢），文件名 `黑岩书库列表_{频道}_{YYYYMMDD}.md`。脚本区分 CDP 未连、未登录、超时、接口错误，并带书名命中率质量门。

## 字段

书名、作者、分类/类型（聚合时类型当题材）、字数、价格、创建/更新时间、标签与简介（`--detail`）。书库列表没有热度字段，聚合按列表顺序取代表作，热度结论要靠标签和更新时间旁证，可信度写低一档。

## 分析维度

| 维度 | 看什么 |
|---|---|
| 类型分布 | 虐恋、复仇、身份反转的占比 |
| 创建/更新时间 | 近期新开的集中在哪些类型 |
| 标签组合 | 极端情绪的具体包装方式 |
