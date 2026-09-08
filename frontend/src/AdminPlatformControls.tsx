import { useEffect, useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';
import { api } from './api';

const labels: Record<string, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', telegram: 'Telegram', twitter: 'X / Twitter' };

export default function AdminPlatformControls() {
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  useEffect(() => { api.platforms().then(result => { setPlatforms(result.platforms); setDisabled(new Set(result.disabledPlatforms)); }).catch(() => setStatus('Could not load platform visibility settings.')); }, []);
  const toggle = async (platform: string) => {
    const next = new Set(disabled);
    next.has(platform) ? next.delete(platform) : next.add(platform);
    setDisabled(next); setStatus('Saving platform visibility…');
    try { await api.setPlatforms(Array.from(next)); setStatus(`${labels[platform] || platform} is now ${next.has(platform) ? 'hidden' : 'visible'} to users.`); }
    catch (error) { setDisabled(disabled); setStatus(error instanceof Error ? error.message : 'Could not update platform visibility.'); }
  };
  return <div className="panel platform-controls"><span className="eyebrow">CUSTOMER CATALOG</span><h3>Platform availability</h3><p className="muted">Choose which social networks customers can see. Changes apply to the customer catalog immediately.</p><div className="platform-toggle-grid">{platforms.map(platform => { const hidden = disabled.has(platform); return <button key={platform} className={`platform-toggle ${hidden ? 'hidden' : ''}`} onClick={() => toggle(platform)}><span className={`platform ${platform}`}>{(labels[platform] || platform).slice(0, 1)}</span><span><b>{labels[platform] || platform}</b><small>{hidden ? 'Hidden from customers' : 'Visible to customers'}</small></span>{hidden ? <EyeOff size={16}/> : <Eye size={16}/>} </button>; })}</div>{status && <p className="email-status">{status}</p>}</div>;
}
