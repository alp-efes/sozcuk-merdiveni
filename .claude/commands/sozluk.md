---
description: Sözlüğü ve bulmacaları yeniden üret, sonra doğrula
---

Sözlüğü ve bulmacaları yeniden üret:

```bash
python3 tools/sozluk_indir.py && python3 tools/bulmaca_uret.py
```

Sonra `words.json` üzerinde şunları doğrula ve tek bir tabloda raporla:

1. Uzunluk başına kelime ve bulmaca sayısı.
2. Zorluk dağılımı. Dokuz (uzunluk, zorluk) kutusunun hepsi dolu olmalı.
3. Şapkalı harf sızıntısı yok (`Â`, `Î`, `Û` hiçbir kelimede geçmemeli).
4. `tools/yasakli.txt` içindeki hiçbir kelime sözlükte değil.
5. Örnek kontrol: KASE, GEL, GÖTÜR var; ETMEK, ALMAK, DEMEK yok.

$ARGUMENTS

Sonunda kullanıcıyı uyar: `words.json` değiştiği için **günün bulmacası da
değişir**. Bu yüzden değişikliği gün ortasında yayına almamasını hatırlat.
