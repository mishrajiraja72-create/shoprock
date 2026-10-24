#!/bin/sh
# Run from the project root:  sh tests/run_all.sh   (needs node, python3, playwright + chromium)
set -e
cd "$(dirname "$0")/.."
echo "== unit (Cart logic)";            node cart-logic.test.js | tail -1
echo "== browser: storefront flow";     (cd tests && python3 e2e.py      | tail -1)
echo "== browser: v3 features";         (cd tests && python3 e2e_v3.py   | tail -1)
echo "== browser: dashboard -> store";  (cd tests && python3 e2e_dash.py | tail -1)
