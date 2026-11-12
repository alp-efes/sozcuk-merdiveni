#!/usr/bin/env bash
# Tüm testleri çalıştırır. PR açmadan önce ikisi de geçmelidir.
#   bash tools/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== Veri ve site bütünlüğü =="
python3 tools/test_veri.py
echo
echo "== Tarayıcı duman testi =="
node tools/test_tarayici.js
