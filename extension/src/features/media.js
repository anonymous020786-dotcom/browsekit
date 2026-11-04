(() => {
  const { register, command, toast, copyText } = globalThis.Browsekit;

  function formatTime(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  const area = element => element.clientWidth * element.clientHeight;

  // The video the user most likely means: the playing one, else the largest on the page.
  function activeVideo() {
    const videos = [...document.querySelectorAll('video')];
    return videos.find(video => !video.paused) ?? videos.sort((a, b) => area(b) - area(a))[0] ?? null;
  }

  register({
    id: 'video-speed-keys',
    name: 'Video speed keys',
    category: 'media',
    shortcut: '] / [ / \\',
    description: 'Press ] to speed up, [ to slow down (0.25× steps) and \\ to reset the current video to 1×.',
    run() {
      const changeSpeed = delta => () => {
        const video = activeVideo();
        if (!video) return false;
        video.playbackRate = delta === 0 ? 1 : Math.min(16, Math.max(0.25, video.playbackRate + delta));
        toast(`Speed ${video.playbackRate.toFixed(2)}×`, 900);
      };
      command('Speed up video', ']', changeSpeed(0.25));
      command('Slow down video', '[', changeSpeed(-0.25));
      command('Reset video speed', '\\', changeSpeed(0));
    },
  });

  register({
    id: 'picture-in-picture',
    name: 'Picture-in-picture shortcut',
    category: 'media',
    shortcut: 'Alt+Shift+P',
    description: 'Pops the current video out into a floating window, even on sites that disable it (Chromium browsers).',
    run() {
      command('Picture-in-picture', 'alt+shift+p', async () => {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          return;
        }
        const video = activeVideo();
        if (!video) {
          toast('No video on this page');
          return;
        }
        video.disablePictureInPicture = false;
        try {
          await video.requestPictureInPicture();
        } catch (error) {
          toast(`Picture-in-picture unavailable: ${error.message}`);
        }
      });
    },
  });

  register({
    id: 'pause-other-media',
    name: 'One player at a time',
    category: 'media',
    description: 'When a video or audio with sound starts, other players on the page that have sound are paused.',
    run() {
      document.addEventListener('play', event => {
        if (event.target.muted) return;
        for (const media of document.querySelectorAll('video, audio')) {
          if (media !== event.target && !media.paused && !media.muted) media.pause();
        }
      }, true);
    },
  });

  register({
    id: 'video-loop-toggle',
    name: 'Loop video',
    category: 'media',
    shortcut: 'Alt+Shift+L',
    description: 'Toggles looping for the current video.',
    run() {
      command('Toggle video loop', 'alt+shift+l', () => {
        const video = activeVideo();
        if (!video) return false;
        video.loop = !video.loop;
        toast(video.loop ? 'Loop on' : 'Loop off');
      });
    },
  });

  register({
    id: 'autoplay-blocker',
    name: 'Block autoplay with sound',
    category: 'media',
    defaultEnabled: false,
    description: 'Pauses videos that start playing with sound before you have clicked or typed on the page.',
    run() {
      let interacted = false;
      for (const type of ['pointerdown', 'keydown']) {
        addEventListener(type, () => { interacted = true; }, { capture: true, once: true });
      }
      const block = media => {
        if (interacted || media.muted || media.paused) return;
        media.pause();
        toast('Blocked autoplay — press play to start');
      };
      document.querySelectorAll('video, audio').forEach(block);
      document.addEventListener('play', event => block(event.target), true);
    },
  });

  register({
    id: 'video-screenshot',
    name: 'Save video frame',
    category: 'media',
    shortcut: 'Alt+Shift+S',
    description: 'Saves the current frame of the video as a PNG file.',
    run() {
      command('Save video frame', 'alt+shift+s', () => {
        const video = activeVideo();
        if (!video?.videoWidth) {
          toast('No video frame to capture');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        try {
          const link = document.createElement('a');
          link.download = `${document.title || 'video'} @ ${Math.floor(video.currentTime)}s.png`.replace(/[\\/:*?"<>|]/g, '_');
          link.href = canvas.toDataURL('image/png');
          link.click();
        } catch {
          toast('This site does not allow capturing its video frames');
        }
      });
    },
  });

  register({
    id: 'remember-video-speed',
    name: 'Remember video speed per site',
    category: 'media',
    description: 'Remembers the playback speed you pick on each site and applies it to every new video there.',
    async run() {
      const storageKey = `speed:${location.hostname}`;
      let savedSpeed = (await chrome.storage.local.get(storageKey))[storageKey];
      const apply = video => {
        if (savedSpeed && video.playbackRate !== savedSpeed) video.playbackRate = savedSpeed;
      };
      document.querySelectorAll('video').forEach(apply);
      document.addEventListener('play', event => {
        if (event.target instanceof HTMLVideoElement) apply(event.target);
      }, true);
      document.addEventListener('ratechange', event => {
        const video = event.target;
        // Only remember changes the user made, not the site's own resets between videos.
        if (!(video instanceof HTMLVideoElement) || !(navigator.userActivation?.isActive ?? true)) return;
        savedSpeed = video.playbackRate;
        chrome.storage.local.set({ [storageKey]: savedSpeed });
      }, true);
    },
  });

  register({
    id: 'video-seek-keys',
    name: 'Skip back / forward 10 seconds',
    category: 'media',
    shortcut: 'Alt+Shift+, / Alt+Shift+.',
    description: 'Jumps the current video back or forward 10 seconds, on any site.',
    run() {
      const seek = seconds => () => {
        const video = activeVideo();
        if (!video) return false;
        video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || Infinity);
        toast(`${seconds > 0 ? '+' : '−'}${Math.abs(seconds)}s`, 700);
      };
      command('Skip video back 10 seconds', 'alt+shift+,', seek(-10));
      command('Skip video forward 10 seconds', 'alt+shift+.', seek(10));
    },
  });

  register({
    id: 'video-time-left',
    name: 'Time left at current speed',
    category: 'media',
    description: 'Shows how long the current video has left at its playback speed, and when it will end. Run it from the command palette.',
    run() {
      command('Show video time left', null, () => {
        const video = activeVideo();
        if (!video || !Number.isFinite(video.duration)) return false;
        const secondsLeft = (video.duration - video.currentTime) / video.playbackRate;
        const endsAt = new Date(Date.now() + secondsLeft * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        toast(`${formatTime(secondsLeft)} left at ${video.playbackRate}× · ends at ${endsAt}`, 4000);
      });
    },
  });

  register({
    id: 'video-ab-loop',
    name: 'A–B repeat',
    category: 'media',
    description: 'Repeats a section of a video. Run "Set A–B loop point" at the start, again at the end, and a third time to stop.',
    run() {
      let loop = null; // { video, start, end }
      const keepInLoop = () => {
        if (loop?.end != null && loop.video.currentTime >= loop.end) loop.video.currentTime = loop.start;
      };
      command('Set A–B loop point', null, () => {
        const video = activeVideo();
        if (!video) return false;
        if (!loop || loop.video !== video) {
          loop?.video.removeEventListener('timeupdate', keepInLoop);
          loop = { video, start: video.currentTime, end: null };
          video.addEventListener('timeupdate', keepInLoop);
          toast(`Loop start set at ${formatTime(loop.start)} — run again at the end point`);
        } else if (loop.end === null) {
          if (video.currentTime <= loop.start) {
            toast('The end point must come after the start');
            return;
          }
          loop.end = video.currentTime;
          video.currentTime = loop.start;
          toast(`Repeating ${formatTime(loop.start)}–${formatTime(loop.end)}`);
        } else {
          video.removeEventListener('timeupdate', keepInLoop);
          loop = null;
          toast('A–B repeat off');
        }
      });
    },
  });

  register({
    id: 'video-native-controls',
    name: 'Show native video controls',
    category: 'media',
    description: 'Adds the browser\'s own play bar to videos that hide it (seek, volume, download, full screen). Toggle from the command palette.',
    run() {
      command('Toggle native video controls', null, () => {
        const video = activeVideo();
        if (!video) return false;
        video.controls = !video.controls;
        toast(video.controls ? 'Native controls shown' : 'Native controls hidden');
      });
    },
  });

  register({
    id: 'copy-video-source',
    name: 'Copy video file URL',
    category: 'media',
    description: 'Copies the direct file address of the current video when it has one. Run it from the command palette.',
    run() {
      command('Copy video source URL', null, async () => {
        const video = activeVideo();
        if (!video) return false;
        const source = video.currentSrc;
        if (!source || source.startsWith('blob:')) {
          toast('This video is streamed in pieces, so it has no single file address');
          return;
        }
        toast((await copyText(source)) ? 'Copied video URL' : 'Copy failed');
      });
    },
  });

  register({
    id: 'wheel-volume',
    name: 'Alt + scroll for volume',
    category: 'media',
    shortcut: 'Alt+Wheel',
    defaultEnabled: false,
    description: 'Hold Alt and scroll over a video or audio player to change its volume in 5% steps.',
    run() {
      document.addEventListener('wheel', event => {
        if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
        // Players often cover the <video> with their own controls, so look at everything under the pointer.
        const media = document.elementsFromPoint(event.clientX, event.clientY).find(element => element instanceof HTMLMediaElement);
        if (!media) return;
        event.preventDefault();
        const step = event.deltaY < 0 ? 0.05 : -0.05;
        media.volume = Math.min(1, Math.max(0, Math.round((media.volume + step) * 100) / 100));
        if (media.volume > 0) media.muted = false;
        toast(`Volume ${Math.round(media.volume * 100)}%`, 700);
      }, { capture: true, passive: false });
    },
  });
})();
