import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import Spinner from '../components/Spinner';

const statusColors = { Pending:'#f39c12', Processing:'#3498db', Shipped:'#9b59b6', Delivered:'#2ecc71' };

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/orders/${id}`).then(d => setOrder(d.order || d)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (!order) return <p style={{textAlign:'center',padding:40}}>Order not found.</p>;

  return (
    <div style={styles.wrap}>
      <Link to="/orders" style={styles.back}>← Back to Orders</Link>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2>Order #{order.orderId?.slice(-8).toUpperCase()}</h2>
          <span style={{...styles.badge, background: statusColors[order.status] || '#888'}}>{order.status}</span>
        </div>
        <div style={styles.meta}>
          <span>Date: {new Date(order.createdAt).toLocaleString()}</span>
          <span>Total: <strong style={{color:'#ff6b35'}}>₹{order.totalAmount || order.total || 0}</strong></span>
        </div>
        {order.deliveryAddress && (
          <div style={styles.address}>
            <strong>Delivery Address:</strong> {order.deliveryAddress}
          </div>
        )}
        <h3 style={{marginTop:24}}>Items</h3>
        {(order.items || []).map(item => (
          <div key={item.productId} style={styles.item}>
            <span>{item.productName || item.productId}</span>
            <span>x{item.quantity}</span>
            <span style={{color:'#ff6b35'}}>₹{(item.unitPrice || item.price || 0) * item.quantity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth:700, margin:'32px auto', padding:'0 20px' },
  back: { color:'#4a90e2', textDecoration:'none' },
  card: { background:'#fff', borderRadius:12, padding:32, boxShadow:'0 4px 20px rgba(0,0,0,0.08)', marginTop:16 },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  badge: { color:'#fff', padding:'6px 16px', borderRadius:20, fontWeight:'bold' },
  meta: { display:'flex', gap:32, color:'#666', marginBottom:16 },
  address: { background:'#f5f7fa', padding:12, borderRadius:6, color:'#555' },
  item: { display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #eee' },
};
