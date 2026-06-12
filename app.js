const AEM_PREFIX = '/content/rmit/au/en';
const RMIT_DOMAIN = 'https://www.rmit.edu.au';

const WORKER_URL =
  'https://people-extractor-sumin-2026-redirect.hahasuminn.workers.dev';

async function extractPeople() {

  const html =
    document.getElementById('htmlInput').value;

  const container =
    document.createElement('div');

  container.innerHTML = html;

  removeUnwantedAreas(container);

  const rows = [];

  const anchors =
    container.querySelectorAll('a');

  for (const anchor of anchors) {

    const href =
      anchor.getAttribute('href');

    if (!href) {
      continue;
    }

    const isProfile =
      href.includes('/profiles/');

    const isContact =
      href.includes('/contact/');

    if (!isProfile && !isContact) {
      continue;
    }

    const name =
      cleanName(anchor.textContent);

    const url =
      await resolveUrl(href);

    rows.push({
      name,
      url
    });

  }

  renderResults(rows);

}

function removeUnwantedAreas(container) {

  const selectors = [
    'script',
    'style',
    'svg',
    'nav',
    'header',
    'footer',
    '.top-nav',
    '.breadcrumb',
    '.breadcrumbs',
    '.footer',
    '[data-elastic-exclude]'
  ];

  selectors.forEach(selector => {
    container
      .querySelectorAll(selector)
      .forEach(el => el.remove());
  });

}

async function resolveUrl(url) {

  if (!url || url.trim() === '') {
    return 'No link';
  }

  url = url.trim();

  if (url.startsWith('/profiles/')) {
    return AEM_PREFIX + url;
  }

  if (
    url.startsWith(
      'https://www.rmit.edu.au/profiles/'
    )
  ) {

    return url.replace(
      RMIT_DOMAIN,
      AEM_PREFIX
    );

  }

  if (
    url.startsWith('/contact/') ||
    url.startsWith(
      'https://www.rmit.edu.au/contact/'
    )
  ) {

    try {

      const response =
        await fetch(
          `${WORKER_URL}/?url=${encodeURIComponent(url)}`
        );

      const data =
        await response.json();

      if (!data.finalUrl) {

        return `Redirect not resolved: ${url}`;

      }

      if (
        data.finalUrl.startsWith(
          'https://www.rmit.edu.au/profiles/'
        )
      ) {

        return data.finalUrl.replace(
          'https://www.rmit.edu.au',
          '/content/rmit/au/en'
        );

      }

      return `Not a profile page: ${data.finalUrl}`;

    } catch (error) {

      console.error(error);

      return `Redirect not resolved: ${url}`;

    }

  }

  return `Not a profile page: ${url}`;

}

function cleanText(text) {

  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

}

function cleanName(name) {

  return cleanText(name);

}

function renderResults(rows) {

  const tbody =
    document.getElementById('results');

  const status =
    document.getElementById('status');

  tbody.innerHTML = '';

  if (rows.length === 0) {

    status.textContent =
      'No people found.';

    return;

  }

  rows.forEach(row => {

    const tr =
      document.createElement('tr');

    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td>
        <button onclick="copyText('${escapeForJs(row.name)}')">
          Copy
        </button>
      </td>
      <td>${escapeHtml(row.url)}</td>
      <td>
        <button onclick="copyText('${escapeForJs(row.url)}')">
          Copy
        </button>
      </td>
    `;

    tbody.appendChild(tr);

  });

  status.textContent =
    `${rows.length} result(s) found.`;

}

function copyText(text) {

  navigator.clipboard.writeText(text);

}

function clearAll() {

  document.getElementById('htmlInput').value = '';

  document.getElementById('results').innerHTML = '';

  document.getElementById('status').textContent =
    'No results yet.';

}

function escapeHtml(text) {

  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

}

function escapeForJs(text) {

  return String(text)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");

}
