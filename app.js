const AEM_PREFIX = '/content/rmit/au/en';
const RMIT_DOMAIN = 'https://www.rmit.edu.au';
const BAD_ABS_PREFIX = '/content/rmit-ui/en';
 
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
 
  const tasks = [];
  
  // [구조 수정] 문서 전체에서 a를 바로 찾지 않고, 개별 인물 카드(.icon-feature)를 먼저 찾아 루프를 돕니다.
  const iconFeatures = container.querySelectorAll('.icon-feature');
  
  // 중복 추출 방지를 위해 이미 처리한 a 태그를 추적할 Set 생성
  const processedAnchors = new Set();

  // 1. icon-feature 컴포넌트 형태로 존재하는 인물 카드들 우선 처리
  iconFeatures.forEach(card => {
    // 카드 내부에서 h3 이름 요소 탐색
    const h3NameElement = card.querySelector('h3.h5, h3[role="heading"]');
    if (!h3NameElement) return;

    let name = h3NameElement.textContent;
    
    // 카드 내부에서 링크 요소 탐색
    const anchor = card.querySelector('a');
    let href = anchor ? anchor.getAttribute('href') : null;

    if (anchor) {
      processedAnchors.add(anchor); // 이 링크는 처리 완료로 등록
    }

    // 이름 정제
    name = cleanName(name);

    // 만약 링크가 있는 경우에만 URL 검증 후 태스크 추가 (링크 없는 사람은 명단에서 제외하거나 빈값 처리 가능)
    if (href) {
      href = href.trim();
      if (isTargetUrl(href)) {
        const normalizedHref = normalizeUrl(href);
        
        tasks.push(
          resolveUrl(normalizedHref).then(result => ({
            name,
            status: result.status,
            url: result.url
          }))
        );
      }
    } else {
      // 링크가 아예 없는 사람(예: Members 탭의 Dr Aayushi Badhwar)은 빈 링크 상태로 UI에 표시는 되도록 추가
      tasks.push(
        Promise.resolve({
          name,
          status: 'No link attached',
          url: ''
        })
      );
    }
  });

  // 2. 카드 형태가 아닌 본문 내 일반 텍스트 링크(Standard text links) 처리
  const allAnchors = container.querySelectorAll('a');
  allAnchors.forEach(anchor => {
    // 이미 위의 icon-feature 루프에서 처리된 링크라면 패스
    if (processedAnchors.has(anchor)) return;

    let href = anchor.getAttribute('href');
    if (!href) return;

    href = href.trim();
    if (!isTargetUrl(href)) return;

    const normalizedHref = normalizeUrl(href);
    let name = anchor.textContent; // 일반 텍스트 링크는 링크 텍스트 자체를 이름으로 사용
    name = cleanName(name);

    tasks.push(
      resolveUrl(normalizedHref).then(result => ({
        name,
        status: result.status,
        url: result.url
      }))
    );
  });
 
  try {
    // 비동기 작업 병렬 처리
    const rows = await Promise.all(tasks);
    renderResults(rows);
  } catch (error) {
    console.error(error);
    status.textContent = 'An error occurred while extracting data.';
  }
}

// 대상 URL 검증 헬퍼 함수
function isTargetUrl(href) {
  const isProfile = href.includes('/profiles/');
  const isContact = href.includes('contact/');
  return isProfile || isContact;
}

// URL 정규화 헬퍼 함수
function normalizeUrl(href) {
  if (href.startsWith(RMIT_DOMAIN)) {
    href = href.substring(RMIT_DOMAIN.length);
  }
  if (href.startsWith(BAD_ABS_PREFIX)) {
    href = href.substring(BAD_ABS_PREFIX.length);
  }
  return href;
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
 
  // 1. Handle profile paths
  if (url.startsWith('/profiles/')) {
    return { status: 'Profile', url: AEM_PREFIX + url };
  }
 
  if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
    return {
      status: 'Profile',
      url: url.replace(RMIT_DOMAIN, AEM_PREFIX)
    };
  }
 
  // 2. Handle contact paths
  if (url.startsWith('/contact/') || url.startsWith('https://www.rmit.edu.au/contact/')) {
    try {
      let targetUrl = url;
      if (url.startsWith('/contact/')) {
        targetUrl = RMIT_DOMAIN + url;
      }

      const response = await fetch(`${WORKER_URL}/?url=${encodeURIComponent(targetUrl)}`);
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
          url: data.finalUrl.replace(RMIT_DOMAIN, AEM_PREFIX)
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
 
    // 2. Render Copy Name Button
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
