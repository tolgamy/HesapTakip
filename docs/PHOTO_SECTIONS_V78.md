# v78 · Fotoğraflı ana ekranlar

v77 Ayarlar görünümü korunurken aynı iPhone öncelikli tasarım dili, **Genel Bakış, Finans, Hesaplar ve Firmalar** ana menülerine yayılır. Yeni stiller yalnızca `public/photo-sections-v78.css` içindedir; HTML'deki erişilebilir başlıklar, mevcut düğmeler, form kimlikleri, navigasyon olayları, finansal tutarlar ve sunucu işlemleri değiştirilmez.

| Ana menü / görünüm | Fotoğraf uygulaması | Unsplash fotoğraf kimliği |
| --- | --- | --- |
| Genel Bakış (`overviewView`) | Uygulama araması ve finansal durum kartı | `photo-1675848311787-d2706fce4aed` |
| Finans (`cardsView`, `bankingView`) | Kart başlığı ve Bankalarım alanı | `photo-1554224155-6726b3ff858f`, `photo-1746792613213-c154e2891449` |
| Hesaplar (`collectionsView`, `platformsView`, `peopleView`) | Ana başlık ve mevcut iki hesap türü kartı | `photo-1746792613213-c154e2891449`, `photo-1675684110324-4c3fba42903d` |
| Firmalar (`payablesView`, `directoryView`) | Borç başlığı ve firma rehberi | `photo-1554224155-6726b3ff858f`, `photo-1675684110324-4c3fba42903d` |

Kaynaklar, v77 Ayarlar'da zaten kullanılan Unsplash görselleridir; yeni bir üçüncü taraf alan adı eklenmez. Fotoğraflar yalnızca dekoratiftir ve optimizasyon için `w`, `h`, `q` parametreleriyle yüklenir.

Unsplash lisansı: https://unsplash.com/license

**Gizlilik ve bağlantı:** Görseller `images.unsplash.com` üzerinden yüklenir; fotoğraf isteklerinde kullanıcı IP adresi ve sayfa origin bilgisi CDN tarafından görülebilir. Finansal kayıtlar, banka verileri, kullanıcı adı, şifre veya PIN fotoğraf URL'lerinde bulunmaz. Uzak görseller yokken düz arka plan rengi kalır. Veri tasarrufu tercihi (`prefers-reduced-data: reduce`) ve yazdırma halinde fotoğraflar devre dışı kalır. CSP'deki `img-src` izni v77'den kalmadır; `script-src` ve `connect-src` genişletilmez.

**Doğrulama:** `npm test` çalıştırılmalı, ayrıca Safari iPhone'da 320–430 piksel aralıklarında her ana menü, açılır alt sekmeler, hesap türü seçimi, kart listesi, firma filtreleri ve formlar görsel/işlevsel olarak kontrol edilmelidir. Bu düzenleme gerçek cihaz ekran görüntüsüyle henüz doğrulanmamıştır.
