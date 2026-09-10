// ============================================================
// Jagashilp — static SEO page generator (for GitHub Pages)
//
// GitHub Pages sirf static files serve karta hai — koi server nahi,
// isliye Google ko har product ka apna, crawlable page dene ke liye
// ye script Supabase se products fetch karke /product/<slug>/index.html
// (poora static HTML, proper <title>/meta/JSON-LD ke saath) + sitemap.xml
// khud generate kar deti hai. GitHub Actions workflow ise roz chalata
// hai — matlab admin panel se naya product add karne ke ~24 ghante
// baad (ya workflow manually run karke turant) uska SEO page apne aap
// ban jaata hai, koi manual kaam nahi.
//
// Run locally: node scripts/generate-seo.mjs
// ============================================================

import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://eyokoflhamibueoxbqwx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcybQttvdd_6ghB3PW2PKQ_zkLCzwyQ';
const SITE_URL = 'https://jagashilp.in';
const REPO_ROOT = process.cwd();

async function sbFetch(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed (${res.status}): ${query}`);
  return res.json();
}

function slugify(text) {
  return String(text || 'product')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'product';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function productPageHtml(p, pageUrl) {
  const desc = (p.description || `${p.name} — handmade personalised gift from Jagashilp.`).slice(0, 160);
  const mrp = p.mrp && p.mrp > p.price ? p.mrp : null;
  const offPct = mrp ? Math.round((1 - p.price / mrp) * 100) : 0;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    image: p.image_url ? [p.image_url] : [],
    description: p.description || p.name,
    sku: p.id,
    brand: { '@type': 'Brand', name: 'Jagashilp' },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/?p=${p.id}`,
      priceCurrency: 'INR',
      price: p.price,
      availability: 'https://schema.org/InStock',
    },
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(p.name)} — Buy Online | Jagashilp</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${pageUrl}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Jagashilp">
<meta property="og:title" content="${escapeHtml(p.name)} | Jagashilp">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${pageUrl}">
${p.image_url ? `<meta property="og:image" content="${escapeHtml(p.image_url)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<style>
  body{font-family:-apple-system,'Plus Jakarta Sans',sans-serif; max-width:480px; margin:0 auto; padding:32px 20px 60px; color:#171313; background:#FFFBF9;}
  .top{font-weight:800; font-size:18px; margin-bottom:24px;}
  .top span{color:#E60023;}
  img{width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:20px; margin-bottom:18px; background:#F3ECEA;}
  h1{font-size:21px; margin:0 0 8px;}
  .desc{color:#544C4A; font-size:14px; line-height:1.5; margin-bottom:16px;}
  .price{font-size:24px; font-weight:800; margin:14px 0;}
  .mrp{color:#A69C99; text-decoration:line-through; font-size:15px; font-weight:600; margin-left:8px;}
  .off{color:#0AA36B; font-size:13px; font-weight:700; margin-left:6px;}
  a.btn{display:block; text-align:center; background:#E60023; color:#fff; padding:15px; border-radius:16px; font-weight:700; text-decoration:none; font-size:15px;}
</style>
</head>
<body>
  <div class="top">Jaga<span>shilp</span></div>
  ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">` : ''}
  <h1>${escapeHtml(p.name)}</h1>
  <p class="desc">${escapeHtml(p.description || 'Handmade, hand-painted personalised gift from Jagashilp.')}</p>
  <div class="price">₹${p.price}${mrp ? `<span class="mrp">₹${mrp}</span><span class="off">${offPct}% OFF</span>` : ''}</div>
  <a class="btn" href="${SITE_URL}/?p=${p.id}">Buy on Jagashilp →</a>
</body>
</html>`;
}

async function main() {
  console.log('Fetching products + main categories from Supabase...');
  const [products, categories] = await Promise.all([
    sbFetch('products?select=id,name,price,mrp,image_url,description,category&active=eq.true&order=sort_order'),
    sbFetch('main_categories?select=type,label&active=eq.true&order=sort_order').catch(() => []),
  ]);
  console.log(`Found ${products.length} active products.`);

  const productDir = path.join(REPO_ROOT, 'product');
  fs.rmSync(productDir, { recursive: true, force: true });
  fs.mkdirSync(productDir, { recursive: true });

  const usedSlugs = new Set();
  const urls = [`${SITE_URL}/`];

  for (const p of products) {
    let slug = `${slugify(p.name)}-${p.id.slice(0, 8)}`;
    while (usedSlugs.has(slug)) slug += '-x'; // theoretical collision guard
    usedSlugs.add(slug);

    const dir = path.join(productDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    const pageUrl = `${SITE_URL}/product/${slug}/`;
    fs.writeFileSync(path.join(dir, 'index.html'), productPageHtml(p, pageUrl));
    urls.push(pageUrl);
  }

  // Category filter URLs (?type=<category>) also worth listing so Google can
  // discover category-filtered views, even though they share the homepage file.
  categories.forEach((c) => urls.push(`${SITE_URL}/?type=${encodeURIComponent(c.type)}`));

  // Static policy pages already exist as folders in the repo.
  ['privacy-policy', 'terms-and-conditions', 'refund-and-cancellation', 'shipping-policy', 'contact-us'].forEach((slug) => {
    if (fs.existsSync(path.join(REPO_ROOT, slug, 'index.html'))) urls.push(`${SITE_URL}/${slug}/`);
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(REPO_ROOT, 'sitemap.xml'), sitemap);

  console.log(`Done — generated ${products.length} product pages + sitemap.xml (${urls.length} URLs).`);
}

main().catch((err) => {
  console.error('SEO generation failed:', err);
  process.exit(1);
});
