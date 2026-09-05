import { useEffect, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';

type Service = {
  id: string;
  name: string;
  category?: string;
  platformId: string;
  pricePer1000: number;
};

export default function ServicesOptimized({ services, query, setQuery, loading, onSelect }: {
  services: Service[];
  query: string;
  setQuery: (value: string) => void;
  loading: boolean;
  onSelect: (service: Service) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(60);

  useEffect(() => {
    setVisibleCount(60);
  }, [query]);

  const visibleServices = services.slice(0, visibleCount);

  return <div className="content">
    <div className="page-intro">
      <div><span className="eyebrow">CATALOG</span><h2>Find your next growth move.</h2><p>Choose from {services.length || 'our'} high-quality services across every major platform.</p></div>
      <div className="search"><Search size={17}/><input placeholder="Search services" value={query} onChange={event => setQuery(event.target.value)}/></div>
    </div>
    <div className="service-grid">
      {loading ? <div className="empty">Loading your catalog…</div> : visibleServices.map(service => <button className="service-card" key={service.id} onClick={() => onSelect(service)}>
        <div className={`platform ${service.platformId}`}>{service.platformId.slice(0, 1).toUpperCase()}</div>
        <span className="category">{service.category || service.platformId}</span>
        <h3>{service.name}</h3>
        <div className="service-meta"><span>From KES {Number(service.pricePer1000 || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / 1k</span><ChevronRight size={16}/></div>
      </button>)}
      {!loading && !services.length && <div className="empty">No services found. Try another search.</div>}
    </div>
    {!loading && visibleCount < services.length && <button className="btn outline service-load-more" onClick={() => setVisibleCount(count => count + 60)}>Load more services ({services.length - visibleCount} remaining)</button>}
  </div>;
}
