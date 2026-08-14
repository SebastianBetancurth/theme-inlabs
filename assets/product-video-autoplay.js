document.addEventListener('DOMContentLoaded', () => {
  const productMediaVideos = document.querySelectorAll(
    '.product__media-item deferred-media'
  );

  if (!productMediaVideos.length) return;

  const setupVideo = (video) => {
    if (!video || video.dataset.autoplayReady === 'true') return;

    video.dataset.autoplayReady = 'true';

    // Necesario para autoplay fiable
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;

    // Sin controles
    video.controls = false;
    video.removeAttribute('controls');

    // Indicamos visualmente que se puede hacer clic
    video.style.cursor = 'pointer';

    // Click = play / pause
    video.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  };

  const loadAndPlayVideo = (deferredMedia) => {
    const template = deferredMedia.querySelector('template');

    // Solo vídeos subidos directamente a Shopify
    if (!template || !template.content.querySelector('video')) {
      return;
    }

    // Si Dawn todavía no ha cargado el vídeo,
    // activamos el deferred-media.
    if (!deferredMedia.hasAttribute('loaded')) {
      const poster = deferredMedia.querySelector('.deferred-media__poster');

      if (poster) {
        poster.click();
      }
    }

    // Esperamos a que Dawn inserte el <video>
    const waitForVideo = () => {
      const video = deferredMedia.querySelector('video');

      if (!video) {
        requestAnimationFrame(waitForVideo);
        return;
      }

      setupVideo(video);

      video.play().catch(() => {});
    };

    waitForVideo();
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

  productMediaVideos.forEach((deferredMedia) => {
    const template = deferredMedia.querySelector('template');

    if (template && template.content.querySelector('video')) {
      observer.observe(deferredMedia);
    }
  });
});