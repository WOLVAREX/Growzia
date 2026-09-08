import { useState } from 'react';
import { Check, RefreshCw, Search } from 'lucide-react';
import { api } from './api';

const money = (n:number) => `KES ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Status({ value }:{value:string}) {
  return <span className={`status status-${value}`}>{value}</span>;
}

export default function AdminOrdersPanel({ orders, refresh, pendingOnly = false }:{orders:any[];refresh:()=>void;pendingOnly?:boolean}) {
  const [checks, setChecks] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState('');
  const [messages, setMessages] = useState<Record<string, string>>({});

  const inspect = async (id:string) => {
    setBusy(id); setMessages({...messages, [id]: 'Checking provider endpoint and balance…'});
    try { const result = await api.providerCheck(id); setChecks({...checks, [id]: result.inspection}); setMessages({...messages, [id]: 'Provider check complete'}); }
    catch (error) { setMessages({...messages, [id]: (error as Error).message}); }
    finally { setBusy(''); }
  };
  const initiate = async (id:string) => {
    setBusy(id); setMessages({...messages, [id]: 'Initiating with provider…'});
    try { await api.initiateOrder(id); setMessages({...messages, [id]: 'Provider initiation completed'}); await refresh(); await inspect(id); }
    catch (error) { setMessages({...messages, [id]: (error as Error).message}); }
    finally { setBusy(''); }
  };
  const complete = async (id:string) => {
    setBusy(id); setMessages({...messages, [id]: 'Updating order…'});
    try { await api.complete(id); setMessages({...messages, [id]: 'Order marked completed'}); await refresh(); }
    catch (error) { setMessages({...messages, [id]: (error as Error).message}); }
    finally { setBusy(''); }
  };

  return <div className="panel">
    <div className="section-head"><div>
      <span className="eyebrow">{pendingOnly ? 'PENDING PROVIDER ORDERS' : 'ALL ORDERS'}</span>
      <h3>{pendingOnly ? 'Provider preflight queue' : 'Order operations'}</h3>
      <p className="muted">Inspect the target URL, provider service ID, live provider funds, and endpoint before initiation.</p>
    </div><button className="btn outline" onClick={() => refresh()} disabled={busy !== ''}><RefreshCw size={15}/> Refresh</button></div>
    <div className="table-scroll"><table><thead><tr><th>Customer / target</th><th>Service / route</th><th>Provider funds</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {orders.length === 0 ? <tr><td colSpan={6}><div className="empty">No matching orders.</div></td></tr> : orders.map(order => {
        const check = checks[order.id]; const isBusy = busy === order.id;
        return <tr key={order.id}>
          <td><b>{order.user?.username || 'Unknown'}</b><small>{order.user?.email}</small><a className="order-link" href={order.link} target="_blank" rel="noreferrer" title={order.link}>{order.link}</a></td>
          <td><b>{order.serviceName}</b><small>{order.platformId} · {order.serviceType} · qty {Number(order.quantity || 0).toLocaleString()}</small><small>Provider service ID: {order.providerServiceId || '—'}</small>{check && <small className={check.providerCheckError ? 'error-text' : 'route-check'}>{check.providerCheckError || `${check.providerCode} endpoint checked · ${check.providerEndpoint}`}</small>}</td>
          <td>{check?.providerBalanceKes == null ? 'Not checked' : <><b>{money(check.providerBalanceKes)}</b><small>Required: {money(check.expectedProviderCostKes)}</small></>}</td>
          <td>{money(order.costKes)}</td>
          <td><Status value={order.status}/>{messages[order.id] && <small className="action-feedback">{messages[order.id]}</small>}</td>
          <td className="action-cell">{order.status === 'pending' && !order.providerOrderId && <>{!check ? <button className="mini-btn" disabled={isBusy} onClick={() => inspect(order.id)}>{isBusy ? 'Checking…' : <><Search size={12}/> Check provider</>}</button> : <button className="mini-btn" disabled={isBusy || !check.canInitiate} onClick={() => initiate(order.id)}>{isBusy ? 'Working…' : check.canInitiate ? <><Check size={12}/> Initiate</> : 'Waiting for funds'}</button>}</>}{order.status !== 'completed' && order.providerOrderId && <button className="mini-btn" disabled={isBusy} onClick={() => complete(order.id)}>{isBusy ? 'Saving…' : 'Complete'}</button>}</td>
        </tr>;
      })}
    </tbody></table></div>
  </div>;
}
