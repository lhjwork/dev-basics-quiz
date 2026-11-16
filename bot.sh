#!/bin/sh
# 텔레그램 봇 켜기: 이 폴더에서 Claude Code(Opus)를 텔레그램과 연결해 실행한다.
# 이 창이 켜져 있는 동안만 봇이 답한다. 서버에서는 tmux 안에서 켠다(deploy/setup-bot.sh 의 안내 참고).
cd "$(dirname "$0")" || exit 1
exec claude --model opus --channels plugin:telegram@claude-plugins-official
