import React from 'react';

export default function Spinner() {
  return (
    <div style={{ display:'flex', justifyContent:'center', padding:40 }}>
      <div style={{ width:40, height:40, border:'4px solid #eee', borderTop:'4px solid #4a90e2', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
