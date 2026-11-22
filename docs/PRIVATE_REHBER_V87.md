# HesapTakip v87 — Kişisel Rehber ve Güvenlik Altında Üye Yönetimi

## Kullanıcı kararı

Ayarlar'ın mevcut **3×3 pastel grid** ekranındaki üçüncü kart **Üye Yönetimi** yerine **Rehber** olur. **Üye ve Yetki Yönetimi**, **Ayarlar → Güvenlik → ⚙️ Üye ve Yetki Yönetimi → Üyeleri yönet** alanına taşınır. Üye adları ve mevcut onay/engelleme/izin kaydetme API'leri değişmez. Aynı 9 kartın boyutları, renkleri, açık/koyu mod ve beşli tab bar korunur.

## Kişisel telefon rehberi

Ekli `Rehberim_1630_iPhone_Uyumlu_Cep(1).vcf` dosyası **1.630 kişi kartı ve toplam 1.644 geçerli telefon numarası** içerir. Bu dosya gerçek kişilerin özel numaralarını taşıdığı için **GitHub'a eklenmedi** ve herkese açık web varlığına gömülmedi.

- Ayarlar → Rehber içinde **iPhone Rehberinden Aktar (.vcf)** butonu, kullanıcı tarafından seçilen dosyayı tarayıcı içinde açar.
- İsim ve numaralar **dosyayı seçmekle sunucuya gönderilmez**. Önce kart/numara sayılarıyla önizleme gösterilir; ancak **Kişileri içe aktar** tuşuna basıldığında yükleme başlar.
- 100'lük partilerle, yalnız oturum açmış **yönetici** ve açık PIN oturumu için geçerli API'ye kayıt yapılır. Aynı ad+normalize telefon eşleşmesi tekrar içe aktarımda `INSERT OR IGNORE` ile atlanır. Var olan kayıtlar silinmez.
- Listeden **arama**, bir kişinin numarasını **Ara** (`tel:`) ile telefon arama uygulamasına iletme ve tek kişi ekleme desteklenir.
- Büyük rehberin tamamı arama için belleğe alınır; ekrana bir anda en fazla 250 kayıt çizilir, böylece iPhone'da kaydırma performansı korunur.
- Kişi isimleri telefon numaraları üzerinden HTML oluşturulmaz; `textContent` ile güvenli gösterilir. Telefon bağlantılarında yalnız rakam ve `+` kalır.
- Rehber **şirket temsilcileri, Üye Yönetimi, finans veya kişi borç/alacak listesi** değildir. Bunlar değişmeden kalır.

## Sunucu erişim kontrolleri ve veri bütünlüğü

Yalnızca `src/personal-contacts-v87.js` adlı ayrı, yönetici yetkili, D1 depolamalı tablo/endpoint eklenir:
- `GET /api/personal-contacts`: yöneticiye ait özel kişi/telefon listesini oku.
- `POST /api/personal-contacts/import`: onaylanmış kayıtları istekte en fazla 100 adet olmak üzere ekle.
- `personal_contacts_v87`: `CREATE TABLE IF NOT EXISTS`, ayrı benzersizlik indeksleri; hiçbir mevcut finansal/kullanıcı/kurum tablosuna dokunmaz.
- Genel sunucu `src/index.js` mevcut oturum/PIN/doğru origin kontrolünden **sonra** bu rotaya yönlendirir.
- Sunucu `principal.role==='admin'` zorunlu tutar; istemci kartı gizlemek tek başına güvenlik sayılmaz.
- Yönetici rolü düşürülürse rehberin önceden ekrana yüklenmiş adı/numarası ve dosya önizlemesi temizlenir.
- Veri GitHub açık deposuna, statik HTML/JS/CSS veya örnek test dosyalarına dahil edilmez.

## Korunan işlemler

Bu sürümde var olan **belgeler, fatura, banka, firma, platform, üye onayı, üye yetkileri, şifre kasası, PIN ve finansal hesaplama davranışları** değiştirilmez. Üye ve Yetki Yönetimi'ni Güvenlik içine taşıma yalnız navigasyon değişikliğidir. Kişi rehberi için kendi tablosu dışında veritabanında yazma yapılmaz.

Bağımsız üretim D1 veritabanı yedeği bu işlemde alınmaz. v86 GitHub commit'ine dönülebilir ama yeni özel rehber verileri geri dönüşte silinmemelidir. Aktarım yalnız kullanıcı uygulamada dosyayı seçip onayladıktan sonra tamamlanır; **bu kod değişikliği, ekli özel .vcf dosyasını otomatik olarak canlı sisteme yüklemez**.

## Yayın ve doğrulama

`npm test`, Wrangler dry-run, 3×3 kart testi, farklı üyelik rolleri ve API doğrulaması. Gerçek iPhone'da seçme/önizleme/onay akışı, arama, koyu/açık mod, Güvenlik → Üye Yönetimi, beşli alt menü, gerçek canlı rehber ve finansal kayıtların yerinde kalması kontrol edilmeli.
