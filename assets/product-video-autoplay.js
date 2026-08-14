document.addEventListener('DOMContentLoaded', () => {
  const deferredVideos = document.querySelectorAll(
    '.product__media-item deferred-media'
  );

  if (!deferredVideos.length) return;

  function prepareTemplate(deferredMedia) {
    const template = deferredMedia.querySelector('template');

    if (!template) return false;

    const templateVideo = template.content.querySelector('video');

    if (!templateVideo) return false;

    // MUY IMPORTANTE PARA iOS / Android:
    // preparar el vídeo ANTES de que Dawn lo clone.
    templateVideo.muted = true;
    templateVideo.defaultMuted = true;
    templateVideo.autoplay = true;
    templateVideo.playsInline = true;
    templateVideo.controls = false;

    templateVideo.setAttribute('muted', '');
    templateVideo.setAttribute('autoplay', '');
    templateVideo.setAttribute('playsinline', '');

    templateVideo.removeAttribute('controls');

    return true;
  }

  function setupVideo(video) {
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;

    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');

    video.removeAttribute('controls');

    video.style.cursor = 'pointer';

    if (video.dataset.clickPauseReady === 'true') return;

    video.dataset.clickPauseReady = 'true';

    video.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (video.paused) {
        video.muted = true;

        video.play().catch((error) => {
          console.debug('Video play bloqueado:', error);
        });
      } else {
        video.pause();
      }
    });
  }

  function loadVideo(deferredMedia) {
    prepareTemplate(deferredMedia);

    // Dawn tiene públicamente este método.
    if (!deferredMedia.hasAttribute('loaded')) {
      if (typeof deferredMedia.loadContent === 'function') {
        deferredMedia.loadContent(false);
      } else {
        const poster = deferredMedia.querySelector(
          '.deferred-media__poster'
        );

        if (poster) poster.click();
      }
    }

    const waitForVideo = () => {
      const video = deferredMedia.querySelector('video');

      if (!video) {
        requestAnimationFrame(waitForVideo);
        return;
      }

      setupVideo(video);

      video.muted = true;

      const playPromise = video.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.debug('Autoplay bloqueado:', error);
        });
      }
    };

    waitForVideo();
  }

  function pauseVideo(deferredMedia) {
    const video = deferredMedia.querySelector('video');

    if (video && !video.paused) {
      video.pause();
    }
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadVideo(entry.target);
        } else {
          pauseVideo(entry.target);
        }
      });
    },
    {
      // Antes teníamos 60%.
      // Eso puede fallar en pantallas pequeñas.
      threshold: 0.01
    }
  );

  deferredVideos.forEach((deferredMedia) => {
    if (prepareTemplate(deferredMedia)) {
      observer.observe(deferredMedia);
    }
  });
});