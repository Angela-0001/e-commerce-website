import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api';
import Toast from '../components/Toast';
import Spinner from '../components/Spinner';

const STATUS_OPTIONS = ['Processing', 'Shipped', 'Delivered'];
const STATUS_COLORS = { Pending:'#f39c12', Processing:'#3498db', Shipped:'#9b59b6', Delivered:'#2ecc71' };
const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='10' fill='%23aaa'%3ENo Img%3C/text%3E%3C/svg%3E";

export default function Admin() {
  const [tab, setTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState({ name:'', description:'', price:'', stockQuantity:'', categoryId:'' });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef();

  const showToast = (message, type='success') => setToast({ message, type });

  const loadProducts = useCallback(() => {
    setLoading(true);
    api.get('/products?pageSize=100')
      .then(d => setProducts(d.products || []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const loadOrders = useCallback(() => {
    setLoading(true);
    api.get('/admin/orders')
      .then(d => setOrders(d.items || d.orders || []))
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get('/categories').then(d => setCategories(d.categories || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'products') loadProducts();
    if (tab === 'orders') loadOrders();
    if (tab === 'dashboard') {
      Promise.all([
        api.get('/products?pageSize=100').catch(() => ({ products: [] })),
        api.get('/admin/orders?pageSize=100').catch(() => ({ items: [] })),
      ]).then(([pd, od]) => {
        const prods = pd.products || [];
        const ords = od.items || od.orders || [];
        const revenue = ords.reduce((s, o) => s + (o.totalAmount || 0), 0);
        const pending = ords.filter(o => o.status === 'Pending').length;
        setStats({ products: prods.length, orders: ords.length, revenue, pending });
        setOrders(ords.slice(0, 5));
      });
    }
  }, [tab, loadProducts, loadOrders]);

  function openAdd() {
    setForm({ name:'', description:'', price:'', stockQuantity:'', categoryId:'' });
    setEditProduct(null); setImageFile(null); setImagePreview(null); setUploadProgress(0);
    setShowForm(true);
  }

  function openEdit(p) {
    setForm({ name:p.name, description:p.description, price:p.price, stockQuantity:p.stockQuantity, categoryId:p.categoryId });
    setEditProduct(p);
    setImageFile(null);
    setImagePreview(p.imageUrl || null);
    setUploadProgress(0);
    setShowForm(true);
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5MB', 'error'); return; }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function uploadImage() {
    if (!imageFile) return null;
    setUploading(true);
    setUploadProgress(10);
    try {
      const { uploadUrl, imageUrl, imageKey } = await api.post('/admin/products/upload-url', {
        fileName: imageFile.name,
        fileType: imageFile.type,
      });
      setUploadProgress(40);
      await fetch(uploadUrl, { method: 'PUT', body: imageFile, headers: { 'Content-Type': imageFile.type } });
      setUploadProgress(100);
      return { imageUrl, imageKey };
    } finally {
      setUploading(false);
    }
  }

  async function submitProduct(e) {
    e.preventDefault();
    try {
      let imgData = {};
      if (imageFile) {
        const result = await uploadImage();
        if (result) imgData = result;
      } else if (editProduct?.imageUrl) {
        imgData = { imageUrl: editProduct.imageUrl, imageKey: editProduct.imageKey };
      }

      const payload = {
        ...form,
        price: parseFloat(form.price),
        stockQuantity: parseInt(form.stockQuantity),
        imageKeys: [imgData.imageKey || 'placeholder.jpg'],
        ...imgData,
      };

      if (editProduct) {
        await api.put(`/products/${editProduct.productId}`, payload);
        showToast('Product updated!');
      } else {
        await api.post('/products', payload);
        showToast('Product created!');
      }
      setShowForm(false);
      loadProducts();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteProduct(productId) {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.del(`/products/${productId}`);
      showToast('Deleted');
      loadProducts();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function updateStatus(orderId, status) {
    try {
      await api.put(`/orders/${orderId}/status`, { status });
      setOrders(o => o.map(x => x.orderId === orderId ? {...x, status} : x));
      showToast('Status updated');
    } catch (err) { showToast(err.message, 'error'); }
  }

  return (
    <div style={styles.layout}>
      <div style={styles.sidebar}>
        <div style={styles.sideTitle}>⚙️ Admin</div>
        {['dashboard','products','orders'].map(t => (
          <button key={t} style={{...styles.sideBtn, ...(tab===t ? styles.sideBtnActive : {})}} onClick={() => setTab(t)}>
            {t === 'dashboard' ? '📊 Dashboard' : t === 'products' ? '📦 Products' : '🛒 Orders'}
          </button>
        ))}
      </div>

      <div style={styles.main}>

        {/* Dashboard */}
        {tab === 'dashboard' && (
          <div>
            <h2 style={styles.pageTitle}>Dashboard</h2>
            {stats ? (
              <>
                <div style={styles.statsGrid}>
                  {[
                    { label:'Total Products', value: stats.products, color:'#4a90e2' },
                    { label:'Total Orders', value: stats.orders, color:'#2ecc71' },
                    { label:'Total Revenue', value: `₹${stats.revenue}`, color:'#ff6b35' },
                    { label:'Pending Orders', value: stats.pending, color:'#f39c12' },
                  ].map(s => (
                    <div key={s.label} style={{...styles.statCard, borderTop:`4px solid ${s.color}`}}>
                      <div style={styles.statVal}>{s.value}</div>
                      <div style={styles.statLabel}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <h3 style={{marginTop:32}}>Recent Orders</h3>
                <table style={styles.table}>
                  <thead><tr>{['Order ID','Total','Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.orderId}>
                        <td style={styles.td}>#{(o.orderId||'').slice(-8).toUpperCase()}</td>
                        <td style={styles.td}>₹{o.totalAmount || 0}</td>
                        <td style={styles.td}><span style={{...styles.badge, background: STATUS_COLORS[o.status]||'#888'}}>{o.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <Spinner />}
          </div>
        )}

        {/* Products */}
        {tab === 'products' && (
          <div>
            <div style={styles.pageHeader}>
              <h2 style={styles.pageTitle}>Products</h2>
              <button style={styles.addBtn} onClick={openAdd}>+ Add Product</button>
            </div>

            {showForm && (
              <div style={styles.formBox}>
                <h3 style={{marginTop:0}}>{editProduct ? 'Edit Product' : 'Add Product'}</h3>
                <form onSubmit={submitProduct}>
                  <div style={styles.formGrid}>
                    <input style={styles.input} placeholder="Product Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
                    <input style={styles.input} placeholder="Price (₹)" type="number" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required />
                    <input style={styles.input} placeholder="Stock Quantity" type="number" value={form.stockQuantity} onChange={e=>setForm({...form,stockQuantity:e.target.value})} required />
                    <select style={styles.input} value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value})} required>
                      <option value="">Select Category</option>
                      {categories.map(c=><option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}
                    </select>
                    <textarea style={{...styles.input, gridColumn:'1/-1', height:70, resize:'vertical'}} placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} required />
                  </div>

                  {/* Image Upload */}
                  <div style={styles.uploadArea} onClick={() => fileInputRef.current.click()}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" style={styles.previewImg} />
                    ) : (
                      <div style={styles.uploadPlaceholder}>
                        <div style={{fontSize:32}}>📷</div>
                        <div>Click to upload image (max 5MB)</div>
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleFileChange} />
                  </div>
                  {imageFile && <div style={styles.fileName}>Selected: {imageFile.name}</div>}
                  {uploadProgress > 0 && uploadProgress < 100 && (
                    <div style={styles.progressBar}>
                      <div style={{...styles.progressFill, width:`${uploadProgress}%`}} />
                    </div>
                  )}

                  <div style={{display:'flex', gap:10, marginTop:16}}>
                    <button style={styles.btn} type="submit" disabled={uploading}>
                      {uploading ? 'Uploading...' : editProduct ? 'Update Product' : 'Create Product'}
                    </button>
                    <button style={styles.cancelBtn} type="button" onClick={()=>setShowForm(false)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {loading ? <Spinner /> : (
              <table style={styles.table}>
                <thead><tr>{['Image','Name','Category','Price','Stock','Actions'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {products.length === 0 && <tr><td colSpan={6} style={{...styles.td, textAlign:'center', color:'#888'}}>No products yet</td></tr>}
                  {products.map(p => (
                    <tr key={p.productId}>
                      <td style={styles.td}>
                        <img src={p.imageUrl || PLACEHOLDER} alt={p.name} style={styles.thumb}
                          onError={e => { e.target.src = PLACEHOLDER; }} />
                      </td>
                      <td style={styles.td}>{p.name}</td>
                      <td style={styles.td}>{categories.find(c=>c.categoryId===p.categoryId)?.name || '-'}</td>
                      <td style={styles.td}>₹{p.price}</td>
                      <td style={styles.td}>{p.stockQuantity}</td>
                      <td style={styles.td}>
                        <button style={styles.editBtn} onClick={()=>openEdit(p)}>Edit</button>
                        <button style={styles.delBtn} onClick={()=>deleteProduct(p.productId)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Orders */}
        {tab === 'orders' && (
          <div>
            <h2 style={styles.pageTitle}>Orders</h2>
            {loading ? <Spinner /> : (
              <table style={styles.table}>
                <thead><tr>{['Order ID','Total','Status','Update Status'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {orders.length === 0 && <tr><td colSpan={4} style={{...styles.td, textAlign:'center', color:'#888'}}>No orders yet</td></tr>}
                  {orders.map(o => (
                    <tr key={o.orderId}>
                      <td style={styles.td}>#{(o.orderId||'').slice(-8).toUpperCase()}</td>
                      <td style={styles.td}>₹{o.totalAmount || 0}</td>
                      <td style={styles.td}><span style={{...styles.badge, background: STATUS_COLORS[o.status]||'#888'}}>{o.status}</span></td>
                      <td style={styles.td}>
                        <select style={styles.select} value={o.status}
                          onChange={e => updateStatus(o.orderId, e.target.value)}
                          disabled={o.status === 'Delivered'}>
                          <option value={o.status}>{o.status}</option>
                          {STATUS_OPTIONS.filter(s => s !== o.status).map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={()=>setToast(null)} />}
    </div>
  );
}

const styles = {
  layout: { display:'flex', minHeight:'calc(100vh - 56px)' },
  sidebar: { width:200, background:'#1a1a2e', padding:'24px 0', flexShrink:0 },
  sideTitle: { color:'#fff', fontWeight:'bold', fontSize:18, padding:'0 20px 20px' },
  sideBtn: { display:'block', width:'100%', padding:'12px 20px', background:'none', border:'none', color:'#aaa', textAlign:'left', cursor:'pointer', fontSize:15 },
  sideBtnActive: { background:'#4a90e2', color:'#fff' },
  main: { flex:1, padding:32, background:'#f5f7fa', overflowY:'auto' },
  pageTitle: { fontSize:26, color:'#1a1a2e', marginBottom:20, marginTop:0 },
  pageHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  statsGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:20 },
  statCard: { background:'#fff', borderRadius:10, padding:20, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' },
  statVal: { fontSize:32, fontWeight:'bold', color:'#1a1a2e' },
  statLabel: { color:'#888', marginTop:4 },
  formBox: { background:'#fff', padding:24, borderRadius:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:24 },
  formGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 },
  input: { padding:'10px 12px', border:'1px solid #ddd', borderRadius:6, fontSize:14, width:'100%', boxSizing:'border-box' },
  uploadArea: { border:'2px dashed #ddd', borderRadius:8, padding:20, textAlign:'center', cursor:'pointer', background:'#fafafa', minHeight:100, display:'flex', alignItems:'center', justifyContent:'center' },
  uploadPlaceholder: { color:'#aaa' },
  previewImg: { maxHeight:160, maxWidth:'100%', borderRadius:6, objectFit:'contain' },
  fileName: { fontSize:13, color:'#666', marginTop:6 },
  progressBar: { height:6, background:'#eee', borderRadius:3, marginTop:8, overflow:'hidden' },
  progressFill: { height:'100%', background:'#4a90e2', transition:'width 0.3s' },
  btn: { padding:'10px 24px', background:'#4a90e2', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:'bold' },
  cancelBtn: { padding:'10px 24px', background:'#eee', color:'#555', border:'none', borderRadius:6, cursor:'pointer' },
  addBtn: { padding:'10px 20px', background:'#ff6b35', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:'bold' },
  table: { width:'100%', borderCollapse:'collapse', background:'#fff', borderRadius:10, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' },
  th: { background:'#f5f7fa', padding:'12px 16px', textAlign:'left', fontWeight:'bold', color:'#555', fontSize:14 },
  td: { padding:'10px 16px', borderBottom:'1px solid #eee', fontSize:14 },
  thumb: { width:50, height:50, objectFit:'cover', borderRadius:4 },
  editBtn: { background:'#4a90e2', color:'#fff', border:'none', padding:'5px 12px', borderRadius:4, cursor:'pointer', marginRight:6 },
  delBtn: { background:'#e74c3c', color:'#fff', border:'none', padding:'5px 12px', borderRadius:4, cursor:'pointer' },
  badge: { color:'#fff', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:'bold' },
  select: { padding:'6px 10px', border:'1px solid #ddd', borderRadius:4, fontSize:13 },
};
