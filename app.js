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

  // 본문 내의 모든 요소를 HTML 순서대로 탐색
  const allElements = container.querySelectorAll('*');
  const visitedElements = new Set();

  allElements.forEach(el => {
    if (visitedElements.has(el)) return;

    // 1. 리스트 아이템(<li>)인 경우 - 링크 유무 상관없이 무조건 파싱 시도
    if (el.tagName.toLowerCase() === 'li') {
      el.querySelectorAll('*').forEach(child => visitedElements.add(child));
      visitedElements.add(el);

      const anchor = el.querySelector('a');
      let href = anchor ? anchor.getAttribute('href') : null;
      if (href) href = href.trim();

      // Case A: 리스트 내부에 타겟 주소(프로필/스태프)가 명확히 있는 경우
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
      // Case B: [직원 편의용 핵심 변경] 링크가 없거나 일반 링크인 리스트 아이템도 이름 형태면 다 가져옴!
      else {
        let name = el.textContent;
        name = cleanName(name);

        // 메뉴 전체 글이나 소셜 공유 단어 같은 명백한 노이즈가 아니고, 글자 수가 적당하면 인물로 간주
        if (name && name.length > 1 && name.length < 60) {
          const lowerName = name.toLowerCase();
          // 푸터 링크나 시스템 버튼 문구 필터링
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
    // 2. 리스트(li)가 아닌 단독 카드(.icon-feature)나 개별 CTA 버튼인 경우
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
 
// 불필요 영역 제거 로직 (GNAV, FOOTER 등 기본 컴포넌트 1차 청소)
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
 
// URL 최종 목적지 분석 (베트남 경로 최우선 대응)
async function resolveUrl(url, currentName) {
  if (!url || url.trim() === '' || url.startsWith('javascript:')) {
    return { name: currentName, status: 'Button/Script Link', url: url };
  }
 
  url = url.trim();

  if (url.startsWith('/content/rmit/vn/en')) {
    return { name: currentName, status: 'VN Profile (AEM)', url: url };
  }
 
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
          url: finalUrl.replace(RMIT
