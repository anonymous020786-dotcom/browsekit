// Site packs: features that only run on one website, selected with `match`.
// These depend on each site's markup and URLs, so they are the first thing to check when a site redesigns.
(() => {
  const { register, command, addStyle, toast, copyText, watchDom } = globalThis.Browsekit;

  // --- GitHub -------------------------------------------------------------------

  const onGitHub = () => location.hostname === 'github.com';

  // "owner/repo" on repository pages, otherwise null.
  function gitHubRepo() {
    const nameWithOwner = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.content;
    if (nameWithOwner) return nameWithOwner;
    const goImport = document.querySelector('meta[name="go-import"]')?.content.split(' ')[0];
    return goImport?.replace(/^github\.com\//, '') ?? null;
  }

  register({
    id: 'github-raw-file',
    name: 'GitHub: open raw file',
    category: 'sites',
    match: onGitHub,
    description: 'On a GitHub file page, opens the raw file. Run it from the command palette.',
    run() {
      command('GitHub: open raw file', null, () => {
        if (!/^\/[^/]+\/[^/]+\/blob\//.test(location.pathname)) return false;
        location.href = `${location.origin}${location.pathname.replace('/blob/', '/raw/')}`;
      });
    },
  });

  register({
    id: 'github-copy-clone',
    name: 'GitHub: copy clone command',
    category: 'sites',
    match: onGitHub,
    description: 'Copies "git clone https://github.com/owner/repo.git" for the repository you are viewing.',
    run() {
      command('GitHub: copy git clone command', null, async () => {
        const repo = gitHubRepo();
        if (!repo) return false;
        toast((await copyText(`git clone https://github.com/${repo}.git`)) ? `Copied clone command for ${repo}` : 'Copy failed');
      });
    },
  });

  register({
    id: 'github-vscode-dev',
    name: 'GitHub: open in vscode.dev',
    category: 'sites',
    match: onGitHub,
    description: 'Opens the current repository in the browser version of VS Code.',
    run() {
      command('GitHub: open repository in vscode.dev', null, () => {
        const repo = gitHubRepo();
        if (!repo) return false;
        window.open(`https://vscode.dev/github/${repo}`, '_blank', 'noopener');
      });
    },
  });

  register({
    id: 'github-copy-path',
    name: 'GitHub: copy file path',
    category: 'sites',
    match: onGitHub,
    description: 'On a GitHub file or folder page, copies its path within the repository (e.g. src/index.js).',
    run() {
      command('GitHub: copy file path', null, async () => {
        const path = location.pathname.match(/^\/[^/]+\/[^/]+\/(?:blob|tree)\/[^/]+\/(.+)$/)?.[1];
        if (!path) return false;
        const decoded = decodeURIComponent(path);
        toast((await copyText(decoded)) ? `Copied ${decoded}` : 'Copy failed');
      });
    },
  });

  register({
    id: 'github-absolute-dates',
    name: 'GitHub: absolute dates',
    category: 'sites',
    defaultEnabled: false,
    match: onGitHub,
    description: 'Shows real dates ("Mar 4, 2025") instead of relative ones ("3 months ago") on GitHub.',
    run() {
      watchDom(() => {
        for (const time of document.querySelectorAll('relative-time:not([format="datetime"])')) {
          time.setAttribute('format', 'datetime');
        }
      });
    },
  });

  // --- YouTube ------------------------------------------------------------------

  const onYouTube = () => /(^|\.)youtube\.com$/.test(location.hostname);
  const youTubeVideoId = () =>
    new URLSearchParams(location.search).get('v') ?? location.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/)?.[1] ?? null;

  register({
    id: 'youtube-shorts-to-watch',
    name: 'YouTube: open Shorts in the normal player',
    category: 'sites',
    defaultEnabled: false,
    match: onYouTube,
    description: 'Redirects /shorts/ links to the regular video page, with a seek bar, speed control and comments.',
    run() {
      const redirect = () => {
        const id = location.pathname.match(/^\/shorts\/([\w-]{11})/)?.[1];
        if (id) location.replace(`/watch?v=${id}`);
      };
      redirect();
      // YouTube is a single-page app; it fires this event after every in-app navigation.
      document.addEventListener('yt-navigate-finish', redirect);
    },
  });

  register({
    id: 'youtube-hide-shorts',
    name: 'YouTube: hide Shorts',
    category: 'sites',
    defaultEnabled: false,
    match: onYouTube,
    description: 'Hides Shorts shelves, Shorts in feeds and search results, and the Shorts menu entry.',
    run() {
      addStyle(`
        ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], grid-shelf-view-model:has(a[href^="/shorts/"]),
        ytd-rich-item-renderer:has(a[href^="/shorts/"]), ytd-video-renderer:has(a[href^="/shorts/"]),
        ytd-guide-entry-renderer:has(a[title="Shorts"]), ytd-mini-guide-entry-renderer[aria-label="Shorts"] {
          display: none !important;
        }`);
    },
  });

  register({
    id: 'youtube-hide-comments',
    name: 'YouTube: hide comments',
    category: 'sites',
    defaultEnabled: false,
    match: onYouTube,
    description: 'Hides the comment section under videos.',
    run() {
      addStyle('ytd-comments#comments { display: none !important; }');
    },
  });

  register({
    id: 'youtube-timestamp-link',
    name: 'YouTube: copy link at current time',
    category: 'sites',
    shortcut: 'Alt+Shift+Y',
    match: onYouTube,
    description: 'Copies a short youtu.be link that starts the video where you are right now.',
    run() {
      command('YouTube: copy link at current time', 'alt+shift+y', async () => {
        const id = youTubeVideoId();
        if (!id) return false;
        const seconds = Math.floor(document.querySelector('#movie_player video, video')?.currentTime ?? 0);
        const link = `https://youtu.be/${id}${seconds ? `?t=${seconds}` : ''}`;
        toast((await copyText(link)) ? `Copied ${link}` : 'Copy failed');
      });
    },
  });

  register({
    id: 'youtube-thumbnail',
    name: 'YouTube: open video thumbnail',
    category: 'sites',
    match: onYouTube,
    description: 'Opens the full-resolution thumbnail of the current video. Run it from the command palette.',
    run() {
      command('YouTube: open video thumbnail', null, () => {
        const id = youTubeVideoId();
        if (!id) return false;
        window.open(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, '_blank', 'noopener');
      });
    },
  });

  // --- Other sites ----------------------------------------------------------------

  register({
    id: 'wikipedia-desktop',
    name: 'Wikipedia: always use desktop site',
    category: 'sites',
    match: () => /\.m\.wikipedia\.org$/.test(location.hostname),
    description: 'Redirects mobile Wikipedia links (en.m.wikipedia.org) to the desktop site.',
    run() {
      location.replace(location.href.replace('.m.wikipedia.org', '.wikipedia.org'));
    },
  });

  register({
    id: 'old-reddit',
    name: 'Reddit: use old.reddit.com',
    category: 'sites',
    defaultEnabled: false,
    match: () => location.hostname === 'www.reddit.com' && !/^\/(media|gallery|poll)\b/.test(location.pathname),
    description: 'Redirects Reddit to the classic, faster old.reddit.com layout.',
    run() {
      location.replace(`https://old.reddit.com${location.pathname}${location.search}${location.hash}`);
    },
  });

  register({
    id: 'amazon-short-url',
    name: 'Amazon: short product URLs',
    category: 'sites',
    match: () => /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|nl|se|pl|in|co\.jp|com\.au|com\.mx|com\.br|com\.tr|sg|ae|sa)$/.test(location.hostname),
    description: 'Shortens product page addresses to /dp/ASIN, so copied links are clean and free of tracking.',
    run() {
      const asin = location.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/)?.[1];
      if (asin && location.pathname !== `/dp/${asin}`) history.replaceState(history.state, '', `/dp/${asin}`);
    },
  });

  register({
    id: 'wikipedia-hide-citations',
    name: 'Wikipedia: hide citation numbers',
    category: 'sites',
    defaultEnabled: false,
    match: () => /(^|\.)wikipedia\.org$/.test(location.hostname),
    description: 'Hides the [1][2] citation markers in article text for smoother reading.',
    run() {
      addStyle('sup.reference, sup.noprint.Inline-Template { display: none !important; }');
    },
  });

  register({
    id: 'stackexchange-hide-hot-questions',
    name: 'Stack Overflow: hide "Hot Network Questions"',
    category: 'sites',
    defaultEnabled: false,
    match: () => /(^|\.)(stackoverflow\.com|stackexchange\.com|superuser\.com|serverfault\.com|askubuntu\.com|mathoverflow\.net)$/.test(location.hostname),
    description: 'Removes the distracting "Hot Network Questions" sidebar on Stack Overflow and Stack Exchange sites.',
    run() {
      addStyle('#hot-network-questions { display: none !important; }');
    },
  });

  register({
    id: 'hacker-news-collapse',
    name: 'Hacker News: collapse all threads',
    category: 'sites',
    match: () => location.hostname === 'news.ycombinator.com',
    description: 'Collapses every top-level comment thread so you can skim and open just the ones you want.',
    run() {
      command('Hacker News: collapse all top-level comments', null, () => {
        let collapsed = 0;
        for (const row of document.querySelectorAll('tr.comtr')) {
          if (row.querySelector('td.ind')?.getAttribute('indent') !== '0' || row.classList.contains('coll')) continue;
          row.querySelector('a.togg')?.click();
          collapsed++;
        }
        if (!collapsed) return false;
        toast(`Collapsed ${collapsed} thread(s)`);
      });
    },
  });
})();
