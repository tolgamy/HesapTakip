# HesapTakip V58 — Google Drive şifreli ikinci yedek

## Genel işleyiş
- Yönetici, PIN kilidini açıp Yedekleme ekranından Google hesabını bağlar.
- OAuth 2.0 authorization code + PKCE akışı yalnızca drive.appdata yetkisi ister.
- Google appDataFolder normal Drive klasör listesinde görünmez. Yedek geçmişi HesapTakip içinde gösterilir.
- Google refresh token yalnızca Worker'da kullanılır, D1'e AES-256-GCM ile şifrelenmiş olarak yazılır. Şifreleme anahtarı BACKUP_ENCRYPTION_KEY secret üzerinden HKDF ile ayrılır.
- Yalnızca V57'nin AES-256-GCM şifreli R2 kopyası Google'a gider. Finans kayıtları Google'a açık metin gönderilmez.
- Yüklendikten sonra Drive'dan tekrar indirilip SHA-256 ile doğrulanır. Aynı gün aynı içerik ikinci kez yüklenmez; farklı içerik üzerine yazılmaz.
- Son 7 kopya korunarak, 30 günden eski V58 uygulama kopyaları silinir. Başka Google Drive dosyalarına dokunulmaz.
- Günlük Türkiye saati 10.00 cron'unda önce R2 şifreli arşiv, sonra Google şifreli kopyası denenir.
- Bağlantıyı kaldırmak Google Drive'daki eski şifreli arşivleri silmez.
- Uygulama canlı veritabanına otomatik restore uygulamaz. Ayrı test D1 kurtarma provası gerekir.

## Google Cloud Console kurulumu (hesap sahibinin yapacağı kısım)
1. Google Cloud Console'da proje oluştur veya seç; Google Drive API'yi etkinleştir.
2. Google Auth Platform / consent screen ekranında uygulama adı, destek e-postası ve izinleri ayarla; sadece drive.appdata izni kullan.
3. OAuth Client ID türü: Web application.
4. Authorized redirect URI (birebir):
   https://hesaptakip.tolgamy.workers.dev/api/google-drive/callback
5. Cloudflare → Workers & Pages → hesaptakip → Settings → Variables and Secrets → Production alanına ekle:
   - GOOGLE_OAUTH_CLIENT_ID: Web OAuth Client ID
   - GOOGLE_OAUTH_CLIENT_SECRET: Secret türünde OAuth Client Secret
6. Mevcut BACKUP_BUCKET, BACKUP_ENCRYPTION_KEY, APP_PASSWORD, SESSION_SECRET ve DB bağlantısına dokunma.
7. HesapTakip uygulamasında yönetici + PIN ile Yedekleme → Google hesabını bağla → Google izni ver.
8. Önce Yedekleme → Şifreli yedek oluştur. Sonra Şimdi şifreli kopyala ve Kopyayı doğrula.
9. Google API bağlantısı hatası ve otomatik cron kayıtlarını da ayrıca kontrol et.

## Güvenlik ve sınırlar
- Google OAuth Client Secret, refresh token ve yedek şifreleme anahtarını sohbet, ekran görüntüsü veya GitHub dosyasına koyma.
- Google OAuth uygulaması Testing modundaysa refresh token süresine tabi olabilir. Sürekli otomatik yedekleme için Google'ın üretim/verification kurallarını uygula.
- BACKUP_ENCRYPTION_KEY kaybolursa eski R2 ve Google şifreli kopyaları çözülemez. Anahtarı güvenli, erişim kontrollü bir kasa içinde ayrıca sakla.
- V57'nin 8 MiB toplam JSON ve tablo başına 20.000 satır sınırları aynen geçerlidir.
- Yeni D1 yazımları yalnızca Google bağlantı yetkisi ve yedek geçmişi içindir. Banka, kasa, POS, kart ve firma tabloları değiştirilmez.

## Kabul koşulları
- [x] OAuth PKCE, şifreli refresh token, R2'dan Google appDataFolder'a aktarım ve geri okuma kodu
- [x] Yönetici Yedekleme ekranı ile günlük cron entegrasyonu
- [ ] GitHub Actions testleri ve Wrangler dry-run doğrulansın
- [ ] Google Cloud OAuth bilgileri Cloudflare'a güvenli kaydedilsin
- [ ] Google hesabı yetkilendirmesi canlı ortamda tamamlanıp gerçek kopya doğrulansın
- [ ] Ayrı test D1'de geri yükleme provası yapılsın
