document.addEventListener('DOMContentLoaded', () => {
  const videos = document.querySelectorAll('.product-autoplay-video');

  if (!videos.length) return;

  videos.forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;

    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    video.removeAttribute('controls');

    const forcePlay = () => {
      video.muted = true;
      video.defaultMuted = true;

      const promise = video.play();

      if (promise !== undefined) {
        promise.catch(() => {});
      }
    };

    forcePlay();

    video.addEventListener('loadedmetadata', forcePlay);
    video.addEventListener('loadeddata', forcePlay);
    video.addEventListener('canplay', forcePlay);

    setTimeout(forcePlay, 100);
    setTimeout(forcePlay, 300);
    setTimeout(forcePlay, 700);

    video.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (video.paused) {
        forcePlay();
      } else {
        video.pause();
      }
    });
  });
});

window.addEventListener('pageshow', () => {
  document.querySelectorAll('.product-autoplay-video').forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    video.play().catch(() => {});
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;

  document.querySelectorAll('.product-autoplay-video').forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;

    video.play().catch(() => {});
  });
});