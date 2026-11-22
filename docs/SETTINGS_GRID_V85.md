# HesapTakip v85 — 10 Bölümlü Premium Ayarlar ve ⚙️ Yetkiler

## Onaylanan görsel yön
Kullanıcının paylaştığı iki sütunlu pastel kartlı iPhone referansına göre Ayarlar ekranında **10 adet gerçek işlevli kategori** bulunur: Giriş Bilgileri, Faturalar, Üye Yönetimi, Kontrol Merkezi, Kart ve Ekstre, Banka ve POS, Raporlar, Güvenlik, Marka Logoları, Güncellemeler. iOS tipografisi, iki sütunlu pastel kartlar, koyu lacivert açık/koyu tema ve beşli alt menü korunur.

## Her kartın gerçek bağlantısı

| Bölüm | Var olan çalışan işlem |
| --- | --- |
| Giriş Bilgileri | Mevcut şifre kasası `vault` sayfası |
| Faturalar | Var olan `bills` sayfası |
| Üye Yönetimi | Sadece yönetici için `useraccounts` sayfası; gerçek üyelik kayıtları |
| Kontrol Merkezi | Mevcut 20 denetim aracı; açılır panel |
| Kart ve Ekstre | Kontrol Merkezi araçları 04–05; kart önerisi ve PDF ön kontrol |
| Banka ve POS | Mevcut araçlar 06–08; POS, banka, kasa ve firma |
| Raporlar | Mevcut rapor ve analiz araçları 13–18; Excel/PDF, vade/nakit analizleri |
| Güvenlik | Mevcut PIN ve kullanım kılavuzu ekranı |
| Marka Logoları | Özel logolar, kurum yönetimi, kayıtlı kurumlar ve yeni kurum hazırlığı |
| Güncellemeler | Mevcut `Güncellemeleri Kontrol Et` ve uygulamayı kurma araçları |

Bölüm değiştirirken **mevcut DOM formları yeniden oluşturulmaz veya kopyalanmaz**. `settings-grid-v85.js`, mevcut kontrolleri kategorilere ayırarak yalnız ekran görünürlüğünü değiştirir. Borç/tahsilat/banka raporlarının hesaplama kodu yerinde kalır.

## Üye Yetkileri — yalnız ⚙️ içinde

Üye Yönetimi listesinde gerçek `display_name`, `@username`, `status` ve her satırın sağında ⚙️ vardır. Gereksiz uzun 9 kutuluk yetki ızgarası ana listede **yoktur**.

⚙️ ile açılan tek erişilebilir `dialog` içinde mevcut 9 yetki (Genel Bakış, Bankalar/POS, Kredi Kartları, Yemek Kartları, Platform Alacakları, Şahıs Alacakları, Firma Borçları, Temsilciler, Kullanıcı İşlemleri) ve üyelik durumu düzenlenir. Önceki `PATCH /api/users/:id` işlemi yalnız **Yetkileri kaydet / Onayla** tuşuna basınca çalışır; açma/kapama veri güncellemesi yapmaz. Silme eylemi mevcut doğrulamalı akışta kalır; finans kayıtlarını silmez. Sunucu yönetici kontrolü korunur.

Kayıt ve yetki listesi, `GET /api/users` üzerinden yalnız yöneticiye gelir. Ana ayarlar grid'i de yalnız yöneticide görünür; normal üyelerin halihazırdaki iki izinli Ayarlar kısayolu korunur. Oluşturulan HTML'de kişisel adlar ve kullanıcı adları mevcut `esc()` işleviyle kaçırılır.

## Tasarım/güvenlik sınırları
Bu, görüntüleme/navigasyon ve açık izin paneli iyileştirmesidir. Örnek kullanıcı, sanal borç, ek ürün/stok özelliği, yeni fatura kuralı ya da yeni veritabanı tablosu oluşturulmaz. Gerçek finans kayıtları, belgeler, yüklenen logolar, kullanıcı şifreleri, PIN, hesaplama/ödeme kodu ve Cloudflare D1 veritabanı şeması değiştirilmez. İzin kaydetme eskisi gibi **ancak yönetici düğmeye bastığında** çalışır.

**Önceki canlı kod sürümü v84:** `47d07758784a8e86ad836ee5c32551d9e6dc9746`. Bu commit kod için geri dönüş noktasıdır; canlı D1 veritabanının bağımsız yedeği bu işlemde alınmaz.

## Gerekli kontrol
GitHub Actions `npm test` ve `wrangler deploy --dry-run`; 320, 375, 430 px iPhone Safari görünümü; üye listesinde ⚙️ aç/kapat, üye izni değiştirme (yalnız yetkili test hesabında), iptal ve klavye odağı; şifre kasası, rapor ve faturalar; beşli alt menü açık/koyu mod.

Bu sürüm hazırlanırken gerçek kullanıcı hesaplarının adları ve kayıtları açılıp okunmadı. Örnek isimler üretim verisi değildir.
