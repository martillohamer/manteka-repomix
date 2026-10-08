---
title: "Komut Satırı Seçenekleri"
description: "Girdi, çıktı, dosya seçimi, uzak depolar, yapılandırma, güvenlik, token sayımı, MCP ve agent skills için tüm Repomix CLI seçeneklerine başvurun."
---

# Komut Satırı Seçenekleri

## Temel Seçenekler
- `-v, --version`: Sürüm bilgisini göster ve çık

## CLI Giriş/Çıkış Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `--verbose` | Ayrıntılı hata ayıklama günlüğünü etkinleştir (dosya işleme, token sayısı ve yapılandırma ayrıntılarını gösterir) |
| `--quiet` | Hatalar dışında tüm konsol çıktısını bastır (betik yazımı için kullanışlıdır) |
| `--stdout` | Paketlenmiş çıktıyı dosya yerine doğrudan stdout'a yaz (tüm günlük kaydını bastırır) |
| `--stdin` | Stdin'den dosya yollarını satır satır oku (belirtilen dosyalar doğrudan işlenir) |
| `--copy` | İşlemden sonra oluşturulan çıktıyı sistem panosuna kopyala |
| `--token-count-tree [threshold]` | Token sayısıyla dosya ağacını göster; isteğe bağlı eşik yalnızca ≥N token içeren dosyaları gösterir (örn. `--token-count-tree 100`) |
| `--top-files-len <number>` | Özette gösterilecek en büyük dosya sayısı (varsayılan: `5`) |

## Repomix Çıktı Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `-o, --output <file>` | Çıktı dosyası yolu (varsayılan: `repomix-output.xml`, stdout için `"-"` kullanın) |
| `--style <style>` | Çıktı formatı: `xml`, `markdown`, `json` veya `plain` (varsayılan: `xml`) |
| `--output-file-path-style <style>` | Çıktıda dosya yollarının gösterilme biçimi: `target-relative` veya `cwd-relative` (varsayılan: `target-relative`) |
| `--parsable-style` | Geçerli XML/Markdown sağlamak için özel karakterleri kaçış karakteriyle işle (çıktı biçimlendirmeyi bozan kod içerdiğinde gereklidir) |
| `--compress` | Tree-sitter ayrıştırmasını kullanarak temel kod yapısını (sınıflar, fonksiyonlar, arayüzler) çıkar |
| `--output-show-line-numbers` | Çıktıda her satırın önüne satır numarası ekle |
| `--no-file-summary` | Çıktıdan dosya özeti bölümünü çıkar |
| `--no-directory-structure` | Çıktıdan dizin ağacı görselleştirmesini çıkar |
| `--no-files` | Dosya içerikleri olmadan yalnızca meta veri oluştur (depo analizi için kullanışlıdır) |
| `--remove-comments` | Paketlemeden önce tüm kod yorumlarını kaldır |
| `--remove-empty-lines` | Tüm dosyalardan boş satırları kaldır |
| `--truncate-base64` | Çıktı boyutunu azaltmak için uzun base64 veri dizelerini kırp |
| `--header-text <text>` | Çıktının başına eklenecek özel metin |
| `--instruction-file-path <path>` | Çıktıya dahil edilecek özel talimatları içeren dosyanın yolu |
| `--split-output <size>` | Çıktıyı numaralı birden fazla dosyaya böl (örn. `repomix-output.1.xml`); `500kb`, `2mb` veya `1.5mb` gibi boyut değerleri |
| `--include-empty-directories` | Dizin yapısına dosyasız klasörleri dahil et |
| `--include-full-directory-structure` | `--include` kalıpları kullanılırken bile Dizin Yapısı bölümünde tüm depo ağacını göster |
| `--no-git-sort-by-changes` | Dosyaları git değişiklik sıklığına göre sıralama (varsayılan: en çok değiştirilen dosyalar önce) |
| `--include-diffs` | Çalışma ağacı ve aşamalı değişiklikleri gösteren git fark bölümü ekle |
| `--include-logs` | Mesajlar ve değiştirilen dosyalarla git commit geçmişi ekle |
| `--include-logs-count <count>` | `--include-logs` ile dahil edilecek son commit sayısı (varsayılan: `50`) |

## Dosya Seçim Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `--include <patterns>` | Yalnızca bu glob kalıplarıyla eşleşen dosyaları dahil et (virgülle ayrılmış, örn. `"src/**/*.js,*.md"`) |
| `-i, --ignore <patterns>` | Hariç tutulacak ek kalıplar (virgülle ayrılmış, örn. `"*.test.js,docs/**"`) |
| `--no-gitignore` | Dosyaları filtrelerken `.gitignore` kurallarını kullanma |
| `--no-dot-ignore` | Dosyaları filtrelerken `.ignore` kurallarını kullanma |
| `--no-default-patterns` | Yerleşik yoksayma kalıplarını uygulama (`node_modules`, `.git`, derleme dizinleri vb.) |

## Uzak Depo Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `--remote <url>` | Uzak bir depoyu klonla ve paketle (GitHub URL'si veya `kullanıcı/depo` formatı) |
| `--remote-branch <name>` | Kullanılacak belirli dal, etiket veya commit (varsayılan: deponun varsayılan dalı) |
| `--remote-trust-config` | Uzak depolardan yapılandırma dosyalarına güven ve yükle. Güvenilen bir yapılandırma komut çalıştırabilir ve yerel dosyaları okuyabilir, bu yüzden bu seçeneği yalnızca tamamen güvendiğiniz depolar için kullanın (güvenlik için varsayılan olarak devre dışı). Etkileşimli bir terminalde yapılandırma gösterilir ve onay istenir |

## Yapılandırma Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `-c, --config <path>` | `repomix.config.json` yerine özel yapılandırma dosyası kullan |
| `--init` | Varsayılan ayarlarla yeni bir `repomix.config.json` dosyası oluştur |
| `--global` | `--init` ile birlikte, yapılandırmayı geçerli dizin yerine home dizininde oluştur |

## Güvenlik Seçenekleri
- `--no-security-check`: API anahtarları ve parolalar gibi hassas verilerin taranmasını atla (dikkatli kullanın; çıktıda gizli bilgiler açığa çıkabilir)

## Token Sayımı Seçenekleri
- `--token-count-encoding <encoding>`: Sayım için tokenleştirici model: o200k_base (GPT-4o), cl100k_base (GPT-3.5/4) vb. (varsayılan: o200k_base)
- `--token-budget <number>`: Paketlenmiş çıktı N tokeni aştığında sıfır olmayan bir çıkış koduyla başarısız ol. Çıktıyı hedef modelin bağlam penceresi içinde tutmak için CI işlem hatlarında ve ajan iş akışlarında bir koruma olarak kullanışlıdır. Çıktı yine de oluşturulur; taşmayı yalnızca çıkış kodu bildirir.

## MCP Seçenekleri
- `--mcp`: AI araç entegrasyonu için Model Context Protocol sunucusu olarak çalıştır
- `--sandbox [dir]`: (`--mcp` ile birlikte) MCP sunucusunun dosya araçlarını bir çalışma alanı dizinine sınırla (varsayılan olarak çalışma dizini; örn. `--sandbox path/to/project`). Her yol bu köke görelidir, mutlak/ana makine yolları reddedilir ve uzak paketleme, beceri oluşturma ile harici çıktıları ekleme devre dışı bırakılır. Bkz. [MCP Sunucusu](/tr/guide/mcp-server).

## Ajan Becerileri Oluşturma Seçenekleri

| Seçenek | Açıklama |
|---------|----------|
| `--skill-generate [name]` | Claude Agent Skills formatında çıktıyı `.claude/skills/<name>/` dizinine oluştur (ad belirtilmezse otomatik oluşturulur) |
| `--skill-project-name <name>` | Oluşturulan Skills açıklamalarında kullanılan proje adını geçersiz kıl |
| `--skill-output <path>` | Beceri çıktı dizin yolunu doğrudan belirt (konum istemini atlar) |
| `-f, --force` | Tüm onay istemlerini atla (beceri dizini üzerine yazma, uzak yapılandırma güveni) |

## İzleme Modu Seçenekleri

- `-w, --watch`: Dosya değişikliklerini izler ve otomatik olarak yeniden paketler. Yeni, değiştirilmiş ve silinmiş dosyalar algılanır, hızlı değişiklikler debounce edilir (300 ms) ve her yeniden oluşturmadan sonra bir zaman damgası yazdırılır. Durdurmak için `Ctrl+C` tuşlarına basın.

İzleme modu yalnızca yerel dizinlerle çalışır, bu nedenle `--remote`, konumsal argüman olarak verilen uzak depo URL'si, `--stdout`, `--stdin`, `--split-output`, `--skill-generate` veya `--copy` ile birlikte kullanılamaz. Bu kısıtlamalar, seçenek ister komut satırında ister yapılandırma dosyanızda ayarlanmış olsun geçerlidir.

## Termodinamik ve Evrim Komutları

Repomix, deponuzun Git geçmişini okuyup kodun nerede zorlandığını raporlayan iki analiz komutuyla gelir. Bunlar çalışma ağacınız karşısında salt okunurdur: `heat` hiçbir şey yazmaz, `evolve` ise tüm işini geçici dizininiz altındaki tek kullanımlık Git worktree'lerde yapar; böylece dallarınız, HEAD'iniz ve commit edilmemiş işiniz dokunulmadan kalır.

### heat

Dosya başına "sıcaklığı" commit hareketliliği, yazar sayısı, dosya boyutu ve siklomatik yoğunluk üzerinden ölçer, ardından eşik değerine ulaşan ya da aşan dosyaları *kaynıyor* olarak listeler.

```bash
# Analyse the last 90 days of history
repomix heat .

# Widen the window and the report size
repomix heat . --days 365 --limit 50

# Machine-readable output
repomix heat . --json
```

| Seçenek | Varsayılan | Açıklama |
| --- | --- | --- |
| `--days <n>` | `90` | Analiz edilecek Git geçmişinin gün sayısı |
| `--max-commits <n>` | `500` | Analiz edilecek en fazla commit sayısı |
| `--t-max <n>` | `80` | Kaynayan dosyalar için sıcaklık eşiği |
| `--limit <n>` | `20` | Tabloda listelenecek dosya sayısı |
| `--json` | off | Tablo yerine ham raporu üret |
| `--no-fail` | off | Kaynayan dosyalar tespit edilse bile `0` ile çık |
| `--report` | off | `thermodynamic-report.json` dosyasını `.manteka-memory/` altına yaz |

### evolve

Deponuzu geçici mutantlara dallandırır, kaynayan dosyalarda mutasyon uygular ve mutantları Biyolojik Fitness Endeksi'ne göre sıralar. Her mutant kendi ayrılmış (detached) Git worktree'sinde değerlendirilir, bu yüzden deponuz hiçbir zaman değiştirilmez.

```bash
# Explore five mutants from the current HEAD
repomix evolve .

# Restrict to one operator and two files
repomix evolve . --operator dead-guard --target src/legacy.ts

# Include the project's own test suite in the score
repomix evolve . --run-tests
```

| Seçenek | Varsayılan | Açıklama |
| --- | --- | --- |
| `--population <n>` | `5` | Değerlendirilecek en fazla mutant sayısı |
| `--operator <name>` | üçü de | Tek bir operatörle sınırla; tekrarlanabilir |
| `--target <path>` | kaynayan dosyalar | Belirli dosyalarla sınırla; tekrarlanabilir |
| `--concurrency <n>` | `2` | Paralel olarak değerlendirilen mutant sayısı |
| `--run-tests` | off | Fitness indeksine test eksenini dahil et |
| `--test-timeout <ms>` | `300000` | Mutant başına test suite zaman aşımı |
| `--json` | off | Tablo yerine ham raporu üret |
| `--report` | off | `evolution-report.json` dosyasını `.manteka-memory/` altına yaz |

`--target` kapsamı genişletmez, daraltır: hedefler kaynayan dosya kümesiyle kesiştirilir, bu yüzden kaynamayan bir dosyayı adlandırmak o dosya için hiçbir mutant üretmez.

**Sıralamanın anlamı.** Üç mutasyon operatörünün de kod eklemesi, sıcaklığı bir miktar yükseltir. Bu yüzden her mutant, değiştirilmemiş temel çizgiden bir tık daha kötü puan alır ve sıralama **en az zararlıdan başlayarak** anlamına gelir, en iyi iyileşmeden değil. Soğutma operatörleri sonraki bir sürümde gelene kadar tabloyu bu şekilde yorumlayın.

::: warning Test suite'inizi çalıştırmak
`--run-tests`, kendi `test` betiğinizi mutant başına bir kez, mutasyona uğramış kaynak üzerinde çalıştırır. Bu, değiştirilmiş girdiye karşı keyfi proje kodu çalıştırmak demektir. Çalıştırmayı gerçekten amaçlamıyorsanız kapalı bırakın ve yavaş olacağını bilin.
:::

## İlgili Kaynaklar

- [Yapılandırma](/tr/guide/configuration) - CLI bayrakları yerine yapılandırma dosyasında seçenekleri ayarlayın
- [Çıktı Formatları](/tr/guide/output) - XML, Markdown, JSON ve düz metin formatlarının ayrıntıları
- [Kod Sıkıştırma](/tr/guide/code-compress) - `--compress` seçeneğinin Tree-sitter ile nasıl çalıştığı
- [Güvenlik](/tr/guide/security) - `--no-security-check` seçeneğinin devre dışı bıraktıkları

## Örnekler

```bash
# Basic usage
repomix

# Custom output file and format
repomix -o my-output.md --style markdown
repomix -o my-output.json --style json

# Output to stdout
repomix --stdout > custom-output.txt

# Send output to stdout, then pipe into another command (for example, simonw/llm)
repomix --stdout | llm "Please explain what this code does."

# Custom output with compression
repomix --compress

# Split output into multiple files (max size per part)
repomix --split-output 20mb

# Process specific files with patterns
repomix --include "src/**/*.ts,*.md" --ignore "*.test.js,docs/**"

# Remote repository with branch
repomix --remote https://github.com/user/repo/tree/main

# Remote repository with commit
repomix --remote https://github.com/user/repo/commit/836abcd7335137228ad77feb28655d85712680f1

# Remote repository with shorthand
repomix --remote user/repo

# Remote repository with shorthand (auto-detected, no --remote needed)
repomix user/repo

# Using stdin for file list
find src -name "*.ts" -type f | repomix --stdin
git ls-files "*.js" | repomix --stdin
echo -e "src/index.ts\nsrc/utils.ts" | repomix --stdin

# Git integration
repomix --include-diffs  # Include git diffs for uncommitted changes
repomix --include-logs   # Include git logs (last 50 commits by default)
repomix --include-logs --include-logs-count 10  # Include last 10 commits
repomix --include-diffs --include-logs  # Include both diffs and logs

# Token count analysis
repomix --token-count-tree
repomix --token-count-tree 1000  # Only show files/directories with 1000+ tokens

# İzleme modu: dosyalar değiştiğinde otomatik olarak yeniden paketle
repomix --watch
repomix -w --include "src/**/*.ts"
```
