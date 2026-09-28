# 起点：采集与分析

作者选了起点才读本文。默认不需要 Chrome：脚本先读 `https://m.qidian.com` 移动端 SSR pageContext，移动端不可用时才回退 CDP/PC 页面，文件头 `抓取方式` 标 `mobile-ssr` 或 `cdp-pc`。

## 榜单与命令

`node scripts/qidian-rank-scraper.js --type {榜单} --outdir {输出目录}`（`--type all` 全采；`--mode mobile|cdp` 强制一种方式；`--detail yes` 进详情页补标签、简介、最新更新）

| 榜单 | --type | URL | 看什么 |
|------|--------|-----|--------|
| 新人签约新书榜 | newsign | qidian.com/rank/newsign/ | 新人签约作品，新风向 |
| 签约作者新书榜 | signnewbook | qidian.com/rank/signnewbook/ | 已签约作者新作风向 |
| 公众作者新书榜 | pubnewbook | qidian.com/rank/pubnewbook/ | 发现潜力作者 |
| 新人作者新书榜 | newauthor | qidian.com/rank/newauthor/ | 新人赛道 |
| 三江推荐 | sanjiang | qidian.com/sanjiang/ | 编辑精选，按周分组（非 /rank/ 路径） |
| 月票榜 | yuepiao | qidian.com/rank/yuepiao/ | 付费认可度最高 |
| 畅销榜 | hotsales | qidian.com/rank/hotsales/ | 真金白银投票 |
| 阅读指数榜 | readindex | qidian.com/rank/readindex/ | 阅读量综合 |
| 收藏榜 | collect | qidian.com/rank/collect/ | 读者关注热度 |
| 原创推荐榜 | recom | qidian.com/rank/recom/ | 平台推荐 |

默认组合：新人签约新书榜 + 签约作者新书榜 + 月票榜 + 畅销榜。文件名 `起点{榜单}_{YYYYMMDD}.md`。

## 字段

排名、书名、作者、题材（主类·子类；聚合时主类作题材、子类进标签）、状态、签约、收费模式、字数、总推荐（聚合的热度口径）、标签/最新更新/简介（详情页）、作品页链接。额外必填：题材、字数、总推荐，缺的写 `[待补]`。

## 分析维度

| 维度 | 看什么 |
|---|---|
| 月票榜/畅销榜 | 付费认可与持续追读，最硬的指标 |
| 各新书榜 | 新作者、新题材的早期信号；和月票/畅销榜的题材占比对照 |
| 三江推荐 | 平台力推方向 |
| 追读率 | 决定推荐位分配（榜单上看不到，只能从月票/畅销间接推断） |
