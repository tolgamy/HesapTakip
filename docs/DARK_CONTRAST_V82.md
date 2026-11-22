# v82 — Dark Mode Yazı Kontrastı ve iPhone Boşluk Düzeltmesi

Kaynak: Kullanıcının iPhone koyu mod ekran görüntüsü `IMG_0831.png` (03:19; “Alacaklarım ve firma borçlarım”). Görüntüde Eminevim, Akbank Artı Para, Yapı Kredi Artı gibi kayıt isimleri ve tutarları, koyu kart üzerinde çok koyu kalıyor. Liste uzun; ayırıcı çizgiler açık renkli ve başlık iPhone durum çubuğuna yaklaşıyor.

## Kök neden

`public/styles.css` içindeki açık temaya ait `.overview-line strong { color:#24444d }`, `.overview-line>b { color:#103846 }` ve `.overview-line small { color:#8ca0a6 }` kuralları koyu modda da etkin. v81 `theme-v81.css` koyu arka planı ayarlıyor ama `.overview-line` satır metninin kontrastını düzeltmiyor. Bu nedenle sorun **veri miktarlarında değil yalnızca görünüşte**.

## v82 değişikliği

Yalnız `public/dark-contrast-v82.css` eklenerek önceki tüm v81/iOS stil dosyalarından **sonra** yüklenir:

- Kayıt isimleri `#F0F4FF`, normal tutarlar `#F4F7FF`, açıklamalar `#B8C5DA`.
- Alacak vurgusu `#60E4B6` (yeşil), borç vurgusu `#FF9FAA` (mercan).
- Ayırıcı çizgiler `#33465F`; hafif ve tutarlı.
- `overview-line` toplam satırlarının da kontrastı düzeltilir.
- Gerçek ödeme listesi, kart dağılımı ve son işlemlerde açık tema metin kalıntıları görünür hale getirilir.
- Genel, Finans, Hesaplar, Firmalar, Ayarlar için ortak `.stat` açıklamaları ve tutarları karanlık kartta okunur hale getirilir.
- iOS güvenli alan, mobil üst/alt iç boşluklar ve kaydırarak bölüme geçiş konumları düzeltilir; hiçbir bölüm, kayıt ya da düğme gizlenmez.
- Ay/güneş mod anahtarı, renkli menü ikonları ve orijinal marka logo renkleri korunur. Açık modun renkleri değiştirilmez.

## Veri güvenliği

**DB, belge, firma, bakiye ve ödeme kayıtlarına dokunulmadı.** Değişen üretim dosyaları yalnızca `public/index.html` (yeni CSS linki ve v82 meta), `public/version.json` ve yeni `public/dark-contrast-v82.css`. `src/`, `migrations/`, veritabanı, dosya/fiş/dekont, güvenlik/PIN, para aktarımı ve ödeme JS kaynakları aynı kaldı.

Bu çalışma veritabanı yedeği oluşturmaz. Kod için önceki canlı `v81` sürümüne GitHub commit'i üzerinden geri dönülebilir; üretim kullanıcı verilerinin satır satır doğrulandığı iddia edilmez.

## Kontrol

`npm test` ve `wrangler deploy --dry-run` başarılı olmalı. iPhone Safari'de tam ekran uzun finans listelerinde renkler, başlık/saat alanı, sabit beşli alt menü, yatay taşma ve koyu/açık geçiş ayrıca doğrulanmalı. Gerçek iPhone görüntü doğrulaması bu PR'da otomatik yapılamaz.
