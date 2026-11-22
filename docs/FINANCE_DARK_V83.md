# v83 — Finans kartlarında koyu mod okunabilirliği

## Gerçek iPhone ekranındaki sorun
Gönderilen `IMG_0832.png` görselinde Finans bölümündeki Garanti BBVA kartlarının banka adları okunabilir ancak **Bireysel / son dört hane, Limit ve Kullanılabilir** satırları fazla gri. **Kart Bilgileri** düğmesinde yazı ile arka plan neredeyse aynı açık renkte. `İşlemler` düğmesi ayrı kalıyor; ayarlar simgesi ve gerçek Garanti BBVA logosu korunmalı.

## Kök neden
`public/approved-ui-v70.js` gerçek kayıttan `.v70-compact-card`, `.v70-bank-info`, `.v70-bank-actions` içeriklerini oluşturuyor. `public/approved-ui-v70.css` bu alanlar için **açık tema** renkleri belirliyor: kart açıklaması `#71879a`, düğme beyazı `#fff`. v81 koyu mod ise `button` yazılarını genel olarak açık renge çeviriyor; kartın üzerindeki açık renkli düğme arka planını değiştirmediği için okunabilirlik kayboluyor.

## Düzeltme
Yeni `public/finance-card-dark-v83.css` dosyası v82'den sonra yüklenir. **Yalnızca koyu temada**, gerçek banka kartlarının:
- Banka adı: `#F5F7FF`.
- Kart türü, son dört hane, limit, kullanılabilir: `#CBD7EB`.
- Kart Bilgileri: koyu mavi degrade ve beyaz yazı.
- İşlemler: koyu yeşil yüzey ve açık mint yazı.
- Dişli/ayarlar: koyu antrasit-mavi ve açık yazı.
- Açılır işlem menüleri ve genişletilen gerçek kart bilgileri: koyu yüzeyde görünür metin.
- Gerçek kurum logosu nötr beyaz yüzeyinde kalır; SVG/görüntünün orijinal marka rengine müdahale edilmez.
- iPhone 360/740 px eşikleri, 46 px dokunma hedefi, `focus-visible`, `prefers-reduced-motion` korunur.

## Güvenlik ve veri koruma
**Finansal veri, veritabanı, belgeler, banka kartı numarası, limit, ödeme, kayıt yetkisi ve PIN/oturum mantığı değişmedi.** Değişen üretim dosyaları yalnızca CSS katmanı, `public/index.html` stil bağlantısı/sürüm metası ve `public/version.json` sürüm açıklamasıdır. Kayıt oluşturan `approved-ui-v70.js`, `cards-pro.js`, `src/` ve `migrations/` aynı kalır. Yüklenen logolar, hesap kayıtları, banka işlemleri ve tüm paralar uygulamadaki mevcut gerçek değerlerdir.

Önceki canlı kod `v82` GitHub commit `ac1fe60584be19570b2fa5c099c2fc0f48e4df63` üzerinden geri alınabilir. Bu çalışma bağımsız D1 veritabanı yedeği oluşturmaz.

## Doğrulama
`npm test` ve `wrangler deploy --dry-run` başarılı olmalı. GitHub Actions üretim dağıtımı sonucunda canlı Workers URL doğrulanmalı. Gerçek iPhone Safari üzerinde koyu/açık geçiş, **Kart Bilgileri** aç/kapat, **İşlemler**, dişli, son dört hane ve limit alanı son kez görsel olarak kontrol edilmeli.
