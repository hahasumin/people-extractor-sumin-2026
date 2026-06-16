const AEM_AU_PREFIX = '/content/rmit/au/en';
const AEM_VN_PREFIX = '/content/rmit/vn/en'; // 베트남 전용 접두사
const RMIT_AU_DOMAIN = 'https://www.rmit.edu.au';
const RMIT_VN_DOMAIN = 'https://www.rmit.edu.vn'; // 베트남 도메인
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

  // 본문 내의 모든 요소를 HTML 순서대로 탐색하기 위한 트리 순회
  const allElements = container.querySelectorAll('*');
  const visitedElements = new Set();

  allElements.forEach(el => {
    if (visitedElements.has(el)) return;

    // 1. 리스트 아이템(<li>) 처리 구조
    if (el.tagName.toLowerCase() === 'li') {
      el.querySelectorAll('*').forEach(child => visitedElements.add(child));
      visitedElements.add(el);

      const anchor = el.querySelector('a');
      let href = anchor ? anchor.getAttribute('href') : null;
      if (href) href = href.trim();

      // Case A: 리스트 내부에 유효한 타겟 프로필/스태프 링크가 있는 경우
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
      // Case B: [직원 편의] 링크가 유독 누락되었거나 일반 텍스트만 든 리스트인 경우
      else {
        let name = el.textContent;
        name = cleanName(name);

        // 글자 수가 적당하고 유효한 이름 형태일 때 수집 (노이즈 필터링 포함)
        if (name && name.length > 1 && name.length < 60) {
          const lowerName = name.toLowerCase();
          const isNoise = lowerName.includes('twitter') || 
                          lowerName.includes('facebook') || 
                          lowerName.includes('instagram') || 
                          lowerName.includes('linkedin') ||
                          lowerName.includes('cookie') ||
                          lowerName.includes('privacy') ||
                          lowerName.includes('terms of');

          if (!isNoise) {
            tasks.push(
              Promise.resolve({
                name: name,
                status: 'Text/General Link',
                url: (href && !href.startsWith('javascript:')) ? href : '[Link 없음]'
              })
            );
          }
        }
      }
    } 
    // 2. 리stit가 아닌 독립형 카드(.icon-feature) 또는 일반 단독 CTA 버튼인 경우
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

// 추출 타겟 조건 정의 (베트남 상대 경로인 /content/rmit/vn/en 패턴 추가 대폭 보완)
function isTargetUrl(href) {
  if (href.startsWith('javascript:')) return false;
  const isProfile = href.includes('/profiles/');
  const isAcademicStaff = href.includes('contact/staff-contacts/academic-staff'); 
  const isVnAem = href.includes('/content/rmit/vn/en'); // 베트남 상대 경로 감지 조건 추가
  return isProfile || isAcademicStaff || isVnAem;
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
 
// URL 최종 목적지 분석 및 도메인 치환 (베트남 상대경로 최우선 예외 분기 처리)
async function resolveUrl(url, currentName) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { name: currentName, status: 'Button/Script Link', url: url };
  }
 
  url = url.trim();

  // [중요 교정] 이미 베트남 AEM 경로(/content/rmit/vn/en) 형태를 띠고 있다면 즉시 통과
  if (url.startsWith('/content/rmit/vn/en')) {
    return { name: currentName, status: 'VN Profile (AEM)', url: url };
  }
 
  // 풀 도메인 형태의 베트남 프로필 주소 처리
  if (url.startsWith('https://www.rmit.edu.vn/profiles/') || url.startsWith('http://www.rmit.edu.vn/profiles/')) {
    const cleanPath = url.replace('https://www.rmit.edu.vn', '').replace('http://www.rmit.edu.vn', '');
    return {
      name: currentName,
      status: 'VN Profile',
      url: AEM_VN_PREFIX + cleanPath
    };
  }
 
  // 호주 내부 프로필 주소인 경우 (/content/rmit/au/en 적용)
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
 
  // 지정된 Academic Staff 주소인 경우 -> Worker를 거쳐 리다이렉트 추적
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
      
      // Worker 결과에서 베트남 AEM 상대 경로가 포착되었을 때 대응
      if (finalUrl.includes('/content/rmit/vn/en')) {
        const vnPathIndex = finalUrl.indexOf('/content/rmit/vn/en');
        return {
          name: currentName,
          status: 'Redirected VN Profile (AEM)',
          url: finalUrl.substring(vnPathIndex)
        };
      }

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
