import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, UploadCloud, FileText, Download, AlertCircle, CheckCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function BulkPage() {
    const [token, setToken] = useState(null);
    const [file, setFile] = useState(null);
    const [baseUrl, setBaseUrl] = useState('');
    const [jobId, setJobId] = useState(null);
    const [jobStatus, setJobStatus] = useState(null); // pending, processing, completed, failed
    const [downloadUrl, setDownloadUrl] = useState(null);

    useEffect(() => {
        const t = localStorage.getItem('jwt_token');
        if(t) setToken(t);
    }, []);

    // Polling Effect
    useEffect(() => {
        if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return;
        const interval = setInterval(checkStatus, 2000);
        return () => clearInterval(interval);
    }, [jobId, jobStatus]);

    const checkStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/api/bulk/${jobId}`, { headers: { 'Authorization': `Bearer ${token}` }});
            const data = await res.json();
            setJobStatus(data.status);
            if (data.status === 'completed') setDownloadUrl(data.download_url);
        } catch(e) {}
    };

    const handleDrop = (acceptedFiles) => {
        setFile(acceptedFiles[0]);
    };

    const startBulkJob = async () => {
        if (!file) return;
        const formData = new FormData();
        formData.append('csv', file);
        formData.append('baseUrl', baseUrl);
        
        try {
            const res = await fetch(`${API_URL}/api/bulk`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setJobId(data.jobId);
                setJobStatus('pending');
            }
        } catch(e) { alert('Error starting job'); }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
            <nav className="nav-bar">
                <div className="nav-logo">Bulk QR Generator</div>
                <Link href="/"><button className="btn btn-outline"><ArrowLeft size={16}/> Back to Dashboard</button></Link>
            </nav>

            <div className="wizard-container" style={{maxWidth:'800px'}}>
                
                {/* CONFIGURATION */}
                {!jobId && (
                    <div className="glass-card">
                        <h2 style={{marginTop:0}}>1. Upload Data</h2>
                        <p style={{color:'var(--text-secondary)', marginBottom:'20px'}}>
                            Upload a CSV file. If you have a 'url' column, leave Base URL empty. 
                            Otherwise, enter a Base URL and we will append your columns as parameters.
                        </p>

                        <div {...useDropzone({onDrop: handleDrop}).getRootProps()} className="dropzone" style={{marginBottom:'20px'}}>
                            <input {...useDropzone({onDrop: handleDrop}).getInputProps()} />
                            {file ? 
                                <div style={{color:'var(--text-primary)', display:'flex', alignItems:'center', justifyContent:'center', gap:'10px'}}>
                                    <FileText size={24}/> {file.name}
                                </div> 
                                : 
                                <div><UploadCloud size={32}/><p>Drag CSV file here</p></div>
                            }
                        </div>

                        <div className="input-group">
                            <label className="input-label">Base URL Template (Optional)</label>
                            <input type="text" placeholder="https://myagency.com/property" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} />
                            {/* FIX: Replaced -> with &rarr; to fix build error */}
                            <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:'5px'}}>Example: https://site.com &rarr; https://site.com?col1=val1</p>
                        </div>

                        <button className="btn btn-primary" style={{width:'100%', justifyContent:'center'}} onClick={startBulkJob} disabled={!file}>
                            Start Bulk Generation
                        </button>
                    </div>
                )}

                {/* PROGRESS UI */}
                {jobId && (
                    <div className="glass-card" style={{textAlign:'center', padding:'60px'}}>
                        {jobStatus === 'pending' || jobStatus === 'processing' ? (
                            <>
                                <div className="loader" style={{margin:'0 auto 20px auto'}}></div> 
                                {/* Simple CSS loader would be needed, or just text */}
                                <h3>Generating your codes...</h3>
                                <p style={{color:'var(--text-secondary)'}}>This runs in the background. You can leave this page.</p>
                            </>
                        ) : jobStatus === 'completed' ? (
                            <>
                                <CheckCircle size={64} color="var(--success)" style={{margin:'0 auto 20px auto'}}/>
                                <h3>Job Completed!</h3>
                                <p style={{marginBottom:'30px'}}>Your ZIP file containing QR images and the updated CSV is ready.</p>
                                <a href={downloadUrl} className="btn btn-primary" style={{textDecoration:'none', justifyContent:'center'}}>
                                    <Download size={18}/> Download Assets
                                </a>
                            </>
                        ) : (
                            <>
                                <AlertCircle size={64} color="var(--danger)" style={{margin:'0 auto 20px auto'}}/>
                                <h3>Job Failed</h3>
                                <p>Please check your CSV format and try again.</p>
                                <button onClick={()=>setJobId(null)} className="btn btn-outline">Try Again</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}