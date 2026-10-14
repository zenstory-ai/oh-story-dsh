# 起点：采集与分析

作者选了起点才读本文。采集只走本技能 `bridge/rankmin_cli.py` 的起点移动榜。不要执行下文旧命令，不要回退 CDP，不要进详情页。

## 榜单与命令

在技能目录执行 `python3 bridge/rankmin_cli.py --out {输出目录} --limit 20 --qidian {榜单别名}`。可跑的别名是 yuepiao、hotsales、readindex、newfans、recom、vipup、signnewbook、pubnewbook、newsign、newauthor。不要把 sanjiang、collect、女生精选或女生月票写进命令。不要全采，不要进详情页，不要打开网页榜去补失败的榜，不要 CDP。

| 榜单 | --type | URL | 看什么 |
|------|--------|-----|--------|
| 新人签约新书榜 | newsign | qidian.com/rank/newsign/ | 新人签约作品，新风向 |
| 签约作者新书榜 | signnewbook | qidian.com/rank/signnewbook/ | 已签约作者新作风向 |
| 公众作者新书榜 | pubnewbook | qidian.com/rank/pubnewbook/ | 发现潜力作者 |
| 新人作者新书榜 | newauthor | qidian.com/rank/newauthor/ | 新人赛道 |
| 三江推荐 | 解析器不接受，不要写入命令 | qidian.com/sanjiang/ | 编辑精选，按周分组（非 /rank/ 路径） |
| 月票榜 | yuepiao | qidian.com/rank/yuepiao/ | 付费认可度最高 |
| 畅销榜 | hotsales | qidian.com/rank/hotsales/ | 真金白银投票 |
| 阅读指数榜 | readindex | qidian.com/rank/readindex/ | 阅读量综合 |
| 收藏榜 | 解析器不接受，不要写入命令 | qidian.com/rank/collect/ | 读者关注热度 |
| 原创推荐榜 | recom | qidian.com/rank/recom/ | 平台推荐 |

默认组合：月票榜、畅销榜、阅读指数榜，别名 yuepiao,hotsales,readindex。作者点名新书榜时再加 newsign、signnewbook、pubnewbook、newauthor。文件名 `起点{榜单}_{YYYYMMDD}.md`。

### 书库新书

书库新书页不在本版本的 provider 里。不要开 Chrome，不要打开网页书库去补失败的榜。

## 字段

排名、书名、作者、题材（主类·子类）、状态、字数、榜单值、作品页。榜单值是这一榜自己的口径，不是在读人数，也不是总推荐。移动榜不写总推荐、签约和收费模式。简介只有列表里带了才写。缺题材、字数或榜单值就标 [待补]。不要进详情页补。

## 分析维度

| 维度 | 看什么 |
|---|---|
| 月票榜/畅销榜 | 付费认可与持续追读，最硬的指标 |
| 各新书榜 | 新作者、新题材的早期信号；和月票/畅销榜的题材占比对照 |
| 三江推荐 | 本版本不采集，不要写成平台力推 |
| 追读率 | 决定推荐位分配（榜单上看不到，只能从月票/畅销间接推断） |
