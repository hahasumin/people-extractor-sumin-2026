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
 
  // 상하단 뼈대 정제 (본문 파괴 방지)
  removeUnwantedAreas(container);
 
  const tasks = [];
  const iconFeatures = container.querySelectorAll('.icon-feature, .iconfeature');
  const processedAnchors = new Set();

  // 1. 기존 인물 카드 형태 처리 (VAS, IVV 등 카드 레이아웃)
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

  // 2. [핵심 수정] 본문 내 모든 일반 링크 및 "모든 종류의 CTA 버튼" 수집
  const allAnchors = container.querySelectorAll('a');
  allAnchors.forEach(anchor => {
    if (processedAnchors.has(anchor)) return;

    let href = anchor.getAttribute('href');
    if (!href) return;
    href = href.trim();

    // 주소 조건(/profiles/, contact/)에 맞거나, '버튼' 역할을 하는 CTA 태그인 경우 모두 통과
    const isButtonRole = anchor.getAttribute('role') === 'button';
    const isCtaClass = anchor.className.toLowerCase().includes('btn') || anchor.className.toLowerCase().includes('cta');
    
    if (isTargetUrl(href) || isButtonRole || isCtaClass) {
      const normalizedHref = normalizeUrl(href);
      
      let name = anchor.textContent; 
      name = cleanName(name);

      // 텍스트가 비어있고 title 속성이 있으면 그것을 이름으로 사용
      if (!name && anchor.getAttribute('title')) {
        name = anchor.getAttribute('title');
      }
      // 텍스트도 없고 title도 없으면 aria-label 대용 사용
      if (!name && anchor.getAttribute('aria-label')) {
        name = anchor.getAttribute('aria-label');
      }
      // 정말 아무것도 없으면 주소나 요소를 구별할 수 있게 임시 이름 부여
      if (!name) {
        name = `[CTA Button] ${href}`;
      }

      tasks.push(
        resolveUrl(normalizedHref).then(result => ({
          name,
          status: isTargetUrl(href) ? result.status : 'General CTA/Button',
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

// target 주소 판별 함수
function isTargetUrl(href) {
  const isProfile = href.includes('/profiles/');
  const isContact = href.includes('contact/');
  return isProfile || isContact;
}

// URL 정규화
function normalizeUrl(href) {
  if (href.startsWith('javascript:')) return href; // 스크립트 형태 주소 보존
  if (href.startsWith(RMIT_DOMAIN)) {
    href = href.substring(RMIT_DOMAIN.length);
  }
  if (href.startsWith(BAD_ABS_PREFIX)) {
    href = href.substring(BAD_ABS_PREFIX.length);
  }
  return href;
}
 
// 불필요 영역 제거 로직 개선
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
 
// URL 최종 목적지 분석 (Profiles / Contact 분기 처리)
async function resolveUrl(url) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { status: 'Button/Script Link', url: url };
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
 
  return { status: 'Page Link', url: url };
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
