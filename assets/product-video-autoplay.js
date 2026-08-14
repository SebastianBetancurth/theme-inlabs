document.addEventListener('DOMContentLoaded', () => {
  const productMediaVideos = document.querySelectorAll(
    '.product__media-item deferred-media'
  );

  if (!productMediaVideos.length) return;

  const loadAndPlayVideo = (deferredMedia) => {
    // Solo actuar sobre vídeos alojados en Shopify.
    const template = deferredMedia.querySelector('template');

    if (!template || !template.content.querySelector('video')) {
      return;
    }

    // Dawn no carga el vídeo hasta activar el poster.
    if (!deferredMedia.hasAttribute('loaded')) {
      const poster = deferredMedia.querySelector('.deferred-media__poster');

      if (poster) {
        poster.click();
      }
    }

    // Esperamos a que Dawn inserte el <video>.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const video = deferredMedia.querySelector('video');

        if (!video) return;

        video.muted = true;
        video.defaultMuted = true;
        video.autoplay = true;
        video.playsInline = true;

        video.play().catch(() => {});
      }, 50);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const deferredMedia = entry.target;

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          loadAndPlayVideo(deferredMedia);
        } else {
          const video = deferredMedia.querySelector('video');

          if (video && !video.paused) {
            video.pause();
          }
        }
      });
    },
    {
      threshold: [0, 0.6]
    }
  );

  productMediaVideos.forEach((media) => {
    const template = media.querySelector('template');

    if (template && template.content.querySelector('video')) {
      observer.observe(media);
    }
  });
});