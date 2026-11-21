# HesapTakip v80 — Premium Apple arayüzü ve veri koruma notları

## Kaynak tasarım

Onaylanan ekranlar: `Genel`, `Finans`, `Hesaplar`, `Firmalar`, `Ayarlar`. Açık buz-mavi / lavanta arka plan, gerçek marka logoları, mavi-mor özet kartları, renkli alt gezinme ikonları ve iOS kart düzeni. Kaynak görseller önceki konuşmada paylaşılan `4-ekran-birlikte.png` ile Finans ekranı taslağıdır. Tarayıcı araç çubuğu iPhone Safari'ye aittir; uygulama HTML'sine taklit olarak eklenmemiştir.

## Saklanacak veri ve belgeler

Bu sürüm **mevcut finans ve belge verisini değiştirmez**:

- **D1 veritabanı:** Mevcut `wrangler.jsonc` D1 bağlantısı aynıdır. Yeni migration, tablo değişikliği, temizleme veya veri silme sorgusu yoktur.
- **Belgeler ve dosyalar:** PDF, dekont, yüklenmiş logo, giriş bilgileri, arşiv, firma kartı, ekstre, kayıt düzeltme geçmişi ve kullanıcı ayarlarına dokunulmadı.
- **Kimlik doğrulama:** PIN, biyometri, erişim izinleri, şifreler ve oturum mantığı değişmedi.
- **İşlemler:** Borç/alacak hesaplamaları, ekstreler, tahsilatlar, ödemeler ve kasa/banka hareketleri aynıdır.
- **Rakamlar:** Referans ekranlardaki örnek rakamlar/kayıtlar kullanılmaz. Mevcut uygulamanın gerçek kayıtlarından gelen değerler gösterilir.
- **Markalar:** Kullanıcının yüklediği özel logo mevcut önceliğini korur; yalnızca mevcut kurum/alan adı logo eşleştirmesi kullanılmaya devam eder.

Üretim öncesi geri dönüş noktası: **v79 main** commit `4d9cbd7b60e02e0b9be51f8fb3fe20eb9e5c72ab`. Kod sürümü GitHub'da durur. Bu bir **üretim D1 veritabanı yedeği değildir**; canlı veritabanının bağımsız yedeği bu işlemde alınmamıştır. Herhangi bir verinin silinmiş veya yedeklenmiş olduğu iddia edilmemelidir.

## Yapılan dosya değişiklikleri

- Yeni `public/ios-premium-v80.css`: 5 ana ekrana ait görsel stil, iPhone dar ekran, erişilebilirlik ve alt menü.
- `public/index.html`: yeni stil dosyası bağlandı ve yalnızca sürüm meta etiketi güncellendi. Var olan formlar, kimlikler ve kontroller silinmedi.
- `public/version.json`: sürüm v80.
- Testlerde eski v79 sürüm beklentileri yeni yayın sürümüne uyarlandı. Test davranışı veya finansal işlem kodu değiştirilmedi.
- `tests/ios-premium-v80.test.mjs`: gerçek veri bağlantılarının, beş menünün ve değişmeyen veritabanı kaynaklarının regresyon kontrolü.

## Yayın güvenliği

1. `npm test` ve Cloudflare Wrangler dry-run tamamlanmalı.
2. PR değişen dosyaları incelenmeli: `migrations/`, `src/` ve mali hesaplama JavaScript'lerinde değişiklik bulunmamalı.
3. Cloudflare dağıtımı yalnız mevcut `main` iş akışından yapılmalı; veritabanı taşıma komutu çalıştırılmamalı.
4. Yayın sonrası `version.json` üzerinden v80 doğrulanmalı.
5. Gerçek iPhone'da görünüm, dokunmatik alanlar ve kullanıcı rolüne göre görünürlük kontrol edilmeli.

Bu tasarım kullanıcı kayıtlarının yedeğini oluşturmuyor; veri kaybını önlemek için mevcut kayıtlara yazmaz.
