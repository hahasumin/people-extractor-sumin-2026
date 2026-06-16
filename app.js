const AEM_PREFIX = '/content/rmit/au/en';
const RMIT_DOMAIN = 'https://www.rmit.edu.au';
const BAD_ABS_PREFIX = 'https://www.rmit.edu.au/content/rmit-ui/en';
 
const WORKER_URL = 'https://people-extractor-sumin-2026-redirect.hahasuminn.workers.dev';
 
async function extractPeople() {
  const status = document.getElementById('status');
  const html = document.getElementById('htmlInput').value;
  
  if (!html.trim()) {
    status.textContent = 'Please paste HTML content first.';
    return;
  }

  status.textContent = 'Extracting and resolving URLs... Please wait.';
 
  const container = document.createElement('div');
  container.innerHTML = html;
 
  removeUnwantedAreas(container);
 
  const anchors = container.querySelectorAll('a');
  const tasks = [];
 
  for (const anchor of anchors) {
    let href = anchor.getAttribute('href');
    if (!href) continue;
 
    // Clean and normalize href before filtering to handle mistakenly entered absolute paths
    href = href.trim();
    if (href.startsWith(BAD_ABS_PREFIX)) {
      href = href.replace(BAD_ABS_PREFIX, '');
    }

    const isProfile = href.includes('/profiles/');
    const isContact = href.includes('/contact/');
 
    if (!isProfile && !isContact) continue;
 
    // Default: Use anchor text as the initial name
    let name = anchor.textContent;
 
    // Check if the current link is inside an 'iconfeature' component
    const iconFeatureContainer = anchor.closest('.iconfeature');
    
    if (iconFeatureContainer) {
      // Find the h3 tag that contains the actual name within the component
      const h3NameElement = iconFeatureContainer.querySelector('h3.h5');
      if (h3NameElement) {
        name = h3NameElement.textContent; // Use the actual name instead of "Find out more"
      }
    }
 
    // Trim whitespace and clean up the text
    name = cleanName(name);
 
    tasks.push(
      resolveUrl(href).then(result => ({
        name,
        status: result.status,
        url: result.url
      }))
    );
  }
 
  try {
    // Process worker requests in parallel for better performance
    const rows = await Promise.all(tasks);
    renderResults(rows);
  } catch (error) {
    console.error(error);
    status.textContent = 'An error occurred while extracting data.';
  }
}
 
function removeUnwantedAreas(container) {
  const selectors = [
    'script', 'style', 'svg', 'nav', 'header', 'footer',
    '.top-nav', '.breadcrumb', '.breadcrumbs', '.footer',
    '[data-elastic-exclude]'
  ];
 
  selectors.forEach(selector => {
    container.querySelectorAll(selector).forEach(el => el.remove());
  });
}
 
async function resolveUrl(url) {
  if (!url || url.trim() === '') {
    return { status: 'No link', url: '' };
  }
 
  url = url.trim();
 
  // Handle profile paths
  if (url.startsWith('/profiles/')) {
    return { status: 'Profile', url: AEM_PREFIX + url };
  }
 
  if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
    return {
      status: 'Profile',
      url: url.replace(RMIT_DOMAIN, AEM_PREFIX)
    };
  }
 
  // Handle contact paths (including those that were stripped from BAD_ABS_PREFIX)
  if (url.startsWith('/contact/') || url.startsWith('https://www.rmit.edu.au/contact/')) {
    try {
      const response = await fetch(`${WORKER_URL}/?url=${encodeURIComponent(url)}`);
      const data = await response.json();
 
      if (!data.finalUrl) {
        return { status: 'Redirect not resolved', url: url };
      }
 
      if (data.status === 404) {
        return { status: '404', url: data.finalUrl };
      }
 
      if (data.finalUrl.startsWith('https://www.rmit.edu.au/profiles/')) {
        return {
          status: 'Redirected',
          url: data.finalUrl.replace('https://www.rmit.edu.au', '/content/rmit/au/en')
        };
      }
 
      return { status: 'Not a profile page', url: data.finalUrl };
    } catch (error) {
      console.error(error);
      return { status: 'Redirect not resolved', url: url };
    }
  }
 
  return { status: 'Not a profile page', url: url };
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
  const tbody = document.getElementById('results');
  const status = document.getElementById('status');
 
  tbody.innerHTML = '';
 
  if (rows.length === 0) {
    status.textContent = 'No people found.';
    return;
  }
 
  rows.forEach(row => {
    const tr = document.createElement('tr');
 
    // 1. Render Name
    const tdName = document.createElement('td');
    tdName.textContent = row.name;
    tr.appendChild(tdName);
 
    // 2. Render Copy Name Button (Event listener approach for browser compatibility)
    const tdCopyName = document.createElement('td');
    const btnCopyName = document.createElement('button');
    btnCopyName.textContent = 'Copy';
    btnCopyName.addEventListener('click', () => copyText(row.name, btnCopyName));
    tdCopyName.appendChild(btnCopyName);
    tr.appendChild(tdCopyName);
 
    // 3. Render Status
    const tdStatus = document.createElement('td');
    tdStatus.textContent = row.status;
    tr.appendChild(tdStatus);
 
    // 4. Render Final URL
    const tdUrl = document.createElement('td');
    tdUrl.textContent = row.url;
    tr.appendChild(tdUrl);
 
    // 5. Render Copy URL Button
    const tdCopyUrl = document.createElement('td');
    const btnCopyUrl = document.createElement('button');
    btnCopyUrl.textContent = 'Copy';
    btnCopyUrl.addEventListener('click', () => copyText(row.url, btnCopyUrl));
    tdCopyUrl.appendChild(btnCopyUrl);
    tr.appendChild(tdCopyUrl);
 
    tbody.appendChild(tr);
  });
 
  status.textContent = `${rows.length} result(s) found.`;
}
 
function copyText(text, buttonElement) {
  navigator.clipboard.writeText(text)
    .then(() => {
      // Provide visual feedback upon successful copy
      const originalText = buttonElement.textContent;
      buttonElement.textContent = 'Copied!';
      buttonElement.style.backgroundColor = '#4CAF50';
      buttonElement.style.color = 'white';
      
      setTimeout(() => {
        buttonElement.textContent = originalText;
        buttonElement.style.backgroundColor = '';
        buttonElement.style.color = '';
      }, 1200);
    })
    .catch(err => {
      console.error('Could not copy text: ', err);
      alert('Copy failed. Please copy manually.');
    });
}
 
function clearAll() {
  document.getElementById('htmlInput').value = '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('status').textContent = 'No results yet.';
}
