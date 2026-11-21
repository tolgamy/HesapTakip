# v77 · Ayarlar fotoğraf kaynakları

Fotoğraflar dekoratif arka plan olarak kullanılır; güvenlik veya finans bilgisi içermez. Metin, kontroller ve gezinme fotoğraf yüklenmese de erişilebilir kalır. Mobil bağlantıda hafif görüntüler için Unsplash CDN üzerindeki `w` / `h` / `q` parametreleri kullanılır.

Unsplash genel kullanım koşulları: https://unsplash.com/license

| Ayarlar bölümü | Fotoğraf | Kaynak |
| --- | --- | --- |
| Kullanıcı Hesapları | Bitkili çalışma masası ve dizüstü bilgisayar | https://unsplash.com/photos/a-desk-with-a-laptop-and-a-potted-plant-0kki97eZQs0 |
| Faturalar | Gerçek vergi/fatura evrakları ve hesap makinesi | https://unsplash.com/photos/search/bills (görsel Unsplash CDN foto-1554224155-6726b3ff858f) |
| İşletme Kontrol Merkezi | Dizüstü bilgisayar, bitki ve kahve | https://unsplash.com/photos/laptop-coffee-and-plant-on-a-wooden-desk-Kx4DzUnAIFg |
| PIN güvenliği | Ahşap yüzeyde anahtarlar | https://unsplash.com/photos/a-bunch-of-keys-sitting-on-top-of-a-wooden-table-PxiAc1aElFQ |
| Biyometrik giriş | Çalışma masasında dizüstü bilgisayar ve bitki | https://unsplash.com/photos/a-desk-with-a-notebook-pen-and-a-plant-KB2z8sJpSg8 |
| Kullanım Kılavuzu | Kitaplık | https://unsplash.com/photos/search/books (Unsplash CDN foto-1507842217343-583bb7270b66) |

**Gizlilik ve çalışma şekli:** Fotoğraflar üçüncü taraf Unsplash CDN'den yüklenir; CDN'e kullanıcının IP adresi ve site origin bilgisi gidebilir. Veritabanı, PIN, kullanıcı adı ve finansal bilgiler fotoğraf URL'sine eklenmez. Offline / erişilemeyen fotoğraflarda düz renk arka plan gösterilir. `Content-Security-Policy` yalnız `img-src` için `images.unsplash.com` ekler; betik veya API izni verilmez.
