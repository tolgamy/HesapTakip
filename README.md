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

**Dikkat:** Bu ilk sürümde tek bir ortak yönetici parolası kullanılır; hesaplara göre yetkilendirme veya ayrı kullanıcı girişi bulunmaz. Uygulama banka bağlantısı kurmaz, ödeme veya WhatsApp bildirimleri göndermeyi içermez. Gerçek kayıtların paylaşımı için güçlü ve eşsiz parola kullanın. Tam kart numarası, CVV, kimlik numarası veya banka parolası girmeyin.

## Cloudflare üzerinden yayına alma

1. Cloudflare Dashboard → **Storage & databases → D1** üzerinden `karttakip-db` adında yeni D1 veritabanı oluşturun ve **database ID** değerini kopyalayın.
2. Depodaki `wrangler.jsonc` dosyasında `database_id` alanındaki `00000000-0000-0000-0000-000000000000` yer tutucusunu gerçek ID ile değiştirip commit edin.
3. Cloudflare → **Workers & Pages → Create → Import a repository** ile `tolgamy/HesapTakip` deposunu bağlayın. Bu bir **Worker** uygulamasıdır; proje adı `hesaptakip` olmalı (ya da `wrangler.jsonc` içindeki `name` ile aynı olmalı). Build command `npm run test` (isteğe bağlı), deploy command `npx wrangler deploy` olabilir.
4. Worker'ın **Settings → Variables and Secrets** bölümüne gizli (encrypted) iki değer tanımlayın: `APP_PASSWORD` (**en az 12 karakter**) ve `SESSION_SECRET` (**en az 32 karakter**, rastgele). Bu değerleri GitHub koduna eklemeyin.
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

Uygulama sadece kart takma adı ve isteğe bağlı kartın son 4 hanesini saklar. Yönetici parolası Cloudflare secret olarak kalmalıdır; GitHub'a veya müşteriye açık bir dosyaya yazmayın. Yedek JSON dosyaları finansal bilgi içerir, şifreli/güvenli yerde tutun. Erişim kontrolü tek paylaşılan parolaya dayanır; birden fazla personelin erişimi gerekecekse ayrı roller ve kullanıcı hesapları eklenmelidir.

## Canlı kurulumda giriş hata kontrolü

- Worker > Settings > Variables and Secrets bölümünde Production için `APP_PASSWORD` (en az 12 karakter) ve `SESSION_SECRET` (en az 32 karakter) Secret olarak kayıtlı olmalıdır.
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
- **Yetkiler:** Yönetici `APP_PASSWORD`; opsiyonel personel `STAFF_PASSWORD`; opsiyonel salt-okunur `VIEWER_PASSWORD`. Her biri Cloudflare **Production Secret** olarak en az 12 karakter. Şifreler birbirinden farklı olmalı. Bu sürüm kişiye özgü kullanıcı hesapları değil, rol başına ortak giriş şifresi kullanır. İşlem geçmişinde rol/işlem/zaman/kaynak tutulur; kişi kimliği tutulmaz. Eski v1 yönetici oturumları kabul edilir.
- **Otomatik yedekleme:** Cloudflare D1 Time Travel bağımsız platform korumasıdır. Özel bir **R2 bucket** `BACKUP_BUCKET` binding ile bağlanırsa Cron, günlük özel JSON veri kopyası yazar; bucket bağlı değilse uygulama "yedek alındı" demez. Saklama süresi, erişim izinleri ve düzenli geri yükleme denemeleri Cloudflare panelinden ayrıca yönetilmelidir. Kullanıcının indirebildiği JSON yedeği de mevcuttur.

**Önemli güvenlik gereği:** Cloudflare'da oluşturulmuş `APP_PASSWORD` ve `SESSION_SECRET` sırlarını GitHub'a veya örnek yapılandırmalara yazmayın. `wrangler.jsonc` dosyasında `keep_vars: true` kullanılır; yine de her yeni Production yayını sonrası giriş testini yapın.

### Test ve yayına alma kontrol listesi

1. GitHub geliştirme dalındaki otomatik `npm test` ve `wrangler deploy --dry-run` kontrollerini geçirin.
2. **Production'a almadan önce:** Geçici önizleme/test ortamında giriş, rol yetkileri, demo kart/firma/kasa/evrak işlemleri, Excel ve PDF indirmelerini test edin.
3. Cloudflare Production D1 için yedek/geri yükleme noktası teyit edin; şemalar sadece `CREATE TABLE IF NOT EXISTS` ile eklenir, eski tablolar silinmez. `migrations/0003_finance_suite.sql` istenirse manuel uygulanabilir.
4. Yalnızca testler başarılıysa güncel dalı `main` ile birleştirin ve kontrollü yayın yapın. Cloudflare Git bağlantısı kopuksa otomatik deploy beklentisine güvenmeyin.
5. Production'da `https://hesaptakip.tolgamy.workers.dev/api/session` üzerinden giriş servisini doğrulayın; şifreleri asla paylaşmayın.
