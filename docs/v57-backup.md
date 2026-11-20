# HesapTakip V57 — şifreli Cloudflare yedekleme (hazırlık)

## Kapsam ve güvenlik
- Canlı finans verilerini silmez/düzenlemez. D1 tablolarını okur; özel R2'ye AES-256-GCM şifreli yedek yükler.
- Günlük cron 07:00 UTC (Türkiye 10:00) çalışır; Cloudflare D1 Time Travel ayrıca korunur.
- Tüm uygulama tabloları dinamik bulunur. Eski eksik ve şifresiz günlük exporter devreden çıkartılır.
- Dosya özel R2 nesnesidir, public domain/URL oluşturulmaz.
- Her dosya yüklendikten sonra R2'den geri okunur, AES-GCM ile çözülür ve satır sayıları karşılaştırılır. Başarı ancak doğrulamadan sonra kaydedilir.
- 30 günden eski günlük şifreli arşivler silinir; son 7 günlük kopya korunur. Eski şifresiz dosyalar otomatik silinmez.
- Başarısız işlem backup_runs içine kaydedilir. Encryption secret yoksa disabled olur ve asla şifresiz kopya yazılmaz.
- GET /api/backups/status, POST /api/backups/run ve GET /api/backups/preview sadece PIN kilidini açmış admin içindir. Preview salt okunur ve veritabanına geri yükleme yapmaz.
- Mantıksal D1 dışa aktarımı atomik snapshot değildir: eşzamanlı güncellemeler kısmen tespit edilir. Tam zaman noktasına geri dönüş için D1 Time Travel kullanılır.

## Yayın öncesi Cloudflare kurulumu
1. Cloudflare R2 Object Storage alanında hesaptakip-private-backups isimli ÖZEL bucket açın. Public access açmayın.
2. BUCKET GERÇEKTEN OLUŞTURULDUKTAN SONRA wrangler.jsonc içine r2_buckets bağlaması ekleyin:
   {"r2_buckets":[{"binding":"BACKUP_BUCKET","bucket_name":"hesaptakip-private-backups"}]}
   Bu alan üst düzey yapılandırma özelliğidir; mevcut D1 ve diğer alanlar korunur.
3. Cloudflare → Workers & Pages → hesaptakip → Settings → Variables and Secrets → Add Secret:
   Name: BACKUP_ENCRYPTION_KEY
   Value: 32 rastgele baytın 64 karakter HEX gösterimi. Örnek üretim (yerel terminal): openssl rand -hex 32
4. Anahtarı güvenli parola kasasında ayrı saklayın. GitHub'a, sohbetlere ve ekran görüntülerine koymayın. Kaybolursa eski şifreli arşivler çözülemez. APP_PASSWORD, SESSION_SECRET ve VAULT_ENCRYPTION_KEY değiştirilmez.
5. V57 kodu yayınlandıktan sonra admin oturum ve PIN açıkken /api/backups/status için configured:true arayın; POST /api/backups/run ile kopya başlatın; /api/backups/preview ile ilk geri okuma doğrulamasını kontrol edin.

## Canlıya alma kabul koşulları
- [x] Şifreleme, R2 geri okuma, bütünlük, başarısızlık kaydı, tablo kapsama ve temizlik otomatik testleri.
- [ ] Özel R2 bucket ve Worker binding'i tanımlandı.
- [ ] BACKUP_ENCRYPTION_KEY kuruldu ve güvenli şekilde ayrıca saklandı.
- [ ] İlk gerçek günlük R2 şifreli yedeği oluşturuldu ve geri okunarak doğrulandı.
- [ ] Ayrı test D1 üzerinde geri yükleme provası ve banka/kasa/POS/kart/firma tutarlılık kontrolü yapıldı.
- [ ] Operasyonel günlük başarısızlık izlemesi doğrulandı.

## Limitler ve geri yükleme
Her tabloda 20.000 kayıt ve toplam JSON'da 8 MiB sınır vardır. Sınır aşıldığında eksik yedek üretilmez. Daha büyük veritabanları için Cloudflare D1 export API + Workflows ile ölçeklenebilir aktarım gereklidir. Bu sürüm canlı veriyi otomatik geri yüklemez; ayrı staging kurtarma provası bitmeden üretimde restore yapılmamalıdır.
