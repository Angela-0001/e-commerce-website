import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Spinner from '../components/Spinner';
import Toast from '../components/Toast';

export default function Cart() {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();

  async function fetchCart() {
    try {
      const data = await api.get('/cart');
      setCart(data);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchCart(); }, []);

  async function updateQty(productId, quantity) {
    try {
      await api.put(`/cart/items/${productId}`, { quantity });
      fetchCart();
    } catch (err) { setToast({ message: err.message, type: 'error' }); }
  }

  async function removeItem(productId) {
    if (!window.confirm('Remove this item?')) return;
    try {
      await api.del(`/cart/items/${productId}`);
      fetchCart();
    } catch (err) { setToast({ message: err.message, type: 'error' }); }
  }

  async function placeOrder() {
    try {
      const data = await api.post('/orders', {});
      setToast({ message: 'Order placed!', type: 'success' });
      setTimeout(() => navigate(`/orders/${data.orderId}`), 1200);
    } catch (err) { setToast({ message: err.message, type: 'error' }); }
  }

  if (loading) return <Spinner />;

  const items = cart?.items || [];

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>Your Cart</h2>
      {items.length === 0 ? (
        <p style={styles.empty}>Your cart is empty.</p>
      ) : (
        <>
          {items.map(item => (
            <div key={item.productId} style={styles.row}>
              <div style={styles.imgBox}>
                {item.imageUrl
                  ? <img src={item.imageUrl} alt={item.productName} style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:6}} onError={e=>{e.target.style.display='none';}} />
                  : <span style={{fontSize:28}}>🛒</span>}
              </div>
              <div style={styles.info}>
                <div style={styles.name}>{item.productName}</div>
                <div style={styles.price}>₹{item.unitPrice || item.price} each</div>
              </div>
              <div style={styles.qtyRow}>
                <button style={styles.qBtn} onClick={() => updateQty(item.productId, item.quantity - 1)}>-</button>
                <span style={styles.qty}>{item.quantity}</span>
                <button style={styles.qBtn} onClick={() => updateQty(item.productId, item.quantity + 1)}>+</button>
              </div>
              <div style={styles.lineTotal}>₹{item.lineTotal || (item.unitPrice || item.price) * item.quantity}</div>
              <button style={styles.removeBtn} onClick={() => removeItem(item.productId)}>✕</button>
            </div>
          ))}
          <div style={styles.totalRow}>
            <span>Total:</span>
            <span style={styles.total}>₹{cart.grandTotal || cart.total || items.reduce((s,i) => s + (i.lineTotal || (i.unitPrice||i.price)*i.quantity), 0)}</span>
          </div>
          <button style={styles.orderBtn} onClick={placeOrder}>Proceed to Order</button>
        </>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

const styles = {
  wrap: { maxWidth:800, margin:'32px auto', padding:'0 20px' },
  title: { fontSize:28, color:'#1a1a2e', marginBottom:24 },
  empty: { textAlign:'center', color:'#888', padding:40, fontSize:18 },
  row: { display:'flex', alignItems:'center', gap:16, background:'#fff', borderRadius:10, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' },
  imgBox: { width:60, height:60, background:'#f5f5f5', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 },
  info: { flex:1 },
  name: { fontWeight:'bold', color:'#222' },
  price: { color:'#888', fontSize:14 },
  qtyRow: { display:'flex', alignItems:'center', gap:8 },
  qBtn: { width:28, height:28, border:'1px solid #ddd', borderRadius:4, background:'#f5f5f5', cursor:'pointer' },
  qty: { minWidth:24, textAlign:'center', fontWeight:'bold' },
  lineTotal: { fontWeight:'bold', color:'#ff6b35', minWidth:80, textAlign:'right' },
  removeBtn: { background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:18 },
  totalRow: { display:'flex', justifyContent:'space-between', padding:'16px 0', fontSize:20, fontWeight:'bold', borderTop:'2px solid #eee' },
  total: { color:'#ff6b35' },
  orderBtn: { display:'block', width:'100%', padding:14, background:'#ff6b35', color:'#fff', border:'none', borderRadius:8, fontSize:16, cursor:'pointer', fontWeight:'bold', marginTop:16 },
};
