// Switches between the Home / Graphs / About sections of index.html based on
// the URL hash (#home, #graphs, #about). Only shows and hides sections - the
// page never reloads, so paystubs loaded on Home stay in memory. Kept apart
// from script.js so the tabs still work if pdf.js fails to load.

const DEFAULT_PAGE = 'home';
const tabs = [...document.querySelectorAll('.tabs__tab')];
const pageNames = tabs.map((tab) => tab.dataset.page);

function showPage() {
  const requested = location.hash.slice(1);
  const current = pageNames.includes(requested) ? requested : DEFAULT_PAGE;
  for (const name of pageNames) {
    document.getElementById(`page-${name}`).hidden = name !== current;
  }
  for (const tab of tabs) {
    if (tab.dataset.page === current) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
}

window.addEventListener('hashchange', showPage);
showPage();
