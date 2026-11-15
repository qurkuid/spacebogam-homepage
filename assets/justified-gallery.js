(() => {
  // Keep source/keyboard/lightbox order. Fit complete images, never crop them.
  const galleries = [...document.querySelectorAll('.pd-page .case-gallery')];
  function arrange(gallery) {
    const width = gallery.clientWidth;
    if (!width || gallery.closest('[hidden]')) return;
    const figures = [...gallery.children].filter(f => !f.hidden && f.matches('figure'));
    if (!figures.length) return;
    const gap = innerWidth <= 760 ? 10 : 16;
    const target = width < 600 ? 145 : width < 1000 ? 230 : 260;
    const ratios = figures.map(f => {
      const image = f.querySelector('img');
      return (Number(image?.getAttribute('width')) || image?.naturalWidth || 1) /
        (Number(image?.getAttribute('height')) || image?.naturalHeight || 1);
    });
    // Dynamic programming chooses consecutive groups closest to a readable height.
    const costs = Array(figures.length + 1).fill(Infinity), groups = [];
    costs[figures.length] = 0;
    for (let start = figures.length - 1; start >= 0; start--) {
      let sum = 0;
      for (let count = 1; count <= Math.min(width < 600 ? 2 : 5, figures.length - start); count++) {
        sum += ratios[start + count - 1];
        const height = (width - gap * (count - 1)) / sum;
        const last = start + count === figures.length;
        const fitted = last ? Math.min(height, target * 1.25) : height;
        const score = Math.pow(Math.log(fitted / target), 2) +
          (height < (width < 600 ? 90 : 120) ? 4 : 0) + costs[start + count];
        if (score < costs[start]) { costs[start] = score; groups[start] = {count, height: fitted}; }
      }
    }
    gallery.classList.add('is-justified');
    gallery.style.setProperty('--gallery-gap', gap + 'px');
    for (let start = 0; start < figures.length;) {
      const {count, height} = groups[start];
      for (let offset = 0; offset < count; offset++) {
        const index = start + offset, size = Math.floor(ratios[index] * height * 100) / 100;
        figures[index].style.width = size + 'px';
        figures[index].querySelector('img')?.setAttribute('sizes', Math.ceil(size) + 'px');
      }
      start += count;
    }
  }
  galleries.forEach(gallery => {
    let frame;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => arrange(gallery)); };
    new ResizeObserver(schedule).observe(gallery);
    new MutationObserver(schedule).observe(gallery, {subtree: true, attributes: true, attributeFilter: ['hidden']});
    gallery.addEventListener('load', schedule, true);
    schedule();
  });
})();
