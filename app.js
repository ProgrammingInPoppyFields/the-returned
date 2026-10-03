// Loads posts.json and renders the blog.
// Posts appear in the same order as in the JSON file.

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Tiny formatter: **bold**, *italic*, blank line = new paragraph, single newline = line break.
function formatParagraphs(str) {
  return str
    .split(/\n{2,}/)
    .map(p => {
      let html = escapeHtml(p)
        .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      return `<p>${html}</p>`;
    })
    .join('');
}

// Unsplash image links (images.unsplash.com/...) get resized on Unsplash's side,
// so the page loads an 800px-wide version (sharp at 400px on retina screens).
function imageUrl(src) {
  try {
    const url = new URL(src);
    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.delete('h');
      url.searchParams.set('w', '800');
      url.searchParams.set('q', '80');
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'max');
      return url.toString();
    }
  } catch (e) { /* relative path like images/foo.jpg: use as-is */ }
  return src;
}

// Unsplash links get cropped to an exact size on Unsplash's side.
// Other URLs (or local files) are used as-is.
function croppedUrl(src, w, h) {
  try {
    const url = new URL(src);
    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('w', String(w));
      url.searchParams.set('h', String(h));
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('crop', 'entropy');
      url.searchParams.set('q', '80');
      url.searchParams.set('auto', 'format');
      return url.toString();
    }
  } catch (e) { /* relative path */ }
  return src;
}

// A text block starting with "> " becomes an indented quote.
function renderBlock(block) {
  if (typeof block === 'string') {
    if (block.startsWith('> ')) {
      return `<blockquote class="text">${formatParagraphs(block.slice(2))}</blockquote>`;
    }
    return `<div class="text">${formatParagraphs(block)}</div>`;
  }
  if (block && block.image) {
    const alt = escapeHtml(block.alt || '');
    const cls = 'post-image';
    const credit = block.credit
      ? `<figcaption>${formatParagraphs(block.credit).replace(/<\/?p>/g, '')}</figcaption>`
      : '';
    return `<figure class="${cls}"><img src="${escapeHtml(imageUrl(block.image))}" alt="${alt}" loading="lazy">${credit}</figure>`;
  }
  return '';
}

function renderPost(post) {
  const title = post.title ? `<h1 class="post-title">${escapeHtml(post.title)}</h1>` : '';
  const body = (post.body || []).map(renderBlock).join('');
  const tags = (post.tags || [])
    .map(t => `<a href="#tag/${encodeURIComponent(t)}">${escapeHtml(t)}</a>`)
    .join('');
  const classes = ['post', 'paper'];
  if (post.style === 'big') classes.push('big');
  if (post.speaker) classes.push(`speaker-${post.speaker}`);
  return `
    <div class="entry">
      <article class="${classes.join(' ')}">
        ${title}
        <div class="post-body">${body}</div>
      </article>
      ${tags ? `<div class="tags">${tags}</div>` : ''}
    </div>`;
}

let DATA = null;

// The dictionary-entry header at the top of the page.
// Each sense gets a number, a small label and its text; a sense marked
// "highlight": true is set apart below a dotted line, in typewriter type.
function renderDefinition(def) {
  const el = document.getElementById('definition');
  if (!def || !def.term) { el.hidden = true; return; }
  const inline = t => formatParagraphs(t || '').replace(/<\/?p>/g, '');
  const senses = (def.senses || []).map((s, i) => `
    <li class="sense${s.highlight ? ' highlight' : ''}">
      <span class="sense-num">${String(i + 1).padStart(2, '0')}</span>
      <div class="sense-body">
        ${s.label ? `<span class="sense-label">${escapeHtml(s.label)}</span>` : ''}
        <span class="sense-text">${inline(s.text)}</span>
      </div>
    </li>`).join('');
  const footer = (def.footer || []).map(f => `<span>${escapeHtml(f)}</span>`).join('');
  el.innerHTML = `
    <div class="definition-inner paper">
      <div class="definition-head">
        <h1 class="term">${escapeHtml(def.term)}</h1>
        ${def.pronunciation ? `<span class="pronunciation">${escapeHtml(def.pronunciation)}</span>` : ''}
      </div>
      <ol class="senses">${senses}</ol>
      <div class="card-footer">${footer}</div>
    </div>`;
  el.hidden = false;
}

// The "voices" card at the top of the feed. Each speaker's name and note
// are set in that speaker's own font; clicking one shows only their posts.
function renderVoices(active) {
  const speakers = (DATA.site && DATA.site.speakers) || {};
  const ids = Object.keys(speakers);
  const el = document.getElementById('voices');
  if (!ids.length) { el.hidden = true; return; }
  const counts = {};
  DATA.posts.forEach(p => { if (p.speaker) counts[p.speaker] = (counts[p.speaker] || 0) + 1; });
  el.innerHTML = `
    <div class="voices-label">the voices</div>
    <ul>
      ${ids.map(id => `
        <li class="voice speaker-${escapeHtml(id)}${active === id ? ' active' : ''}">
          <a href="#speaker/${encodeURIComponent(id)}">
            <span class="voice-name">${escapeHtml(speakers[id].name || id)}</span>
            <span class="voice-note">${escapeHtml(speakers[id].note || '')}</span>
          </a>
          <span class="voice-count">${counts[id] || 0}</span>
        </li>`).join('')}
    </ul>
    <div class="voices-hint">tell them apart by their handwriting</div>`;
  el.hidden = false;
}

function render() {
  const tagMatch = location.hash.match(/^#tag\/(.+)$/);
  const spkMatch = location.hash.match(/^#speaker\/(.+)$/);
  const tag = tagMatch ? decodeURIComponent(tagMatch[1]) : null;
  const speaker = spkMatch ? decodeURIComponent(spkMatch[1]) : null;
  let posts = DATA.posts;
  if (tag) posts = posts.filter(p => (p.tags || []).includes(tag));
  if (speaker) posts = posts.filter(p => p.speaker === speaker);

  renderVoices(speaker);

  const filter = document.getElementById('filter');
  if (tag || speaker) {
    const speakers = (DATA.site && DATA.site.speakers) || {};
    const label = tag
      ? `tagged: <strong>${escapeHtml(tag)}</strong>`
      : `voice: <strong>${escapeHtml((speakers[speaker] && speakers[speaker].name) || speaker)}</strong>`;
    filter.hidden = false;
    filter.innerHTML = `${label} (${posts.length}) &nbsp;/&nbsp; <a href="#">show all</a>`;
  } else {
    filter.hidden = true;
  }

  // Reading-order labels: one at the start, a nudge every few posts, one at the end.
  const NUDGE_EVERY = 6;
  const nudges = ["keep scrollin'", "keeeep scrollin'", "still going", "further down", "almost caught up"];
  const marker = (cls, text, arrow = '↓') =>
    `<div class="marker ${cls}">${text}${arrow ? `<span class="arrow">${arrow}</span>` : ''}</div>`;

  let html = marker('start', (tag || speaker) ? 'oldest first' : 'start here. oldest first');
  posts.forEach((p, i) => {
    html += renderPost(p);
    const isLast = i === posts.length - 1;
    if (!isLast && (i + 1) % NUDGE_EVERY === 0) {
      html += marker('nudge', nudges[Math.min((i + 1) / NUDGE_EVERY - 1, nudges.length - 1)]);
    }
  });
  html += marker('end', 'you’re caught up. for now.', '');

  document.getElementById('posts').innerHTML = html;
  window.scrollTo(0, 0);
}

fetch('posts.json')
  .then(r => r.json())
  .then(data => {
    DATA = data;
    const site = data.site || {};
    if (site.title) {
      document.title = site.title;
    }
    renderDefinition(site.definition);
    if (site.favicon) {
      // square crop, 128x128 so it stays sharp on retina tabs
      document.getElementById('favicon').href = croppedUrl(site.favicon, 128, 128);
    }
    if (site.description) {
      document.getElementById('site-description').innerHTML = formatParagraphs(site.description);
    }
    if (site.about) {
      const about = document.getElementById('site-about');
      about.innerHTML = formatParagraphs(site.about);
      about.hidden = false;
    }
    render();
    window.addEventListener('hashchange', render);
  })
  .catch(err => {
    document.getElementById('posts').innerHTML =
      '<p>Could not load posts.json. If you opened index.html directly from your computer, run a local server instead (see README).</p>';
    console.error(err);
  });
