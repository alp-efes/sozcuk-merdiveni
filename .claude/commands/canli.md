---
description: Canlı siteyi uçtan uca test et (iki domain, 301, varlıklar)
---

Canlı yayını test et ve tek bir tabloda raporla:

1. `https://xn--szckyolu-n4a6d.com/` → 200 ve oyun yükleniyor mu.
2. Varlıklar 200 mü: `favicon.ico`, `og-image.png`, `words.json`,
   `robots.txt`, `sitemap.xml`.
3. Yönlendiren domain 301 veriyor mu — apex, `www`, bir alt yol ve sorgu
   dizesi için: `https://xn--szckmerdiveni-imb6g.com/...`
4. Güvenlik: `/.git/config` ve `/tools/bulmaca_uret.py` **404** olmalı.
   200 dönerse `.assetsignore` bozulmuş demektir, hemen bildir.
5. Tarayıcıda oyunu aç: konsol hatası var mı, günün bulmacası geliyor mu.

$ARGUMENTS

Tarayıcıda test ederken önbelleğe dikkat et. Çalışan kodun yeni sürüm olduğunu
`WordLadder.prototype` üzerinden doğrula.
