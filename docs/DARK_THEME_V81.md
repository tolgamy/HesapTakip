# HesapTakip v81 — Premium Koyu / Açık Mod

## Ekran ve etkileşim

Kullanıcının iPhone ekran görüntüsünde kırmızı ile işaretlediği yer, ana başlığın sağındaki üç nokta (`v8MoreButton`) menüsünün **hemen soludur**. Bu konuma işlevsel bir `htThemeToggle` ay/güneş anahtarı yerleştirildi. Beş bölüm (**Genel, Finans, Hesaplar, Firmalar, Ayarlar**) ve mevcut alt menü korunur.

- Açık modda ay ikonu görünür. Dokununca koyu moda geçer, ikon güneşe dönüşür ve `aria-pressed="true"` olur.
- Koyu modda güneşe dokununca açık moda döner.
- Tema seçimi yalnızca tarayıcının **yerel** `localStorage` alanında `ht-ui-theme-v81` anahtarıyla saklanır. Tema tercihi cihazlar arasında senkronize edilmez; kullanıcı bilgileri sunucuya gönderilmez.
- İlk ziyarette seçilmiş tercih yoksa telefonun `prefers-color-scheme` ayarı izlenir; kullanıcı elle seçtikten sonra cihaz temasındaki değişiklik bunu ezmez.
- Yerel depolama devre dışıysa mevcut oturumda geçiş çalışır; sonraki açılışta tercih kalıcı olmayabilir.
- Tema JavaScript'i `<head>` içinde ilk boyamadan önce çalışır; harici istemci script CSP politikasına uyar.
- Geçişlerde hafif renk animasyonu var; hareketi azalt tercihinde animasyon yoktur. Klavye odağı ve ekran okuyucu etiketleri korunur.
- Kurum logolarının orijinal renkleri, kartların canlı değerleri ve mavi mor özet kartlarının kontrastı korunur. Yeni koyu yüzeyler ve butonlar mevcut içerikleri yeniden düzenlemez.

## Güvenlik / belge koruma

Yeni JS **yalnız `data-ht-theme` özelliği** ve görsel moda ait `localStorage` anahtarını değiştirir. Finansal kayıtları, belgeleri, logo yüklemelerini, gizli banka şifrelerini, PIN, biyometri veya sunucu/veritabanı durumunu okumaz/silmez. API ve D1 işlemi çağırmaz. Yapılan kod değişikliği: `public/theme-v81.js`, `public/theme-v81.css`, `public/index.html` içindeki anahtar + dosya bağlantıları, `public/version.json`, testler ve bu belge. `src/`, `migrations/` ve işleme/ödeme JS dosyaları değişmez.

Bu işlem **bağımsız bir üretim D1 veritabanı yedeği değildir**. Veri kaybı olmadığını ancak gerçek kullanıcı verilerini okumadan garanti etmem mümkün değildir; mevcut kayıtları değiştirmeyen sürüm olarak tasarlandı.

## GitHub geri dönüş noktaları

- Önceki canlı **v80** main commit: `1b1df69bce713566bdb42f640582e099217a6d2e`.
- Önceki **v79** main commit: `4d9cbd7b60e02e0b9be51f8fb3fe20eb9e5c72ab`.

## Yayın öncesi doğrulama

1. GitHub Actions üzerinde `npm test` ve `wrangler deploy --dry-run` başarılı olmalı.
2. iPhone Safari'de dar ekranlarda ay/güneş butonunun üç noktanın solunda kalması ve Genel Bakış başlığının kırpılmaması kontrol edilmeli.
3. Açık/koyu dönüşümü, sayfa yenileme, Safari Gizli mod ve sistem tema değişikliği sınanmalı.
4. Beş ana ekran, finans tabloları, şirket logosu, kayıt formları, güncellemeler, PIN ve modal pencerelerde kontrast kontrol edilmeli.
5. Açık tema v80 görünümlü olarak kalmalı ve yeni kullanıcıya örnek rakam/firma eklenmemeli.

Bu PR canlıya alınmadan önceki tasarımsal ve işlevsel hazırlıktır.
