const AEM_PREFIX = '/content/rmit/au/en';
const AEM_VN_PREFIX = '/content/rmit/vn/en'; // [추가] 베트남 접두사
const RMIT_DOMAIN = 'https://www.rmit.edu.au';
const RMIT_VN_DOMAIN = 'https://www.rmit.edu.vn'; // [추가] 베트남 도메인
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

  // 본문 내의 모든 <a> 태그를 HTML에 등장하는 '순서대로' 전부 훑습니다.
  const allAnchors = container.querySelectorAll('a');
  
  allAnchors.forEach(anchor => {
    let href = anchor.getAttribute('href');
    if (!href) return;
    href = href.trim();

    // 지정해둔 핵심 주소 패턴(AU 또는 VN 관련)만 통과
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

// 타겟 URL 판별 조건 (대소문자 구별 없이 AU와 VN의 주소 패턴을 동일하게 매칭)
function isTargetUrl(href) {
  if (href.startsWith('javascript:')) return false;
  
  const lowerHref = href.toLowerCase();
  const isProfile = lowerHref.includes('/profiles/');
  const isAcademicStaff = lowerHref.includes('contact/staff-contacts/academic-staff'); 
  const isVnAem = lowerHref.includes('/content/rmit/vn/en'); // 베트남 내부 경로 패턴
  const isVnDomain = lowerHref.includes('rmit.edu.vn');    // 베트남 라이브 도메인 패턴
  
  return isProfile || isAcademicStaff || isVnAem || isVnDomain;
}

// URL 정규화 (AU와 VN 도메인 접두사를 동일하게 생략 처리)
function normalizeUrl(href) {
  if (href.startsWith('javascript:')) return href;
  if (href.startsWith(RMIT_DOMAIN)) {
    href = href.substring(RMIT_DOMAIN.length);
  }
  if (href.startsWith(RMIT_VN_DOMAIN)) {
    href = href.substring(RMIT_VN_DOMAIN.length); // [추가] 베트남 도메인 생략 처리
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
 
// URL 최종 목적지 분석 및 도메인 치환 (AU와 VN 완벽 대칭 처리)
async function resolveUrl(url, currentName) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { name: currentName, status: 'Button/Script Link', url: url };
  }
 
  url = url.trim();
  const lowerUrl = url.toLowerCase();

  // ----------------------------------------------------
  // [베트남 전용 분기 코드] - AU와 완전 똑같은 규칙으로 적용
  // ----------------------------------------------------
  if (lowerUrl.startsWith('/content/rmit/vn/en')) {
    return { name: currentName, status: 'VN Profile', url: url };
  }
  
  if (url.startsWith('https://www.rmit.edu.vn/profiles/') || url.startsWith('http://www.rmit.edu.vn/profiles/')) {
    return {
      name: currentName,
      status: 'VN Profile',
      url: url.replace(RMIT_VN_DOMAIN, AEM_VN_PREFIX)
    };
  }

  // ----------------------------------------------------
  // [기존 호주 전용 분기 코드]
  // ----------------------------------------------------
  if (url.startsWith('/profiles/')) {
    return { name: currentName, status: 'Profile', url: AEM_PREFIX + url };
  }
 
  if (url.startsWith('https://www.rmit.edu.au/profiles/')) {
    return {
      name: currentName,
      status: 'Profile',
      url: url.replace(RMIT_DOMAIN, AEM_PREFIX)
    };
  }
 
  // 2. 지정된 Academic Staff 주소인 경우 -> Worker를 거쳐 리다이렉트 추적
  if (lowerUrl.includes('contact/staff-contacts/academic-staff')) {
    try {
      let targetUrl = url;
      if (url.startsWith('/')) {
        targetUrl = RMIT_DOMAIN + url;
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
      const lowerFinalUrl = finalUrl.toLowerCase();

      // 리다이렉트된 결과가 베트남 프로필일 경우 치환
      if (lowerFinalUrl.startsWith('https://www.rmit.edu.vn/profiles/')) {
        return {
          name: currentName,
          status: 'Redirected VN Profile',
          url: finalUrl.replace(RMIT_VN_DOMAIN, AEM_VN_PREFIX)
        };
      }

      // 리다이렉트된 결과가 호주 프로필인 경우 치환
      if (finalUrl.startsWith('https://www.rmit.edu.au/profiles/')) {
        return {
          name: currentName,
          status: 'Redirected Profile',
          url: finalUrl.replace(RMIT_DOMAIN, AEM_PREFIX)
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
  document.getElementById('status').textContent = '
