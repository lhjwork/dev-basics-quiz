#!/bin/bash
# 서버에서 한 번 실행:  sudo ./setup-bot.sh
#  1) 자동 배포 cron 등록 (이 폴더의 auto-deploy.sh 를 1분마다)
#  2) 텔레그램 봇 전용 계정(quizbot) 생성: sudo·docker 권한이 없어서 이 서버의 다른 서비스는 건드릴 수 없다.
#     봇은 자기 폴더(~quizbot/quiz)에서 문제를 고쳐 GitHub 에 올리고, 1)의 자동 배포가 그것을 사이트에 반영한다.
# (메시지는 영어: 서버의 브라우저 터미널이 한글을 표시하지 못한다)
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" = 0 ] || { echo "run with sudo"; exit 1; }
OWNER=$(stat -c %U .)          # 이 저장소를 clone 한 계정(ubuntu)
REPO=lhjwork/dev-basics-quiz
BOT=quizbot

avail=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
echo "available memory: ${avail}MB"
[ "$avail" -ge 500 ] || echo "WARNING: under 500MB free. The bot (Claude Code) may be killed or slow the site down."

apt-get update -qq && apt-get install -y -qq tmux nodejs unzip git >/dev/null

# 1) 자동 배포
git rev-parse HEAD > .tried && chown "$OWNER" .tried   # 지금 돌고 있는 버전은 다시 빌드하지 않는다
line="* * * * * $PWD/auto-deploy.sh >> $PWD/auto-deploy.log 2>&1"
( crontab -u "$OWNER" -l 2>/dev/null | grep -vF auto-deploy.sh || true; echo "$line" ) | crontab -u "$OWNER" -
echo "OK: auto deploy cron installed for $OWNER"

# 2) 봇 계정
id "$BOT" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$BOT"
sudo -iu "$BOT" bash -s <<BOTEOF
set -euo pipefail
command -v claude >/dev/null || [ -x ~/.local/bin/claude ] || curl -fsSL https://claude.ai/install.sh | bash
[ -x ~/.bun/bin/bun ] || curl -fsSL https://bun.sh/install | bash
grep -q '.local/bin' ~/.profile || echo 'export PATH="\$HOME/.local/bin:\$HOME/.bun/bin:\$PATH"' >> ~/.profile
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N '' -C quizbot -f ~/.ssh/id_ed25519
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
[ -d ~/quiz ] || git clone -q https://github.com/$REPO.git ~/quiz
cd ~/quiz
git remote set-url origin git@github.com:$REPO.git
git config user.name quizbot && git config user.email quizbot@users.noreply.github.com
BOTEOF

cat <<DONE

=== Next steps ===
1. GitHub > $REPO > Settings > Deploy keys > Add deploy key, check "Allow write access", paste:

$(cat /home/$BOT/.ssh/id_ed25519.pub)

2. sudo -iu $BOT
3. claude                      (log in with your Claude account, then /exit)
4. claude plugin install telegram@claude-plugins-official
5. mkdir -p ~/.claude/channels/telegram && chmod 700 ~/.claude/channels/telegram
   nano ~/.claude/channels/telegram/.env      (one line: TELEGRAM_BOT_TOKEN=your-token)
   chmod 600 ~/.claude/channels/telegram/.env
6. tmux new -s bot ~/quiz/bot.sh
   In Telegram, send any message to the bot, then in this screen:
     /telegram:access pair CODE
     /telegram:access policy allowlist
7. Detach with Ctrl-b then d. The bot keeps running. Come back with: tmux attach -t bot
   After a server reboot, run step 6's tmux command again (as $BOT).
DONE
