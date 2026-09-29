// Scroll reveals. Without JS (or with reduced motion) everything is simply visible.
(function () {
  var els = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach(function (e) { e.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach(function (e) { io.observe(e); });
})();

// Demo videos: with reduced motion the CSS shows the poster instead; also stop playback so
// the hidden video does not keep downloading and decoding.
(function () {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.media video').forEach(function (v) {
    v.removeAttribute('autoplay');
    v.preload = 'none';
    v.pause();
  });
})();
