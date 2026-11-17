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
