import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Toast from '../components/Toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('request');
  const [form, setForm] = useState({ code:'', newPassword:'' });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleRequest(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setToast({ message: 'Reset code sent to your email', type: 'success' });
      setStep('confirm');
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
    setLoading(false);
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/confirm-password', { email, ...form });
      setToast({ message: 'Password reset! Please login.', type: 'success' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
    setLoading(false);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.box}>
        <h2 style={styles.title}>Reset Password</h2>
        {step === 'request' ? (
          <form onSubmit={handleRequest}>
            <input style={styles.input} placeholder="Your email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <button style={styles.btn} disabled={loading}>{loading ? 'Sending...' : 'Send Reset Code'}</button>
          </form>
        ) : (
          <form onSubmit={handleConfirm}>
            <input style={styles.input} placeholder="Reset code" value={form.code} onChange={e => setForm({...form, code: e.target.value})} required />
            <input style={styles.input} placeholder="New password" type="password" value={form.newPassword} onChange={e => setForm({...form, newPassword: e.target.value})} required />
            <button style={styles.btn} disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
          </form>
        )}
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
  btn: { width:'100%', padding:12, background:'#4a90e2', color:'#fff', border:'none', borderRadius:6, fontSize:16, cursor:'pointer', fontWeight:'bold' },
};
