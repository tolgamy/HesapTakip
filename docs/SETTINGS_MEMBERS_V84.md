# HesapTakip v84 — Ayarlar akışı, onaylı üyeler ve koyu mod kontrol merkezi

## Sorun ve kaynak
Kullanıcının paylaştığı iPhone Ayarlar görüntülerinde iki belirgin sorun var:

1. Açık temada **Üye ve Yetki Yönetimi** yalnızca İşletme Kontrol Merkezi'nin içine gizlenmiş; üye adı, onay durumu ve bekleyen başvuru sayısı ana ekranda görünmüyor. Ayrıca **Kullanıcı Hesapları** başlığı üyelik değil, bankaların/platformların **şifre kasasına** götürüyor ve kavramlar karışıyor.
2. Koyu modda İşletme Kontrol Merkezi'nin genişletilmiş araçları açık renkli kart üzerinde açık renkli metin kullanıyor. **Kartlar ve ekstreler**, **Banka, POS ve firmalar** araçları çok zor okunuyor. Beş araç başlangıçta otomatik açık; sayfa gereksiz uzun.

## Yeniden tasarlanan akış
**Ayarlar → (Giriş Bilgileri / Faturalar) → Onaylı üyeler → İşletme Kontrol Merkezi → Güvenlik ve Erişim**

- **Giriş Bilgileri** banka ve platform şifre kasasına gider; üyelik paneli değildir.
- **Onaylı üyeler** yönetici oturumunda Ayarlar ekranının üst bölümünde yer alır: güncel ad soyad, `@kullanıcı adı`, **Onaylı** statüsü; **onaylı, onay bekleyen, engellenen** sayıları. En fazla altı onaylı isim görünür, fazlası için yönetim ekranı bağlantısı var.
- **Üyeleri yönet** mevcut `data-v69-open-members` işleviyle **Üye ve Yetki Yönetimi** ekranını açar. Oradaki başvuru/onay/engel/izin kaydetme davranışı aynen devam eder; başvurular üst sıraya alınır.
- Kullanıcı adları **sadece `GET /api/users` sonucundan** gelir. Bu endpoint zaten sunucuda `admin` rolü kontrolü yapıyor; başka kullanıcıların adları normal üyelere açıklanmaz.
- Üyelik listesi özel DOM elemanlarında `textContent` ile oluşturulur, HTML metnine veya sabit örnek isimlere dönüştürülmez. Durum yoksa “Henüz onaylı üye yok”; API hatasında “Üye bilgileri alınamadı” açıklaması gösterilir. Yönetici hesabı onaylı üye sayısına eklenmez.
- Kontrol Merkezi ayrı, **tek satır bir açılır panel**. 20 mevcut araç, işlevleri veya bağlantıları değiştirilmeden korunur. Önceden otomatik açılan beş iç araç artık başlangıçta kapalı; kullanıcı seçtiğini açar.
- Koyu modda araç başlıklarının **zemini de metni de** birlikte değiştirilir: antrasit/mavi üzerine yüksek kontrastlı beyaz, sekonder açıklama mavi-gri. Açık mod premium Apple görünümü ve beşli alt menü korunur.

## Veri güvenliği
Bu çalışma, gerçek kullanıcı bilgilerini yalnız **görüntüler**. **Veritabanı, finansal kayıtlar, belgeler, faturalar, şifre kasası içerikleri, PIN, banka hesapları, borç/alacak hesaplamaları ve erişim yetkileri değiştirilmez.** Üye API'si mevcut, sunucuda yalnız yöneticiye izinli okuma API'sidir. Şifreler veya finansal bilgiler istemciye ek bir kanalla taşınmaz.

Değişen dosyalar: `public/index.html` (mevcut linkin taşınması, araçların başlangıçta kapatılması, yeni kart), `public/users-v26.js` (var olan üye okuma cevabından özet çizimi), `public/navigation-v18.js` (şifre kasası başlığı), yeni `public/settings-flow-v84.css`, `public/version.json`, testler ve bu doküman. **`src/`, `migrations/`, ödeme/hesaplama kodları değişmedi.**

Kod geri dönüş noktası, önceki canlı v83 `6f1010f4e2ef7b927f422c09879a516dfc997fd6`. Bu değişiklik üretim D1 veritabanı yedeği almaz.

## Kontrol
1. GitHub Actions `npm test` + `wrangler deploy --dry-run` başarılı olmalı.
2. Yönetici oturumunda onaylı üyelerin gerçek adları ve statü sayıları gösterilmeli, yeni başvuru onaylandığında aynı liste güncellenmeli.
3. Normal kullanıcı bu kartı ve üye yönetimi ekranını görememeli; sunucu `/api/users` isteğine admin kontrolünü korumalı.
4. iPhone Safari, açık ve koyu mod: 20 aracın başlığı okunabilir, tıklanabilir ve kapalı başlamalı; PIN, fatura, şifre kasası ve diğer bölümler çalışmalı.
5. Onaylanan kullanıcı isimleri ayrı **canlı veritabanından** gelir; GitHub kodundan gerçek kullanıcı sayısı/adı belirlenemez ve bu belgede gerçek kişiler hakkında tahmin yapılmaz.

Gerçek iPhone'da son görsel kontrol otomatik testlerin yerine geçmez.
