# HesapTakip — aynı adres, ayrı kişisel veritabanları (v76)

## Tasarım
- Tek site: `hesaptakip.tolgamy.workers.dev`.
- Ana yönetici (`admin`): mevcut `DB` / `karttakip-db`. Mevcut finans kayıtları taşınmaz veya silinmez.
- Kişisel hesap: ayrı, boş Cloudflare **D1** veritabanı; yalnız atanmış `TENANT_DB_N` binding üzerinden erişilir.
- Kullanıcı kaydı/oturum, PIN ve biyometrik ana veritabanında; **kartlar, firmalar, faturalar, kasa/banka hesapları, ekstreler, ödemeler, şifre kasası, logolar, raporlar, hareket ve denetim geçmişi** kişisel D1 içinde.
- Aynı D1 farklı slotlarla veya ana `DB` olarak bağlanırsa `ht_data_space_guard` erişimi engeller.
- Oturum ve API çağrılarında slot istemciden alınmaz: yalnız imzalı hesap kimliği → merkezi `app_member_tenants` eşlemesi kullanılır.
- Slot atanmamış hesabın eski ortak veriyi okuması engellenir. Onaylı eski personel hesapları da yeni slot bağlanmadan giriş yapamaz.

## Yayın öncesi zorunlu Cloudflare adımları
1. Önce mevcut D1 veritabanınızın güncel yedeğini alın; veri kaybı veya yanlış bağlama durumunda geri dönebileceğinizden emin olun.
2. Cloudflare hesabınızda her yeni kullanıcı için **farklı D1 veritabanı** oluşturun. Örnek komut: `npx wrangler d1 create hesaptakip-kullanici-1`.
3. Cloudflare'ın döndürdüğü **gerçek** `database_id` bilgisini alın. `wrangler.jsonc` içindeki mevcut `DB` binding'ine **dokunmadan** `d1_databases` dizisine şuna benzer bir ek binding koyun:

```json
{
  "binding": "TENANT_DB_1",
  "database_name": "hesaptakip-kullanici-1",
  "database_id": "CLOUDFLARE_TARAFINDAN_OLUSTURULAN_GERCEK_ID"
}
```

4. 2. kişi için `TENANT_DB_2` ve **başka bir D1 veritabanı ID'si** kullanın. Kod `TENANT_DB_1`–`TENANT_DB_20` aralığındaki bağlı slotları tanır. **Aynı database_id asla tekrar kullanılmamalı.**
5. Önce `npm test` ve `npx wrangler deploy --dry-run` çalıştırın; sonra Cloudflare dağıtımını yapın. Gerekli secret'ları koda koymayın; mevcut Workers / GitHub Actions secret yapılandırmasını koruyun.
6. Yönetici hesabıyla giriş yapın. Yeni kullanıcı aynı adreste **kullanıcı başvurusu** oluşturur. **Kullanıcı Hesapları → Üye ve Yetki Yönetimi** bölümünde o kişinin `TENANT_DB_1` alanını seçin, ardından onaylayın.
7. Kişi kendi şifresiyle giriş yapar, kendi 6 haneli PIN'ini kurar ve **boş** kart/firma listelerini görür; kendi kayıtlarını ekler. Başka kullanıcının verilerini göremez.
8. Aynı anda iki farklı tarayıcı profili açıp ana yönetici ve iki kişisel hesabı kontrol edin. Biri firma/kart kaydı eklediğinde diğerinin listesi, raporu, API çıktısı ve şifre kasası değişmemelidir.

## Önemli güvenlik ve işletim kuralları
- Finans verilerinin ayrımı, uygulama içindeki filtrelemeye değil **fiziksel D1 bağlamına** dayanır.
- `DB` binding'ini kesinlikle başka bir kullanıcının veritabanına yönlendirmeyin.
- Atanan slot sonradan arayüzden değiştirilemez. Bir kullanıcıyı başka slota taşımak ayrı ve denetimli veri göçü gerektirir.
- Hesabı silmek merkezi giriş kaydını kaldırır, kişisel D1'i veya oradaki finans verilerini otomatik silmez.
- Yeni özel DB'nin ayrı veri yedeği gereklidir. Otomatik bulut yedekleme bu değişiklikte açılmaz.
- Bu sürümde her kullanıcıya tek özel veritabanı bağlanır; çok kişi için her seferinde D1 oluşturup Worker'a slot eklemek gerekir. Otomatik veritabanı oluşturma/provizyon veya ücretsiz plan kapasitesi garanti edilmez.
- Bu çalışma sunucu kodu + yönetim ekranıdır: **Cloudflare üzerinde yeni D1 henüz oluşturulmadan ya da bağlanmadan çalışır olarak yayınlanmamalıdır.**
