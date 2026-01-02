import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { QrCode, LogOut, Plus, UploadCloud, Users, Activity, ExternalLink, Trash2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function Dashboard() {
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
  return <MainView token={token} onLogout={handleLogout} />;
}

function AuthScreen() {
    return (
        <div style={{minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f172a'}}>
            <div className="glass-card" style={{maxWidth:'400px', width:'100%', textAlign:'center'}}>
                <h2 style={{marginBottom:'20px'}}>QR Enterprise Login</h2>
                <button onClick={() => window.location.href = `${API_URL}/api/auth/google`} className="btn btn-primary" style={{background:'white', color:'#111', width:'100%', justifyContent:'center'}}>
                  <span style={{color:'#4285F4', fontWeight:'900', fontSize:'1.2rem'}}>G</span> Continue with Google
                </button>
            </div>
        </div>
    );
}

function MainView({ token, onLogout }) {
  const [codes, setCodes] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchCodes();
  }, []);

  const fetchStats = async () => {
    try {
        const res = await fetch(`${API_URL}/api/stats`, { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) setStats(await res.json());
    } catch(e) { console.error(e); }
  };

  const fetchCodes = async () => {
    try {
        const res = await fetch(`${API_URL}/api/codes`, { headers: { 'Authorization': `Bearer ${token}` }});
        if (res.ok) setCodes(await res.json());
    } catch(e) { console.error(e); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Navigation */}
      <nav className="nav-bar">
        <div className="nav-logo"><QrCode size={24}/> Enterprise QR</div>
        <div className="nav-links">
           <Link href="/" className="nav-item active">Overview</Link>
           <Link href="/create" className="nav-item">Create QR</Link>
           <Link href="/bulk" className="nav-item">Bulk Generator</Link>
        </div>
        <button onClick={onLogout} className="btn btn-outline" style={{padding:'8px 12px'}}><LogOut size={16}/></button>
      </nav>

      <div className="bento-grid">
        
        {/* QUICK ACTIONS */}
        <div className="glass-card col-span-3 flex-between" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color:'white', border:'none'}}>
            <div>
                <h2 style={{margin:0, fontSize:'1.5rem'}}>Welcome Back</h2>
                <p style={{opacity:0.9, marginTop:'5px'}}>Manage your campaigns and track performance.</p>
            </div>
            <div style={{display:'flex', gap:'15px'}}>
                <Link href="/bulk">
                    <button className="btn" style={{background:'rgba(255,255,255,0.2)', color:'white'}}><UploadCloud size={18}/> Bulk Import</button>
                </Link>
                <Link href="/create">
                    <button className="btn" style={{background:'white', color:'var(--accent)'}}><Plus size={18}/> Create QR</button>
                </Link>
            </div>
        </div>

        {/* ANALYTICS CHART */}
        <div className="glass-card col-span-2" style={{minHeight:'300px'}}>
            <div className="flex-between" style={{marginBottom:'20px'}}>
                <h3 style={{margin:0, display:'flex', gap:'10px', alignItems:'center'}}><Activity size={20} color="var(--accent)"/> Scan Performance</h3>
                <div style={{textAlign:'right'}}>
                     <span style={{fontSize:'0.8rem', color:'var(--text-secondary)'}}>Total Scans</span>
                     <div style={{fontSize:'1.5rem', fontWeight:'bold'}}>{stats?.total || 0}</div>
                </div>
            </div>
            <div style={{ width: '100%', height: '200px' }}>
               {stats && stats.timeline ? (
                   <ResponsiveContainer>
                      <BarChart data={stats.timeline}>
                         <XAxis dataKey="date" stroke="#94a3b8" tick={{fontSize:12}} />
                         <Tooltip contentStyle={{ borderRadius:'8px' }} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                         <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
               ) : (
                   <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center'}}>No data available</div>
               )}
            </div>
        </div>

        {/* RECENT CODES */}
        <div className="glass-card col-span-1">
             <h3 style={{margin:'0 0 20px 0', display:'flex', gap:'10px', alignItems:'center'}}><Users size={20} color="var(--accent)"/> Recent Campaigns</h3>
             <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                {codes.slice(0, 5).map(code => (
                    <div key={code.id} style={{ padding:'10px', border:'1px solid var(--border)', borderRadius:'8px', display:'flex', alignItems:'center', gap:'10px' }}>
                        <div style={{width:'30px', height:'30px', background: code.meta_data?.color || '#000', borderRadius:'6px'}}></div>
                        <div style={{flex:1, overflow:'hidden'}}>
                            <div style={{fontWeight:'600', fontSize:'0.9rem'}}>{code.short_slug}</div>
                            <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', textOverflow:'ellipsis', overflow:'hidden', whiteSpace:'nowrap'}}>{code.destination_url}</div>
                        </div>
                        <a href={code.short_url} target="_blank" className="btn btn-outline" style={{padding:'5px'}}><ExternalLink size={14}/></a>
                    </div>
                ))}
                {codes.length === 0 && <p style={{color:'var(--text-secondary)', fontSize:'0.9rem'}}>No codes yet.</p>}
             </div>
        </div>

      </div>
    </div>
  );
}