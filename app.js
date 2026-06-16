const AEM_AU_PREFIX = '/content/rmit/au/en';
const AEM_VN_PREFIX = '/content/rmit/vn/en';
const RMIT_AU_DOMAIN = 'https://www.rmit.edu.au';
const RMIT_VN_DOMAIN = 'https://www.rmit.edu.vn';
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
 
  // 상하단 노이즈 영역 제거
  removeUnwantedAreas(container);
 
  const tasks = [];

  // 본문 내의 모든 요소를 HTML 순서대로 탐색하기 위해 전체 트리를 훑습니다.
  const allElements = container.querySelectorAll('*');
  const visitedElements = new Set();

  allElements.forEach(el => {
    if (visitedElements.has(el)) return;

    // 1. 만약 요소가 리스트 아이템(<li>)인 경우
    if (el.tagName.toLowerCase() === 'li') {
      // 해당 li 내부의 모든 하위 요소는 중복 처리되지 않도록 차단 리스트에 추가
      el.querySelectorAll('*').forEach(child => visitedElements.add(child));
      visitedElements.add(el);

      const anchor = el.querySelector('a');
      let href = anchor ? anchor.getAttribute('href') : null;
      if (href) href = href.trim();

      // Case A: 리스트 아이템 내부에 우리가 찾는 프로필/스태프 링크가 존재하는 경우
      if (href && isTargetUrl(href)) {
        let name = el.textContent; 
        name = cleanName(name);

        const normalizedHref = normalizeUrl(href);
        tasks.push(
          resolveUrl(normalizedHref, name).then(result => ({
            name: result.name,
            status: result.status,
            url: result.url
          }))
        );
      } 
      // Case B: 리스트 내부에 링크는 없지만, 프로필/스태프 리스트 영역으로 의심되는 경우 (텍스트만 존재)
      else {
        let name = el.textContent;
        name = cleanName(name);

        // 텍스트가 유효하고 너무 길지 않은 경우(메뉴 전체 글 방지) 리스트에 추가
        if (name && name.length < 100) {
          // [핵심 수정] 주변 동료 리스트(ul/ol) 중 하나라도 profiles 나 staff-contacts 관련 단어가 묻어있는 패널인지 체크
          const parentUl = el.closest('ul, ol');
          const isProfileArea = parentUl && (
            parentUl.innerHTML.includes('/profiles/') || 
            parentUl.innerHTML.includes('contact/staff-contacts/academic-staff')
          );

          if (isProfileArea) {
            tasks.push(
              Promise.resolve({
                name: name,
                status: 'Text Only (No Link)',
                url: '[Link 없음]'
              })
            );
          }
        }
      }
    } 
    // 2. 리스트(li)가 아닌 일반 카드(.icon-feature)나 단독 CTA 버튼인 경우 (기존 로직 유지)
    else if (el.tagName.toLowerCase() === 'a') {
      visitedElements.add(el);
      let href = el.getAttribute('href');
      if (!href) return;
      href = href.trim();

      if (isTargetUrl(href)) {
        const normalizedHref = normalizeUrl(href);
        let name = '';

        const parentCard = el.closest('.icon-feature, .iconfeature');
        if (parentCard) {
          const h3NameElement = parentCard.querySelector('h3.h5, h3[role="heading"]');
          if (h3NameElement) name = h3NameElement.textContent;
        }

        if (!name) name = el.textContent;
        name = cleanName(name);

        if (!name && el.getAttribute('title')) name = el.getAttribute('title');
        if (!name && el.getAttribute('aria-label')) name = el.getAttribute('aria-label');
        if (!name) name = href.includes('staff-contacts') ? `[Academic Staff CTA]` : `[Profile Link]`;

        tasks.push(
          resolveUrl(normalizedHref, name).then(result => ({
            name: result.name,
            status: result.status,
            url: result.url
          }))
        );
      }
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

// 추출 타겟 조건
function isTargetUrl(href) {
  if (href.startsWith('javascript:')) return false;
  const isProfile = href.includes('/profiles/');
  const isAcademicStaff = href.includes('contact/staff-contacts/academic-staff'); 
  return isProfile || isAcademicStaff;
}

// URL 정규화
function normalizeUrl(href) {
  if (href.startsWith('javascript:')) return href;
  if (href.startsWith(RMIT_AU_DOMAIN)) {
    href = href.substring(RMIT_AU_DOMAIN.length);
  }
  if (href.startsWith(BAD_ABS_PREFIX)) {
    href = href.substring(BAD_ABS_PREFIX.length);
  }
  return href;
}
 
// 불필요 영역 제거 로직
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
 
// URL 최종 목적지 분석 (베트남 캠퍼스 분기 포함)
async function resolveUrl(url, currentName) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { name: currentName, status: 'Button/Script Link', url: url };
  }
 
  url = url.trim();
 
  if (url.startsWith('https://www.rmit.edu.vn/profiles/') || url.startsWith('http://www.rmit.edu.vn/profiles/')) {
    const cleanPath = url.replace('https://www.rmit.edu.vn', '').replace('http://www.rmit.edu.vn', '');
    return {
      name: currentName,
      status: 'VN Profile',
      url: AEM_VN_PREFIX + cleanPath
    };
  }
 
  if (url.startsWith('/profiles/')) {
    return { name: currentName, status: 'Profile', url: AEM_AU_PREFIX + url };
  }
 
  if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
    return {
      name: currentName,
      status: 'Profile',
      url: url.replace(RMIT_AU_DOMAIN, AEM_AU_PREFIX)
    };
  }
 
  if (url.includes('contact/staff-contacts/academic-staff')) {
    try {
      let targetUrl = url;
      if (url.startsWith('/')) {
        targetUrl = RMIT_AU_DOMAIN + url;
      }

      const response = await fetch(`${WORKER_URL}/?url=${encodeURIComponent(targetUrl)}`);
      const data = await response.json();
 
      if (!data.finalUrl) {
        return { name: currentName, status: 'Redirect not resolved', url: url };
      }
 
      if (data.status === 404) {
        return { name: currentName, status: '404', url: data.finalUrl };
      }
 
      const finalUrl = data.finalUrl;
      
      if (finalUrl.startsWith('https://www.rmit.edu.vn/profiles/')) {
        return {
          name: currentName,
          status: 'Redirected VN Profile',
          url: finalUrl.replace(RMIT_VN_DOMAIN, AEM_VN_PREFIX)
        };
      }

      if (finalUrl.startsWith('https://www.rmit.edu.au/profiles/')) {
        return {
          name: currentName,
          status: 'Redirected Profile',
          url: finalUrl.replace(RMIT_AU_DOMAIN, AEM_AU_PREFIX)
        };
      }
 
      return { name: currentName, status: 'Resolved Destination', url: finalUrl };
    } catch (error) {
      console.error(error);
      return { name: currentName, status: 'Redirect Error', url: url };
    }
  }
 
  return { name: currentName, status: 'Link', url: url };
}
 
function cleanText(text) {
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
 
function cleanName(name) {
  let t = cleanText(name);
  t = t.replace(/view profile/i, '')
       .replace(/find out more/i, '')
       .replace(/read more/i, '')
       .trim();
  return t;
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
    
    if (row.url === '[Link 없음]') {
      btnCopyUrl.disabled = true;
      btnCopyUrl.style.opacity = '0.5';
      btnCopyUrl.style.cursor = 'not-allowed';
    } else {
      btnCopyUrl.addEventListener('click', () => copyText(row.url, btnCopyUrl));
    }
    
    tdCopyUrl.appendChild(btnCopyUrl);
    tr.appendChild(tdCopyUrl);
 
    tbody.appendChild(tr);
  });
 
  status.textContent = `${rows.length} result(s) found.`;
