# HesapTakip — Cloudflare üzerinde kredi kartı ödeme takibi

GitHub üzerinde tutulan, Cloudflare Workers + D1 ile yayınlanan, Türkçe ve telefon uyumlu web uygulaması. Kart sahibi, banka, kart takma adı, isteğe bağlı **yalnızca son dört hane**, dönem ekstresi, son ödeme tarihi, kısmi ödeme ve kalan borçları takip eder. Banka hesabınıza bağlanmaz, otomatik ödeme yapmaz. Kod herkese açık GitHub deposunda olsa bile finansal kayıtlar Cloudflare D1'de kalır.

## Özellikler

- Birden çok kişi ve bankaya ait kartları yönetme
- Her karta bir dönem için tek ekstre, ayrı son ödeme tarihi
- Birden fazla kısmi ödeme, kalan borç hesabı
- Geciken / 7 gün içinde ödenecek borçların özeti
- Ödeme geçmişi ve JSON dosyası olarak yedek indirme
- Yönetici parolası, güvenli HttpOnly oturum çerezi, giriş deneme sınırı
- Mobil ve masaüstünde responsive arayüz

**V26:** İlk yönetici, kullanıcı adı `admin` ve mevcut `APP_PASSWORD` ile giriş yapar. Diğer kullanıcılar kişisel kullanıcı adı ve en az 8 karakterli şifreyle başvurur; admin Ayarlar üzerinden onay verir, her kullanıcıya görüntüleme alanlarını ayrı ayrı açar veya engeller. Yeni kullanıcıların kayıt değiştirme yetkisi yoktur. Banka/platform giriş bilgileri ayrı `Kullanıcı İşlemleri` kasasında AES-GCM şifrelenir; bunun için Cloudflare'da bağımsız ve en az 32 karakterli `VAULT_ENCRYPTION_KEY` Secret tanımlanmalıdır. Şifre kaydedildikten sonra bu anahtarı değiştirirseniz eski şifreler çözülemez. Kasaya yalnızca admin ve açıkça `Kullanıcı İşlemleri` yetkisi verilen onaylı hesaplar erişir. Tam kart numarası, CVV, 2FA kodu, kimlik numarası saklamayın. Uygulama banka bağlantısı kurmaz veya WhatsApp mesajını otomatik göndermez.

## Cloudflare üzerinden yayına alma

1. Cloudflare Dashboard → **Storage & databases → D1** üzerinden `karttakip-db` adında yeni D1 veritabanı oluşturun ve **database ID** değerini kopyalayın.
2. Depodaki `wrangler.jsonc` dosyasında `database_id` alanındaki `00000000-0000-0000-0000-000000000000` yer tutucusunu gerçek ID ile değiştirip commit edin.
3. Cloudflare → **Workers & Pages → Create → Import a repository** ile `tolgamy/HesapTakip` deposunu bağlayın. Bu bir **Worker** uygulamasıdır; proje adı `hesaptakip` olmalı (ya da `wrangler.jsonc` içindeki `name` ile aynı olmalı). Build command `npm run test` (isteğe bağlı), deploy command `npx wrangler deploy` olabilir.
4. Worker'ın **Settings → Variables and Secrets** bölümüne gizli (encrypted) iki değer tanımlayın: `APP_PASSWORD` (**en az 8 karakter**) ve `SESSION_SECRET` (**en az 32 karakter**, rastgele). Bu değerleri GitHub koduna eklemeyin.
5. **SQL yapıştırmak zorunda değilsiniz:** Uygulama, Cloudflare Worker ilk API isteğini aldığında D1 tablolarını `CREATE TABLE IF NOT EXISTS` ile otomatik olarak oluşturur. Bu işlem var olan kayıtları silmez. İsterseniz manuel alternatif olarak `npx wrangler d1 migrations apply karttakip-db --remote` kullanabilirsiniz.
6. Worker'ın `*.workers.dev` adresini açın, yönetici parolanızla giriş yapın. GitHub'a yapılan sonraki commit'ler otomatik deploy edilebilir (Git entegrasyonu açıksa).

> D1 kimliği ayarlanıp gizli değişkenler girilmeden uygulama kullanıma hazır değildir. Bu repository tek başına Cloudflare üzerinde yayın yapılmış olduğu anlamına gelmez.

## Yerel geliştirme

Node.js 20+ kuruluysa:

```sh
npm install
cp .dev.vars.example .dev.vars
# örnek değerleri güçlü yerel değerlerle değiştirin
npx wrangler d1 migrations apply karttakip-db --local
npm run dev
npm test
```

`npm run dev` için Wrangler'a Cloudflare hesabıyla giriş yapmak gerekebilir. Canlı veritabanını yönetmek için `--remote` kullanılacağını unutmayın.

## Veri güvenliği

Kart kayıtlarında yalnız takma ad ve isteğe bağlı son dört hane tutulur. Banka/platform giriş kasasında kullanıcı adı ve AES-GCM şifreli parola ayrıca tutulabilir; tam kart numarası/CVV saklanmaz. Yönetici parolası ve kasa şifreleme anahtarı Cloudflare Secret olarak kalmalıdır; GitHub'a veya açık dosyaya yazmayın. JSON yedekleri finansal veri içerir ve ayrı saklanmalıdır. Yeni kullanıcılar yalnızca admin onayıyla erişir.

## Canlı kurulumda giriş hata kontrolü

- Worker > Settings > Variables and Secrets bölümünde Production için `APP_PASSWORD` (en az 8 karakter) ve `SESSION_SECRET` (en az 32 karakter) Secret olarak kayıtlı olmalıdır.
- Değişikliklerden sonra Production'a yeni deployment yapıldığını kontrol edin.
- Worker > Settings > Builds > Branch control bölümünde üretim dalı `main` olmalıdır.
- `https://hesaptakip.tolgamy.workers.dev/api/session` adresi giriş yapılmamışken `{"authenticated":false}` yanıtını vermelidir. 503 dönerse hata mesajı hangi ayarın eksik veya kısa olduğunu söyler.
- Şifreleri veya finansal verileri GitHub'a yüklemeyin.

## Firma borçları, alacaklar ve raporlar (v2)

Mevcut tasarımın sol menüsünde iki yeni alan vardır:

- **Borçlu Olduğumuz Firmalar:** Tedarikçilere borçları ve yapılan ödemeleri izler.
- **Alacaklı Olduğumuz Firmalar:** Müşterilerden/firma cari hesaplarından alacakları ve tahsilatları izler.

Firma adı, isteğe bağlı telefon ve not bilgileri kaydedilir. Her firmaya tutarı ve tarihi olan **Borç/Alacak** hareketi eklenir. Sonrasında **Ödeme/Tahsilat** ile kısmi veya tam kapatma yapılır. Kalan bakiye tüm hareketlerden hesaplanır. Ödeme veya tahsilat, kalan tutarı aşamaz. Firma kaydı geçmişinde hareket varsa yanlışlıkla silinemez; önce ilgili hareketlerin silinmesi gerekir. Firma türü sonradan dönüştürülmez; kayıt türünün yanlış seçilmesi hâlinde hareketleri silip doğru türde yeni firma oluşturulmalıdır.

**Excel** düğmesi: Excel tarafından açılabilen gerçek \`.xlsx\` dosyası indirir. Özet, Firma Bakiyeleri, Firma Hareketleri, Kartlar, Ekstreler ve Kart Ödemeleri sayfalarını içerir.

**PDF** düğmesi: Yazdırmaya uygun raporu yeni pencerede açar. Tarayıcının yazdırma hedefini **PDF olarak kaydet** seçerek PDF dosyası oluşturulur; bu sürüm ayrı bir sunucu PDF dosyası üretmez. Açılır pencereler engellenirse izin vermek gerekir. Excel ve PDF yalnızca oturum açmış kullanıcıların tarayıcısında oluşturulur; üçüncü taraf servise aktarılmaz.

**Yedek indir** düğmesi JSON yedek formatını korur ve artık firma/hareket kayıtlarını da içerir. Yedekler hassas ticari bilgi içerir, güvenli yerde saklayın.

### Veritabanı güncellemesi

Cloudflare D1 içindeki mevcut \`cards\`, \`statements\`, \`payments\` ve \`login_attempts\` tabloları korunur. Yeni \`firms\` ve \`firm_movements\` tabloları Worker'ın **ilk API isteğinde** \`CREATE TABLE IF NOT EXISTS\` kullanılarak otomatik oluşturulur. Bu işlem için mevcut veritabanını silmeyin veya yeniden oluşturmayın. Manuel migration dosyası \`migrations/0002_firms.sql\` de sağlanır.

### Cloudflare'a güncel sürümü yayınlama

\`tolgamy/HesapTakip\` deposunun \`main\` dalındaki en son kod Cloudflare'da yayınlanmalıdır. Git entegrasyonu **disconnected** görünüyorsa yalnızca GitHub'a commit yapılması üretim sürümünü güncellemez. Cloudflare Workers → hesaptakip → Settings → Builds bölümünde Git bağlantısını tekrar kurun, ardından yeni commit için bir Production deployment çalıştırın. Mevcut \`APP_PASSWORD\` ve \`SESSION_SECRET\` değerlerini GitHub dosyalarına eklemeyin, D1 veritabanını değiştirmeyin. Yayın sonrası firmalar menülerinin açıldığını ve kayıt/Excel/PDF işlevlerini kontrol edin.


## V3: İşletme Finans Takibi (test geliştirme dalı)

**Geliştirme dalı:** `feature/finance-suite-v3`. Mevcut canlı `main` uygulaması ve D1 kayıtları değiştirilmeden hazırlanır.
Mevcut renkler, menü yapısı, kartlar, ekstreler, firmalar, Excel/PDF raporları korunur.

- **Ödeme takvimi:** Kart ekstreleri, vadesi kaydedilmiş firma borç/alacak hareketleri, bekleyen çek/senetler. Ay bazında takvim ve gecikmeler.
- **Otomatik hatırlatmalar:** Cloudflare Cron günlük 07:00 UTC (Türkiye saati 10:00) çalışır; 7, 3, 1 ve 0 gün kala uygulama içi hatırlatma kaydeder. Dışarıya WhatsApp, e-posta, SMS veya push bildirimi göndermez. Mesaj gönderimi için ayrıca sağlayıcı gerekir.
- **Firma cari hesap ekstreleri:** V2 firma hareketleri menüsündeki borç, ödeme, alacak, tahsilat ve kalan bakiye korunur; ilgili vadeler takvimde de görünür.
- **Kasa & banka:** Elle girilen açılış bakiyesi, para girişi/çıkışı, gelir/gider/diğer kategorisi. Mevcut bakiye aşılınca çıkış reddedilir. Banka API entegrasyonu veya otomatik havale yoktur.
- **Çek & senet:** Tür, verilen/alınan, firma/kişi, tutar, düzenleme/vade, bekliyor/ödendi/iade/iptal durumları.
- **Gelir/gider:** Aylık raporda **yalnızca gelir/gider etiketli kasa/banka nakit hareketleri** esas alınır. Kredi kartı ekstresi ve firma borcu kaydı otomatik gider sayılmaz; çift sayım önlenir.
- **Gelişmiş arama:** Kart, ekstre, firma, cari hareket, kasa hareketi, çek/senet, tarih aralığı ve serbest metin.
- **Yetkiler (V26):** Yönetici `admin` + `APP_PASSWORD` ile giriş yapar. Kişisel kullanıcı hesapları yönetici onayıyla etkinleşir; `app_members` içinde her kullanıcıya ekran bazlı salt-okunur izinler tanımlanır. Eski ortak `STAFF_PASSWORD` ve `VIEWER_PASSWORD` girişleri devre dışıdır. Eski imzalı v1 yönetici oturumları kabul edilir. Şifre kasası için bağımsız `VAULT_ENCRYPTION_KEY` gerekir.
- **Otomatik yedekleme:** Cloudflare D1 Time Travel bağımsız platform korumasıdır. Özel bir **R2 bucket** `BACKUP_BUCKET` binding ile bağlanırsa Cron, günlük özel JSON veri kopyası yazar; bucket bağlı değilse uygulama "yedek alındı" demez. Saklama süresi, erişim izinleri ve düzenli geri yükleme denemeleri Cloudflare panelinden ayrıca yönetilmelidir. Kullanıcının indirebildiği JSON yedeği de mevcuttur.

**Önemli güvenlik gereği:** Cloudflare'da oluşturulmuş `APP_PASSWORD` ve `SESSION_SECRET` sırlarını GitHub'a veya örnek yapılandırmalara yazmayın. `wrangler.jsonc` dosyasında `keep_vars: true` kullanılır; yine de her yeni Production yayını sonrası giriş testini yapın.

### Test ve yayına alma kontrol listesi

1. GitHub geliştirme dalındaki otomatik `npm test` ve `wrangler deploy --dry-run` kontrollerini geçirin.
2. **Production'a almadan önce:** Geçici önizleme/test ortamında giriş, rol yetkileri, demo kart/firma/kasa/evrak işlemleri, Excel ve PDF indirmelerini test edin.
3. Cloudflare Production D1 için yedek/geri yükleme noktası teyit edin; şemalar sadece `CREATE TABLE IF NOT EXISTS` ile eklenir, eski tablolar silinmez. `migrations/0003_finance_suite.sql` istenirse manuel uygulanabilir.
4. Yalnızca testler başarılıysa güncel dalı `main` ile birleştirin ve kontrollü yayın yapın. Cloudflare Git bağlantısı kopuksa otomatik deploy beklentisine güvenmeyin.
5. Production'da `https://hesaptakip.tolgamy.workers.dev/api/session` üzerinden giriş servisini doğrulayın; şifreleri asla paylaşmayın.


## V5 — Türkiye banka / ödeme kuruluşu kataloğu ve gelişmiş kartlar

**Kurum listesi:** 151 seçenek (66 banka ve 85 ödeme, elektronik para, yemek kartı ve POS marka/uygulaması). Marka uygulamaları mutlaka lisanslı ödeme kuruluşu anlamına gelmez.
Kurumların listesi 17 Kasım 2026 itibarıyla BDDK banka listesi ve TCMB ödeme/elektronik para listelerine göre hazırlanmıştır.
Kaynaklar:
- BDDK: https://www.bddk.org.tr/Kurulus/Liste/77
- TCMB: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Odeme+Hizmetleri/Elektronik+Para+Kuruluslari
- TCMB ödeme kuruluşları: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Odeme+Hizmetleri/Odeme+Kuruluslari

Listede yer almak, kurumun **kredi kartı verdiğini**, tüm hizmetlerine faaliyet izni olduğunu ya da lisans durumunun değişmediğini **garanti etmez**. Hizmet/izin güncellemelerini resmî kurum sayfalarından teyit edin. İninal gibi faaliyet izni iptal edilen kuruluşlar aktif kurum kataloğuna alınmadı. Türkiye'deki bankaların uygulama markaları (İşCep, BonusFlaş, CEPTETEB, Enpara Şirketim) ana kuruluşla eşleştirilmeye çalışılır. Tami markası Garanti Ödeme'ye, Ödero ise Token Ödeme'ye aittir.

**Logolar:** 36 popüler kurum için orijinal vektör logo görselleri (kaynak: https://github.com/murattahtaci/turkish-bank-logos-svg, sağlayıcıya/markaya ait görseller), diğerleri için kurumun resmî alan adına göre favicon; ikisi de yoksa kurum baş harfleri gösterilir.
Dışarıdan gelen görseller yalnızca resim olarak yüklenir. Logo görselleri markaların tescilli haklarına tabidir; uygulama hiçbir banka veya ödeme kuruluşunca desteklendiğini ima etmez.
İlgili kuruma ait görsel farklı/eskiyse **Kartlar → Kurumlar ve logolar → Düzenle → Logo** üzerinden PNG/JPEG/WebP yükleyin. Logo, tarayıcıda en fazla 64×64 piksele indirgenerek D1'de saklanır. SVG yüklemesi kabul edilmez.

**Kart alanları:** Kart sahibi, kurum, takma ad, son dört hane, kredi/banka/sanal/POS kart tipi, bireysel/ticari, ek kart, TRY/USD/EUR/GBP, aktif/pasif/iptal, toplam limit, kullanılabilir limit, kullanılan limit (hesaplanan), nakit avans limiti, asgari ödeme oranı, kesim günü, ödeme günü, son kesim ve ödeme tarihleri, gerçek bir sonraki kesim/ödeme tarihleri (manuel), sonraki tahmini kesim/ödeme tarihleri (otomatik), hatırlatma açık/kapalı, renk, faiz/komisyon notları, isteğe bağlı bağlı IBAN ve kart notu.
**Kullanılan limit** banka verisinden gelmez: toplam limit − kullanılabilir limittir. Başka para birimiyle girilen kart limitlerini TL toplamlarına eklemeyin.
Gün 29/30/31 seçilirse kısa aylarda son güne yuvarlanır; ödeme günü kesim gününden küçük veya eşitse takip eden ayda hesaplanır. Tahminler resmî banka vadesi değildir, tatil/hafta sonu kaymalarını içermez. Manuel ileri tarih girilirse tahminin üzerinde gösterilir.

**Kart filtresi:** Kurum adı, kurum türü, kart durumu, vade aralığı (7/30 gün veya gecikme) ve limit/ödeme tarihine göre sıralama.
**Raporlar:** Kartların yeni alanları ve kurum kataloğu Excel/PDF çıktılarına eklenir.
**Kurum yönetimi:** Sadece admin kurumu/alan adını düzenler veya özel kurum ekleyebilir. CSV dosyasıyla 25'lik partiler halinde en fazla 500 özel kurum içe aktarabilir; örnek: `docs/ornek-kurumlar.csv`. Hazır kuruluşlar silinmez, pasife alınır; bağlı kartı olan özel kurum silinemez.

**Eski veriler:** D1 `cards` tablosu **silinmez**. Worker başlatıldığında `PRAGMA table_info` ile eksik yeni alanlar tespit edilir ve yalnız bunlar `ALTER TABLE ADD COLUMN` ile eklenir. `institutions` tablosu `CREATE TABLE IF NOT EXISTS` ile oluşur, mevcut özel kurum verileri `INSERT OR IGNORE` ile korunur. Eski kartlarda ek alanlar boş olur. Değişiklik öncesi Cloudflare D1 yedeği önerilir.
`migrations/0004_institutions.sql` belge amaçlıdır; Worker otomatik tamamlandıysa yeniden uygulamayın.

**Güvenlik:** Tam kart numarası ve CVV depolanmaz. Bağlı IBAN yalnızca gerekiyorsa eklenmeli; bu alan D1'de saklanır ve rapora dahil olabilir. `APP_PASSWORD` / `SESSION_SECRET` değerleri GitHub'a yazılmaz. `keep_vars:true` Cloudflare runtime değişkenlerinin korunmasına yardımcı olur, ancak her yayın sonrası giriş kontrolü gereklidir.

**Yayın:** Test dalındaki GitHub Actions `npm test` ve `wrangler deploy --dry-run` kontrolleri geçmeden üretime alınmaz. Cloudflare Git bağlantısı veya GitHub'da iki Cloudflare deployment secret tanımlı değilse ana dala birleştirmek Workers canlı sürümünü **otomatik yayınlamayabilir**.


## V6 — Net Genel Bakış, Türkçe tarihler, yemek kartı/POS markaları

**Genel Bakış** artık eski yalnız-ekstre toplamının yerine tek ortak hesap kullanır:

`Net genel borç (TRY) = Kartların kullanılan limiti (TRY) + Firmalara kalan borç − Firmalardan kalan alacak`

- Her kartta hem `credit_limit_kurus` hem `available_limit_kurus` girilmişse **borç = kart limiti − kullanılabilir limit**. Bu kartın **açık ekstresi yeniden eklenmez** (çift sayım yok).
- İki limit alanı eksik eski kartlarda açık ekstrelerden kalan tutar geçici yedek borç olarak kullanılır.
- Firma borç/alacak bakiyesi = cari borç/alacak hareketlerinin toplamı − ödeme/tahsilatlar.
- Kullanıcının örneği: kart borcu 609 TL + firma borcu 500 TL − firma alacağı 500 TL = **609 TL net borç**.
- Net toplam negatifse ana gösterge **Net Genel Alacak** olarak görünür.
- USD/EUR/GBP kartlar kendi para birimlerinde ayrıca gösterilir; bilinmeyen kurdan TL dönüşümü yapılmaz.
- Kasa/banka bakiyesi, nakit dahil net pozisyon, bekleyen çek/senet, gelir/gider, firmaların açık bakiyeleri, kart dağılımı, yaklaşan vadeler ve son işlemler Genel Bakış'ta ayrı ayrı görünür. Çek/senetler aynı firma borcunu temsil edebileceğinden ana toplama ayrıca eklenmez. Kasa/banka net borçtan ayrı tutulur.

**Görünen tarihler** Türkiye biçimindedir: `18.11.2026` (`GG.AA.YYYY`). Kart, firma, çek-senet, ödeme takvimi, arama, işlem geçmişi, Excel/PDF raporlarında bu biçimde gösterilir. Veritabanı ve HTML yerel takvim seçicileri güvenli sıralama için ISO `YYYY-MM-DD` değerleri kullanmayı sürdürür. Ekstre dönemi ay-yıl `11.2026` olarak görünür.

**Yemek kartı ve POS kataloğu:** 12 ek marka/uygulama seçeneği:
SETPOS, SETCARD, MultiNet Up, MultiPOS, MultiPay, Edenred/Ticket Restaurant,
MetropolCard, Metropol Cep POS, TokenFlex, TokenFlex POS, Pluxee ve Pluxee CepPos.
Fotoğraftaki e-Devlet uygulaması bir finans kuruluşu olmadığından eklenmez.
Kartlar menüsündeki logo/kısayol satırında marka seçilerek önceden seçilmiş kuruluşla yeni kart veya hesap açılabilir. Logo olarak resmî kurum alan adının site simgesi gösterilir; bulunmazsa harfli simge kullanılır. Kullanıcı kendi kurum logosunu da yükleyebilir. Bunlar farklı bankalar veya TCMB lisanslı kuruluşlar olmayabilir; katalog bir **finans/marka seçici**dir, resmî faaliyet izni belgesi değildir.

**Rapor uyumu:** Excel/PDF özetindeki net rakam Genel Bakış ile aynı `computeFinancialOverview` hesaplamasını kullanır. Para birimleri karıştırılmaz.

**Yayın güvenliği:** Bu sürüm veri silmez, D1 şemasını değiştirmez, Cloudflare sırlarını güncellemez. GitHub `npm test` ve `wrangler deploy --dry-run` geçmeden ana dala birleştirmeyin. Cloudflare'ın otomatik yayını ayrıca doğrulanmalıdır.


## V7 — Sade para ve alacak/borç takip paneli

Bu sürüm **kullanıcının gerçek ihtiyacına göre** ana menüyü yedi bölüme indirir:
1. Genel Bakış — tek bakışta kart borçları, banka hesapları, yemek kartı alacakları, platform hakedişleri, şahıslardan alacaklar ve firmalara borçlar.
2. Kredi Kartlarım — banka kart logoları, toplam/kullanılabilir limit, kullanılan limit, hesap kesim ve ödeme tarihleri; eski ekstreler ve kart ödeme geçmişi burada.
3. Bankalarım — sadece `cash_accounts.type='bank'` banka hesapları; manuel bakiye ve para giriş/çıkış hareketleri.
4. Yemek Kartı Alacaklarım — SETCARD, MultiNet, Edenred, MetropolCard, TokenFlex, Pluxee veya serbest kuruluş adı; alacak ve tahsilat hareketleri.
5. Platformlardaki Param — Getir, Trendyol, Yemeksepeti, Usmar Market (.com), Usmar Market (.com.tr) veya serbest platform; tahsil edilmemiş hakediş takibi. İki Usmar web adresi ayrı kayıt olarak listelenir.
6. Şahıslardan Alacaklarım — kişi ismi, toplam alacak, tahsilat ve kalan.
7. Firmalara Borçlarım — tedarikçilere borç, ödemeler, kalan bakiye.

**iPhone:** Alt menü 5 sekme: Genel · Kartlar · Bankalar · Alacaklar · Borçlar. **Alacaklar** ekranında Yemek Kartı / Platform / Şahıs olarak üçe ayrılır. Masaüstünde yedi bölümün hepsi doğrudan yan menüde bulunur.

### Bakiye hesaplama

- Kart borcu: kredi kartının limiti − kullanılabilir limit; bu iki alan boşsa açık ekstreden kalan tutar kullanılır. Banka kartı ve POS kartları kredi kartı borcuna eklenmez.
- Yemek kartı, platform, şahıs ve eski diğer alacak hesaplarında açık alacak = `charge − settlement`.
- Net genel borç = kart borcu (TL) + firmalara borç (TL) − **tüm** alacaklar (TL). 609 + 500 − 500 = 609 TL.
- Banka hesabı bakiyesi ayrıca görünür. Platformlarda bekleyen para banka hesabına geçmiş kabul edilmez. Tahsilatı kaydettiğinizde alacak düşer; isterseniz banka hesabına para girişini ayrıca işleyebilirsiniz.
- USD/EUR/GBP kartlar otomatik kur çevrimi olmadan TL toplamına eklenmez.
- Kredi kartı ekstresi ve limitten kullanılan tutar aynı borç için iki kez sayılmaz.

**Mevcut kayıtları koruma:** Var olan `firms` tablosuna sadece `receivable_group` alanı eklenir. Mevcut alacakların türü tahmin edilmez; `general` yani **Önceden kayıtlı diğer alacaklar** olarak korunur. Düzenle bölümünden meal/platform/person olarak sınıflandırılabilir. Borçlu olduğumuz firmalar aynı kayıtlarla devam eder. Eski çek/senet, takvim, rapor, R2/yedekleme ve benzeri tablolardan veri **silinmez**; yalnız yeni navigasyondan kaldırılmıştır.

**Otomatik bağlantı yok:** Getir, Trendyol, Yemeksepeti, Usmar Market, yemek kartı sağlayıcıları veya bankalara giriş yapılmaz; bakiyeler kullanıcı tarafından girilir. Resmî hesapların belirli aralıklarla eşleştiği iddia edilmez. Veri çekme için ayrı güvenli entegrasyon gerekir.

**Yayın güvenliği:** Tüm Cloudflare APP_PASSWORD / SESSION_SECRET değerleri ve var olan D1 kimliği korunur. Önce otomatik `npm test` ve `wrangler deploy --dry-run` başarılı olmalıdır. GitHub ana dalının güncellenmesi, kopuk Cloudflare Git bağlantısını otomatik düzeltmeyebilir.


## V9 — Sade kredi kartları ve platform / yemek kartı alacakları

**Kredi kartı ekleme / düzenleme ekranı** sadece şunları gösterir:
banka seçimi (arama ve banka logosu), kartın son 4 hanesi, kart türü,
bireysel/ticari kullanım, ek kart var mı, para birimi, toplam kart limiti,
kullanılabilir limit, hesap kesim günü, ödeme günü, hesap kesim tarihi,
son ödeme tarihi, bir sonraki hesap kesim tarihi ve bir sonraki ödeme tarihi.
Kart sahibi ve takma ad yeni kartlarda sistem içinde otomatik oluşturulur;
eski kartların sahip/takma ad kayıtları korunur. Nakit avans, asgari ödeme
oranı, IBAN ve notlar arayüzde artık bulunmaz, ancak veritabanındaki mevcut
değerleri düzenleme sırasında silinmez. Tam kart numarası ve CVV istenmez.

**Yemek Kartı Alacakları:** SETCARD, MultiNet, Edenred, MetropolCard,
TokenFlex, Pluxee, SETPOS, MultiPOS, MultiPay, Metropol Cep POS,
TokenFlex POS, Pluxee CepPos. Logolar için markaların resmî web alan
adlarından favicon gösterilir, bulunamazsa baş harfli simge kullanılır.
Gerektiğinde PC üzerinden özel PNG/JPEG/WebP logo yüklenebilir.
Mobilde özel logo yükleme alanı gizlidir.

**Platformlardaki Param:** Getir, Getir Çarşı, Trendyol, Uber Eats,
Yemeksepeti, Yemeksepeti Mahalle, USMAR.com, Usmar.com.tr; ayrıca serbest
platform adı girilebilir. USMAR kayıtları ayrı izlenir.
Logo seçiminin altında aynı sayfada **alacak tutarı, işlem tarihi, beklenen
ödeme tarihi** ve ödeme kuruluşu/banka seçimi bulunur. PayTR, iyzico,
Kuveyt Türk ve Tami POS hızlı erişim seçenekleridir. Kurum listesindeki
diğer banka ve ödeme kuruluşları da seçilebilir.
Kullanıcının seçtiği banka/POS yalnızca **hangi kanaldan tahsilat
beklendiği** bilgisidir; otomatik veri çekmez ve banka bakiyesine
kendiliğinden para girişi kaydetmez.

**Kayıt güvenliği:** Firma tablosuna yalnızca eksikse
`payout_institution_id` ve `logo_data` alanları eklenir.
Alacak hesabı ve ilk alacak hareketi `DB.batch` ile tek
işlemde kaydedilir. Mevcut firma ve kart kayıtları, Cloudflare sırları
ve daha önce kaydedilmiş diğer alanlar korunur.
Özel logo sunucu tarafında sadece küçük veri URI biçimindeki
PNG/JPEG/WebP görselleri kabul eder, SVG/HTML/uzak URL kabul edilmez.

**Yayın:** CI `npm test` ve `wrangler deploy --dry-run`
başarılı olmalı. GitHub ana dalının güncellenmesi ile Cloudflare Workers
Production'ın yayınlandığı ayrı şeylerdir; otomatik Cloudflare bağlantısı
kapalıysa elle yayın veya Cloudflare bağlantısını düzeltmek gerekir.


## V11 — Toplu banka yönetimi / altı yemek kartı

- Kredi kartları → Kurum ve logo yönetimi: **Yalnızca bankalar** (varsayılan),
  **Yalnızca gizlenenler**, banka başına seçim kutusu, **Görünenleri işaretle**,
  **Seçimi temizle**, **Seçilenleri gizle/göster/sil**. Düzenleme ve yeni banka
  ekleme aynı ekranda bulunur, yeni banka için tür varsayılan `bank` olur.
- Banka silme işlemi **kalıcıdır ve onay ister**. Kullanılmakta olan kredi
  kartı veya ödeme kuruluşuna bağlı firma varsa işlem reddedilir. Toplu silme
  tek D1 batch işleminde uygulanır; kurumlardan biri bağlıysa hiçbiri
  silinmez. Hazır banka silindiğinde kodun sonraki çalışmasında tekrar
  eklenmesin diye `deleted_institutions` tablosunda silme kaydı tutulur.
- **Önceden gizlenmiş bankalar otomatik silinmez.** Bunun için canlı D1
  verisini görüntülemek gerekir. Yönetici arayüzünden **Yalnızca gizlenenler →
  Görünenleri işaretle → Seçilenleri sil** kullanılabilir. Mevcut kart ve
  finans geçmişi korunur.
- Yemek kartı hazır seçimleri **tam altı**: SETCARD, MultiNet, Edenred,
  MetropolCard, TokenFlex ve Pluxee. MultiPay artık yemek kartı kısayollarında
  yer almaz. Eski MultiPay kurum kaydı varsa pasife alınır; eski finans
  hareketleri silinmez. Yeni **EdenredPOS**, Bankalarım → POS Günlük Ciroları
  bölümünde ayrı bir hızlı ekleme butonu ve ödeme kuruluşu olarak bulunur.
- Yeni sürüm kodu GitHub'da yayınlansa bile Cloudflare Production
  bağlantısı ayrıca doğrulanmalıdır; GitHub'dan otomatik deploy garanti edilmez.


## V12 — Ayarlar ve logoların merkezden yönetimi

- **Ayarlar** PC'de sol menüde, iPhone'da üst başlıktaki dişli simgesindedir; mobil alt 5 sekme korunur.
- **Yeni kurum veya firma ekle:** Ad yazıldığında **“Bu kaydı nereye eklemek istiyorsun?”** sorusu görünür. Banka, ödeme kuruluşu/POS, kredi kartı, banka hesabı, nakit kasa, yemek kartı alacağı, platform alacağı, POS günlük cirosu, şahıstan alacak ve firmaya borç seçenekleri vardır. Seçim ancak ilgili form açar; ayrı kaydetme yapılmadan D1'e para, kart veya kurum kaydı eklenmez.
- Ayarlar'dan banka/ödeme kuruluşu **ekle, düzenle, gizle, toplu sil**, resmî logo bağlantısı veya PC'den logo yükleme, yemek kartları, platformlar, firma/şahıs ve kayıtlı hesapların düzenle/logo ekranlarına erişim sağlanır.
- Altı yemek kartının görünen adları: **Setcard, Multinet, Edenred, Metropolcard, Tokenflex ve Pluxee**. Mevcut `SETCARD`, `MultiNet Up` ve diğer eski isimli cari kayıtlar özel ad eşleştiriciyle aynı hesap olarak tanınır. Veritabanındaki tarih, hareket ve bakiyeler değiştirilmez.
- **Logo gösterimi önceliği:** kullanıcının yüklediği görsel → mevcut marka vektörü / resmî kuruma ait site simgesi (favicon) → özgün renkli ve harfli uygulama simgesi. Son tür **resmî logo değildir**; ayırt edilebilir varsayılan uygulama işaretidir. Kullanıcı PC'de PNG/JPG/WebP yükleyebilir, sunucunun mevcut güvenlik boyutu ve MIME kısıtları geçerlidir.
- Ad değiştirilirse kategori seçimi sıfırlanır; dolayısıyla yanlış bölüme istemeden kayıt açılması önlenir.
- Yeni özellikler GitHub ana dalına aktarılsa da canlı Cloudflare Production dağıtımı ayrıca kontrol edilmelidir.


## V14 — Görseldeki yemek kartı ve cari hesap düzenleme eksikleri

- **Bankalarım → POS Günlük Ciroları:** bozuk resim simgesiyle görünen **EdenredPOS** hızlı butonu kaldırıldı. EdenredPOS, banka hesabı değildir; istenirse genel ödeme kuruluşları/POS kataloğundan seçilebilir. `+ POS hesabı` bölümü kalır.
- **Yeni yemek kartı, platform, POS, şahıs alacağı veya firma kaydı:** ilgili ekleme penceresinde kurum adı, **alacak/borç tutarı**, **işlem tarihi**, **tahmini paranın geçeceği tarih (vade)**, **paranın geleceği banka/ödeme kuruluşu** ve açıklama alanı vardır. Tutarla hesap oluşturma `/api/firms/with-charge` ile atomik yapılır; tutar girilmezse boş bakiye hesabı açılır.
- **Cari hesap → Düzenle:** Önceden yalnız isim/telefon/kuruluş değiştirilebiliyordu. Artık **tek borç veya alacak hareketi** olan hesaplarda aynı ekranda **mevcut tutarı, işlem tarihini, vadesini ve işlem açıklamasını** görüp değiştirebilirsin. Örneğin 524 → 574 TL değişikliği `/api/firms/:id/details` üzerinden cari bilgi + hareketi **tek D1 batch** işleminde düzeltir. Eski hareket kimliği ve `correction_log` düzeltme geçmişi korunur. Mevcut tahsilat daha büyükse düzeltme engellenir.
- **Hiç hareketi olmayan mevcut hesaplar:** Düzenle penceresinden ilk tutar ve tarih girilebilir, iki kayıt tek işlemde oluşturulur. **Birden çok hareketi olan hesaplar:** bütün tutarları yanlışlıkla tek toplamla ezmek yerine her alış/satış/tahsilatın yanında ayrı **Düzenle** düğmesi bulunur.
- **Alacak kartı özeti** beklenen ödeme tarihini ve seçilmiş tahsilat kuruluşunu gösterir; para gerçekten bankaya yatmadıkça banka/kasa bakiyesi kendiliğinden artırılmaz. Gerçek kısmi tahsilat ayrıca `Tahsilat / Ödeme Geldi` işlemiyle girilir.
- iPhone üzerinde uzun form kaydırılabilir, marka adı ile altındaki kategori açıklaması ayrı satırlarda gösterilir. Kullanıcının önceki verileri ve Cloudflare gizli değerleri korunur.

GitHub testlerinin ve Wrangler dry-run kontrolünün geçmesi **Production yayını anlamına gelmez**; canlı Cloudflare Workers dağıtımı ayrıca kontrol edilmelidir.

## V17 — Firma Rehberi, Excel, logolar ve sürüm denetimi

- **Firma Rehberi** masaüstü menüsünden veya mobil Genel Bakış/Hesaplar sayfasından açılır. Her firmanın kendi +90 telefonu, ziyaret günü, notu, logosu; ayrıca birden fazla temsilci, kişi telefonu ve ziyaret günü vardır. Rehber, `directory_companies`, `directory_contacts`, `directory_templates` tablolarında tutulur. Firmayı var olan cari hesapla ilişkilendirmek sadece referanstır: alacak, borç, kasa veya tahsilat oluşturmaz.
- **Excel şablonu:** Firma Rehberi → Örnek Excel. İlk satır başlıkları `Firma Adı`, `Temsilci Adı Soyadı`, `Telefon (+90)`, `Ziyaret Günü`, `Firma Notu`, `Temsilci Notu` olmalıdır. Temsilcisi olmayan firmada telefon firmanın ana telefonu sayılır. Aynı firmada farklı temsilciler ayrı satırda olur. `.xlsx` ve `.csv` desteklenir, en fazla 100 satır/işlem. İçe aktarmadan önce önizleme/hata kontrolü yapılır; kaydetmede mevcut firmaları atlama veya yalnız yeni temsilcileri ekleme seçimi vardır. Para bakiyeleri içe aktarılmaz.
- **WhatsApp / Business:** Firma veya temsilcinin WhatsApp bağlantısı kullanıcıya mesajı düzenlettikten sonra açılır. Otomatik ileti gönderimi yoktur. Business özel URL şeması cihazın uygulama ayarlarına bağlıdır, her cihazda ayrı Business uygulamasına geçiş garanti değildir. Normal bağlantı `wa.me` üzerinden yapılır. Ayarlar'da özelleştirilebilir mesaj şablonları bulunur.
- **Logo yönetimi:** Ayarlar → Tüm kayıtların logoları. Banka/ödeme kuruluşu, kredi kartı, banka/kasa hesabı, yemek kartı, platform, kişi, firma, POS ve rehber kayıtları için PNG/JPG/WebP yükleme/değiştirme/kaldırma sağlanır. Orijinal finans hareketleri korunur; `entity_logos` tablosu ve mevcut `logo_data` sütunları kullanılır.
- **Güncellemeleri kontrol et:** Ayarlar → Güncellemeleri kontrol et, çalışan `meta[name=ht-build]` sürümünü Cloudflare'da yayınlanan `/version.json` sürümüyle karşılaştırır. Yeni sürüm gerçekten yayındaysa kullanıcı onayıyla servis çalışanı güncellenir ve uygulama yeniden açılır. GitHub'da commit olup Production dağıtımı yoksa bu işlem yeni kodu otomatik yayınlayamaz; Cloudflare deploy bağlantısını ayrıca kontrol edin. Her yeni yayınla beraber hem HTML sürümünü hem `version.json` sürümünü yükseltin.
- **Veri güvenliği:** Mevcut `firms`, `firm_movements`, `cards`, `payments`, `cash_accounts` kayıtları silinmez veya yeniden oluşturulmaz. Yeni tablolar `CREATE TABLE IF NOT EXISTS` ile eklenir. Canlı D1 veritabanında geri yükleme noktası doğrulanmalı; üretime alma ancak testler ve Wrangler dry-run başarılıysa yapılmalıdır.


### V26 güvenli kasa ve üyelik

- Kullanıcı adı `admin`, şifre mevcut `APP_PASSWORD` olarak yönetici girişi yapın.
- Yeni kullanıcı giriş ekranından **Yeni kullanıcı kaydı oluştur** ile başvurur; admin **Ayarlar → Admin / Kullanıcı Yönetimi** bölümünden onaylar ve yalnızca izin verilen ekranları işaretler. Onaylanmayan veya engellenen kullanıcı oturum açamaz; yetki değişimi mevcut oturumu geçersiz kılar.
- Banka POS ve Ödeme Kuruluşları **Ayarlar → Çalıştığım kurumlar ve firmalar** altında farklı kategorilerdir. **Firmalar → Kullanıcı İşlemleri** banka, POS ve platform giriş bağlantıları ve şifre kasasıdır.
- Cloudflare Worker Settings → Variables and Secrets bölümüne `VAULT_ENCRYPTION_KEY` adında bağımsız, güçlü, rastgele **Secret** ekleyin. Bu anahtar yokken şifreli kayıt oluşturma/çözme güvenli biçimde engellenir.
- Giriş kasasında saklanan şifreler D1'de yalnızca AES-GCM şifreli metin ve tek kullanımlık IV olarak durur; normal liste, Excel/JSON yedekleri ve kullanıcı API listeleri şifre döndürmez.
- V26 ile eski STAFF_PASSWORD / VIEWER_PASSWORD ortak parola girişleri devre dışıdır. Önceden açılmış ortak personel oturumları da yeni API'de kabul edilmez. Kullanıcılar ayrı ayrı üye olup admin onayından geçmelidir.


### V27 menü ve parola kolaylığı

- Firmalar ana menüsü altında üç sayfa sekmesi bulunur: **Firma Borçlarım**, **Firma Temsilcileri**, **Kullanıcı İşlemleri**. Bunlar ana menüde ayrı kalabalık bağlantılar veya açılır pencereler değildir.
- Yönetici APP_PASSWORD ve kişisel üye şifreleri en az **8 karakter** olabilir; güvenlik için tahmin edilmesi zor ve benzersiz şifre önerilir. Cloudflare Secret değeri otomatik değişmez; mevcut şifreniz olduğu gibi kalır. Oturum için `SESSION_SECRET` ve kasa için `VAULT_ENCRYPTION_KEY` uzunluk ve güvenlik koşulları değişmedi.


### V28 kart önerisi ve PIN ile giriş kasası

- **Kartlarım → Bugün hangi kartı kullanayım?**: Aktif, kredi tipindeki ve kullanılabilir limiti pozitif olarak kayıtlı kartlar arasından en son hesap kesimi gerçekleşeni önerir. Karşısında kayıtlı **kullanılabilir limit** (kuruş verisi) ve kesim tarihi gösterilir. Kayıtlı limitler bankadan otomatik güncellenmez; kredi maliyeti, kampanya ve ödeme bütçesi dikkate alınmaz. Veri yoksa kart/limit uydurulmaz.
- **Hesaplar** sekmeleri sol baştan: **Kullanıcı İşlemleri**, **Şahıs Alacaklarım**, **Platform Alacaklarım**. Mevcut firma kayıtları ve kasa bilgileri silinmez.
- **Kullanıcı İşlemleri** kasasında admin önce ayrı bir dört haneli PIN oluşturur; bundan sonra tüm şifre gösterme **ve kopyalama** istekleri sunucuda PIN ile doğrulanır. 5 yanlış denemede 15 dakika kilit uygulanır. PIN hash'i şifre kasası sunucu anahtarına bağımlı, salt'lı PBKDF2 biçiminde saklanır; veritabanında PIN düz metin bulunmaz.
- PIN kurulum/değişimi yalnız admine açıktır. Güncellemek için eski PIN gerekir. Yetkili kullanıcı kasa şifresini görüntülemek/kopyalamak için PIN'i ayrıca bilmelidir. Gösterilen şifre 20 saniye içinde ekrandan temizlenir; kopyalanan şifre panoda kalabileceği için ortak bilgisayarlarda panoyu temizleyin.


### V31 — Temsilci gün filtresi, banka seçimi ve kasa kopyalama

- **Firmalar → Firma Temsilcileri** hızlı listesinde aramanın yanına **Ziyaret günü** filtresi eklendi; mobilde alt alta, PC'de yan yana çalışır. Firma rehberindeki mevcut gün filtresi korunur.
- **Finans → Bankalarım** başlığındaki **Banka / Kuruluş Ekle** yanında kayıtlı banka hesabı seçimi, **Para Girişi** ve **Para Çıkışı** eklendi. Seçim listeyi filtreler; işlem mevcut hesabın D1 hareket formuna gider, yeni sahte hesap oluşturmaz. Kullanıcı yetkileri değişmedi; salt-okunur hesaplar işlem yapamaz.
- Anasayfadaki **+ Yeni İşlem → Firma Ekle (Temsilciyle)** aynı formda firma adı, telefon, ziyaret günü, isteğe bağlı iş temsilcisi ve telefonunu alır. Temsilci doldurulmuşsa yeni firma ve kişi tek veritabanı batch işleminde kaydedilir; cari hesap bağlama isteğe bağlıdır.
- **Hesaplar → Kullanıcı İşlemleri** içinde **Kullanıcı adını kopyala** ve **Şifreyi kopyala (PIN)** ayrı düğmelerdir. Şifre olmayan kayıtta buton pasiftir ve kullanıcıya düzenleyip şifre eklemesi söylenir. PIN doğrulaması ve kasa yetkileri sunucu tarafında zorunlu olmaya devam eder.


### V32 — PIN olmadan çok alanlı giriş bilgileri

- Hesaplar → Kullanıcı İşlemleri içinde 4 haneli **kasa PIN'i kullanılmaz**. Mevcut admin oturumu veya açık **Kullanıcı İşlemleri** yetkisi yeterlidir. Sitenin SMS/iki aşamalı doğrulaması, HesapTakip'in kendi oturum güvenliğinin yerine geçmez; bu yüzden kasa yetkisini yalnız güvendiğiniz kişilere verin.
- Her kayıt için mevcut **Kullanıcı Adı** ve **Şifre** alanları aynen korunur; ek olarak **+ Alan Ekle** ile 20'ye kadar farklı isimli alan açılabilir (ör. Admin, Şifre, Parola, Mağaza Kodu). Alanın adını, gizli/normal türünü ve değerini yazın. Yeni değerler AES-GCM ile şifrelenir; liste yanıtında yalnız isim ve dolu/boş durumu bulunur.
- **Kopyala** her alan için ayrı sunulur. Şifre ve ek alan değerleri yalnız yetkili oturumdan yapılan tek bir istekle çözülür; toplu liste, denetim kayıtları ve normal yedek cevapları şifre döndürmez. Alan değiştirirken değeri boş bırakmak eski değeri korur; silinen alanın kendi kaydı veritabanından kaldırılır.
- V28'in eski PIN tabloları, geçmiş verilere dokunmamak için bırakıldı fakat artık erişim denetiminde kullanılmıyor. Giriş PIN'ini zorunlu tutan V28/V31 açıklamaları V32 için geçerli değildir.


### V33 — Firma Temsilcileri ara düğmesi

Firmalar → Firma Temsilcileri içindeki arama kutusunun yanına PC ve mobilde görünen **Ara** düğmesi eklendi. Kişi, firma veya telefon arama terimini mevcut ziyaret günü filtresiyle birlikte uygular; arama kutusuna yazarken dinamik filtreleme de çalışmaya devam eder.


### V34 — mobil firma ve POS ekranlarını sadeleştirme

- **Yeni İşlem Ekle** penceresindeki **Diğer işlemler — tüm seçenekler** alt bölümü kaldırıldı. Ana Firmalar, Platformlar, Kredi Kartları ve Yemek Kartları işlemleri yerinde kaldı. Eski işlemler veritabanından silinmedi; ilgili Finans/Hesaplar sayfaları kullanılabilir.
- **Finans → POS ve Ödeme Kuruluşları** için telefon görünümü düzenlendi: bekleyen tutarlar ve notları ayrı satırlarda, şirket adı ve açıklaması tam genişlikte, bakiye ve Hareketler düğmesi altında yer alır. POS ve cari hesap hesaplamaları değiştirilmedi.
- **Firma Rehberi** mobil kartında WhatsApp / Business ve **Ara** görünür kalır. Firma ve temsilci için **Düzenle, Sil**, firma için **Logo, + İş Temsilcisi** işlemleri erişilebilir ⚙️ menüsündedir. Masaüstündeki normal eylem düğmeleri korunur. Yetkisi olmayan kişiler düzenleme menüsünü görmez.
