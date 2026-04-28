import React, { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bg = type === 'error' ? '#e74c3c' : '#2ecc71';
  return (
    <div style={{ position:'fixed', bottom:24, right:24, background:bg, color:'#fff', padding:'12px 24px', borderRadius:8, zIndex:999, fontSize:15, boxShadow:'0 4px 12px rgba(0,0,0,0.2)' }}>
      {message}
    </div>
  );
}
