import { useEffect, useState } from 'react';
import { api } from './api';

export default function AdminEmailTools({ users }: { users: any[] }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('broadcast');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState('');
  const [senderId, setSenderId] = useState('');
  const [hours, setHours] = useState(24);
  const [opsStatus, setOpsStatus] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [testStatus, setTestStatus] = useState('');

  useEffect(() => {
    void Promise.all([api.providerAlerts(), api.processingWindow()]).then(([alerts, window]) => {
      setNumbers((alerts.numbers || []).join(', '));
      setSenderId(alerts.senderId || '');
      setHours(window.hours ?? 24);
    }).catch(() => setOpsStatus('Could not load operations settings.'));
  }, []);

  const saveOperations = async () => {
    setOpsStatus('Saving…');
    try {
      await api.setProviderAlerts(numbers.split(',').map(value => value.trim()).filter(Boolean), senderId);
      await api.setProcessingWindow(hours);
      setOpsStatus('Operations settings saved.');
    } catch (error) { setOpsStatus(error instanceof Error ? error.message : 'Could not save operations settings.'); }
  };

  const send = async () => {
    if (!subject.trim() || !message.trim()) { setStatus('Enter a subject and message.'); return; }
    setBusy(true); setStatus('');
    try {
      const result = target === 'broadcast' ? await api.broadcastEmail(subject, message) : await api.emailUser(target, subject, message);
      setStatus(target === 'broadcast' ? `Sent to ${result.sent} users.` : 'Email sent successfully.');
      setSubject(''); setMessage('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Email could not be sent.'); }
    finally { setBusy(false); }
  };

  const testSms = async () => {
    if (!testNumber.trim()) { setTestStatus('Enter a recipient number first.'); return; }
    setTestStatus('Sending test SMS…');
    try { await api.testProviderAlert(testNumber.trim(), senderId); setTestStatus('Test SMS accepted by Nena.'); }
    catch (error) { setTestStatus(error instanceof Error ? error.message : 'Test SMS failed.'); }
  };

  return <div className="email-tools">
    <div className="email-tools-head"><div><span className="eyebrow">OPERATIONS CENTER</span><h3>Provider alerts and customer timing</h3><p className="muted">Queued orders are explained to customers. Low-provider-balance alerts are sent only after an order reaches the provider flow.</p></div></div>
    <label>Processing window (hours)<input type="number" min="0" max="168" value={hours} onChange={event => setHours(Number(event.target.value))}/></label>
    <label>Nena sender UUID<input value={senderId} onChange={event => setSenderId(event.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/><small>Nena requires the sender UUID, not the display name (for example, not “NENA”).</small></label>
    <label>Admin alert numbers<input value={numbers} onChange={event => setNumbers(event.target.value)} placeholder="2547..., 2547..."/><small>Separate multiple numbers with commas.</small></label>
    <button className="btn dark" onClick={saveOperations}>Save operations settings</button>{opsStatus && <p className="email-status">{opsStatus}</p>}
    <label>Test recipient<input value={testNumber} onChange={event => setTestNumber(event.target.value)} placeholder="254712345678"/></label><button className="btn outline" onClick={testSms}>Send test SMS</button>{testStatus && <p className="email-status">{testStatus}</p>}
    <div className="email-tools-head"><div><span className="eyebrow">EMAIL CENTER</span><h3>Contact your users</h3><p className="muted">Send a broadcast or a direct message through Brevo.</p></div></div>
    <select value={target} onChange={event => setTarget(event.target.value)}><option value="broadcast">Broadcast to all active users</option>{users.filter(user => !user.isBanned).map(user => <option key={user.id} value={user.id}>{user.username} · {user.email}</option>)}</select>
    <input value={subject} onChange={event => setSubject(event.target.value)} placeholder="Subject"/><textarea value={message} onChange={event => setMessage(event.target.value)} placeholder="Write your message…" rows={4}/><button className="btn dark" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send email'}</button>{status && <p className="email-status">{status}</p>}
  </div>;
}
