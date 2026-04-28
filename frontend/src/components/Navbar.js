import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav style={styles.nav}>
      <Link to={isAdmin ? '/admin' : '/'} style={styles.brand}>🛍 ShopEase</Link>
      <div style={styles.links}>
        {!isAdmin && <Link to="/products" style={styles.link}>Products</Link>}
        {!isAdmin && user && <Link to="/cart" style={styles.link}>Cart</Link>}
        {!isAdmin && user && <Link to="/orders" style={styles.link}>Orders</Link>}
        {!isAdmin && user && <Link to="/profile" style={styles.link}>Profile</Link>}
        {!user && <Link to="/login" style={styles.btn}>Login</Link>}
        {!user && <Link to="/register" style={{...styles.btn, background:'#ff6b35'}}>Sign Up</Link>}
        {user && <button onClick={handleLogout} style={styles.btn}>Logout</button>}
      </div>
    </nav>
  );
}

const styles = {
  nav: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 32px', background:'#1a1a2e', color:'#fff', position:'sticky', top:0, zIndex:100 },
  brand: { color:'#fff', textDecoration:'none', fontSize:22, fontWeight:'bold' },
  links: { display:'flex', gap:16, alignItems:'center' },
  link: { color:'#ccc', textDecoration:'none', fontSize:15 },
  btn: { background:'#4a90e2', color:'#fff', border:'none', padding:'8px 16px', borderRadius:6, cursor:'pointer', textDecoration:'none', fontSize:14 },
};
