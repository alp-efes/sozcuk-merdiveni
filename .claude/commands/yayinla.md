---
description: Değişiklikleri commit'le, push'la ve canlı yayını doğrula
---

Değişiklikleri yayına al:

1. `git status --short` ve `git diff --stat` ile neyin değiştiğini göster.
2. Türkçe, açıklayıcı bir commit mesajı yaz. Ne değişti ve **neden** değişti
   yaz; sadece dosya adı listeleme.
3. Commit'le ve push'la. **Push ağ hatası verirse aynı komutu tekrar dene** —
   bu projede ara sıra oluyor.
4. Cloudflare otomatik derler. Yaklaşık 90 saniye bekle.
5. Canlı siteyi gerçekten test et ve sonucu raporla. Değişiklik tarayıcıda
   görünür türdense ekran görüntüsü al.

$ARGUMENTS

Test etmeden "yayınlandı" deme. Build başarısız olursa logu oku ve sebebini
söyle.
