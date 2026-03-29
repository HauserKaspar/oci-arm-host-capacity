const { chromium } = require('playwright');

const FITSSEY_URL = 'https://app.fitssey.com/geniusprzystan/frontoffice#filters:2026-05-04,0';
const STOP_DATE = '2026-04-05';

async function main() {
  // Sprawdź datę stopu
  const today = new Date().toISOString().slice(0, 10);
  if (today > STOP_DATE) {
    console.log(`Past stop date (${STOP_DATE}), exiting.`);
    process.exit(0);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log('Otwieranie strony Fitssey...');
  await page.goto(FITSSEY_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  const content = await page.content();

  // Szukamy wskaźników że maj jest dostępny:
  // - elementy z datami maja (2026-05-XX lub "05/2026")
  // - przyciski rezerwacji
  // - brak komunikatu "brak zajęć"
  const indicators = [
    '2026-05',
    'may 2026',
    'maj 2026',
  ];

  // Pobierz widoczny tekst strony
  const visibleText = await page.evaluate(() => document.body.innerText.toLowerCase());

  // Sprawdź czy są elementy z zajęciami (przyciski, karty zajęć)
  const classElements = await page.$$('[class*="class"],[class*="event"],[class*="lesson"],[class*="booking"],[class*="schedule"]');

  const foundIndicator = indicators.some(i => visibleText.includes(i.toLowerCase()));
  const hasClassElements = classElements.length > 0;

  console.log(`Wskaźniki tekstowe: ${foundIndicator}`);
  console.log(`Elementy zajęć: ${hasClassElements} (${classElements.length} elementów)`);
  console.log(`Fragment tekstu strony:\n${visibleText.slice(0, 500)}`);

  await browser.close();

  if (foundIndicator) {
    console.log('\n✅ ZNALEZIONO MAJ 2026 — tworzę issue na GitHubie!');
    await createGithubIssue();
    await sendNtfy('🎉 Fitssey: Maj 2026 dostępny!', 'Otwórz aplikację i zapisz się na zajęcia.');
  } else {
    console.log('\n⏳ Maj 2026 jeszcze niedostępny.');
  }
}

async function createGithubIssue() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github+json',
    },
    body: JSON.stringify({
      title: '🎉 Fitssey: Kalendarz maj 2026 jest dostępny!',
      body: `Wykryto dostępność kalendarza na maj 2026 na stronie Fitssey.\n\n🔗 ${FITSSEY_URL}\n\n_Sprawdź i zapisz się na zajęcia!_`,
    }),
  });

  if (res.ok) {
    const issue = await res.json();
    console.log(`Issue utworzony: ${issue.html_url}`);
  } else {
    console.error('Błąd tworzenia issue:', await res.text());
  }
}

async function sendNtfy(title, message) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers: { 'Title': title, 'Priority': 'urgent', 'Tags': 'tada' },
    body: message,
  });
  console.log('Ntfy wysłane.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
