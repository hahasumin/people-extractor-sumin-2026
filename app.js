const AEM_PREFIX = '/content/rmit/au/en';
const RMIT_DOMAIN = 'https://www.rmit.edu.au';
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
   const href = anchor.getAttribute('href');
   if (!href) continue;
   const isProfile = href.includes('/profiles/');
   const isContact = href.includes('/contact/');
   if (!isProfile && !isContact) continue;
   const name = cleanName(anchor.textContent);
   // 병렬 처리를 위해 프로미스를 배열에 담음
   tasks.push(
     resolveUrl(href).then(result => ({
       name,
       status: result.status,
       url: result.url
     }))
   );
 }
 try {
   // 모든 URL 검증을 동시에 실행 (속도 최적화)
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
 if (url.startsWith('/profiles/')) {
   return { status: 'Profile', url: AEM_PREFIX + url };
 }
 if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
   return {
     status: 'Profile',
     url: url.replace(RMIT_DOMAIN, AEM_PREFIX)
   };
 }
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
   // 이름 열
   const tdName = document.createElement('td');
   tdName.textContent = row.name;
   tr.appendChild(tdName);
   // 이름 복사 버튼 열
   const tdCopyName = document.createElement('td');
   const btnCopyName = document.createElement('button');
   btnCopyName.textContent = 'Copy';
   btnCopyName.addEventListener('click', () => copyText(row.name, btnCopyName));
   tdCopyName.appendChild(btnCopyName);
   tr.appendChild(tdCopyName);
   // 상태 열
   const tdStatus = document.createElement('td');
   tdStatus.textContent = row.status;
   tr.appendChild(tdStatus);
   // URL 열
   const tdUrl = document.createElement('td');
   tdUrl.textContent = row.url;
   tr.appendChild(tdUrl);
   // URL 복사 버튼 열
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
