#!/usr/bin/env bash
# Stores the Telegram bot token and chat id in the Secret `alertmanager-telegram`
# (namespace monitoring). Takes them from k8s/alerting/telegram.env (git-ignored):
#   TELEGRAM_BOT_TOKEN=123456:ABC...
#   TELEGRAM_CHAT_ID=123456789
# or asks interactively when the file is missing, so they stay out of the repo and the Helm release.
#   1. @BotFather → /newbot → token
#   2. @userinfobot → your Id = chat id (the bot must have got /start from you)
#   ./k8s/alerting/telegram-secret.sh
set -euo pipefail

cd "$(dirname "$0")"
K="kubectl --context ${KUBE_CONTEXT:-minikube} -n monitoring"

if [ -f telegram.env ]; then
  # shellcheck disable=SC1091
  . ./telegram.env
  token="$TELEGRAM_BOT_TOKEN" chat_id="$TELEGRAM_CHAT_ID"
else
  read -rsp "Bot token: " token; echo
  read -rp "Chat id: " chat_id
fi
[[ "$chat_id" =~ ^-?[0-9]+$ ]] || { echo "chat id must be a number" >&2; exit 1; }

$K create secret generic alertmanager-telegram \
  --from-literal=bot-token="$token" --from-literal=chat-id="$chat_id" \
  --dry-run=client -o yaml | $K apply -f -
echo "Secret saved. Now run ./k8s/alerting/install.sh"
