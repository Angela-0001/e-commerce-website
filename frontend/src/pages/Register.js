import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api';
import Toast from '../components/Toast';

export default function Register() {
  const [form, setForm] = useState({ name:'', email:'', password:'', confirmPassword:'', phoneNumber:'' });
  const [step, setStep] = useState('register');
  const [code, setCode] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

  async function handleRegister(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setToast({ message: 'Passwords do not match', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      const payload = { email: form.email, password: form.password, name: form.name };
      if (form.phoneNumber) payload.phoneNumber = form.phoneNumber.startsWith('+') ? form.phoneNumber : '+' + form.phoneNumber;
      await api.post('/auth/register', payload);
      setToast({ message: 'Check your email for a verification code', type: 'success' });
      setStep('verify');
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
    setLoading(false);
  }

  async function handleVerify(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/verify', { email: form.email, code });
      setToast({ message: 'Account verified! Please login.', type: 'success' });
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setToast({ message: err.message, type: 'error' });
    }
    setLoading(false);
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.box}>
        <h2 style={styles.title}>{step === 'register' ? 'Create Account' : 'Verify Email'}</h2>

        {step === 'register' ? (
          <form onSubmit={handleRegister}>
            <input style={styles.input} placeholder="Full Name" value={form.name}
              onChange={e => setForm({...form, name: e.target.value})} required />

            <input style={styles.input} placeholder="Email" type="email" value={form.email}
              onChange={e => setForm({...form, email: e.target.value})} required />

            <div style={styles.passWrap}>
              <input style={styles.passInput} placeholder="Password (min 8 chars, 1 upper, 1 number, 1 symbol)"
                type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => setForm({...form, password: e.target.value})} required />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPass(v => !v)}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>

            <div style={styles.passWrap}>
              <input style={styles.passInput} placeholder="Confirm Password"
                type={showConfirm ? 'text' : 'password'} value={form.confirmPassword}
                onChange={e => setForm({...form, confirmPassword: e.target.value})} required />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowConfirm(v => !v)}>
                {showConfirm ? '🙈' : '👁'}
              </button>
            </div>

            <input style={styles.input} placeholder="Phone (optional, e.g. +911234567890)"
              value={form.phoneNumber} onChange={e => setForm({...form, phoneNumber: e.target.value})} />

            <button style={styles.btn} disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <p style={{color:'#666', marginBottom:16}}>Enter the 6-digit code sent to <strong>{form.email}</strong></p>
            <input style={styles.input} placeholder="Verification Code" value={code}
              onChange={e => setCode(e.target.value)} required />
            <button style={styles.btn} disabled={loading}>{loading ? 'Verifying...' : 'Verify Email'}</button>
            <button type="button" style={{...styles.btn, background:'#888', marginTop:8}}
              onClick={async () => {
                try { await api.post('/auth/resend-verification', { email: form.email }); setToast({ message: 'Code resent!', type: 'success' }); }
                catch (err) { setToast({ message: err.message, type: 'error' }); }
              }}>Resend Code</button>
          </form>
        )}

        <p style={styles.foot}>Already have an account? <Link to="/login">Login</Link></p>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

const styles = {
  wrap: { minHeight:'80vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f7fa' },
  box: { background:'#fff', padding:40, borderRadius:12, boxShadow:'0 4px 20px rgba(0,0,0,0.1)', width:'100%', maxWidth:420 },
  title: { textAlign:'center', marginBottom:24, color:'#1a1a2e' },
  input: { display:'block', width:'100%', padding:'12px', marginBottom:12, border:'1px solid #ddd', borderRadius:6, fontSize:15, boxSizing:'border-box' },
  passWrap: { display:'flex', alignItems:'center', border:'1px solid #ddd', borderRadius:6, marginBottom:12, overflow:'hidden' },
  passInput: { flex:1, padding:'12px', border:'none', outline:'none', fontSize:15 },
  eyeBtn: { background:'none', border:'none', padding:'0 12px', cursor:'pointer', fontSize:18 },
  btn: { display:'block', width:'100%', padding:12, background:'#4a90e2', color:'#fff', border:'none', borderRadius:6, fontSize:16, cursor:'pointer', fontWeight:'bold', marginBottom:8 },
  foot: { textAlign:'center', marginTop:16, color:'#666' },
};
