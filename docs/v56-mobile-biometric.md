# V56 — Mobil biyometrik kilit açma (inceleme dalı)

## Kullanıcı kararı
- **Masaüstünde Windows Hello yok.** V55'teki mevcut 6 haneli PIN tek kilit açma seçeneği.
- iPhone/iPad: cihaz destekliyorsa Face ID / Touch ID; Android: cihaz destekliyorsa parmak izi / telefon güvenlik doğrulaması.
- Mobil biyometri PIN yerine **isteğe bağlı kilit açma yöntemi**; telefonun kendi güvenlik ekranı bazen biyometri yerine cihaz PIN/parolasını gösterebilir. Uygulama biyometrik veri görmez.
- Hesaba ilk giriş, kullanıcı onayı ve yönetici yetkileri aynen korunur.

## Kurulum ve akış
1. Telefonda normal hesap girişi yap, V55 PIN ile ekranı aç.
2. Ayarlar > **Telefon biyometrik kilidi** > **Bu telefonu tanıt**. Cihaz doğrulamasını tamamla.
3. Bir sonraki kilitte "Face ID / parmak izi ile aç" düğmesini kullan; PIN formu her zaman kalır.
4. Telefon kaybolursa başka güvenilir oturumda Ayarlar > **Tüm telefonları kaldır**, ardından istenirse PIN'i değiştir. Uzun hesap şifresiyle **PIN sıfırlama** bütün biyometrik anahtarları da iptal eder.
5. Telefon desteği yoksa kayıt ve açma düğmeleri görünmez; masaüstünde biyometri görünmez.

## Güvenlik
- Sunucuda WebAuthn challenge, origin, RP ID, kullanıcı doğrulama (UV), kayıtlı public key ile dijital imza ve sayaç kontrolü.
- Challenge oturuma/hesaba bağlıdır, 2 dakikada zaman aşımı olur ve **tek kullanımlıdır**.
- Kayıt için aktif PIN ile açılmış oturum zorunludur; yeni kullanıcı veya kimliği doğrulanmamış kişi yalnız biyometriyle oturum başlatamaz.
- Başarılı doğrulama yalnızca ilgili oturumun PIN kilidini kaldırır; mevcut finans uç noktalarındaki sunucu tarafı 423 kilidi korunur.
- D1'e yalnız public key, credential ID ve sayaç yazılır. Biyometrik görüntü, parmak izi, PIN veya tam kart verisi saklanmaz.
- 5 cihaz üst sınırı; kullanıcının tüm anahtarları iptal etme işlemi; kayıp cihazda PIN sıfırlama otomatik iptal.
- Cloudflare Workers 2026-10-01 compatibility date Node uyumu içeriyor; npm modülü \`@simplewebauthn/server\` 14.1.0.
- Login, kasa, banka, POS, firma ve hesaplama dosyalarına dokunulmadı.

## Test önkoşulu
- GitHub PR için \`npm install --no-audit --no-fund\`, \`npm test\`, \`npx wrangler deploy --dry-run\` geçmeli.
- iPhone Safari PWA, Android Chrome PWA; biyometri kayıt/açma; olmayan sensör; iptal edilen istem; yanlış challenge; 2 dk süre aşımı; başka kullanıcı hesabı; çalınmış imza; ikincil sekme; PIN sıfırlamada anahtar silinmesi; masaüstünde sadece PIN.
- En az iki gerçek cihazda manuel güvenlik ve kullanım testi yapılmadan \`main\` ile birleştirme veya Cloudflare'a yayınlama yapılmamalı.
- GitHub Actions'ın PR kontrolü Cloudflare'a yayınlamaz; production deploy sadece \`main\` push üzerinden yapılır.

## Dikkat
- V56 henüz yayınlanmadığı için \`public/version.json\` hâlâ V55'tir. Yayın sürümü ve eski sürüm test sabitleri, bütün testler ve cihaz QA sonrası aynı PR'da güncellenmeli.
- Mobil biyometri WebAuthn platform doğrulamasıdır; telefonun donanım türünü veya sadece yüz/parmak izi kullanımını mutlak garanti edemez.
