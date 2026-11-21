# Premium iPhone / beş ana bölüm — v79 inceleme taslağı

Önceden onaylanan beş görsel tasarımın, **gerçek HesapTakip modülleri** üzerinde uygulanmış tasarım turu. Apple benzeri sistem tipografisi, rafine boşluklar, cam hissi, degrade kartlar ve alt menü yapısı korunur.

## Bölüm karşılıkları

| Ana sekme | Gerçek uygulamadaki yüzey | Premium düzen |
|---|---|---|
| Genel | `overviewView` | Gerçek net durum, alacak/borç özetleri, aylık grafik, işlem listesi, canlı arama |
| Finans | `cardsView`, `bankingView` | Kartlar / Bankalar alt geçişi, gerçek kartlar, ekstre bilgisi, banka listesi |
| Hesaplar | `collectionsView`, `platformsView`, `peopleView` | İki gerçek hesap türü sekmesi, şirket logolu kayıtlar, filtrelenebilir alacaklar |
| Firmalar | `payablesView`, `directoryView` | Gerçek firma borçları, cari bakiye özetleri, firma ve temsilci rehberi |
| Ayarlar | `settingsView` | Gerçekte bulunan kullanıcı hesapları, faturalar, PIN, kontrol merkezi ve logo yöneticisi |

Logo taslağı, `design/colorful-official-logo-draft` dalındaki değişiklikleri içerir: **kullanıcı logoları öncelikli**, mevcut doğrulanmış kurum SVG'leri veya marka alan adı faviconları görünür.

## Dürüst ürün sınırları

Referans görsellerdeki örnek fiyatlar, müşteri adları ve kayıt sayıları **uygulamada oluşturulmamıştır**. Ayarlar resminde çizilen ve uygulamada bulunmayan Premium Üyelik, cihazlar arası yedekleme, bildirim merkezi gibi özellikler de uydurma düğmeler olarak eklenmemiştir. Arayüz yalnızca mevcut ve gerçekten çalışan davranışları görselleştirir.

Tüm iş yalnız `public/premium-five-v79.css` ve bir CSS linki eklenerek yapıldı. Veritabanı, API, şifre/PIN/biyometri, yetkilendirme, hesaplama, ödeme ve tahsilat kodları değiştirilmedi. `v78` sürüm numarası değişmeden kalır; bu henüz üretim sürümü değildir.

## Kontroller

1. GitHub PR içinde `npm test` ve `wrangler deploy --dry-run` başarıyla tamamlanmalı.
2. iPhone Safari'de yaklaşık 320 / 375 / 430 piksel ekran genişliğinde beş menü, yatay taşma, logo yüklemeleri ve PIN akışı kontrol edilmeli.
3. Kart ödemesi, firma tahsilatı ve banka/kasa hareketleri test hesaplarında mevcut verilerle doğrulanmalı.
4. Tasarım onayından sonra yeni sürüm numarası belirlenip ayrı üretim dağıtımı yapılmalı.

Gerçek cihaz tarayıcısında görsel karşılaştırma henüz yapılmadı. Bu PR taslak olarak kalmalıdır.
