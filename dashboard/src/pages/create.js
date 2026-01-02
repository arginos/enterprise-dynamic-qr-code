import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { ArrowRight, ArrowLeft, Link as LinkIcon, FileText, Image as ImageIcon, Smartphone, Check, UploadCloud } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ... existing imports ...

export default function CreateWizard() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Form Data
    const [type, setType] = useState('url'); 
    const [destination, setDestination] = useState('');
    const [fileUrl, setFileUrl] = useState(''); 
    const [color, setColor] = useState('#2563eb');
    
    // NEW: Preview State
    const [previewImg, setPreviewImg] = useState(null);

    useEffect(() => {
        const t = localStorage.getItem('jwt_token');
        if(!t) router.push('/');
        setToken(t);
    }, []);

    // NEW: Effect to fetch preview when Step 3 opens or Color changes
    useEffect(() => {
        if (step === 3 && destination) {
            fetchPreview();
        }
    }, [step, color, destination]);

    const fetchPreview = async () => {
        try {
            const res = await fetch(`${API_URL}/api/qr/preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destination, color })
            });
            if (res.ok) {
                const blob = await res.blob();
                setPreviewImg(URL.createObjectURL(blob));
            }
        } catch(e) { console.error(e); }
    };

    const handleFileUpload = async (files) => {
        setLoading(true);
        const formData = new FormData();
        formData.append('file', files[0]);

        try {
            const res = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setFileUrl(data.url);
                setDestination(data.url); 
            } else {
                alert('Upload failed');
            }
        } catch(e) { alert('Error uploading file'); }
        setLoading(false);
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/qr`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    qr_type: type,
                    destination: destination,
                    file_asset_url: fileUrl,
                    color: color
                })
            });
            if(res.ok) router.push('/');
            else alert('Failed to create');
        } catch(e) { alert('Error'); }
        setLoading(false);
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
            <nav className="nav-bar">
                <div className="nav-logo">Create New Campaign</div>
                <Link href="/"><button className="btn btn-outline">Cancel</button></Link>
            </nav>

            <div className="wizard-container">
                <div className="wizard-steps">
                    {[1,2,3].map(s => (
                        <div key={s} className={`step-item ${step >= s ? 'active' : ''}`}>
                            <div className="step-number">{s}</div>
                            <span>{s === 1 ? 'Type' : s === 2 ? 'Content' : 'Design'}</span>
                        </div>
                    ))}
                </div>

                {/* STEP 1: SELECT TYPE */}
                {step === 1 && (
                    <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}}>
                        <h2 style={{textAlign:'center', marginBottom:'30px'}}>What kind of QR do you need?</h2>
                        <div className="type-grid">
                            <TypeCard icon={<LinkIcon size={32}/>} label="Website" selected={type==='url'} onClick={()=>setType('url')}/>
                            <TypeCard icon={<FileText size={32}/>} label="PDF" selected={type==='pdf'} onClick={()=>setType('pdf')}/>
                            <TypeCard icon={<ImageIcon size={32}/>} label="Image" selected={type==='image'} onClick={()=>setType('image')}/>
                            <TypeCard icon={<Smartphone size={32}/>} label="App Store" selected={type==='vcard'} onClick={()=>setType('vcard')}/>
                        </div>
                        <div className="flex-end">
                            <button className="btn btn-primary" onClick={()=>setStep(2)}>Next <ArrowRight size={18}/></button>
                        </div>
                    </motion.div>
                )}

                {/* STEP 2: CONTENT */}
                {step === 2 && (
                    <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}}>
                        <h2 style={{textAlign:'center', marginBottom:'30px'}}>Setup Content</h2>
                        <div className="glass-card" style={{maxWidth:'600px', margin:'0 auto'}}>
                            {type === 'url' && (
                                <div className="input-group">
                                    <label className="input-label">Website URL</label>
                                    <input type="url" placeholder="https://example.com" value={destination} onChange={e=>setDestination(e.target.value)} autoFocus />
                                </div>
                            )}
                            {(type === 'pdf' || type === 'image') && (
                                <div>
                                    <label className="input-label">Upload File</label>
                                    <FileUploader onDrop={handleFileUpload} loading={loading} fileUrl={fileUrl} />
                                </div>
                            )}
                        </div>
                        <div className="flex-end" style={{maxWidth:'600px', margin:'20px auto'}}>
                            <button className="btn btn-outline" onClick={()=>setStep(1)}><ArrowLeft size={18}/> Back</button>
                            <button className="btn btn-primary" disabled={!destination} onClick={()=>setStep(3)}>Next <ArrowRight size={18}/></button>
                        </div>
                    </motion.div>
                )}

                {/* STEP 3: DESIGN (UPDATED) */}
                {step === 3 && (
                    <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}}>
                        <h2 style={{textAlign:'center', marginBottom:'30px'}}>Customize Design</h2>
                        <div className="glass-card" style={{maxWidth:'600px', margin:'0 auto', display:'flex', gap:'30px', alignItems:'center'}}>
                            <div style={{flex:1}}>
                                <div className="input-group">
                                    <label className="input-label">QR Color</label>
                                    <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{height:'50px', padding:'2px', cursor:'pointer'}} />
                                </div>
                                <p style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>
                                    Change the color to see the preview update instantly.
                                </p>
                            </div>
                            {/* UPDATED: Live Preview Image */}
                            <div style={{width:'180px', height:'180px', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'12px', border:'1px solid var(--border)', overflow:'hidden'}}>
                                {previewImg ? (
                                    <img src={previewImg} alt="Preview" style={{width:'100%', height:'100%', objectFit:'contain'}} />
                                ) : (
                                    <span style={{color:'var(--text-secondary)', fontSize:'0.8rem'}}>Loading...</span>
                                )}
                            </div>
                        </div>
                        <div className="flex-end" style={{maxWidth:'600px', margin:'20px auto'}}>
                            <button className="btn btn-outline" onClick={()=>setStep(2)}><ArrowLeft size={18}/> Back</button>
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                                {loading ? 'Creating...' : 'Launch Campaign'} <Check size={18}/>
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}

// ... TypeCard and FileUploader components remain the same ...

function TypeCard({ icon, label, selected, onClick }) {
    return (
        <div className={`type-card ${selected ? 'selected' : ''}`} onClick={onClick}>
            <div style={{color: selected ? 'var(--accent)' : 'inherit'}}>{icon}</div>
            <span style={{fontWeight:'600'}}>{label}</span>
        </div>
    );
}

function FileUploader({ onDrop, loading, fileUrl }) {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, multiple: false });
    return (
        <div {...getRootProps()} className="dropzone">
            <input {...getInputProps()} />
            {loading ? <p>Uploading to Secure Storage...</p> : 
             fileUrl ? <p style={{color:'var(--success)'}}><Check size={16}/> File Uploaded Ready</p> :
             <div><UploadCloud size={32}/><p>Drag & drop file here, or click to select</p></div>}
        </div>
    );
}