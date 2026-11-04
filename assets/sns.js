(() => {
  const grid = document.getElementById('instagram-posts');
  const status = document.getElementById('instagram-status');
  fetch('/api/social-feed', { headers: { Accept: 'application/json' } })
    .then(response => { if (!response.ok) throw new Error('Feed unavailable'); return response.json(); })
    .then(({ instagram }) => {
      if (!instagram || instagram.status === 'unavailable') throw new Error('Instagram unavailable');
      const cards = instagram.posts.map(post => {
        const link = new URL(post.url);
        const imageUrl = new URL(post.image);
        if (link.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(link.hostname)
          || imageUrl.protocol !== 'https:' || !/(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/.test(imageUrl.hostname)) return null;
        const anchor = document.createElement('a');
        anchor.className = 'sns-card'; anchor.href = link.href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
        const image = document.createElement('img');
        image.src = imageUrl.href; image.alt = post.caption ? post.caption.slice(0, 100) : '공간보감 인스타그램 게시물'; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove());
        const caption = document.createElement('p'); caption.textContent = post.caption;
        const open = document.createElement('span'); open.className = 'sns-open'; open.textContent = '인스타그램에서 보기 ↗';
        anchor.append(image, caption, open); return anchor;
      }).filter(Boolean);
      grid.replaceChildren(...cards);
      status.textContent = instagram.status === 'stale' ? '저장된 게시물입니다. 최근 소식은 공식 계정에서 확인해 주세요.'
        : cards.length ? '사진을 누르면 인스타그램 원문으로 이동합니다.' : '공개된 게시물은 공식 계정에서 확인해 주세요.';
    })
    .catch(() => { status.textContent = '인스타그램 소식을 연결하고 있습니다. 공식 계정에서 사진과 게시물을 확인해 주세요.'; });
})();
