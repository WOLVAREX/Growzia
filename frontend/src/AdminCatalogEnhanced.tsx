import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { api } from './api';

type ProviderRow = { name: string; providerServiceId: string; baseKesPer1000: number; rawRate: number; rawCurrency: string; min: number; max: number; disabled?: boolean };
type CatalogRow = { canonicalKey: string; platformId: string; serviceType: string; bwm: ProviderRow | null; cheapgains: ProviderRow | null; winner: { providerCode: string; baseKesPer1000: number; sellKesPer1000: number; commissionKesPer1000?: number; commissionPercent?: number; name: string } | null };

const price = (value: number | undefined) => `KES ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const safe = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export default function AdminCatalogEnhanced({ rows, refresh }: { rows: CatalogRow[]; refresh: () => void }) {
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [profitability, setProfitability] = useState<any>(null);

  useEffect(() => {
    Promise.all([api.providerSettings(), api.catalogProfitability()]).then(([settings, profit]) => { setDisabled(new Set(settings.providerServices || [])); setProfitability(profit); }).catch(() => setMessage('Could not load catalogue controls.'));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? rows.filter(row => `${row.canonicalKey} ${row.platformId} ${row.serviceType} ${row.bwm?.name || ''} ${row.cheapgains?.name || ''}`.toLowerCase().includes(term)) : rows;
  }, [rows, query]);

  const toggleProvider = async (provider: string, key: string) => {
    const id = `${provider}:${key}`;
    const next = new Set(disabled);
    next.has(id) ? next.delete(id) : next.add(id);
    setSaving(id); setMessage('');
    try { const result = await api.setProviderSettings(Array.from(next)); setDisabled(new Set(result.providerServices || next)); const text = `${disabled.has(id) ? 'Provider service enabled' : 'Provider service disabled'}. Catalog refresh started.`; setMessage(text); window.alert(text); refresh(); }
    catch (error) { const text = error instanceof Error ? error.message : 'Could not update provider service.'; setMessage(text); window.alert(text); }
    finally { setSaving(null); }
  };

  const savePrice = async (row: CatalogRow) => {
    const value = Number(prices[row.canonicalKey] ?? row.winner?.sellKesPer1000);
    if (!Number.isFinite(value) || value <= 0) { setMessage('Enter a valid Growzia price.'); return; }
    setSaving(row.canonicalKey); setMessage('');
    try { await api.updateCatalogPrice(row.canonicalKey, value); setMessage('Price updated.'); window.alert('Price updated successfully.'); refresh(); }
    catch (error) { const text = error instanceof Error ? error.message : 'Could not update price.'; setMessage(text); window.alert(text); }
    finally { setSaving(null); }
  };

  return <div className="panel admin-catalog-panel">
    {profitability && <div className="catalog-profitability"><div><span className="eyebrow">PROFITABILITY</span><h3>Revenue and provider cost</h3><p className="muted">Gross benefit is customer revenue less the selected provider cost.</p></div><div className="profit-grid"><div><small>Customer revenue</small><b>{price(profitability.orders?.customerRevenueKes)}</b><span>{safe(profitability.orders?.count)} orders</span></div><div><small>Provider cost</small><b>{price(profitability.orders?.providerCostKes)}</b><span>{safe(profitability.providers?.bwm?.orders)} BWM · {safe(profitability.providers?.cheapgains?.orders)} CheapGains</span></div><div><small>Gross benefit</small><b>{price(profitability.orders?.grossBenefitKes)}</b><span>Actual order ledger</span></div></div></div>}
    <div className="section-head"><div><span className="eyebrow">PROVIDER CATALOG</span><h3>Compare and control every service</h3><p className="muted">{rows.length} merged service groups. Provider prices are normalized to KES; Growzia price is editable.</p></div><button className="btn dark" onClick={() => api.sync().then(refresh)}><RefreshCw size={15}/> Sync providers</button></div>
    <div className="catalog-tools"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search WhatsApp, Instagram, followers…"/><span>{filtered.length} shown</span></div>
    {message && <div className="catalog-message">{message}</div>}
    <div className="table-scroll"><table className="catalog-table"><thead><tr><th>Service</th><th>Growzia price / 1k</th><th>BWM provider</th><th>CheapGains provider</th><th>Controls</th></tr></thead><tbody>{filtered.map(row => <tr key={row.canonicalKey}>
      <td><b>{row.winner?.name || row.bwm?.name || row.cheapgains?.name || row.canonicalKey}</b><small>{row.platformId} · {row.serviceType}<br/>{row.canonicalKey}</small></td>
      <td><div className="price-edit"><input type="number" min="0.01" step="0.01" value={prices[row.canonicalKey] ?? row.winner?.sellKesPer1000 ?? ''} onChange={event => setPrices({ ...prices, [row.canonicalKey]: event.target.value })}/><button className="mini-btn" disabled={saving === row.canonicalKey} onClick={() => savePrice(row)}><Save size={13}/></button></div><small>Cost: {price(row.winner?.baseKesPer1000)} · Benefit: {price(row.winner?.commissionKesPer1000)}</small></td>
      <td>{row.bwm ? <>{price(row.bwm.baseKesPer1000)}<small>{row.bwm.name.slice(0, 70)}</small><button className="mini-btn" disabled={saving === `bwm:${row.canonicalKey}`} onClick={() => toggleProvider('bwm', row.canonicalKey)}>{disabled.has(`bwm:${row.canonicalKey}`) ? 'Enable' : 'Disable'}</button></> : '—'}</td>
      <td>{row.cheapgains ? <>{price(row.cheapgains.baseKesPer1000)}<small>{row.cheapgains.name.slice(0, 70)}</small><button className="mini-btn" disabled={saving === `cheapgains:${row.canonicalKey}`} onClick={() => toggleProvider('cheapgains', row.canonicalKey)}>{disabled.has(`cheapgains:${row.canonicalKey}`) ? 'Enable' : 'Disable'}</button></> : '—'}</td>
      <td><span className="type-pill">Winner: {row.winner?.providerCode || 'none'}</span><small>Min/max: {row.winner?.providerCode === 'bwm' ? `${row.bwm?.min}–${row.bwm?.max}` : `${row.cheapgains?.min}–${row.cheapgains?.max}`}</small></td>
    </tr>)}</tbody></table></div>
    {!filtered.length && <div className="empty">No provider services match this search.</div>}
  </div>;
}
