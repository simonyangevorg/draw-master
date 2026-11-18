#!/usr/bin/env bash
# SSH forced command for the GitHub deploy key (set in ~deploy/.ssh/authorized_keys):
#   command="bash /opt/draw-master/infra/deploy/deploy-gate.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-deploy
# Whatever the client asks to run, the key can ONLY do "deploy <40-char sha>".
set -euo pipefail
CMD="${SSH_ORIGINAL_COMMAND:-}"
if [[ "$CMD" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec bash /opt/draw-master/infra/deploy/deploy.sh "${BASH_REMATCH[1]}"
fi
echo "refused: this key may only run 'deploy <commit-sha>'" >&2
exit 1
