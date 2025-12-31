import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { QrCode, LogOut, Edit, Save, Settings, FileText, CheckSquare, Square, Users, X } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState(null);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
        localStorage.setItem('jwt_token', urlToken);
        setToken(urlToken);
        window.history.replaceState({}, document.title, "/");
    } else {
        const saved = localStorage.getItem('jwt_token');
        if (saved) setToken(saved);
    }
  }, []);
  const handleLogout = () => { localStorage.removeItem('jwt_token'); setToken(null); };

  if (!token) return <AuthScreen />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}

function AuthScreen() {
    return (
        <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f3f4f6'}}>
            <div style={{background:'white', padding:'40px', borderRadius:'16px', boxShadow:'0 10px 15px -3px rgba(0,0,0,0.1)', textAlign:'center'}}>
                <h2 style={{marginBottom:'20px'}}>QR Platform Login</h2>
                <button onClick={() => window.location.href = "http://localhost:3000/api/auth/google"} style={{padding:'12px 20px', borderRadius:'8px', background:'white', border:'1px solid #ddd', fontWeight:'bold', cursor:'pointer', display:'flex', alignItems:'center', gap:'10px', margin:'0 auto'}}>
                  <span style={{color:'#4285F4', fontWeight:'900'}}>G</span> Continue with Google
                </button>
            </div>
        </div>
    );
}

function Dashboard({ token, onLogout }) {
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState(null);
  
  // Create Form State
  const [destination, setDestination] = useState('');
  const [iosDest, setIosDest] = useState('');
  const [androidDest, setAndroidDest] = useState('');
  const [leadCapture, setLeadCapture] = useState(false);
  const [color, setColor] = useState('#000000');
  const [generated, setGenerated] = useState(null);

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState('');
  
  // Leads Modal State
  const [viewingLeads, setViewingLeads] = useState(null); // ID of QR code
  const [leadsList, setLeadsList] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchCodes();
  }, []);

  const fetchStats = async () => {
    const res = await fetch('http://localhost:3000/api/stats', { headers: { 'Authorization': `Bearer ${token}` }});
    if (res.ok) setStats(await res.json());
  };

  const fetchCodes = async () => {
    const res = await fetch('http://localhost:3000/api/codes', { headers: { 'Authorization': `Bearer ${token}` }});
    if (res.ok) setCodes(await res.json());
  };

  const createQR = async () => {
    if (!destination) return;
    const rules = {};
    if (iosDest) rules.ios = iosDest;
    if (androidDest) rules.android = androidDest;
    if (leadCapture) rules.lead_capture = true;

    const res = await fetch('http://localhost:3000/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ destination, dynamic_rules: rules, color })
    });
    const data = await res.json();
    setGenerated({ ...data, color }); 
    fetchCodes();
    fetchStats();
  };

  const updateQR = async (id, updates) => {
    await fetch(`http://localhost:3000/api/qr/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updates)
    });
    setEditingId(null);
    fetchCodes(); 
  };

  const toggleLeadGen = (code) => {
      const currentRules = code.dynamic_rules || {};
      const newRules = { ...currentRules, lead_capture: !currentRules.lead_capture };
      updateQR(code.id, { dynamic_rules: newRules });
  };

  const openLeads = async (id) => {
      setViewingLeads(id);
      // NOTE: We need a backend endpoint for this. 
      // For now, we assume the endpoint exists or we mock it.
      // In the next step, verify your backend has app.get('/api/leads/:id'...)
      try {
        const res = await fetch(`http://localhost:3000/api/leads/${id}`, { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) setLeadsList(await res.json());
        else setLeadsList([]);
      } catch(e) { setLeadsList([]); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '1.8rem', color: '#1e293b' }}>Enterprise QR Engine</h1>
        <button onClick={onLogout} style={{ padding: '8px 16px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor:'pointer' }}><LogOut size={14}/> Logout</button>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '30px' }}>
        
        {/* LEFT: CREATOR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', display:'flex', alignItems:'center', gap:'10px' }}><QrCode size={20}/> New Smart Code</h2>
                <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
                    <input type="text" placeholder="Default Destination URL (Required)" value={destination} onChange={e=>setDestination(e.target.value)} style={inputStyle} />
                    <div style={{ background:'#f1f5f9', padding:'15px', borderRadius:'8px' }}>
                        <h3 style={{ fontSize:'0.9rem', marginBottom:'10px', color:'#64748b', display:'flex', alignItems:'center', gap:'5px'}}><Settings size={14}/> Advanced Routing</h3>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'15px'}}>
                            <input type="text" placeholder="iOS Fallback URL" value={iosDest} onChange={e=>setIosDest(e.target.value)} style={inputStyle} />
                            <input type="text" placeholder="Android Fallback URL" value={androidDest} onChange={e=>setAndroidDest(e.target.value)} style={inputStyle} />
                        </div>
                        <div onClick={() => setLeadCapture(!leadCapture)} style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', padding:'10px', background: leadCapture ? '#dcfce7' : 'white', borderRadius:'6px', border: leadCapture ? '1px solid #86efac' : '1px solid #e2e8f0' }}>
                            {leadCapture ? <CheckSquare size={20} color="#16a34a" /> : <Square size={20} color="#94a3b8" />}
                            <span style={{fontSize:'0.9rem', color: leadCapture ? '#166534' : '#64748b', fontWeight: leadCapture ? 'bold' : 'normal'}}>Enable Lead Capture Form</span>
                        </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{height:'40px', width:'60px', border:'none', cursor:'pointer'}} />
                        <button onClick={createQR} style={{ flex:1, background: '#2563eb', color: 'white', padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Generate Dynamic QR</button>
                    </div>
                </div>
                {generated && (
                    <div style={{ marginTop: '20px', padding: '20px', background: '#eff6ff', borderRadius: '12px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                        <QRCodeCanvas value={generated.short_url} size={100} fgColor={generated.color} level={"H"} />
                        <div>
                            <p style={{fontWeight:'bold', marginBottom:'5px'}}>Code Ready!</p>
                            <a href={generated.short_url} target="_blank" style={{ color: '#3b82f6', textDecoration: 'none' }}>{generated.short_url}</a>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '15px' }}>Manage My Codes</h2>
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {codes.map(code => (
                        <div key={code.id} style={{ borderBottom:'1px solid #f1f5f9', paddingBottom:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                            <div style={{flex: 1, paddingRight: '15px'}}>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                    <p style={{fontWeight:'bold', fontSize:'0.9rem'}}>{code.short_slug}</p>
                                    {code.dynamic_rules?.lead_capture && <span style={{fontSize:'0.65rem', background:'#dcfce7', color:'#166534', padding:'2px 6px', borderRadius:'4px'}}>LEAD FORM ON</span>}
                                </div>
                                {editingId === code.id ? (
                                    <input autoFocus type="text" value={editUrl} onChange={e=>setEditUrl(e.target.value)} style={{...inputStyle, padding:'5px', fontSize:'0.8rem', marginTop:'5px'}} />
                                ) : (
                                    <p style={{fontSize:'0.8rem', color:'#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px'}}>{code.destination_url}</p>
                                )}
                            </div>
                            <div style={{display:'flex', gap:'10px'}}>
                                <button onClick={() => openLeads(code.id)} title="View Leads" style={btnIcon}><Users size={16} color="#6366f1"/></button>
                                <button onClick={() => toggleLeadGen(code)} title="Toggle Lead Form" style={{...btnIcon, background: code.dynamic_rules?.lead_capture ? '#dcfce7' : '#f1f5f9', borderRadius: '6px'}}><FileText size={16} color={code.dynamic_rules?.lead_capture ? '#16a34a' : '#94a3b8'} /></button>
                                {editingId === code.id ? (
                                    <button onClick={() => updateQR(code.id, {destination: editUrl})} style={btnIcon}><Save size={16} color="green"/></button>
                                ) : (
                                    <button onClick={() => { setEditingId(code.id); setEditUrl(code.destination_url); }} style={btnIcon}><Edit size={16} color="#64748b"/></button>
                                )}
                            </div>
                        </div>
                    ))}
                    {codes.length === 0 && <p style={{color:'#94a3b8'}}>No codes created yet.</p>}
                </div>
            </div>
        </div>

        {/* RIGHT: ANALYTICS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <h2 style={{ fontSize: '1rem', color:'#64748b', marginBottom:'10px' }}>Total Scans</h2>
                <p style={{ fontSize: '3rem', fontWeight: '800', color: '#111827', margin:0 }}>{stats?.total || 0}</p>
            </div>
            {stats && stats.timeline && (
                <div style={{ background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', height:'300px' }}>
                    <h2 style={{ fontSize: '1rem', color:'#64748b', marginBottom:'20px' }}>Performance</h2>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.timeline}>
                            <XAxis dataKey="date" tick={{fontSize: 10}} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
      </div>

      {/* LEADS MODAL */}
      {viewingLeads && (
          <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center'}}>
              <div style={{background:'white', padding:'30px', borderRadius:'12px', width:'500px', maxHeight:'80vh', overflowY:'auto'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
                      <h2 style={{fontSize:'1.2rem'}}>Captured Leads</h2>
                      <button onClick={()=>setViewingLeads(null)} style={{background:'none', border:'none', cursor:'pointer'}}><X size={20}/></button>
                  </div>
                  <table style={{width:'100%', borderCollapse:'collapse'}}>
                      <thead>
                          <tr style={{textAlign:'left', color:'#64748b', borderBottom:'1px solid #e2e8f0'}}>
                              <th style={{padding:'10px'}}>Name</th>
                              <th style={{padding:'10px'}}>Email</th>
                              <th style={{padding:'10px'}}>Date</th>
                          </tr>
                      </thead>
                      <tbody>
                          {leadsList.map(lead => (
                              <tr key={lead.id} style={{borderBottom:'1px solid #f1f5f9'}}>
                                  <td style={{padding:'10px'}}>{lead.name}</td>
                                  <td style={{padding:'10px'}}>{lead.email}</td>
                                  <td style={{padding:'10px', fontSize:'0.8rem', color:'#64748b'}}>{new Date(lead.submitted_at).toLocaleDateString()}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  {leadsList.length === 0 && <p style={{textAlign:'center', padding:'20px', color:'#94a3b8'}}>No leads captured yet.</p>}
                  
                  <div style={{marginTop:'20px', textAlign:'right'}}>
                       <button onClick={() => {
                           const csv = 'Name,Email,Date\n' + leadsList.map(l => `${l.name},${l.email},${l.submitted_at}`).join('\n');
                           const blob = new Blob([csv], { type: 'text/csv' });
                           const url = window.URL.createObjectURL(blob);
                           const a = document.createElement('a');
                           a.href = url;
                           a.download = 'leads.csv';
                           a.click();
                       }} style={{background:'#2563eb', color:'white', border:'none', padding:'8px 16px', borderRadius:'6px', cursor:'pointer'}}>Download CSV</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' };
const btnIcon = { border:'none', cursor:'pointer', padding:'8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background:'#f1f5f9', borderRadius:'6px' };