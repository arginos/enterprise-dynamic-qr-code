import { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { QrCode, LogOut, Edit, Save, Settings, FileText, CheckSquare, Square, Users, X, Activity, Terminal, Trash2, Key } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
    }
  }, []);

  const handleLogout = () => { localStorage.removeItem('jwt_token'); setToken(null); };

  if (!token) return <AuthScreen />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}

function AuthScreen() {
    return (
        <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a'}}>
            <div className="glass-card" style={{maxWidth:'400px', width:'100%', textAlign:'center'}}>
                <h2 style={{marginBottom:'20px'}}>QR Enterprise Login</h2>
                <button onClick={() => window.location.href = "http://localhost:3000/api/auth/google"} className="primary-btn" style={{background:'white', color:'#111', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}>
                  <span style={{color:'#4285F4', fontWeight:'900', fontSize:'1.2rem'}}>G</span> Continue with Google
                </button>
            </div>
        </div>
    );
}

function Dashboard({ token, onLogout }) {
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState(null);
  const [apiKeys, setApiKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  
  // Custom Domain State
  const [customDomain, setCustomDomain] = useState('');
  const [savingDomain, setSavingDomain] = useState(false);
  
  // Create Form State
  const [destination, setDestination] = useState('');
  const [iosDest, setIosDest] = useState('');
  const [androidDest, setAndroidDest] = useState('');
  const [webhook, setWebhook] = useState('');
  const [leadCapture, setLeadCapture] = useState(false);
  const [color, setColor] = useState('#ffffff'); 
  const [generated, setGenerated] = useState(null);

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState('');
  
  // Leads Modal State
  const [viewingLeads, setViewingLeads] = useState(null);
  const [leadsList, setLeadsList] = useState([]);

  useEffect(() => {
    fetchStats();
    fetchCodes();
    fetchProfile();
    fetchKeys();
  }, []);

  const fetchStats = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/stats', { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) setStats(await res.json());
    } catch(e) { console.error(e); }
  };

  const fetchCodes = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/codes', { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) setCodes(await res.json());
    } catch(e) { console.error(e); }
  };

  const fetchProfile = async () => {
    try {
        const res = await fetch('http://localhost:3000/api/user/me', { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) {
            const data = await res.json();
            if (data.custom_domain) setCustomDomain(data.custom_domain);
        }
    } catch(e) { console.error(e); }
  };

  const fetchKeys = async () => {
      try {
          const res = await fetch('http://localhost:3000/api/keys', { headers: { 'Authorization': `Bearer ${token}` }});
          if (res.ok) setApiKeys(await res.json());
      } catch(e) { console.error(e); }
  };

  const createKey = async () => {
      try {
          const res = await fetch('http://localhost:3000/api/keys', { 
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Dashboard Key' })
          });
          if (res.ok) {
              const data = await res.json();
              setNewKey(data.key);
              fetchKeys();
          }
      } catch(e) { alert('Error creating key'); }
  };

  const deleteKey = async (id) => {
      if(!confirm("Revoke this key? Apps using it will stop working.")) return;
      await fetch(`http://localhost:3000/api/keys/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }});
      fetchKeys();
  };

  const saveDomain = async () => {
    setSavingDomain(true);
    try {
        const res = await fetch('http://localhost:3000/api/user/domain', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ domain: customDomain })
        });
        if (res.ok) {
             alert('Domain saved! Your QR codes will now use this domain.');
             fetchCodes(); 
        } else {
             const err = await res.json();
             alert(err.error || 'Failed to save');
        }
    } catch(e) { alert('Error saving domain'); }
    setSavingDomain(false);
  };

  const createQR = async () => {
    if (!destination) return alert("Destination URL is required");
    const rules = {};
    if (iosDest) rules.ios = iosDest;
    if (androidDest) rules.android = androidDest;
    if (leadCapture) rules.lead_capture = true;

    try {
        const res = await fetch('http://localhost:3000/api/qr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ destination, dynamic_rules: rules, color, webhook_url: webhook })
        });
        
        // 1. Capture the response text first (in case it's not JSON)
        const text = await res.text();
        
        // 2. Try to parse it as JSON
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            // If it's not JSON (e.g. Server Error HTML), throw the text
            throw new Error(text || res.statusText);
        }

        // 3. Check for API-level errors (like Malware alerts)
        if (!res.ok) {
            throw new Error(data.error || "Failed to create QR");
        }

        // Success!
        setGenerated({ ...data, color }); 
        fetchCodes();
        fetchStats();
        setDestination('');
        setWebhook('');
    } catch(e) { 
        // Show the ACTUAL error message
        alert(e.message); 
    }
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
      try {
        const res = await fetch(`http://localhost:3000/api/leads/${id}`, { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) setLeadsList(await res.json());
        else setLeadsList([]);
      } catch(e) { setLeadsList([]); }
  };

  return (
    <div style={{ minHeight: '100vh', padding: '40px' }}>
      
      <header style={{ maxWidth:'1200px', margin:'0 auto 40px auto', display: 'flex', justifyContent: 'space-between', alignItems:'center' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight:'bold' }}>Dashboard</h1>
        <button className="icon-btn" onClick={onLogout} style={{padding:'8px 16px', gap:'8px'}}>
            <LogOut size={16}/> Logout
        </button>
      </header>

      <div className="bento-grid">
        
        {/* BRAND SETTINGS */}
        <div className="glass-card col-span-3">
            <div className="card-header"><Settings size={20} color="var(--accent)"/> Brand Settings</div>
            <div className="flex-row" style={{ alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display:'block', marginBottom:'5px', fontSize:'0.9rem', color:'var(--text-secondary)' }}>Custom Domain (White Label)</label>
                    <input type="text" placeholder="e.g. qr.yourbrand.com" value={customDomain} onChange={e=>setCustomDomain(e.target.value)} style={{marginBottom:0}} />
                </div>
                <button className="primary-btn" onClick={saveDomain} style={{ width:'auto' }} disabled={savingDomain}>
                    {savingDomain ? 'Saving...' : 'Save Domain'}
                </button>
            </div>
            <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:'10px'}}>Note: You must configure your DNS (CNAME record) to point to our server.</p>
        </div>

        {/* CREATOR CARD */}
        <div className="glass-card col-span-1">
            <div className="card-header"><QrCode size={20} color="var(--accent)"/> Create QR</div>
            <input type="text" placeholder="Destination URL (Required)" value={destination} onChange={e=>setDestination(e.target.value)} />
            
            <div style={{marginTop:'15px', marginBottom:'15px', padding:'15px', background:'rgba(255,255,255,0.03)', borderRadius:'8px'}}>
                <div className="flex-row" style={{marginBottom:'10px', color:'var(--text-secondary)', fontSize:'0.9rem'}}>
                    <Settings size={14}/> Smart Routing
                </div>
                <input type="text" placeholder="iOS URL (Optional)" value={iosDest} onChange={e=>setIosDest(e.target.value)} style={{fontSize:'0.8rem'}} />
                <input type="text" placeholder="Android URL (Optional)" value={androidDest} onChange={e=>setAndroidDest(e.target.value)} style={{fontSize:'0.8rem'}} />
                
                <div style={{marginTop:'10px', marginBottom:'10px'}}>
                    <label style={{fontSize:'0.8rem', color:'var(--text-secondary)', display:'block', marginBottom:'4px'}}>Webhook URL (Optional)</label>
                    <input type="text" placeholder="https://your-api.com/webhook" value={webhook} onChange={e=>setWebhook(e.target.value)} style={{fontSize:'0.8rem', marginBottom:0}} />
                </div>
                
                <div onClick={() => setLeadCapture(!leadCapture)} style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', marginTop:'10px', padding:'8px', borderRadius:'6px', border: '1px solid var(--glass-border)', background: leadCapture ? 'rgba(16, 185, 129, 0.1)' : 'transparent' }}>
                    {leadCapture ? <CheckSquare size={18} color="var(--success)" /> : <Square size={18} color="var(--text-secondary)" />}
                    <span style={{fontSize:'0.85rem', color: leadCapture ? 'var(--success)' : 'var(--text-secondary)'}}>Lead Capture Form</span>
                </div>
            </div>

            <div className="flex-row">
                 <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{height:'45px', width:'60px', padding:0, background:'none', border:'none', cursor:'pointer'}} />
                 <button className="primary-btn" onClick={createQR}>Generate</button>
            </div>

            {generated && (
                <div style={{ marginTop: '20px', padding: '15px', background: 'white', borderRadius: '12px', display: 'flex', flexDirection:'column', alignItems:'center', gap: '10px' }}>
                    <QRCodeCanvas value={generated.short_url} size={150} fgColor={generated.color} level={"H"} />
                    <p style={{color:'#111', fontWeight:'bold', fontSize:'0.9rem'}}>Success!</p>
                    <a href={generated.short_url} target="_blank" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize:'0.8rem' }}>{generated.short_url}</a>
                </div>
            )}
        </div>

        {/* ANALYTICS CHART */}
        <div className="glass-card col-span-2" style={{minHeight:'300px', display:'flex', flexDirection:'column'}}>
            <div className="card-header"><Activity size={20} color="var(--accent)"/> Performance</div>
            <div style={{ flex:1, width: '100%' }}>
               {stats && stats.timeline ? (
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.timeline}>
                         <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize:12}} />
                         <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }} itemStyle={{ color: '#fff' }} cursor={{fill: 'rgba(255,255,255,0.05)'}} />
                         <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
               ) : (
                   <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)'}}>No data available</div>
               )}
            </div>
            <div style={{marginTop:'20px', display:'flex', gap:'30px'}}>
                <div><span className="text-sm">Total Scans</span><p style={{fontSize:'2rem', fontWeight:'bold', margin:0}}>{stats?.total || 0}</p></div>
            </div>
        </div>

        {/* ACTIVE CODES LIST */}
        <div className="glass-card col-span-3">
             <div className="card-header"><Users size={20} color="var(--accent)"/> Active Campaigns</div>
             <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                {codes.map(code => (
                    <div key={code.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'15px', background:'rgba(255,255,255,0.02)', borderRadius:'8px', border:'1px solid var(--glass-border)' }}>
                        <div style={{flex:1}}>
                            <div className="flex-row">
                                <span style={{fontWeight:'bold', color:'var(--text-primary)'}}>{code.short_slug}</span>
                                {code.dynamic_rules?.lead_capture && <span style={{fontSize:'0.7rem', background:'rgba(16, 185, 129, 0.2)', color:'var(--success)', padding:'2px 8px', borderRadius:'4px'}}>LEAD GEN</span>}
                            </div>
                            {editingId === code.id ? (
                                <div className="flex-row" style={{marginTop:'5px'}}>
                                    <input autoFocus type="text" value={editUrl} onChange={e=>setEditUrl(e.target.value)} style={{padding:'5px', fontSize:'0.9rem', marginBottom:0}} />
                                    <button onClick={() => updateQR(code.id, {destination: editUrl})} className="icon-btn" style={{background:'var(--success)', border:'none', color:'white'}}><Save size={14}/></button>
                                </div>
                            ) : (
                                <p style={{color:'var(--text-secondary)', fontSize:'0.9rem', margin:'5px 0 0 0'}}>{code.destination_url}</p>
                            )}
                        </div>
                        <div className="flex-row">
                             <button onClick={() => openLeads(code.id)} className="icon-btn" title="View Leads"><Users size={16}/></button>
                             <button onClick={() => toggleLeadGen(code)} className="icon-btn" title="Toggle Lead Form" style={{color: code.dynamic_rules?.lead_capture ? 'var(--success)' : 'inherit'}}><FileText size={16}/></button>
                             <button onClick={() => { setEditingId(code.id); setEditUrl(code.destination_url); }} className="icon-btn"><Edit size={16}/></button>
                        </div>
                    </div>
                ))}
                {codes.length === 0 && <p style={{color:'var(--text-secondary)', textAlign:'center', padding:'20px'}}>No codes created yet.</p>}
             </div>
        </div>

        {/* NEW: DEVELOPER API CARD */}
        <div className="glass-card col-span-3">
             <div className="card-header"><Terminal size={20} color="var(--accent)"/> Developer API</div>
             <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <p style={{color:'var(--text-secondary)', margin:0, fontSize:'0.9rem', maxWidth:'600px'}}>
                        Generate API Keys to create QR codes programmatically from your own applications. 
                        Include <code>x-api-key</code> in your request headers.
                    </p>
                    <button className="primary-btn" onClick={createKey} style={{width:'auto'}}>Generate New Key</button>
                 </div>

                 {newKey && (
                     <div style={{padding:'15px', background:'rgba(16, 185, 129, 0.1)', border:'1px solid var(--success)', borderRadius:'8px', display:'flex', alignItems:'center', gap:'10px'}}>
                         <Key size={20} color="var(--success)"/>
                         <div>
                             <p style={{margin:0, fontWeight:'bold', color:'var(--success)', fontSize:'0.9rem'}}>New Key Generated (Copy immediately, it won't be shown again):</p>
                             <code style={{display:'block', marginTop:'5px', background:'rgba(0,0,0,0.2)', padding:'8px', borderRadius:'4px', userSelect:'all'}}>{newKey}</code>
                         </div>
                     </div>
                 )}

                 <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                     {apiKeys.map(key => (
                         <div key={key.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', borderBottom:'1px solid var(--border)'}}>
                             <div className="flex-row">
                                 <Key size={16} color="var(--text-secondary)"/>
                                 <span style={{fontFamily:'monospace'}}>{key.key_string}</span>
                                 <span style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>({key.name})</span>
                             </div>
                             <button onClick={() => deleteKey(key.id)} className="icon-btn" style={{color:'var(--danger)', borderColor:'var(--danger)'}}><Trash2 size={14}/></button>
                         </div>
                     ))}
                 </div>
             </div>
        </div>

      </div>

      {/* LEADS MODAL */}
      {viewingLeads && (
          <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(5px)', zIndex:50}}>
              <div className="glass-card" style={{width:'500px', maxHeight:'80vh', overflowY:'auto', background:'#1e293b'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px'}}>
                      <h3>Captured Leads</h3>
                      <button onClick={()=>setViewingLeads(null)} style={{background:'none', border:'none', color:'white', cursor:'pointer'}}><X size={20}/></button>
                  </div>
                  <table style={{width:'100%', borderCollapse:'collapse'}}>
                      <thead>
                          <tr style={{textAlign:'left', color:'var(--text-secondary)', borderBottom:'1px solid var(--glass-border)'}}>
                              <th style={{padding:'10px'}}>Name</th>
                              <th style={{padding:'10px'}}>Email</th>
                              <th style={{padding:'10px'}}>Date</th>
                          </tr>
                      </thead>
                      <tbody>
                          {leadsList.map(lead => (
                              <tr key={lead.id} style={{borderBottom:'1px solid var(--glass-border)'}}>
                                  <td style={{padding:'10px'}}>{lead.name}</td>
                                  <td style={{padding:'10px'}}>{lead.email}</td>
                                  <td style={{padding:'10px', fontSize:'0.8rem', color:'var(--text-secondary)'}}>{new Date(lead.submitted_at).toLocaleDateString()}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
}