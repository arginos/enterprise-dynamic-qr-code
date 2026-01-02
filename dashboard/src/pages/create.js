import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { ArrowRight, ArrowLeft, Link as LinkIcon, FileText, Image as ImageIcon, Smartphone, Check, UploadCloud, Palette } from 'lucide-react';

// ✅ HARDCODED IP: Ensures the browser sends files to the correct server
const API_URL = 'http://192.168.1.237:3000';

export default function CreateWizard() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Core Data
    const [type, setType] = useState('url'); 
    const [destination, setDestination] = useState('');
    const [fileUrl, setFileUrl] = useState(''); 
    
    // --- ADVANCED DESIGN STATE ---
    const [logoUrl, setLogoUrl] = useState('');
    const [dotsColor, setDotsColor] = useState('#000000');
    const [bgColor, setBgColor] = useState('#ffffff');
    const [dotType, setDotType] = useState('square'); 
    const [cornerType, setCornerType] = useState('square'); 
    const [cornerColor, setCornerColor] = useState('#000000');

    // QR Ref & State
    const qrCodeRef = useRef(null);
    const [qrCode, setQrCode] = useState(null); 

    useEffect(() => {
        const t = localStorage.getItem('jwt_token');
        if(!t) router.push('/');
        setToken(t);
    }, []);

    // --- INITIALIZE LIBRARY (CLIENT SIDE ONLY) ---
    useEffect(() => {
        import('qr-code-styling').then(({ default: QRCodeStyling }) => {
            const qr = new QRCodeStyling({
                width: 300,
                height: 300,
                image: '',
                dotsOptions: { color: '#000000', type: 'square' },
                cornersSquareOptions: { color: '#000000', type: 'square' },
                backgroundOptions: { color: '#ffffff' },
                imageOptions: { crossOrigin: 'anonymous', margin: 10 }
            });
            setQrCode(qr);
        });
    }, []);

    // --- LIVE PREVIEW EFFECT ---
    useEffect(() => {
        if (step === 3 && qrCodeRef.current && qrCode) {
            qrCodeRef.current.innerHTML = '';
            qrCode.append(qrCodeRef.current);
        }
    }, [step, qrCode]);

    useEffect(() => {
        if (step === 3 && qrCode) {
            qrCode.update({
                data: destination || 'https://example.com',
                image: logoUrl,
                dotsOptions: { color: dotsColor, type: dotType },
                cornersSquareOptions: { color: cornerColor, type: cornerType },
                backgroundOptions: { color: bgColor }
            });
        }
    }, [destination, logoUrl, dotsColor, dotType, cornerType, cornerColor, bgColor, step, qrCode]);

    // --- UPLOAD HANDLERS ---
    const handleFileUpload = async (files, isLogo = false) => {
        setLoading(true);
        const formData = new FormData();
        formData.append('file', files[0]);

        try {
            // Updated to handle token optionality if needed, but headers are fine
            const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
            
            const res = await fetch(`${API_URL}/api/upload`, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                if (isLogo) setLogoUrl(data.url);
                else {
                    setFileUrl(data.url);
                    setDestination(data.url);
                }
            } else { alert('Upload failed: ' + (data.error || 'Unknown error')); }
        } catch(e) { alert('Error uploading file: ' + e.message); }
        setLoading(false);
    };

    const handleSubmit = async () => {
        setLoading(true);
        const designConfig = {
            image: logoUrl,
            dotsOptions: { color: dotsColor, type: dotType },
            cornersSquareOptions: { color: cornerColor, type: cornerType },
            backgroundOptions: { color: bgColor }
        };

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
                    design_config: designConfig
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
                <div className="nav-logo">Create Campaign</div>
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

                {/* STEP 1: TYPE */}
                {step === 1 && (
                    <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}}>
                        <h2 style={{textAlign:'center', marginBottom:'30px'}}>Select Campaign Type</h2>
                        <div className="type-grid">
                            <TypeCard icon={<LinkIcon size={32}/>} label="Website URL" selected={type==='url'} onClick={()=>setType('url')}/>
                            <TypeCard icon={<FileText size={32}/>} label="PDF File" selected={type==='pdf'} onClick={()=>setType('pdf')}/>
                            <TypeCard icon={<ImageIcon size={32}/>} label="Image File" selected={type==='image'} onClick={()=>setType('image')}/>
                            <TypeCard icon={<Smartphone size={32}/>} label="App Store" selected={type==='vcard'} onClick={()=>setType('vcard')}/>
                        </div>
                        <div className="flex-end"><button className="btn btn-primary" onClick={()=>setStep(2)}>Next <ArrowRight size={18}/></button></div>
                    </motion.div>
                )}

                {/* STEP 2: CONTENT */}
                {step === 2 && (
                    <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}}>
                        <h2 style={{textAlign:'center', marginBottom:'30px'}}>Add Content</h2>
                        <div className="glass-card" style={{maxWidth:'600px', margin:'0 auto'}}>
                            {type === 'url' ? (
                                <div className="input-group">
                                    <label className="input-label">Destination URL</label>
                                    <input type="url" placeholder="https://example.com" value={destination} onChange={e=>setDestination(e.target.value)} autoFocus />
                                </div>
                            ) : (
                                <div>
                                    <label className="input-label">Upload your {type.toUpperCase()}</label>
                                    <FileUploader onDrop={handleFileUpload} loading={loading} fileUrl={fileUrl} />
                                </div>
                            )}
                        </div>
                        <div className="flex-end" style={{maxWidth:'600px', margin:'20px auto'}}>
                            <button className="btn btn-outline" onClick={()=>setStep(1)}>Back</button>
                            <button className="btn btn-primary" disabled={!destination} onClick={()=>setStep(3)}>Next</button>
                        </div>
                    </motion.div>
                )}

                {/* STEP 3: ADVANCED DESIGN */}
                {step === 3 && (
                    <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} style={{display:'grid', gridTemplateColumns:'1fr 350px', gap:'40px'}}>
                        
                        {/* LEFT: CONTROLS */}
                        <div className="glass-card">
                            <h3><Palette size={20} style={{marginRight:'10px'}}/> Visual Customization</h3>
                            
                            {/* DOTS */}
                            <div className="input-group">
                                <label className="input-label">Pattern Style</label>
                                <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                                    {['square','dots','rounded','classy','classy-rounded','extra-rounded'].map(d => (
                                        <button key={d} onClick={()=>setDotType(d)} className={`btn ${dotType===d ? 'btn-primary' : 'btn-outline'}`} style={{padding:'8px', fontSize:'0.8rem'}}>
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Pattern Color</label>
                                <input type="color" value={dotsColor} onChange={e=>setDotsColor(e.target.value)} style={{height:'40px'}}/>
                            </div>

                            <hr style={{border:'0', borderTop:'1px solid var(--border)', margin:'20px 0'}}/>

                            {/* CORNERS */}
                            <div className="input-group">
                                <label className="input-label">Corner Eyes</label>
                                <div style={{display:'flex', gap:'10px'}}>
                                    {['square','dot','extra-rounded'].map(c => (
                                        <button key={c} onClick={()=>setCornerType(c)} className={`btn ${cornerType===c ? 'btn-primary' : 'btn-outline'}`} style={{padding:'8px', fontSize:'0.8rem'}}>
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Eye Color</label>
                                <input type="color" value={cornerColor} onChange={e=>setCornerColor(e.target.value)} style={{height:'40px'}}/>
                            </div>

                            <hr style={{border:'0', borderTop:'1px solid var(--border)', margin:'20px 0'}}/>

                            {/* LOGO */}
                            <div className="input-group">
                                <label className="input-label">Upload Logo (Center)</label>
                                {logoUrl ? (
                                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                        <img src={logoUrl} style={{width:'40px', height:'40px', objectFit:'contain'}}/>
                                        <button className="btn btn-outline" onClick={()=>setLogoUrl('')} style={{fontSize:'0.8rem'}}>Remove</button>
                                    </div>
                                ) : (
                                    <FileUploader onDrop={(f) => handleFileUpload(f, true)} loading={loading} fileUrl={null} isMini={true} />
                                )}
                            </div>
                        </div>

                        {/* RIGHT: LIVE PREVIEW */}
                        <div>
                            <div className="glass-card" style={{position:'sticky', top:'100px', textAlign:'center'}}>
                                <h3>Live Preview</h3>
                                <div ref={qrCodeRef} style={{margin:'20px auto', display:'flex', justifyContent:'center'}}></div>
                                <button className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} onClick={handleSubmit} disabled={loading}>
                                    {loading ? 'Generating...' : 'Launch Campaign'} <Check size={18}/>
                                </button>
                                <button className="btn btn-outline" style={{width:'100%', marginTop:'10px'}} onClick={()=>setStep(2)}>Back</button>
                            </div>
                        </div>

                    </motion.div>
                )}
            </div>
        </div>
    );
}

// Sub-components
function TypeCard({ icon, label, selected, onClick }) {
    return (
        <div className={`type-card ${selected ? 'selected' : ''}`} onClick={onClick}>
            <div style={{color: selected ? 'var(--accent)' : 'inherit'}}>{icon}</div>
            <span style={{fontWeight:'600'}}>{label}</span>
        </div>
    );
}

function FileUploader({ onDrop, loading, fileUrl, isMini }) {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, multiple: false });
    return (
        <div {...getRootProps()} className="dropzone" style={{padding: isMini ? '15px' : '40px'}}>
            <input {...getInputProps()} />
            {loading ? <p>Uploading...</p> : 
             fileUrl ? <p style={{color:'var(--success)'}}><Check size={16}/> Ready</p> :
             <div style={{display:'flex', flexDirection: isMini?'row':'column', alignItems:'center', justifyContent:'center', gap:'10px'}}>
                <UploadCloud size={isMini?20:32}/>
                <p style={{margin:0, fontSize: isMini?'0.8rem':'1rem'}}>{isMini ? 'Click to upload logo' : 'Drag file here'}</p>
             </div>}
        </div>
    );
}