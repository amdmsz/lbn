# Public FRP Tunnel Runbook

更新时间：2026-05-01

目标：让手机 App / Windows EXE 在没有 Tailscale 的情况下，通过公网域名访问内网 CRM，并通过 CRM 自己的 `/downloads` 目录分发安装包。

最终访问路径：

```text
App / EXE
  -> https://crm.cclbn.com
  -> 公网服务器 Nginx HTTPS
  -> 127.0.0.1:18080 on 公网服务器
  -> frps
  -> frpc on 内网 CRM
  -> 127.0.0.1:3000 on 内网 CRM
```

## 1. DNS

把 `crm.cclbn.com` 的 A 记录指向公网服务器 IP。

不要再把 `crm.cclbn.com` 公网 DNS 指向 `192.168.x.x` 这类内网 IP；公网手机无法直接访问 RFC1918 私网地址。

## 2. 安装 frp

公网服务器和内网 CRM 服务器都执行：

```bash
FRP_VERSION=0.68.0
ARCH=amd64
cd /tmp
curl -fL -o frp.tar.gz "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_${ARCH}.tar.gz"
tar -xzf frp.tar.gz
sudo install -m 0755 "frp_${FRP_VERSION}_linux_${ARCH}/frps" /usr/local/bin/frps
sudo install -m 0755 "frp_${FRP_VERSION}_linux_${ARCH}/frpc" /usr/local/bin/frpc
frps --version
frpc --version
```

如果服务器是 ARM64，把 `ARCH=amd64` 改为 `ARCH=arm64`。

## 3. 准备共享 token

在任意一台机器生成 token：

```bash
openssl rand -base64 48
```

公网服务器和内网 CRM 服务器都写入同一个 token：

```bash
sudo mkdir -p /etc/frp
printf '%s\n' '替换成上一步生成的token' | sudo tee /etc/frp/frp-token >/dev/null
sudo chmod 600 /etc/frp/frp-token
```

不要把真实 token 提交到仓库。

## 4. 公网服务器配置

```bash
sudo mkdir -p /etc/frp
sudo cp deploy/frp/frps.crm-public.toml /etc/frp/frps.toml
sudo cp deploy/systemd/frps.service /etc/systemd/system/frps.service
sudo systemctl daemon-reload
sudo systemctl enable --now frps
sudo systemctl status frps --no-pager
```

防火墙 / 云安全组只开放：

```text
80/tcp
443/tcp
7000/tcp
```

不要对公网开放 `18080/tcp`。它只给公网服务器本机 Nginx 访问。
模板里的 `proxyBindAddr = "127.0.0.1"` 会让 frp 暴露端口只监听本机，避免 `18080` 直接暴露到公网。

## 5. 公网 Nginx + HTTPS

安装 Nginx 和 Certbot 后：

```bash
sudo cp deploy/nginx/jiuzhuang-crm-public-frp.conf /etc/nginx/sites-available/jiuzhuang-crm-public-frp.conf
sudo sed -i 's/__SERVER_NAME__/crm.cclbn.com/g' /etc/nginx/sites-available/jiuzhuang-crm-public-frp.conf
sudo ln -sf /etc/nginx/sites-available/jiuzhuang-crm-public-frp.conf /etc/nginx/sites-enabled/jiuzhuang-crm-public-frp.conf
sudo nginx -t
```

首次签证书：

```bash
sudo certbot certonly --webroot -w /var/www/html -d crm.cclbn.com
sudo nginx -t
sudo systemctl reload nginx
```

## 6. 内网 CRM 服务器配置

确保 CRM Web 只需要监听本机即可：

```bash
curl -I http://127.0.0.1:3000/login
```

配置 frpc：

```bash
sudo mkdir -p /etc/frp
sudo cp deploy/frp/frpc.crm-intranet.toml /etc/frp/frpc.toml
sudo sed -i 's/__PUBLIC_FRP_SERVER__/公网服务器IP或域名/g' /etc/frp/frpc.toml
sudo cp deploy/systemd/frpc.service /etc/systemd/system/frpc.service
sudo systemctl daemon-reload
sudo systemctl enable --now frpc
sudo systemctl status frpc --no-pager
```

生产环境变量必须保持：

```env
NEXTAUTH_URL=https://crm.cclbn.com
NODE_ENV=production
```

改完环境变量后重启 CRM：

```bash
sudo systemctl restart jiuzhuang-crm
```

## 7. 验证

公网服务器：

```bash
curl -I http://127.0.0.1:18080/login
curl -I https://crm.cclbn.com/login
sudo ss -lntp | grep -E ':(7000|18080|80|443)\b'
sudo journalctl -u frps -n 80 --no-pager
sudo journalctl -u nginx -n 80 --no-pager
```

内网 CRM 服务器：

```bash
sudo journalctl -u frpc -n 80 --no-pager
sudo journalctl -u jiuzhuang-crm -n 120 --no-pager
```

手机关闭 Wi-Fi，只走 4G/5G，打开：

```text
https://crm.cclbn.com/mobile
```

能打开登录页后，App/EXE 就能正常登录。

同时验证客户端更新清单和安装包下载：

```bash
curl -I https://crm.cclbn.com/client-update.json
curl -I https://crm.cclbn.com/downloads/Lbn-CRM-Android.apk
curl -I https://crm.cclbn.com/downloads/Lbn-CRM-0.1.4-x64.zip
```

如果这些地址返回 404，先在内网 CRM 服务器执行：

```bash
cd /var/www/jiuzhuang-crm
bash scripts/sync-client-downloads.sh v0.1.4
```

## 8. 回滚

公网服务器：

```bash
sudo systemctl stop frps
sudo rm -f /etc/nginx/sites-enabled/jiuzhuang-crm-public-frp.conf
sudo nginx -t
sudo systemctl reload nginx
```

内网 CRM 服务器：

```bash
sudo systemctl stop frpc
```

DNS 回滚到原方案即可。
