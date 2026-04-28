import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';

export default function Profile() {
  const { logout } = useAuth();
  const [form, setForm] = useState({ name:'', phoneNumber:'', address:'' });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/users/me').then(d => {
      const u = d.user || d;
      setForm({ name: u.name||'', phoneNumber: u.phoneNumber||'', address: u.address||'' });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/users/me', form);
      setToast({ message: 'Profile updated!', type: 'success' });
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  return (
    <div style={styles.wrap}>
      <div style={styles.box}>
        <h2 style={styles.title}>My Profile</h2>
        <form onSubmit={handleSave}>
          <label style={styles.label}>Name</label>
          <input style={styles.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
          <label style={styles.label}>Phone</label>
          <input style={styles.input} value={form.phoneNumber} onChange={e => setForm({...form, phoneNumber: e.target.value})} placeholder="+91..." />
          <label style={styles.label}>Address</label>
          <textarea style={{...styles.input, height:80}} value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
          <button style={styles.btn} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </form>
        <button style={styles.logoutBtn} onClick={logout}>Logout</button>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

const styles = {
  wrap: { minHeight:'80vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f7fa' },
  box: { background:'#fff', padding:40, borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.1)', width:'100%', maxWidth:440 },
  title: { textAlign:'center', marginBottom:24, color:'#1a1a2e' },
  label: { display:'block', marginBottom:4, color:'#555', fontWeight:'bold', fontSize:14 },
  input: { display:'block', width:'100%', padding:'10px 12px', marginBottom:14, border:'1px solid #ddd', borderRadius:6, fontSize:15, boxSizing:'border-box' },
  btn: { width:'100%', padding:12, background:'#4a90e2', color:'#fff', border:'none', borderRadius:6, fontSize:16, cursor:'pointer', fontWeight:'bold' },
  logoutBtn: { width:'100%', padding:12, background:'#e74c3c', color:'#fff', border:'none', borderRadius:6, fontSize:16, cursor:'pointer', marginTop:12 },
};
