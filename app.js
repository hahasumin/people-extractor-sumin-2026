const AEM_AU_PREFIX = '/content/rmit/au/en';
const AEM_VN_PREFIX = '/content/rmit/vn/en'; // 베트남 전용 접두사 추가
const RMIT_AU_DOMAIN = 'https://www.rmit.edu.au';
const RMIT_VN_DOMAIN = 'https://www.rmit.edu.vn'; // 베트남 도메인 추가
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
  const allAnchors = container.querySelectorAll('a');
  
  // 본문 내의 모든 <a> 태그를 HTML에 등장하는 '순서대로' 전부 훑습니다.
  allAnchors.forEach(anchor => {
    let href = anchor.getAttribute('href');
    if (!href) return;
    href = href.trim();

    // 지정해주신 2가지 핵심 주소 패턴만 통과 (나머지 CTA/링크는 완전 무시)
    if (isTargetUrl(href)) {
      const normalizedHref = normalizeUrl(href);
      let name = '';

      // 1. 만약 이 링크가 .icon-feature (인물 카드) 내부에 속해 있다면, 카드 내의 H3 이름을 먼저 탐색
      const parentCard = anchor.closest('.icon-feature, .iconfeature');
      if (parentCard) {
        const h3NameElement = parentCard.querySelector('h3.h5, h3[role="heading"]');
        if (h3NameElement) {
          name = h3NameElement.textContent;
        }
      }

      // 2. 카드 형태가 아니거나 H3 이름을 못 찾았다면 <a> 태그 자체의 텍스트나 속성 탐색 (일반 CTA 버튼 대응)
      if (!name) {
        name = anchor.textContent;
      }
      name = cleanName(name);

      // 이름 텍스트가 비어있을 경우 대안 속성 적용
      if (!name && anchor.getAttribute('title')) {
        name = anchor.getAttribute('title');
      }
      if (!name && anchor.getAttribute('aria-label')) {
        name = anchor.getAttribute('aria-label');
      }
      // 끝까지 이름이 없는 아이콘 버튼 등의 경우 임시 명칭 부여
      if (!name) {
        name = href.includes('staff-contacts') ? `[Academic Staff CTA]` : `[Profile Link]`;
      }

      // 비동기 URL 분석 처리를 순서대로 tasks 배열에 push
      tasks.push(
        resolveUrl(normalizedHref, name).then(result => ({
          name: result.name,
          status: result.status,
          url: result.url
        }))
      );
    }
  });
 
  try {
    // HTML 순서가 그대로 보장된 채 결과가 출력됩니다.
    const rows = await Promise.all(tasks);
    renderResults(rows);
  } catch (error) {
    console.error(error);
    status.textContent = 'An error occurred while extracting data.';
  }
}

// 타겟 URL 판별 조건 (호주/베트남 구분 없이 패턴 체크)
function isTargetUrl(href) {
  if (href.startsWith('javascript:')) return false;
  const isProfile = href.includes('/profiles/');
  const isAcademicStaff = href.includes('contact/staff-contacts/academic-staff'); 
  return isProfile || isAcademicStaff;
}

// URL 정규화
function normalizeUrl(href) {
  if (href.startsWith('javascript:')) return href;
  
  // 호주 도메인 생략 처리
  if (href.startsWith(RMIT_AU_DOMAIN)) {
    href = href.substring(RMIT_AU_DOMAIN.length);
  }
  // 베트남 도메인은 분기 처리를 위해 원본 주소 형태를 유지하도록 분기 시점에 처리합니다.
  
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
 
// URL 최종 목적지 분석 및 도메인 치환 (베트남 캠퍼스 대응 완비)
async function resolveUrl(url, currentName) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { name: currentName, status: 'Button/Script Link', url: url };
  }
 
  url = url.trim();
 
  // [신규] 1. 베트남 프로필 주소인 경우 (/content/rmit/vn/en 적용)
  if (url.startsWith('https://www.rmit.edu.vn/profiles/') || url.startsWith('http://www.rmit.edu.vn/profiles/')) {
    const cleanPath = url.replace('https://www.rmit.edu.vn', '').replace('http://www.rmit.edu.vn', '');
    return {
      name: currentName,
      status: 'VN Profile',
      url: AEM_VN_PREFIX + cleanPath
    };
  }
 
  // 2. 호주 내부 프로필 주소인 경우 (/content/rmit/au/en 적용)
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
 
  // 3. 지정된 Academic Staff 주소인 경우 -> Worker를 거쳐 리다이렉트 추적
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
      
      // Worker에서 추적된 최종 주소가 베트남 프로필일 경우 대응
      if (finalUrl.startsWith('https://www.rmit.edu.vn/profiles/')) {
        return {
          name: currentName,
          status: 'Redirected VN Profile',
          url: finalUrl.replace(RMIT_VN_DOMAIN, AEM_VN_PREFIX)
        };
      }

      // Worker에서 추적된 최종 주소가 호주 프로필인 경우
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
  document.getElementById('
