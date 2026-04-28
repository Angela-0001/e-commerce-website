import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Spinner from '../components/Spinner';

const statusColors = { Pending:'#f39c12', Processing:'#3498db', Shipped:'#9b59b6', Delivered:'#2ecc71' };

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/orders').then(d => setOrders(d.items || d.orders || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div style={styles.wrap}>
      <h2 style={styles.title}>My Orders</h2>
      {orders.length === 0 ? <p style={styles.empty}>No orders yet.</p> : (
        orders.map(o => (
          <Link key={o.orderId} to={`/orders/${o.orderId}`} style={styles.card}>
            <div>
              <div style={styles.orderId}>Order #{o.orderId.slice(-8).toUpperCase()}</div>
              <div style={styles.date}>{new Date(o.createdAt).toLocaleDateString()}</div>
            </div>
            <div style={styles.right}>
              <div style={styles.total}>₹{o.totalAmount || o.total || 0}</div>
              <span style={{...styles.badge, background: statusColors[o.status] || '#888'}}>{o.status}</span>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}

const styles = {
  wrap: { maxWidth:800, margin:'32px auto', padding:'0 20px' },
  title: { fontSize:28, color:'#1a1a2e', marginBottom:24 },
  empty: { textAlign:'center', color:'#888', padding:40 },
  card: { display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', borderRadius:10, padding:20, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', textDecoration:'none', color:'inherit' },
  orderId: { fontWeight:'bold', color:'#1a1a2e', marginBottom:4 },
  date: { color:'#888', fontSize:14 },
  right: { textAlign:'right' },
  total: { fontWeight:'bold', color:'#ff6b35', fontSize:18, marginBottom:6 },
  badge: { color:'#fff', padding:'4px 12px', borderRadius:20, fontSize:13, fontWeight:'bold' },
};
