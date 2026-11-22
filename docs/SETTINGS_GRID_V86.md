# HesapTakip v86 — 3 sütunlu premium Ayarlar ve alt menüde Güncellemeler

## Kabul edilen tasarım

Kullanıcının 4:15 iPhone ekranı ve pastel Ayarlar taslağı üzerine:

- Beşli renkli iOS alt menü, açık/koyu mod, gerçek kurum logoları, finans hesaplamaları, belgeler ve kullanıcı kayıtları korunur.
- Ana Ayarlar **3 sütun × 3 satır = 9 gerçek kategori** gösterir: Giriş Bilgileri, Faturalar, Üye Yönetimi, Kontrol Merkezi, Kart ve Ekstre, Banka ve POS, Raporlar, Güvenlik, Marka Logoları.
- Uygulamada mevcut olmayan **Ürün/Stok, Müşteri-Veresiye ve Satış Geçmişi** gibi yeni özellikler eklenmez.
- Eski **Güncellemeler** onuncu kartı kaldırılır. Menü yolu: **Ayarlar → Kontrol Merkezi → Uygulama ve Sürüm → Güncellemeleri Kontrol Et**. Gerçek `v68UpdateFooter`, `htCheckUpdates`, `htApplyUpdate` düğmeleri ve PWA kurulum paneli olduğu gibi kullanılır.
- Uygulama ve Sürüm'den **Geri** ile Kontrol Merkezi'ne, oradan Ayarlar ana 3×3 grid'e dönülür.
- Mobilde 320–740 CSS pikselde 3 sütun her zaman korunur. Dar ekranda kısa başlık + büyük ikon tercih edilir; uzun küçük açıklamalar yalnız görsel gizlenir. Kullanıcı seçim yapmaya devam eder. Masaüstünde açıklamalar görünür.
- Ayarlar ekranındaki üstte tekrar eden "Ayarlar" alt başlığı **Bölümler** olarak düzenlenir.
- Koyu modun kaliteli lacivert yüzeyleri ve pastel kartlar korunur; yeni Uygulama ve Sürüm bağlantısı karanlık modda yüksek kontrastlıdır.

## Mevcut kontroller ve bilgi güvenliği

**Yeni API veya veritabanı işlemi eklenmez.** `public/settings-grid-v85.js` yalnızca var olan kullanıcı tıklamasıyla `v85Screen` sunum durumunu değiştirir; `public/settings-grid-v86.css` yalnız renk, kart ölçüleri, üç sütun ve alt bağlantı görünümünü belirler. `public/index.html` içinde tek onuncu kart kaldırılmıştır; `v67UpdateTile` ve sürüm kontrol kodu **silinmemiştir**. Üye yönetimi, ⚙️ izin paneli, banka ve firma verileri aynı işlevlerle devam eder.

`src/`, `migrations/`, tahsilat, ödeme, bakiye, belge yükleme, şifre, PIN ve yetkilendirme sunucu kodları değiştirilmez. Kullanıcı finansal verilerinin veya belge kayıtlarının kaybolmasını sağlayacak bir taşıma işlemi yapılmaz. Bu iş, canlı D1 veritabanı yedeği almaz; verilerin tek tek doğrulandığı iddia edilmez.

Önceki canlı kod v85 `main` üzerinde bulunur; GitHub PR geçmişinden geri dönüş mümkündür.

## Kontroller

- `npm test` ve `wrangler deploy --dry-run` başarılı.
- 9 gerçek yönlendirme, 3 sütun, ana sayfada onuncu kartın olmaması, güncellemeye iç bağlantı ve aynı gerçek sürüm denetleme kimliklerinin korunması.
- iPhone Safari'de 320, 375 ve 430 px ekranlarda yatay taşma, dokunma alanları, kart isimleri, sabit alt menü ve açık/koyu geçiş denetlenmeli.
- Kontrol Merkezi'nden Uygulama ve Sürüm'e ve tekrar Kontrol Merkezi'ne geçiş kontrol edilmeli.
- Üye yetkilerini kaydetme veya finans verisi değiştirme eylemi bu sürüm testi sırasında yapılmamalı.

Bu PR ilk aşamada **taslaktır**; canlı sürüm ancak PR birleştirme ve Cloudflare dağıtımı tamamlandıktan sonra değişir.
