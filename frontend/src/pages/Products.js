import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import Spinner from '../components/Spinner';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nextToken, setNextToken] = useState(null);
  const [searchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    search: '', categoryId: searchParams.get('categoryId') || '',
    minPrice: '', maxPrice: '',
  });

  const fetchProducts = useCallback(async (token = null) => {
    setLoading(true);
    try {
      let url = '/products?pageSize=10';
      if (filters.search) url += `&search=${encodeURIComponent(filters.search)}`;
      if (filters.categoryId) url += `&categoryId=${filters.categoryId}`;
      if (filters.minPrice) url += `&minPrice=${filters.minPrice}`;
      if (filters.maxPrice) url += `&maxPrice=${filters.maxPrice}`;
      if (token) url += `&nextToken=${encodeURIComponent(token)}`;
      const data = await api.get(url);
      setProducts(token ? prev => [...prev, ...(data.products||[])] : (data.products||[]));
      setNextToken(data.nextToken || null);
    } catch {}
    setLoading(false);
  }, [filters]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    api.get('/categories').then(d => setCategories(d.categories || [])).catch(() => {});
  }, []);

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>Products</h2>
      <div style={styles.filters}>
        <input style={styles.input} placeholder="Search..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} />
        <select style={styles.input} value={filters.categoryId} onChange={e => setFilters({...filters, categoryId: e.target.value})}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
        </select>
        <input style={styles.input} placeholder="Min Price" type="number" value={filters.minPrice} onChange={e => setFilters({...filters, minPrice: e.target.value})} />
        <input style={styles.input} placeholder="Max Price" type="number" value={filters.maxPrice} onChange={e => setFilters({...filters, maxPrice: e.target.value})} />
      </div>

      {loading && products.length === 0 ? <Spinner /> : (
        <>
          {products.length === 0 && <p style={styles.empty}>No products found.</p>}
          <div style={styles.grid}>
            {products.map(p => (
              <Link key={p.productId} to={`/products/${p.productId}`} style={styles.card}>
                <div style={styles.imgBox}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}} />
                    : <span style={{fontSize:48}}>🛒</span>}
                </div>
                <div style={styles.body}>
                  <div style={styles.name}>{p.name}</div>
                  <div style={styles.price}>₹{p.price}</div>
                  <div style={styles.stock}>{p.stockQuantity > 0 ? `${p.stockQuantity} in stock` : <span style={{color:'red'}}>Out of stock</span>}</div>
                </div>
              </Link>
            ))}
          </div>
          {nextToken && <button style={styles.loadMore} onClick={() => fetchProducts(nextToken)}>Load More</button>}
        </>
      )}
    </div>
  );
}

const styles = {
  wrap: { maxWidth:1100, margin:'32px auto', padding:'0 20px' },
  title: { fontSize:28, color:'#1a1a2e', marginBottom:20 },
  filters: { display:'flex', gap:12, flexWrap:'wrap', marginBottom:24 },
  input: { padding:'10px 14px', border:'1px solid #ddd', borderRadius:6, fontSize:14, minWidth:140 },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 },
  card: { background:'#fff', borderRadius:10, boxShadow:'0 2px 8px rgba(0,0,0,0.08)', textDecoration:'none', color:'inherit', overflow:'hidden' },
  imgBox: { background:'#f5f5f5', height:140, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48 },
  body: { padding:12 },
  name: { fontWeight:'bold', marginBottom:4, color:'#222' },
  price: { color:'#ff6b35', fontWeight:'bold', marginBottom:4 },
  stock: { fontSize:13, color:'#888' },
  empty: { textAlign:'center', color:'#888', padding:40 },
  loadMore: { display:'block', margin:'24px auto', padding:'12px 32px', background:'#4a90e2', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:15 },
};
