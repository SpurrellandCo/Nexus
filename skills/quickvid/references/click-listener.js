// Click and typing log for a web page being recorded with scripts/record_screen.py.
//
// Run this whole snippet in the page (the browser tool's run-JavaScript action) right after the page loads and before
// the step's first click. Read the log back before the page navigates away, with:
//     JSON.stringify(window.__qvEvents || [])
// and pass that string to `record_screen.py add-clicks <folder> --clip NN --json '<it>'` after stopping the clip.
//
// Clicks a browser extension dispatches inside a page never reach the operating system, so record_screen.py's own
// click tap cannot see them; this listener can. Times are epoch milliseconds; x and y are screen points, the same
// units macOS uses, which is what record_screen.py expects. Keep the page zoom at 100%, or the positions drift.
// It only reads where the pointer and the focused field are; it never records what is typed.
(() => {
  if (window.__qvEvents) return 'already installed';
  window.__qvEvents = [];
  const chromeTop = window.outerHeight - window.innerHeight; // toolbar and tabs above the page
  const chromeLeft = (window.outerWidth - window.innerWidth) / 2;
  const toScreen = (cx, cy) => ({ x: window.screenX + chromeLeft + cx, y: window.screenY + chromeTop + cy });
  const when = (e) => Math.round(performance.timeOrigin + e.timeStamp);
  addEventListener('pointerdown', (e) => {
    window.__qvEvents.push({ t: when(e), ...toScreen(e.clientX, e.clientY), kind: 'click' });
  }, true);
  let lastKey = 0;
  addEventListener('keydown', (e) => {
    const t = when(e);
    if (t - lastKey < 400) return; // one event per burst of typing is enough to steer the camera
    lastKey = t;
    const box = document.activeElement?.getBoundingClientRect?.();
    if (!box) return;
    window.__qvEvents.push({ t, ...toScreen(box.left + Math.min(box.width / 2, 160), box.top + box.height / 2), kind: 'key' });
  }, true);
  return 'installed';
})();
