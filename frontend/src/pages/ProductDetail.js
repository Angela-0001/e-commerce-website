import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/products/${id}`).then(d => setProduct(d.product || d)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  async function addToCart() {
    if (!user) { navigate('/login'); return; }
    try {
      await api.post('/cart/items', { productId: id, quantity: qty });
      setToast({ message: 'Added to cart!', type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
  }

  if (loading) return <Spinner />;
  if (!product) return <p style={{textAlign:'center',padding:40}}>Product not found.</p>;

  return (
    <div style={styles.wrap}>
      <Link to="/products" style={styles.back}>← Back to Products</Link>
      <div style={styles.card}>
        <div style={styles.imgBox}>
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}} onError={e=>{e.target.style.display='none';}} />
            : <span style={{fontSize:80}}>🛒</span>}
        </div>
        <div style={styles.info}>
          <h1 style={styles.name}>{product.name}</h1>
          <p style={styles.desc}>{product.description}</p>
          <div style={styles.price}>₹{product.price}</div>
          <div style={styles.stock}>{product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : <span style={{color:'red'}}>Out of stock</span>}</div>
          <div style={styles.qtyRow}>
            <button style={styles.qtyBtn} onClick={() => setQty(q => Math.max(1, q-1))}>-</button>
            <span style={styles.qty}>{qty}</span>
            <button style={styles.qtyBtn} onClick={() => setQty(q => Math.min(product.stockQuantity, q+1))}>+</button>
          </div>
          <button style={{...styles.addBtn, opacity: product.stockQuantity===0?0.5:1}} disabled={product.stockQuantity===0} onClick={addToCart}>
            Add to Cart
          </button>
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

const styles = {
  wrap: { maxWidth:900, margin:'32px auto', padding:'0 20px' },
  back: { color:'#4a90e2', textDecoration:'none', fontSize:15 },
  card: { display:'flex', gap:40, background:'#fff', borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.08)', padding:32, marginTop:16, flexWrap:'wrap' },
  imgBox: { width:280, height:280, background:'#f5f5f5', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:80 },
  info: { flex:1, minWidth:240 },
  name: { fontSize:28, color:'#1a1a2e', marginBottom:12 },
  desc: { color:'#666', lineHeight:1.6, marginBottom:16 },
  price: { fontSize:28, color:'#ff6b35', fontWeight:'bold', marginBottom:8 },
  stock: { color:'#888', marginBottom:20 },
  qtyRow: { display:'flex', alignItems:'center', gap:16, marginBottom:20 },
  qtyBtn: { width:36, height:36, border:'1px solid #ddd', borderRadius:6, background:'#f5f5f5', cursor:'pointer', fontSize:18 },
  qty: { fontSize:18, fontWeight:'bold', minWidth:24, textAlign:'center' },
  addBtn: { padding:'14px 32px', background:'#ff6b35', color:'#fff', border:'none', borderRadius:8, fontSize:16, cursor:'pointer', fontWeight:'bold' },
};
