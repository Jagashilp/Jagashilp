// ============================================================
// Jagashilp — static SEO generator (GitHub Pages)
//
// Supabase se products + categories fetch karke ye files banata hai:
//   /category/<slug>/index.html   -> har category ka apna crawlable page (Keychain, Mug...)
//   /product/<slug>/index.html    -> har product ka apna page (schema.org Product)
//   /sitemap.xml                  -> sab pages
//   /google-merchant-feed.xml     -> Google Merchant Center (Shopping) feed
//   /index.html                   -> sirf SEO-CATEGORY-NAV markers ke beech ke category links
//
// Run locally: node scripts/generate-seo.mjs
// GitHub Actions roz raat chalata hai (.github/workflows/generate-seo.yml).
// ============================================================

import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://eyokoflhamibueoxbqwx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FcybQttvdd_6ghB3PW2PKQ_zkLCzwyQ';
const SITE_URL = 'https://jagashilp.in';
const BRAND = 'Jagashilp';
const REPO_ROOT = process.cwd();

// Google Shopping category (https://www.google.com/basepages/producttype/taxonomy.en-US.txt).
// Naya category add karo to yahan uska match daal sakte ho; na ho to field feed me nahi jaata.
const GOOGLE_CATEGORY = {
  'keychain': 'Apparel & Accessories > Handbag & Wallet Accessories > Keychains',
  'mug': 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs',
  'fridge magnet': 'Home & Garden > Decor > Refrigerator Magnets',
  't-shirt': 'Apparel & Accessories > Clothing > Shirts & Tops',
  'tote bag': 'Apparel & Accessories > Handbags, Wallets & Cases > Handbags',
};
const APPAREL = new Set(['t-shirt']);

async function sbFetch(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed (${res.status}): ${query}`);
  return res.json();
}

const slugify = (text, fallback = 'item') =>
  String(text || fallback).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;

const esc = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trunc = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

const inr = (n) => `${Number(n).toFixed(2)} INR`;
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const POLICY_LINKS = [
  ['privacy-policy', 'Privacy Policy'],
  ['terms-and-conditions', 'Terms & Conditions'],
  ['refund-policy', 'Refund & Cancellation'],
  ['shipping-policy', 'Shipping Policy'],
  ['contact-us', 'Contact Us'],
];

const CSS = `
  *{box-sizing:border-box}
  body{font-family:-apple-system,'Plus Jakarta Sans',Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px 16px 48px;color:#211922;background:#fff}
  a{color:#E60023;text-decoration:none}
  .top{display:flex;align-items:center;justify-content:space-between;font-weight:800;font-size:18px;margin-bottom:12px}
  .top a{color:#211922}.top span{color:#E60023}
  .crumbs{font-size:12.5px;color:#6b6168;margin-bottom:18px}
  h1{font-size:24px;margin:0 0 8px}
  .lead{color:#544C4A;font-size:14.5px;line-height:1.6;margin:0 0 20px}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .card{display:block;color:#211922;border:1px solid #eee;border-radius:14px;overflow:hidden}
  .card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#F3ECEA;display:block}
  .card .b{padding:10px 12px}.card .n{font-size:13.5px;font-weight:600;line-height:1.3;margin-bottom:4px}
  .price{font-weight:800}.mrp{color:#A69C99;text-decoration:line-through;font-size:12.5px;margin-left:6px}
  .btn{display:block;text-align:center;background:#E60023;color:#fff;padding:14px;border-radius:12px;font-weight:700;margin-top:22px}
  .pimg{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:16px;background:#F3ECEA;margin-bottom:14px}
  .cats,.pol{font-size:13px;line-height:2;margin-top:26px;padding-top:14px;border-top:1px solid #eee}
  .cats a,.pol a{margin-right:14px;white-space:nowrap;display:inline-block}
  .pol a{color:#6b6168}
`;

function shell({ title, description, canonical, ogType = 'website', image, schemas, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${schemas.map(jsonLd).join('\n')}
<style>${CSS}</style>
</head>
<body>
  <div class="top"><a href="${SITE_URL}/">Jaga<span>shilp</span></a><a href="${SITE_URL}/" style="font-size:13px;font-weight:700;color:#E60023">Visit shop →</a></div>
${body}
</body>
</html>`;
}

function footerHtml(categories, activeSlug) {
  const cats = categories
    .map((c) => `<a href="${SITE_URL}/category/${c.slug}/"${c.slug === activeSlug ? ' aria-current="page"' : ''}>${esc(c.label)}</a>`)
    .join('');
  const pol = POLICY_LINKS.filter(([s]) => fs.existsSync(path.join(REPO_ROOT, s, 'index.html')))
    .map(([s, l]) => `<a href="${SITE_URL}/${s}/">${esc(l)}</a>`).join('');
  return `  <nav class="cats" aria-label="Shop by category"><strong>Shop by category:</strong><br>${cats}</nav>
  <nav class="pol" aria-label="Policies">${pol}</nav>`;
}

function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
  };
}

function cardHtml(p) {
  const mrp = p.mrp && p.mrp > p.price ? p.mrp : null;
  return `<a class="card" href="${p.url}">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : ''}<div class="b"><div class="n">${esc(p.name)}</div><div><span class="price">₹${p.price}</span>${mrp ? `<span class="mrp">₹${mrp}</span>` : ''}</div></div></a>`;
}

function categoryPageHtml(cat, products, categories) {
  const url = `${SITE_URL}/category/${cat.slug}/`;
  const label = cat.label;
  const title = `${label} — Personalised & Hand-painted ${label} Online | ${BRAND}`;
  const description = trunc(
    `Buy handmade, hand-painted personalised ${label.toLowerCase()} online from ${BRAND}. ${products.length} designs, customisable for birthdays, anniversaries & festivals. Made in India, COD available.`, 160);
  const body = `  <div class="crumbs"><a href="${SITE_URL}/">Home</a> › ${esc(label)}</div>
  <h1>${esc(label)}</h1>
  <p class="lead">Hand-painted, personalised ${esc(label.toLowerCase())} made with care in India. Pick a design, add your name or message, and gift something truly one of a kind.</p>
  ${products.length ? `<div class="grid">${products.map(cardHtml).join('')}</div>` : '<p class="lead">New designs are coming soon.</p>'}
  <a class="btn" href="${SITE_URL}/?type=${encodeURIComponent(cat.type)}">Shop all ${esc(label)} on ${BRAND} →</a>
${footerHtml(categories, cat.slug)}`;
  return shell({
    title, description, canonical: url,
    image: products.find((p) => p.image_url)?.image_url,
    schemas: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${label} | ${BRAND}`, url, description,
        mainEntity: { '@type': 'ItemList', numberOfItems: products.length,
          itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.name })) } },
      breadcrumbSchema([['Home', `${SITE_URL}/`], [label, url]]),
    ],
    body,
  });
}

function productPageHtml(p, cat, categories) {
  const mrp = p.mrp && p.mrp > p.price ? p.mrp : null;
  const offPct = mrp ? Math.round((1 - p.price / mrp) * 100) : 0;
  const desc = trunc(p.description || `${p.name} — handmade, hand-painted personalised gift from ${BRAND}.`, 160);
  const until = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const crumbs = [['Home', `${SITE_URL}/`]];
  if (cat) crumbs.push([cat.label, `${SITE_URL}/category/${cat.slug}/`]);
  crumbs.push([p.name, p.url]);
  const product = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name,
    image: p.image_url ? [p.image_url] : undefined,
    description: p.description || p.name,
    sku: p.id,
    category: cat?.label,
    brand: { '@type': 'Brand', name: BRAND },
    offers: {
      '@type': 'Offer', url: p.url, priceCurrency: 'INR', price: Number(p.price).toFixed(2),
      priceValidUntil: until, availability: 'https://schema.org/InStock', itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: BRAND },
    },
  };
  const body = `  <div class="crumbs"><a href="${SITE_URL}/">Home</a>${cat ? ` › <a href="${SITE_URL}/category/${cat.slug}/">${esc(cat.label)}</a>` : ''} › ${esc(p.name)}</div>
  ${p.image_url ? `<img class="pimg" src="${esc(p.image_url)}" alt="${esc(p.name)}">` : ''}
  <h1>${esc(p.name)}</h1>
  <p class="lead">${esc(p.description || `Handmade, hand-painted personalised gift from ${BRAND}.`)}</p>
  <div class="price" style="font-size:24px">₹${p.price}${mrp ? `<span class="mrp" style="font-size:15px">₹${mrp}</span><span style="color:#0AA36B;font-size:13px;margin-left:6px">${offPct}% OFF</span>` : ''}</div>
  <a class="btn" href="${SITE_URL}/?p=${p.id}">Buy on ${BRAND} →</a>
${footerHtml(categories, cat?.slug)}`;
  return shell({
    title: `${p.name} — Buy Online | ${BRAND}`, description: desc, canonical: p.url, ogType: 'product',
    image: p.image_url, schemas: [product, breadcrumbSchema(crumbs)], body,
  });
}

function merchantFeed(products, catByType) {
  const items = products.filter((p) => p.image_url).map((p) => {
    const cat = catByType.get(p.category);
    const key = String(p.category || '').toLowerCase();
    const mrp = p.mrp && p.mrp > p.price ? p.mrp : null;
    const lines = [
      ['g:id', p.id], ['title', trunc(p.name, 150)],
      ['description', trunc(p.description || `${p.name} — handmade, hand-painted personalised gift from ${BRAND}.`, 5000)],
      ['link', p.url], ['g:image_link', p.image_url], ['g:availability', 'in_stock'],
      ['g:price', inr(mrp || p.price)], mrp ? ['g:sale_price', inr(p.price)] : null,
      ['g:brand', BRAND], ['g:condition', 'new'], ['g:identifier_exists', 'no'],
      cat ? ['g:product_type', cat.label] : null,
      GOOGLE_CATEGORY[key] ? ['g:google_product_category', GOOGLE_CATEGORY[key]] : null,
      APPAREL.has(key) ? ['g:age_group', 'adult'] : null, APPAREL.has(key) ? ['g:gender', 'unisex'] : null,
    ].filter(Boolean);
    return `    <item>\n${lines.map(([k, v]) => `      <${k}>${esc(v)}</${k}>`).join('\n')}\n    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${BRAND}</title>
    <link>${SITE_URL}/</link>
    <description>${BRAND} — handmade, hand-painted personalised gifts</description>
${items.join('\n')}
  </channel>
</rss>
`;
}

function injectCategoryNav(categories) {
  const file = path.join(REPO_ROOT, 'index.html');
  if (!fs.existsSync(file)) return console.warn('index.html not found — category nav skip');
  const html = fs.readFileSync(file, 'utf8');
  const re = /(<!-- SEO-CATEGORY-NAV:START -->)[\s\S]*?(<!-- SEO-CATEGORY-NAV:END -->)/;
  if (!re.test(html)) return console.warn('SEO-CATEGORY-NAV markers index.html me nahi mile — skip');
  const links = categories.map((c) => `<a href="category/${c.slug}/">${esc(c.label)}</a>`).join('\n    ');
  fs.writeFileSync(file, html.replace(re, `$1\n  <nav class="footer-links footer-cats" aria-label="Shop by category">\n    ${links}\n  </nav>\n  $2`));
}

async function main() {
  console.log('Fetching products + main categories from Supabase...');
  const [rawProducts, rawCats] = await Promise.all([
    sbFetch('products?select=id,name,price,mrp,image_url,description,category&active=eq.true&order=sort_order'),
    sbFetch('main_categories?select=type,label&active=eq.true&order=sort_order').catch(() => []),
  ]);

  const categories = rawCats.map((c) => ({ type: c.type, label: c.label || c.type, slug: slugify(c.type, 'category') }));
  const catByType = new Map(categories.map((c) => [c.type, c]));
  console.log(`Found ${rawProducts.length} active products, ${categories.length} categories.`);

  for (const d of ['product', 'category']) {
    fs.rmSync(path.join(REPO_ROOT, d), { recursive: true, force: true });
    fs.mkdirSync(path.join(REPO_ROOT, d), { recursive: true });
  }

  const used = new Set();
  const products = rawProducts.map((p) => {
    let slug = `${slugify(p.name, 'product')}-${String(p.id).slice(0, 8)}`;
    while (used.has(slug)) slug += '-x';
    used.add(slug);
    return { ...p, slug, url: `${SITE_URL}/product/${slug}/` };
  });

  for (const p of products) {
    fs.mkdirSync(path.join(REPO_ROOT, 'product', p.slug), { recursive: true });
    fs.writeFileSync(path.join(REPO_ROOT, 'product', p.slug, 'index.html'), productPageHtml(p, catByType.get(p.category), categories));
  }
  for (const c of categories) {
    fs.mkdirSync(path.join(REPO_ROOT, 'category', c.slug), { recursive: true });
    const list = products.filter((p) => p.category === c.type);
    fs.writeFileSync(path.join(REPO_ROOT, 'category', c.slug, 'index.html'), categoryPageHtml(c, list, categories));
  }

  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${SITE_URL}/`, ...categories.map((c) => `${SITE_URL}/category/${c.slug}/`), ...products.map((p) => p.url)];
  POLICY_LINKS.forEach(([s]) => { if (fs.existsSync(path.join(REPO_ROOT, s, 'index.html'))) urls.push(`${SITE_URL}/${s}/`); });
  fs.writeFileSync(path.join(REPO_ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);

  fs.writeFileSync(path.join(REPO_ROOT, 'google-merchant-feed.xml'), merchantFeed(products, catByType));
  const skipped = products.filter((p) => !p.image_url).length;
  injectCategoryNav(categories);

  console.log(`Done — ${products.length} product pages, ${categories.length} category pages, sitemap (${urls.length} URLs), merchant feed${skipped ? ` (${skipped} product bina image ke feed se skip)` : ''}.`);
}

main().catch((err) => { console.error('SEO generation failed:', err); process.exit(1); });
