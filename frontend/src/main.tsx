import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './theme.css';
import './payment-theme.css';
import App from './App';
import { api } from './api';

const themeButton = document.createElement('button');
themeButton.className = 'theme-toggle';
themeButton.setAttribute('aria-label', 'Toggle dark mode');
themeButton.innerHTML = '◐ <span>Theme</span>';
const storedTheme = localStorage.getItem('growzia_theme_v2');
if (storedTheme === 'dark') document.documentElement.classList.add('theme-dark');
themeButton.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('theme-dark');
  localStorage.setItem('growzia_theme_v2', dark ? 'dark' : 'light');
});
document.body.appendChild(themeButton);

document.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLButtonElement>('.payment-card .btn.dark');
  if (!button || !button.textContent?.toLowerCase().includes('card')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const amountInput = document.querySelector<HTMLInputElement>('.payment-card input[type="number"]');
  const amount = Number(amountInput?.value || 0);
  button.disabled = true;
  try {
    const result = await api.initializeCardPayment(amount);
    const PaystackPop = (window as any).PaystackPop;
    if (!PaystackPop) throw new Error('Card checkout is unavailable. Refresh and try again.');
    new PaystackPop().resumeTransaction(result.accessCode);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Unable to start card payment');
  } finally { button.disabled = false; }
}, true);

const updateLinkPlaceholder = () => {
  const heading = document.querySelector('.modal h2')?.textContent?.toLowerCase() || '';
  const placeholder = heading.includes('discord') ? 'https://discord.com/invite/your-server' : heading.includes('facebook') ? 'https://facebook.com/your-page' : heading.includes('youtube') ? 'https://youtube.com/@yourchannel' : heading.includes('tiktok') ? 'https://tiktok.com/@yourusername' : heading.includes('twitter') || heading.includes(' x ') ? 'https://x.com/yourusername' : heading.includes('telegram') ? 'https://t.me/yourchannel' : 'https://your-profile-or-post-link.com';
  document.querySelectorAll<HTMLInputElement>('.modal input[type="url"]').forEach((input) => { input.placeholder = placeholder; });
};

const updateOrderEstimate = () => {
  const modal = document.querySelector<HTMLElement>('.modal');
  if (!modal) return;
  const quantity = modal.querySelector<HTMLInputElement>('input[type="number"]');
  const detail = modal.querySelector<HTMLElement>('.muted');
  const form = modal.querySelector('form');
  if (!quantity || !detail || !form) return;
  const match = detail.textContent?.match(/([0-9][0-9,]*(?:\.[0-9]+)?)/);
  if (!match) return;
  const perThousand = Number(match[1].replace(/,/g, ''));
  const total = perThousand * Number(quantity.value || 0) / 1000;
  let estimate = modal.querySelector<HTMLElement>('.order-total');
  if (!estimate) { estimate = document.createElement('div'); estimate.className = 'order-total'; form.insertBefore(estimate, form.querySelector('.error') || form.querySelector('button.btn')); }
  estimate.innerHTML = `<span>Estimated total</span><strong>KES ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`;
};
document.addEventListener('input', (event) => { if ((event.target as HTMLElement).closest('.modal input[type="number"]')) updateOrderEstimate(); });

let providerDisabled = new Set<string>();
const loadProviderSettings = () => api.providerSettings().then((settings) => { providerDisabled = new Set(settings.providerServices || []); enhanceProviderControls(); }).catch(() => {});
const enhanceProviderControls = () => {
  document.querySelectorAll<HTMLTableElement>('.panel table').forEach((table) => {
    const headers = Array.from(table.querySelectorAll('th')).map((header) => header.textContent?.toLowerCase() || '');
    if (!headers.some((header) => header.includes('cheapgains')) || table.dataset.controlsReady === 'true') return;
    table.dataset.controlsReady = 'true';
    table.querySelectorAll('tbody tr').forEach((row) => {
      const cells = row.querySelectorAll('td'); const key = cells[0]?.querySelector('small')?.textContent?.trim(); if (!key) return;
      [
        ['bwm', headers.findIndex((header) => header.includes('bwm'))],
        ['cheapgains', headers.findIndex((header) => header.includes('cheapgains'))],
      ].forEach(([provider, index]) => { const cell = cells[Number(index)]; if (!cell || Number(index) < 0 || cell.querySelector('.provider-control')) return; const button = document.createElement('button'); button.className = 'mini-btn provider-control'; const id = `${provider}:${key}`; const update = () => { button.textContent = providerDisabled.has(id) ? 'Enable' : 'Disable'; }; update(); button.addEventListener('click', async () => { button.disabled = true; const next = new Set(providerDisabled); next.has(id) ? next.delete(id) : next.add(id); try { await api.setProviderSettings(Array.from(next)); providerDisabled = next; update(); } finally { button.disabled = false; } }); cell.appendChild(button); });
    });
  });
};
void loadProviderSettings();

class AppErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() { return this.state.error ? <div style={{padding:'48px',fontFamily:'Manrope, sans-serif'}}><h1>Growzia could not load this view.</h1><p>{this.state.error.message}</p><button onClick={()=>window.location.reload()}>Reload workspace</button></div> : this.props.children; }
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
