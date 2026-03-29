# OCI ARM A1 Instance - Instrukcja konfiguracji

Dokument opisuje pełny proces konfiguracji automatycznego tworzenia instancji
Oracle Cloud A1.Flex (4 OCPU / 24 GB ARM) przez GitHub Actions.

---

## Kontekst

Oracle Cloud Free Tier oferuje instancję ARM A1.Flex (4 OCPU / 24 GB RAM) za darmo,
ale z powodu dużego popytu zasoby są stale niedostępne ("Out of host capacity").
Ten skrypt odpytuje OCI API co 5 minut i tworzy instancję gdy tylko pojawi się pojemność.

**Konto:** HauserKaspar
**Region:** eu-frankfurt-1 (Germany Central Frankfurt)
**VCN:** kazanea
**Public Subnet:** kazanea

---

## Zasoby OCI

| Zasób | OCID |
|-------|------|
| VCN | ocid1.vcn.oc1.eu-frankfurt-1.amaaaaaa4ayom6iampeksdies2ahdfuo4g32zalpzmzsedo2qckdze5gdthq |
| Subnet | ocid1.subnet.oc1.eu-frankfurt-1.aaaaaaaabmuac4ctr334yvplf5b7b43lktxdoip7rpiqer4se4xa267ina4a |
| Image (Ubuntu 22.04 ARM) | ocid1.image.oc1.eu-frankfurt-1.aaaaaaaawb3dyitnr4npe2uiaf2ftisngvy3enndj7aq3hbdqu5ishgjrnxa |

**Availability Domains Frankfurt:**
- siuQ:EU-FRANKFURT-1-AD-1
- siuQ:EU-FRANKFURT-1-AD-2
- siuQ:EU-FRANKFURT-1-AD-3

---

## Klucze i dostępy

**SSH key** (do połączenia z instancją): `~/.ssh/ssh-key-2026-03-28.key`

**OCI API key** (do autoryzacji API):
- Prywatny: `~/.ssh/oci_rsa.pem` (format RSA PKCS#1)
- Fingerprint w OCI: `61:e4:56:44:02:96:39:b2:c1:27:06:50:7c:e2:4a:7f`

---

## GitHub Secrets (repozytorium HauserKaspar/oci-arm-host-capacity)

Wszystkie sekrety ustawiane przez `gh` CLI z `echo -n` (bez trailing newline):

```bash
echo -n "WARTOŚĆ" | gh secret set NAZWA --repo HauserKaspar/oci-arm-host-capacity
```

| Secret | Wartość/Źródło |
|--------|----------------|
| OCI_REGION | `eu-frankfurt-1` |
| OCI_USER_ID | OCID użytkownika (OCI → My Profile) |
| OCI_TENANCY_ID | OCID tenancy (OCI → Governance → Tenancy details) |
| OCI_KEY_FINGERPRINT | `61:e4:56:44:02:96:39:b2:c1:27:06:50:7c:e2:4a:7f` |
| OCI_PRIVATE_KEY_B64 | `base64 -w 0 ~/.ssh/oci_rsa.pem` → plik przez `gh` |
| OCI_SUBNET_ID | OCID subnetu kazanea |
| OCI_IMAGE_ID | OCID Ubuntu 22.04 ARM |
| OCI_SSH_PUBLIC_KEY | Zawartość `~/.ssh/ssh-key-2026-03-28.key.pub` |

**Ustawienie klucza prywatnego (WAŻNE — musi być przez plik):**
```bash
base64 -w 0 ~/.ssh/oci_rsa.pem > /tmp/oci_key_b64.txt
gh secret set OCI_PRIVATE_KEY_B64 --repo HauserKaspar/oci-arm-host-capacity < /tmp/oci_key_b64.txt
```

---

## Workflow

Plik: `.github/workflows/create-instance.yml`

- Uruchamia się co 5 minut (cron)
- Próbuje wszystkie 3 Availability Domains równolegle
- `continue-on-error: true` — jeden AD nie zatrzymuje pozostałych
- Przy sukcesie: instancja zostaje stworzona w OCI

**Ręczne uruchomienie:** GitHub → Actions → Create OCI A1 Instance → Run workflow

---

## Gotowe odpowiedzi skryptu

| Komunikat | Znaczenie |
|-----------|-----------|
| `Out of host capacity` | Brak zasobów — normalne, czekamy |
| `RSA key ok` + brak błędu auth | Konfiguracja poprawna |
| `NotAuthenticated: Failed to verify the HTTP(S) Signature` | Zły klucz prywatny lub fingerprint |
| `NotAuthenticated: The required information...` | Zły User OCID, Tenancy OCID lub region |
| `SignerValidateException: URL is invalid` | Trailing newline/spacja w OCI_REGION |

---

## Typowe pułapki (nauczone na błędach)

### 1. Format klucza prywatnego
OCI generuje klucze PKCS#8 (`-----BEGIN PRIVATE KEY-----`).
Biblioteka PHP potrzebuje PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`).

**Konwersja:**
```bash
openssl pkey -in oci_original.pem -traditional -out oci_rsa.pem
```

### 2. Dodatkowy tekst w pobranym PEM
Oracle dołącza tekst `OCI_API_KEY` na końcu pliku.

**Usunięcie:**
```bash
head -n -1 oci_original.pem > oci_clean.pem
```

### 3. Przekazywanie klucza przez GitHub Secrets
Web UI GitHub dodaje `\r\n` zamiast `\n` przy wklejaniu — niszczy PEM.

**Rozwiązanie:** Base64 + `gh` CLI bezpośrednio z pliku (patrz wyżej).

### 4. Trailing newlines w sekretach
`gh secret set` z interaktywnym wpisywaniem dodaje `\n` na końcu.

**Rozwiązanie:** Zawsze używaj `echo -n "wartość" | gh secret set ...`

### 5. Fingerprint — sposób obliczania
OCI oblicza fingerprint z **DER-encoded** klucza publicznego (nie PEM).

**Poprawne obliczenie:**
```bash
openssl rsa -in oci_rsa.pem -pubout -outform DER | openssl md5 -c
```

Ale najłatwiej: odczytaj fingerprint bezpośrednio z OCI Console po uploadzie klucza.

### 6. Fingerprint po "Paste a public key" w OCI
OCI pokaże fingerprint po kliknięciu Add — użyj TEGO, nie obliczonego lokalnie.

### 7. YAML syntax w GitHub Actions
Edytowanie pliku workflow przez web UI może dodawać niewidoczne znaki.

**Rozwiązanie:** Zawsze edytuj lokalnie i pushuj przez git.

### 8. GitHub token scopes
Token PAT musi mieć scope: `repo` + `workflow` + `read:org` (dla `gh` CLI).

---

## Sprawdzenie działania

```bash
# Weryfikacja klucza RSA
openssl rsa -in ~/.ssh/oci_rsa.pem -check -noout

# Weryfikacja fingerprint
openssl rsa -in ~/.ssh/oci_rsa.pem -pubout -outform DER | openssl md5 -c

# Lista sekretów w repo
gh secret list --repo HauserKaspar/oci-arm-host-capacity
```

---

## Co zrobić gdy instancja zostanie stworzona

1. Sprawdź OCI Console → Compute → Instances
2. Skopiuj publiczny IP instancji
3. Połącz przez SSH:
   ```bash
   ssh -i ~/.ssh/ssh-key-2026-03-28.key ubuntu@IP_INSTANCJI
   ```
4. Wyłącz workflow (żeby nie tworzyć kolejnych instancji):
   GitHub → Actions → Create OCI A1 Instance → ... → Disable workflow
