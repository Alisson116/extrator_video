const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cors = require('cors');

// Configurações iniciais
puppeteer.use(StealthPlugin());
const app = express();
const PORT = process.env.PORT || 3000;

// ScraperAPI (se quiser, defina como variável de ambiente ou direto no código)
const SCRAPER_API_KEY = process.env.SCRAPERAPI_KEY || "2b0361825a9734db5d03db150bb18454";
const SCRAPER_BASE = 'https://api.scraperapi.com';

app.use(cors());
app.use(express.json());

app.post('/extract', async (req, res) => {
  const { url, useScraper } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  let browser;
  try {
    const targetUrl = useScraper
      ? `${SCRAPER_BASE}?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}`
      : url;

    console.log(`[+] Extracting: ${targetUrl} (via ${useScraper ? 'ScraperAPI' : 'direct'})`);

    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    await new Promise(resolve => setTimeout(resolve, 5000)); // esperar carregamento JS

    // Tentativa 1: via função initializePlayer
    let extractedUrl = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const m = html.match(/initializePlayer\(\s*'([^']+\.mp4[^']*)'/);
      return m ? m[1] : null;
    });

    // Tentativa 2: via regex em tag script
    if (!extractedUrl) {
      extractedUrl = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent);
        for (const code of scripts) {
          const m = code.match(/https?:\/\/[^"' ]+\.(mp4|m3u8|webm)/i);
          if (m) return m[0];
        }
        return null;
      });
    }

    await browser.close();

    if (extractedUrl) {
      console.log('[✓] Video encontrado:', extractedUrl);
      return res.json({ videoUrl: extractedUrl });
    } else {
      console.log('[x] Nenhum vídeo encontrado.');
      return res.status(404).json({ error: 'Video not found – complex protection' });
    }
  } catch (err) {
    if (browser) await browser.close();
    console.error('[!] Erro na extração:', err.message);
    return res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
