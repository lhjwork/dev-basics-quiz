#!/bin/bash
# 이미 돌고 있는 nginx 컨테이너(letter-projects) 뒤에 학습지를 붙인다.
# 기존 server 블록은 건드리지 않고, 파일 끝에 학습지용 블록만 추가한다.
# 순서:  sudo ./attach-nginx.sh http  →  (DNS 변경)  →  sudo ./attach-nginx.sh cert  →  sudo ./attach-nginx.sh https
# (메시지는 영어: 서버의 브라우저 터미널이 한글을 표시하지 못한다)
set -euo pipefail
cd "$(dirname "$0")"

DOMAIN=$(sed -n 's/^QUIZ_DOMAIN=//p' .env)
LETTER_DIR=${LETTER_DIR:-/home/ubuntu/letter-projects}
NGINX=${NGINX:-letter-projects-nginx-1}
LE=${LE:-/etc/letsencrypt}
CONF=$LETTER_DIR/nginx.conf
[ -n "$DOMAIN" ] || { echo "QUIZ_DOMAIN is empty in .env"; exit 1; }

# http { ... } 를 닫는 마지막 "}" 바로 앞에 표준 입력의 내용을 끼워 넣고, 검사에 통과하면 적용한다.
add_block() {
    local marker="# quiz-$1 ($DOMAIN)"
    if grep -qF "$marker" "$CONF"; then echo "already added: $marker"; return; fi
    local last
    last=$(grep -n '^}' "$CONF" | tail -1 | cut -d: -f1)
    if [ -z "$last" ] || tail -n +"$((last + 1))" "$CONF" | grep -q '[^[:space:]]'; then
        echo "unexpected nginx.conf layout (no closing '}' at the end). nothing changed."; exit 1
    fi
    local backup new
    backup="$CONF.bak-$(date +%Y%m%d%H%M%S)"
    new=$(mktemp)
    cp -p "$CONF" "$backup"
    { head -n "$((last - 1))" "$CONF"; echo; echo "    $marker"; cat; tail -n +"$last" "$CONF"; } > "$new"
    # mv 가 아니라 덮어쓴다: 파일 하나만 마운트돼 있어서, 파일을 바꿔치기하면 컨테이너는 옛 파일을 계속 본다.
    cat "$new" > "$CONF"; rm "$new"
    if ! docker exec "$NGINX" nginx -t; then
        cat "$backup" > "$CONF"
        echo "nginx rejected the new config. restored the previous file. nothing changed."; exit 1
    fi
    docker exec "$NGINX" nginx -s reload
    echo "OK: added $marker (backup: $backup)"
}

case "${1:-}" in
http)   # 인증서 발급 통로(80번)만 연다
    add_block http <<EOF
    server {
        listen 80;
        server_name $DOMAIN;
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 301 https://\$host\$request_uri; }
    }
EOF
    ;;
cert)   # DNS가 이 서버를 가리킨 뒤에 실행한다. 갱신은 기존 renew-cert.sh(cron)가 함께 처리한다.
    docker run --rm -v "$LE:/etc/letsencrypt" -v "$LETTER_DIR/certbot-www:/var/www/certbot" \
        certbot/certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
        --non-interactive --agree-tos --keep-until-expiring
    ;;
https)
    [ -f "$LE/live/$DOMAIN/fullchain.pem" ] || { echo "no certificate for $DOMAIN yet. run: sudo ./attach-nginx.sh cert"; exit 1; }
    # ponytail: 이 연결은 nginx 컨테이너를 새로 만들면(recreate) 사라진다. 그때는 학습지만 502가 되고,
    # 이 명령을 다시 실행하면 된다. 자주 생기면 letter 쪽 docker-compose.yml 에 외부 네트워크로 적는다.
    docker network connect quiz_inner "$NGINX" 2>/dev/null || true
    # proxy_pass 에 변수를 쓰는 이유: 학습지 컨테이너가 없어도 nginx(와 letter)는 정상적으로 뜬다.
    add_block https <<EOF
    server {
        listen 443 ssl;
        server_name $DOMAIN;
        ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options    "nosniff" always;
        limit_req  zone=req_per_ip burst=40 nodelay;

        location / {
            resolver 127.0.0.11 valid=10s;
            set \$quiz http://quiz:5080;
            proxy_pass \$quiz;
            proxy_set_header Host \$host;
            proxy_read_timeout 150s;
        }
    }
EOF
    ;;
*)
    echo "usage: sudo ./attach-nginx.sh http | cert | https"; exit 1
    ;;
esac
