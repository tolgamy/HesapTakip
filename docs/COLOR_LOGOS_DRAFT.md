# Renkli ikonlar ve gerçek marka logoları — taslak

Bu çalışma **canlıya alınmamış** bir tasarımdır. Ana menü (Genel, Finans, Hesaplar, Firmalar, Ayarlar) ikonları ayrı renkli yuvarlatılmış kutucuklara taşınır; mevcut SVG çizgileri korunur. Ayarlar / marka kataloğundaki logo alanı büyütülür. iPhone küçük ekran düzeni ve odak göstergeleri korunur.

## Marka kaynağı yaklaşımı

Öncelik sırası: **kullanıcının yüklediği özel logo > mevcut gerçek yerel SVG > markanın kendi alan adına ait Google favicon > metin baş harfleri**. Bu şekilde gerçek logo yerine markayı taklit eden tasarım kullanılmaz.

| Marka | Taslakta kullanılan kaynak |
| --- | --- |
| Edenred, Pluxee, Uber Eats | Depodaki mevcut gerçek SVG dosyaları |
| Getir Çarşı | `getir.com` site ikonu |
| Yemeksepeti Mahalle | `yemeksepeti.com` site ikonu |
| Multinet | `multinet.com.tr` site ikonu |
| Setcard | `setcard.com.tr` site ikonu |
| Metropolcard | `metropolcard.com` site ikonu |
| Tokenflex | `tokenflex.com.tr` site ikonu |
| USMAR.com | `usmarmarket.com` site ikonu (alan adı doğrulaması gerekli) |

**Not:** Favicon markanın resmi web sitesinde yayımlanan küçük simgedir; tam çözünürlüklü kurumsal logoyla her zaman aynı değildir. Bir site ikonu güncelliğini yitirmiş veya erişilemezse baş harf gösterilir. Taslakta gerçek logo varmış gibi hazırlanmış sahte vektörler kullanılmaz. Mevcut banka kartlarında gerçek banka vektörleri/kurum logolarını önceliklendiren `cards-pro.js` akışı değiştirilmez.

Multinet Kasım 2026'da “Multinet by Upcoop” kimliğine geçti; gerçek site ikonunun yeni markaya uyumunu görsel yayından önce kontrol etmek gerekir. Kaynak: https://www.aa.com.tr/tr/isdunyasi/sirketler/multinet-marka-kimligini-yeniledi-/705593

Yemeksepeti'nin resmi logo arşivi: https://kurumsal.yemeksepeti.com/logolar/

## Gizlilik ve uygulama sınırı

Google favicon servisi için yalnız bilinen kurum alan adı gönderilir (`https://www.google.com/s2/favicons?domain=...&sz=128`); kullanıcı adı, şifre, PIN veya finansal veri gönderilmez. İstek üçüncü tarafa ait olduğundan ziyaretçinin IP adresi ve sayfa origin bilgisi görülebilir. `img-src` zaten `www.google.com` alan adına izin verir; yeni `script-src` veya `connect-src` yetkisi eklenmez.

Bu değişiklik yalnız görünüm ve varsayılan marka resim kaynağıyla sınırlıdır. Finans işlemleri, veri tabanı ve ödeme hesaplamaları değiştirilmez. Yayına karar verilmeden önce iPhone Safari'de internet bağlantısıyla logo kaynaklarının tek tek görülmesi, yüklü özel logoların korunması ve yeni Multinet simgesinin doğrulanması gerekir.
