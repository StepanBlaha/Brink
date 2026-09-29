#!/usr/bin/env bash
# Replaces the placeholder base URL with baseUrl from site.config.json in all site files.
# Run from anywhere. Idempotent when baseUrl == placeholder. After a real change,
# update "placeholder" to the new baseUrl so later runs keep working.
set -euo pipefail
cd "$(dirname "$0")"
old=$(python3 -c 'import json;print(json.load(open("site.config.json"))["placeholder"])')
new=$(python3 -c 'import json;print(json.load(open("site.config.json"))["baseUrl"])')
[ "$old" = "$new" ] && { echo "baseUrl unchanged ($new)"; exit 0; }
grep -rlF "$old" --include='*.html' --include='*.xml' --include='*.txt' --include='*.webmanifest' --include='*.py' . \
  | xargs sed -i '' "s|$old|$new|g"
python3 - <<P
import json;c=json.load(open("site.config.json"));c["placeholder"]=c["baseUrl"];json.dump(c,open("site.config.json","w"),indent=2)
P
echo "replaced $old -> $new"
