# rank-bridge

起点男频移动榜来自匿名 HTTP。番茄把 `fanqie-python` 的协议客户端放在 `fanqie_app/`，扫榜调分类热门、分类最新，以及按题材的新书（连载、30 万字以下、按热度）。没有跨题材书库列表。刺猬猫把 `ciweimao-api-reverse` 的协议客户端原样放在 `ciweimao_app/`：签名、解密、游客注册和 `Session.get_rank_books`。出口与采集器相同，静态地址用 `CIWEIMAO_PROXY_URL`，否则用快代理密钥提取一条 DPS。晋江把书店榜协议放在 `jjwxc_app/`：目录、72 个频道分页，以及按短页停止的翻页。每本再读公开作品页上的收藏、营养液、积分和字数。作者积分榜和 TOP100 没有频道分页。起点女生精选榜和女生月票榜不在公开的移动榜页上，这两条别名直接失败，不请求验证页。

`assets:craft` 把 `rankmin/`、`ciweimao_app/`、`fanqie_app/` 和 `jjwxc_app/` 铺到 `skills/story-long-scan/bridge/`，并把 `rankmin_cli.py` 铺到同级 `bridge/`。发行构建会删掉 `skills/story-long-scan/scripts/`，所以采集代码不能放在 `scripts/` 下。

不包含：原始 HTML 落盘、桌面 WOFF、番茄字体表、番茄网页书库、用详情页补书名、开篇样本、验证码打戳、章节下载、七猫。起点女频验证页不接。晋江作品页只取收藏、营养液、积分和字数。书名缺失或仍是私用区字符时，函数失败并指出字段。不下章节。四个平台各自是一个 `RankProvider`，命令行只查这张表。番茄和刺猬猫的 curl 会话都从 `net.py` 打开，依赖钉在 `requirements.txt`：`curl_cffi`、`pycryptodome`、`kdl`。起点和晋江继续用 Python 标准库，解压共用 `net.gunzip`。晋江的重试、限速和作品页校验仍留在 `jjwxc_app/http.py`。
