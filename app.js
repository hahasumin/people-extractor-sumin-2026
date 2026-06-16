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
 
  // 상하단 노이즈 제거
  removeUnwantedAreas(container);
 
  const tasks = [];
  const iconFeatures = container.querySelectorAll('.icon-feature, .iconfeature');
  const processedAnchors = new Set();

  // 1. 기존 인물 카드 형태 처리
  iconFeatures.forEach(card => {
    const h3NameElement = card.querySelector('h3.h5, h3[role="heading"]');
    if (!h3NameElement) return;

    let name = h3NameElement.textContent;
    const anchor = card.querySelector('a');
    let href = anchor ? anchor.getAttribute('href') : null;

    if (anchor) {
      processedAnchors.add(anchor);
    }

    name = cleanName(name);

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
      tasks.push(
        Promise.resolve({ name, status: 'No link attached', url: '' })
      );
    }
  });

  // 2. 본문 내 모든 링크 중 'profiles' 또는 'contact' 주소를 가진 요소 처리 (CTA 버튼 포함)
  const allAnchors = container.querySelectorAll('a');
  allAnchors.forEach(anchor => {
    if (processedAnchors.has(anchor)) return;

    let href = anchor.getAttribute('href');
    if (!href) return;
    href = href.trim();

    if (isTargetUrl(href)) {
      const normalizedHref = normalizeUrl(href);
      
      let name = anchor.textContent; 
      name = cleanName(name);

      // 이름 텍스트가 없는 경우 속성값 우회 적용
      if (!name && anchor.getAttribute('title')) {
        name = anchor.getAttribute('title');
      }
      if (!name && anchor.getAttribute('aria-label')) {
        name = anchor.getAttribute('aria-label');
      }
      if (!name) {
        name = href.includes('contact') ? `[Contact CTA Button]` : `[Profile Link]`;
      }

      tasks.push(
        resolveUrl(normalizedHref).then(result => ({
          name,
          status: result.status,
          url: result.url
        }))
      );
    }
  });
 
  try {
    const rows = await Promise.all(tasks);
    renderResults(rows);
  } catch (error) {
    console.error(error);
    status.textContent = 'An error occurred while extracting data.';
  }
}

// 추출 타겟 조건: 오직 profiles 나 contact 가 들어있는 링크만 수집
function isTargetUrl(href) {
  return href.includes('/profiles/') || href.includes('contact');
}

// URL 전규화
function normalizeUrl(href) {
  if (href.startsWith('javascript:')) return href;
  if (href.startsWith(RMIT_DOMAIN)) {
    href = href.substring(RMIT_DOMAIN.length);
  }
  if (href.startsWith(BAD_ABS_PREFIX)) {
    href = href.substring(BAD_ABS_PREFIX.length);
  }
  return href;
}
 
// 불필요 영역 제거
function removeUnwantedAreas(container) {
  const selectors = [
    'script', 'style', 'header', 'footer',
    '#root-experiencefragment', '#campaign-notification-master',
    '.breadcrumb', '.breadcrumbs', '.footer'
  ];
 
  selectors.forEach(selector => {
    container.querySelectorAll(selector).forEach(el => el.remove());
  });
}
 
// [로직 전면 단순화] 원하시는 흐름대로 조건 검사 후 주소를 그대로 반환합니다.
async function resolveUrl(url) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { status: 'Button/Script Link', url: url };
  }
 
  url = url.trim();
 
  // 1. 이미 프로필 주소인 경우 -> 규칙대로 변환 후 그대로 뱉음
  if (url.startsWith('/profiles/')) {
    return { status: 'Profile', url: AEM_PREFIX + url };
  }
 
  if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
    return {
      status: 'Profile',
      url: url.replace(RMIT_DOMAIN, AEM_PREFIX)
    };
  }
 
  // 2. contact 주소인 경우 -> Worker 돌려서 나온 최종 목적지를 가감 없이 그대로 뱉음
  if (url.startsWith('/contact') || url.includes('contact')) {
    try {
      let targetUrl = url;
      if (url.startsWith('/')) {
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
 
      // [수정] 내비게이션 필터 제거: Worker가 찾아낸 주소 그대로 도메인 치환하여 반환
      const finalUrl = data.finalUrl;
      if (finalUrl.startsWith('https://www.rmit.edu.au/profiles/')) {
        return {
          status: 'Redirected Profile',
          url: finalUrl.replace(RMIT_DOMAIN, AEM_PREFIX)
        };
      }
 
      return { status: 'Resolved Destination', url: finalUrl };
    } catch (error) {
      console.error(error);
      return { status: 'Redirect Error', url: url };
    }
  }
 
  return { status: 'Link', url: url };
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
    status.textContent = 'No data extracted.';
    return;
  }
 
  rows.forEach(row => {
    const tr = document.createElement('tr');
 
    const tdName = document.createElement('td');
    tdName.textContent = row.name;
    tr.appendChild(tdName);
 
    const tdCopyName = document.createElement('td');
    const btnCopyName = document.createElement('button');
    btnCopyName.textContent = 'Copy';
    btnCopyName.addEventListener('click', () => copyText(row.name, btnCopyName));
    tdCopyName.appendChild(btnCopyName);
    tr.appendChild(tdCopyName);
 
    const tdStatus = document.createElement('td');
    tdStatus.textContent = row.status;
    tr.appendChild(tdStatus);
 
    const tdUrl = document.createElement('td');
    tdUrl.textContent = row.url;
    tr.appendChild(tdUrl);
 
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
      alert('Copy failed.');
    });
}
 
function clearAll() {
  document.getElementById('htmlInput').value = '';
  document.getElementById('results').innerHTML = '';
  document.getElementById('status').textContent = 'No results yet.';
}
