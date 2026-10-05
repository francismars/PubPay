import React, { useEffect, useMemo, useState } from 'react';

type Slide = { kind: 'text' | 'media'; html: string };

const SLIDE_MS = 6000;

function extractSlides(html: string): Slide[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [];

  const slides: Slide[] = [];
  let textBuf = '';

  const flushText = () => {
    const cleaned = textBuf
      .replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, '')
      .trim();
    const visible = cleaned.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, ' ').trim();
    if (visible) slides.push({ kind: 'text', html: cleaned });
    textBuf = '';
  };

  const isMedia = (el: Element) =>
    el.matches('img, video, iframe, .video-container, .image-container');

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text.trim()) textBuf += text.replace(/</g, '&lt;');
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      if (/<br\s*\/?>\s*$/i.test(textBuf)) flushText();
      else textBuf += '<br>';
      return;
    }
    if (isMedia(node)) {
      flushText();
      slides.push({ kind: 'media', html: node.outerHTML });
      return;
    }
    node.childNodes.forEach(walk);
  };

  root.childNodes.forEach(walk);
  flushText();
  return slides;
}

export const NoteContentView: React.FC<{ html: string }> = ({ html }) => {
  const [slideshow, setSlideshow] = useState(false);
  const [mediaOnly, setMediaOnly] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const sync = () => {
      setSlideshow(document.body.classList.contains('content-slideshow'));
      setMediaOnly(document.body.classList.contains('content-media-only'));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
    return () => observer.disconnect();
  }, []);

  const isLiveEvent = html.includes('live-event-content');
  const slides = useMemo(() => {
    if (!html || isLiveEvent) return [];
    const all = extractSlides(html);
    return mediaOnly ? all.filter(slide => slide.kind === 'media') : all;
  }, [html, isLiveEvent, mediaOnly]);

  useEffect(() => {
    setIndex(0);
  }, [html, slideshow, mediaOnly]);

  useEffect(() => {
    const note = document.getElementById('noteContent');
    if (!note) return;
    note.classList.toggle(
      'content-slideshow-active',
      slideshow && !isLiveEvent && slides.length > 0
    );
    note.classList.toggle(
      'content-media-only-active',
      mediaOnly && !slideshow && !isLiveEvent
    );
    return () => {
      note.classList.remove('content-slideshow-active', 'content-media-only-active');
    };
  }, [slideshow, mediaOnly, isLiveEvent, slides.length]);

  useEffect(() => {
    if (!slideshow || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex(current => (current + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [slideshow, slides.length]);

  useEffect(() => {
    if (!slideshow) return;
    const root = document.getElementById('noteContent');
    const layout = document.querySelector('.main-layout');
    if (!root) return;

    const fitAll = () => {
      const scaleRaw = layout
        ? parseFloat(
            getComputedStyle(layout).getPropertyValue('--type-scale')
          )
        : 1;
      const typeScale = Number.isFinite(scaleRaw) && scaleRaw > 0 ? scaleRaw : 1;

      root.querySelectorAll('.note-slide-text').forEach(node => {
        const slide = node as HTMLElement;
        const fit = slide.querySelector('.note-slide-fit') as HTMLElement | null;
        if (!fit || slide.clientHeight < 8 || slide.clientWidth < 8) return;

        const style = getComputedStyle(slide);
        const pad = (value: string) => {
          const n = parseFloat(value);
          return Number.isFinite(n) ? n : 0;
        };
        const maxH = Math.max(
          0,
          slide.clientHeight - pad(style.paddingTop) - pad(style.paddingBottom) - 2
        );
        const maxW = Math.max(
          0,
          slide.clientWidth - pad(style.paddingLeft) - pad(style.paddingRight)
        );
        fit.style.width = `${maxW}px`;

        const ceiling = Math.max(32, maxH * 0.42) * typeScale;
        let low = 12;
        let high = Math.max(low, ceiling);
        const fits = () =>
          fit.scrollHeight <= maxH && fit.scrollWidth <= maxW + 1;
        for (let i = 0; i < 16; i++) {
          const mid = (low + high) / 2;
          fit.style.fontSize = `${mid}px`;
          if (fits()) {
            low = mid;
          } else {
            high = mid;
          }
        }
        fit.style.fontSize = `${low}px`;
        if (!fits()) {
          fit.style.fontSize = `${Math.max(12, low * 0.96)}px`;
        }
      });
    };

    fitAll();
    const frame = window.requestAnimationFrame(fitAll);
    const observer = new ResizeObserver(fitAll);
    observer.observe(root);
    const styleObserver = layout
      ? new MutationObserver(fitAll)
      : null;
    styleObserver?.observe(layout as Element, {
      attributes: true,
      attributeFilter: ['style']
    });
    window.addEventListener('resize', fitAll);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      styleObserver?.disconnect();
      window.removeEventListener('resize', fitAll);
    };
  }, [slideshow, index, slides]);

  useEffect(() => {
    if (!slideshow) return;
    const root = document.getElementById('noteContent');
    if (!root) return;
    root.querySelectorAll('video').forEach((video, i) => {
      if (i === index) {
        video.muted = true;
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [slideshow, index, slides]);

  if (!html) return null;

  if (isLiveEvent || (!slideshow && !mediaOnly)) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (slides.length === 0) {
    return <div className="note-slide-empty">No media in this note</div>;
  }

  if (!slideshow) {
    return (
      <div
        className="note-media-stack"
        dangerouslySetInnerHTML={{
          __html: slides.map(slide => slide.html).join('')
        }}
      />
    );
  }

  return (
    <div className="note-slideshow">
      {slides.map((slide, i) => (
        <div
          key={`${slide.kind}-${i}`}
          className={`note-slide note-slide-${slide.kind}${i === index ? ' active' : ''}`}
          dangerouslySetInnerHTML={{
            __html:
              slide.kind === 'text'
                ? `<div class="note-slide-fit">${slide.html}</div>`
                : slide.html
          }}
        />
      ))}
      {slides.length > 1 && (
        <div className="note-slide-count">
          {index + 1} / {slides.length}
        </div>
      )}
    </div>
  );
};
