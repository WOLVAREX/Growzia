export type User = { id:string; email:string; username:string; balanceKes:number; isAdmin:boolean; isBanned:boolean; apiKeyActive:boolean; apiKeyPrefix?:string|null };
export type Service = { id:string; name:string; category:string; platformId:string; serviceType:string; min:number; max:number; pricePer1000:number; isRegionVariant?:boolean };
export type Order = { id:string; serviceName:string; platformId:string; quantity:number; costInSelectedCurrency:number; costCurrency:string; status:string; link:string; createdAt:string; remains?:number|null };
const base = import.meta.env.VITE_API_URL || '/api';
let token = localStorage.getItem('growzia_token') || '';
export const setToken = (next:string) => { token = next; next ? localStorage.setItem('growzia_token', next) : localStorage.removeItem('growzia_token'); };
async function request<T>(path:string, options:RequestInit={}) { const headers = new Headers(options.headers); headers.set('Content-Type','application/json'); if (token) headers.set('Authorization', `Bearer ${token}`); const res = await fetch(`${base}${path}`, {...options, headers, credentials:'include'}); const data = await res.json().catch(()=>({})); if (!res.ok) throw new Error(data.error || 'Something went wrong'); return data as T; }
export const api = {
  publicStats: () => request<{users:number}>('/public/stats'),
  login: (body:object) => request<{token:string;user:User}>('/auth/login',{method:'POST',body:JSON.stringify(body)}),
  register: (body:object) => request<{token:string;user:User}>('/auth/register',{method:'POST',body:JSON.stringify(body)}),
  me: () => request<{user:User}>('/auth/me'),
  exchangeGoogle: (code:string) => request<{token:string}>('/auth/google/exchange',{method:'POST',body:JSON.stringify({code})}),
  services: (q='',category='') => request<{services:Service[];count:number;currency:{code:string;symbol:string}}>('/boost/services?'+new URLSearchParams({q,category})),
  categories: () => request<{categories:string[]}>('/boost/categories'),
  orders: () => request<{orders:Order[];stats:Record<string,number>}>('/boost/orders'),
  order: (body:object) => request<{order:Order}>('/boost/order',{method:'POST',body:JSON.stringify(body)}),
  adminStats: () => request<any>('/admin/stats'),
  adminUsers: () => request<any>('/admin/users?limit=100'),
  adminOrders: () => request<any>('/admin/orders?limit=100'),
  rawCatalog: () => request<any>('/admin/catalog/raw?limit=5000'),
  updateCatalogPrice: (canonicalKey:string,sellKesPer1000:number) => request<any>(`/admin/catalog/${encodeURIComponent(canonicalKey)}/price`,{method:'PATCH',body:JSON.stringify({sellKesPer1000})}),
  sync: () => request<any>('/admin/catalog/sync',{method:'POST'}),
  settings: () => Promise.all([request<any>('/admin/settings/maintenance'),request<any>('/admin/settings/margin'),request<any>('/admin/settings/disabled-services')]),
  providerSettings: () => request<{providerServices:string[]}>('/admin/settings/disabled-provider-services'),
  setProviderSettings: (providerServices:string[]) => request<any>('/admin/settings/disabled-provider-services',{method:'POST',body:JSON.stringify({providerServices})}),
  setMaintenance: (enabled:boolean) => request<any>('/admin/settings/maintenance',{method:'POST',body:JSON.stringify({enabled})}),
  setMargin: (marginPercent:number) => request<any>('/admin/settings/margin',{method:'POST',body:JSON.stringify({marginPercent})}),
  ban: (id:string, banned:boolean) => request<any>(`/admin/users/${id}/${banned?'ban':'unban'}`,{method:'POST'}),
  setAdmin: (id:string, isAdmin:boolean) => request<any>(`/admin/users/${id}/admin`,{method:'POST',body:JSON.stringify({isAdmin})}),
  balance: (id:string, amountKes:number) => request<any>(`/admin/users/${id}/balance`,{method:'POST',body:JSON.stringify({amountKes})}),
  emailUser: (id:string, subject:string, message:string) => request<any>(`/admin/email/users/${id}`,{method:'POST',body:JSON.stringify({subject,message})}),
  broadcastEmail: (subject:string, message:string) => request<any>('/admin/email/broadcast',{method:'POST',body:JSON.stringify({subject,message})}),
  complete: (id:string) => request<any>(`/admin/orders/${id}/complete`,{method:'POST'}),
  initializeCardPayment: (amountKes:number) => request<{authorizationUrl:string;accessCode:string;reference:string}>('/payments/paystack/initialize',{method:'POST',body:JSON.stringify({amountKes})}),
  initializeMpesaPayment: (amountKes:number,phone:string) => request<{reference:string;status:string;displayText:string}>('/payments/mpesa/initialize',{method:'POST',body:JSON.stringify({amountKes,phone})}),
  verifyPayment: (reference:string) => request<any>('/payments/paystack/verify',{method:'POST',body:JSON.stringify({reference})}),
  paymentHistory: () => request<any>('/payments/history'),
  providerAlerts: () => request<any>('/admin/settings/provider-alerts'),
  setProviderAlerts: (numbers:string[],senderId:string) => request<any>('/admin/settings/provider-alerts',{method:'POST',body:JSON.stringify({numbers,senderId})}),
  processingWindow: () => request<any>('/admin/settings/processing-window'),
  setProcessingWindow: (hours:number) => request<any>('/admin/settings/processing-window',{method:'POST',body:JSON.stringify({hours})}),
};
