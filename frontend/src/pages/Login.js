import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import Toast from '../components/Toast';

export default function Login() {
  const [form, setForm] = useState({ email:'', password:'' });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post('/auth/login', form);
      const token = data.tokens?.IdToken;
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - b64.length % 4) % 4);
      const payload = JSON.parse(atob(b64 + padding));
      const rawGroups = payload['cognito:groups'] || [];
      const groups = Array.isArray(rawGroups) ? rawGroups : rawGroups.split(',').map(g => g.trim());
      login(token, groups, form.email);
      navigate(groups.includes('Admin') ? '/admin' : '/');
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
    setLoading(false);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.box}>
        <h2 style={styles.title}>Login</h2>
        <form onSubmit={handleLogin}>
          <input style={styles.input} placeholder="Email" type="email" value={form.email}
            onChange={e => setForm({...form, email: e.target.value})} required />

          <div style={styles.passWrap}>
            <input style={styles.passInput} placeholder="Password"
              type={showPass ? 'text' : 'password'} value={form.password}
              onChange={e => setForm({...form, password: e.target.value})} required />
            <button type="button" style={styles.eyeBtn} onClick={() => setShowPass(v => !v)}>
              {showPass ? '🙈' : '👁'}
            </button>
          </div>

          <button style={styles.btn} disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
        </form>
        <p style={styles.foot}><Link to="/forgot-password">Forgot password?</Link></p>
        <p style={styles.foot}>No account? <Link to="/register">Sign Up</Link></p>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

const styles = {
  wrap: { minHeight:'80vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f7fa' },
  box: { background:'#fff', padding:40, borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.1)', width:'100%', maxWidth:400 },
  title: { textAlign:'center', marginBottom:24, color:'#1a1a2e' },
  input: { display:'block', width:'100%', padding:'12px', marginBottom:12, border:'1px solid #ddd', borderRadius:6, fontSize:15, boxSizing:'border-box' },
  passWrap: { display:'flex', alignItems:'center', border:'1px solid #ddd', borderRadius:6, marginBottom:12, overflow:'hidden' },
  passInput: { flex:1, padding:'12px', border:'none', outline:'none', fontSize:15 },
  eyeBtn: { background:'none', border:'none', padding:'0 12px', cursor:'pointer', fontSize:18 },
  btn: { width:'100%', padding:12, background:'#4a90e2', color:'#fff', border:'none', borderRadius:6, fontSize:16, cursor:'pointer', fontWeight:'bold' },
  foot: { textAlign:'center', marginTop:12, color:'#666' },
};
