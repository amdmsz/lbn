# 开启 MySQL 慢查询日志(P3 运维)

> 当前生产 MySQL 状态(2026-06-07 已查):
> - `slow_query_log = OFF`
> - `long_query_time = 10` 秒(太松)
> - `log_queries_not_using_indexes = OFF`
> - `min_examined_row_limit = 0`
> - `slow_query_log_file = /var/lib/mysql/root-slow.log`
>
> 需要开启 + 调到 1 秒阈值,让 F08 客户中心 hard cap 触发时能在日志看到。

## 推荐配置

| 参数 | 推荐值 | 理由 |
|---|---|---|
| `slow_query_log` | `ON` | 启用慢查询日志 |
| `long_query_time` | `1` | 1 秒以上算慢(SaaS 默认值) |
| `log_queries_not_using_indexes` | `ON` | 没走索引的也记 |
| `min_examined_row_limit` | `100` | 扫描行数 ≥100 才记(过滤极小 query) |

## 方案 A:运行时立即生效(重启失效,适合临时排查)

```bash
mysql -u <crm_user> -p liquor_crm <<'SQL'
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
SET GLOBAL log_queries_not_using_indexes = 'ON';
SET GLOBAL min_examined_row_limit = 100;
SHOW VARIABLES WHERE Variable_name IN (
  'slow_query_log', 'long_query_time',
  'log_queries_not_using_indexes', 'min_examined_row_limit'
);
SQL
```

CRM DB 用户可能没 SUPER 权限改 GLOBAL,必要时用 root:
```bash
sudo mysql <<'SQL'
SET GLOBAL slow_query_log = 'ON';
...
SQL
```

## 方案 B:持久化(my.cnf,重启不丢)

编辑 `/etc/mysql/mariadb.conf.d/50-server.cnf`(MariaDB)或 `/etc/mysql/mysql.conf.d/mysqld.cnf`(MySQL):

```ini
[mysqld]
slow_query_log = 1
long_query_time = 1
log_queries_not_using_indexes = 1
min_examined_row_limit = 100
slow_query_log_file = /var/log/mysql/slow.log
```

然后:
```bash
sudo systemctl restart mariadb   # 或 mysql
```

**注意 restart 会断所有连接,务必在低峰期做。** Next.js 服务有连接池会自动重连,但运行中 mutation 会失败一次。

## 日志查看

```bash
sudo tail -f /var/log/mysql/slow.log
# 或 (取决于 OS 配置)
sudo tail -f /var/lib/mysql/root-slow.log

# 用 mysqldumpslow 聚合
sudo mysqldumpslow -s t -t 20 /var/log/mysql/slow.log  # 按总耗时 top 20
sudo mysqldumpslow -s c -t 20 /var/log/mysql/slow.log  # 按出现次数 top 20
```

## 监控集成(后续)

- 把 slow.log 接 logrotate 防膨胀(7 天)
- 接 Sentry/Datadog 自动告警 (top 5 慢查询)
- F08 hard cap 触发时 console.warn 跟慢查询时序对齐排查

## 关联 audit finding

- **F08**(客户中心全表加载) — 已加 hard cap 1500 + 复合索引,但需要慢查询日志验证大表场景是否真生效
- **F11**(TradeOrder 详情 items 无 take) — 评估认为业务上 items 天然有界,慢查询日志可验证
- **F12**(master data 9 个 count 并行) — audit 标 false positive,慢查询日志可印证

## 不做的(避免乱开)

- ❌ `general_log = ON`(记录所有 query,磁盘爆炸 + 性能损耗)
- ❌ `long_query_time = 0`(每个 query 都记,意义不大)
