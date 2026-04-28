import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/products?pageSize=6').then(d => setProducts(d.products || [])).catch(() => {});
    api.get('/categories').then(d => setCategories(d.categories || [])).catch(() => {});
  }, []);

  return (
    <div>
      {/* Hero */}
      <div style={styles.hero}>
        <h1 style={styles.heroTitle}>Welcome to ShopEase</h1>
        <p style={styles.heroSub}>Your one-stop shop for everything you need</p>
        <Link to="/products" style={styles.heroBtn}>Shop Now</Link>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Categories</h2>
          <div style={styles.catGrid}>
            {categories.map(c => (
              <Link key={c.categoryId} to={`/products?categoryId=${c.categoryId}`} style={styles.catCard}>
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      {products.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Featured Products</h2>
          <div style={styles.grid}>
            {products.map(p => (
              <Link key={p.productId} to={`/products/${p.productId}`} style={styles.card}>
                <div style={styles.imgBox}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.name} style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}} />
                    : <span style={{fontSize:48}}>🛒</span>}
                </div>
                <div style={styles.cardBody}>
                  <div style={styles.cardName}>{p.name}</div>
                  <div style={styles.cardPrice}>₹{p.price}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const styles = {
  hero: { background:'linear-gradient(135deg,#1a1a2e,#16213e)', color:'#fff', textAlign:'center', padding:'80px 20px' },
  heroTitle: { fontSize:48, margin:0 },
  heroSub: { fontSize:20, margin:'16px 0 32px', color:'#aaa' },
  heroBtn: { background:'#ff6b35', color:'#fff', padding:'14px 36px', borderRadius:8, textDecoration:'none', fontSize:18, fontWeight:'bold' },
  section: { maxWidth:1100, margin:'40px auto', padding:'0 20px' },
  sectionTitle: { fontSize:28, marginBottom:20, color:'#1a1a2e' },
  catGrid: { display:'flex', gap:12, flexWrap:'wrap' },
  catCard: { background:'#f0f4ff', padding:'12px 24px', borderRadius:8, textDecoration:'none', color:'#4a90e2', fontWeight:'bold', border:'1px solid #d0d9ff' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 },
  card: { background:'#fff', borderRadius:10, boxShadow:'0 2px 8px rgba(0,0,0,0.08)', textDecoration:'none', color:'inherit', overflow:'hidden' },
  imgBox: { background:'#f5f5f5', height:140, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48 },
  cardBody: { padding:12 },
  cardName: { fontWeight:'bold', marginBottom:4, color:'#222' },
  cardPrice: { color:'#ff6b35', fontWeight:'bold' },
};
