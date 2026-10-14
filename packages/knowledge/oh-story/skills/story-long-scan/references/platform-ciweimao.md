# 刺猬猫：采集与分析

作者选了刺猬猫才读本文。采集走本技能 `bridge/ciweimao_app` 的 App 协议客户端，经 `bridge/rankmin_cli.py` 写榜。不要启动 CDP，不要下章节。没有账号环境变量时客户端自己注册游客。出口用 `CIWEIMAO_PROXY_URL`，或 `~/.dsh/ciweimao/` 里的快代理密钥。

## 榜单与命令

在技能目录执行 `python3 bridge/rankmin_cli.py --out {输出目录} --limit 20 --ciweimao fans_value:week,favor:week,tsukkomi:week,yp_new:month`。别名是 `order:time_type`，例如 `favor:week`、`yp:month`。不要全采，不要读 tokens.json，不要下章节。

## 字段

排名、书名、作者、字数、作品页。题材和榜单值只有接口带了才写，没有就标 [待补]，不要下章节补。刺猬猫是小平台：同方向不到 10 本才算稀疏。

## 分析维度

| 维度 | 看什么 |
|---|---|
| 月票/订阅榜 | 付费认可 |
| 新书榜 | 二次元新梗与新设定 |
| 吐槽/刀片榜 | 读者互动强度与争议点 |
