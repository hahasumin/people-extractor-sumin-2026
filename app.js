const AEM_PREFIX = '/content/rmit/au/en';
const RMIT_DOMAIN = 'https://www.rmit.edu.au';

function extractPeople() {
  const html = document.getElementById('htmlInput').value;
  const container = document.createElement('div');
  container.innerHTML = html;

  removeUnwantedAreas(container);

  const rows = [];
  const listItems = container.querySelectorAll('li');

  listItems.forEach(li => {
    const anchor = li.querySelector('a');
    const fullText = cleanText(li.textContent);

    if (!fullText) return;

    let name = '';
    let url = '';

    if (anchor) {
      name = cleanName(anchor.textContent);
      url = anchor.getAttribute('href');
    } else {
      name = extractNameFromText(fullText);
      url = null;
    }

    if (!name) return;
    if (!looksLikePerson(name) && !looksLikeStaffRow(fullText)) return;

    rows.push({
      name: name,
      url: formatUrl(url)
    });
  });

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
    container.querySelectorAll(selector).forEach(el => el.remove());
  });
}

function formatUrl(url) {
  if (!url || url.trim() === '') {
    return 'No link';
  }

  url = url.trim();

  if (url.startsWith('/profiles/')) {
    return AEM_PREFIX + url;
  }

  if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
    return url.replace(RMIT_DOMAIN, AEM_PREFIX);
  }

  if (url.startsWith('/contact/')) {
    return 'Redirect not resolved: ' + RMIT_DOMAIN + url;
  }

  if (url.startsWith('https://www.rmit.edu.au/contact/')) {
    return 'Redirect not resolved: ' + url;
  }

  return 'Not a profile page';
}

function extractNameFromText(text) {
  return text
    .split(' – ')[0]
    .split(' - ')[0]
    .split(' — ')[0]
    .trim();
}

function cleanText(text) {
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(name) {
  return cleanText(name)
    .replace(/\s+-\s*$/, '')
    .replace(/\s+–\s*$/, '')
    .trim();
}

function looksLikePerson(name) {
  const words = name.split(' ').filter(Boolean);
  return words.length >= 2 && name.length < 80;
}

function looksLikeStaffRow(text) {
  const staffWords = [
    'Lecturer',
    'Professor',
    'Associate Professor',
    'Senior Lecturer',
    'Research Fellow',
    'Research Assistant',
    'Industry Fellow',
    'Discipline Lead',
    'Coordinator',
    'Co-ordinator',
    'Associate Dean',
    'Head of Department'
  ];

  return staffWords.some(word => text.includes(word));
}

function renderResults(rows) {
  const tbody = document.getElementById('results');
  const status = document.getElementById('status');

  tbody.innerHTML = '';

  if (rows.length === 0) {
    status.textContent = 'No people found.';
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${escapeHtml(row.name)}</td>
      <td><button onclick="copyText('${escapeForJs(row.name)}')">Copy</button></td>
      <td>${escapeHtml(row.url)}</td>
      <td><button onclick="copyText('${escapeForJs(row.url)}')">Copy</button></td>
    `;

    tbody.appendChild(tr);
  });

  status.textContent = `${rows.length} result(s) found.`;
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

function clearAll() {
  document.getElementById('htmlInput').value = '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('status').textContent = 'No results yet.';
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