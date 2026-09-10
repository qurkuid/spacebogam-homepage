(function(){
  var config = window.SPACEBOGAM_SOCIAL_CONTENT || {};

  function qs(selector){ return document.querySelector(selector); }
  function qsa(selector){ return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function safeText(value, fallback){ return (value || fallback || '').toString(); }
  function validYouTubeId(videoId){ return /^[A-Za-z0-9_-]{6,20}$/.test(videoId || ''); }
  function validHttpUrl(url){
    if (!url) return false;
    try {
      var parsed = new URL(url, location.href);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch(e) { return false; }
  }
  function validAbsoluteHttpUrl(url){
    return /^https?:\/\//i.test(url || '') && validHttpUrl(url);
  }

  function setDisabledLink(a, label){
    if (!a) return;
    a.removeAttribute('href');
    a.setAttribute('aria-disabled', 'true');
    a.setAttribute('role', 'link');
    if (label) a.querySelector('[data-social-label]') ? a.querySelector('[data-social-label]').textContent = label : a.textContent = label;
  }

  function hydrateChannels(){
    var channels = config.channels || {};
    var youtube = qs('[data-social-channel="youtube"]');
    var instagram = qs('[data-social-channel="instagram"]');

    if (youtube && validAbsoluteHttpUrl(channels.youtubeChannelUrl)) {
      youtube.href = channels.youtubeChannelUrl;
      youtube.target = '_blank';
      youtube.rel = 'noopener';
    } else {
      setDisabledLink(youtube, 'YouTube 채널 확정 대기');
    }

    if (instagram && validAbsoluteHttpUrl(channels.instagramProfileUrl)) {
      instagram.href = channels.instagramProfileUrl;
      instagram.target = '_blank';
      instagram.rel = 'noopener';
    } else {
      setDisabledLink(instagram, 'Instagram 확정 대기');
    }
  }

  function hydratePerformanceLinks(){
    var items = Array.isArray(config.performanceContent) ? config.performanceContent : [];
    var list = qs('[data-social-performance-list]');
    if (!list || !items.length) return;
    list.innerHTML = items.map(function(item){
      var href = validHttpUrl(item.href) || /^([./#]|[A-Za-z0-9_-]+\.html)/.test(item.href || '') ? item.href : '#';
      return '<a class="social-content-item" href="' + href + '" data-performance-content="' + safeText(item.key, 'content') + '">' +
        '<b>' + safeText(item.label, '성과 콘텐츠') + '</b>' +
        '<span>' + safeText(item.reason, 'config에서 관리되는 추천 콘텐츠입니다.') + '</span>' +
      '</a>';
    }).join('');
  }

  function hydrateSupportVideos(){
    var videos = Array.isArray(config.supportVideos) ? config.supportVideos.filter(function(item){ return validYouTubeId(item.videoId); }) : [];
    var list = qs('[data-support-video-list]');
    if (!list || !videos.length) return;
    list.innerHTML = videos.map(function(item, index){
      var url = 'https://www.youtube.com/watch?v=' + encodeURIComponent(item.videoId);
      return '<a class="support-video-item" href="' + url + '" target="_blank" rel="noopener" data-social-event="click_support_video" data-social-channel="youtube" data-video-id="' + item.videoId + '">' +
        '<span>' + String(index + 1).padStart(2, '0') + '</span>' +
        '<b>' + safeText(item.title, '보조 영상') + '</b>' +
        '<small>' + safeText(item.description, 'YouTube에서 보기') + '</small>' +
      '</a>';
    }).join('');
  }

  function hydrateInstagramCases(){
    var cases = Array.isArray(config.instagramCases) ? config.instagramCases : [];
    var list = qs('[data-instagram-case-list]');
    if (!list || !cases.length) return;
    list.innerHTML = cases.map(function(item){
      var href = validHttpUrl(item.href) || /^([./#]|[A-Za-z0-9_-]+\.html)/.test(item.href || '') ? item.href : '#';
      var external = /^https?:\/\//i.test(href);
      return '<a class="instagram-case-item" href="' + href + '" ' + (external ? 'target="_blank" rel="noopener" ' : '') + 'data-social-event="click_instagram_case" data-social-channel="instagram" data-instagram-case="' + safeText(item.key, 'case') + '">' +
        '<span class="instagram-case-thumb" style="--case-img:url(\'' + safeText(item.image, '') + '\')"></span>' +
        '<b>' + safeText(item.title, 'Instagram 시공 사례') + '</b>' +
        '<small>' + safeText(item.description, '공간보감 시공 사례 보기') + '</small>' +
      '</a>';
    }).join('');
  }

  function buildIframe(videoId, title){
    var iframe = document.createElement('iframe');
    iframe.width = '560';
    iframe.height = '315';
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&rel=0&modestbranding=1';
    iframe.title = title || '공간보감 추천 YouTube 영상';
    iframe.loading = 'lazy';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    return iframe;
  }

  function hydrateFeaturedVideo(){
    var video = config.featuredVideo || {};
    var shell = qs('[data-featured-video-shell]');
    var media = qs('[data-featured-video-media]');
    var button = qs('[data-featured-video-button]');
    if (!shell || !media || !button) return;

    qsa('[data-featured-video-field]').forEach(function(el){
      var key = el.getAttribute('data-featured-video-field');
      el.textContent = safeText(video[key], el.textContent);
    });
    button.textContent = safeText(video.ctaLabel, button.textContent);

    var ready = video.enabled === true && validYouTubeId(video.videoId);
    shell.dataset.videoReady = ready ? 'true' : 'false';
    if (!ready) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      media.setAttribute('aria-label', '공식 YouTube 영상 ID 확정 대기');
      return;
    }

    button.disabled = false;
    button.removeAttribute('aria-disabled');
    media.style.setProperty('--youtube-thumb', 'url("https://i.ytimg.com/vi/' + video.videoId + '/hqdefault.jpg")');
    media.classList.add('has-video');
    button.addEventListener('click', function(){
      if (media.dataset.loaded === 'true') return;
      media.dataset.loaded = 'true';
      media.innerHTML = '';
      media.appendChild(buildIframe(video.videoId, video.title));
    });
  }

  function init(){
    hydrateChannels();
    hydratePerformanceLinks();
    hydrateSupportVideos();
    hydrateInstagramCases();
    hydrateFeaturedVideo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
