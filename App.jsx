import { useState, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;

const STATUS_CONFIG = {
  Aberta:         { color: "#a0856c", bg: "#f5efe9", label: "Aberta",       icon: "○" },
  Aprovada:       { color: "#b8860b", bg: "#fdf6e3", label: "Aprovada",     icon: "◐" },
  "Produção":     { color: "#7a9e87", bg: "#f0f5f2", label: "Produção",     icon: "◕" },
  "Ag. Retirada": { color: "#9b7fb6", bg: "#f5f0fa", label: "Ag. Retirada", icon: "◎" },
  Entregue:       { color: "#6aaa8a", bg: "#edf7f2", label: "Entregue",     icon: "●" },
};
const STATUS_ORDER = ["Aberta", "Aprovada", "Produção", "Ag. Retirada", "Entregue"];

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  list: () => sbFetch("/ordens_servico?order=created_at.desc"),
  insert: (data) => sbFetch("/ordens_servico", { method: "POST", body: JSON.stringify(data) }),
  update: (id, data) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(data), prefer: "return=minimal" }),
  delete: (id) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
};

async function notifyWhatsApp(os) {
  try {
    await fetch('/api/extract-os', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'notify_whatsapp',
        phone: os.fone,
        osData: { cliente: os.cliente, numero: os.numero, descricao: os.descricao }
      })
    });
  } catch (e) {
    console.error('Erro WhatsApp:', e);
  }
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

async function extractOSFromImage(base64, mediaType) {
  const response = await fetch('/api/extract-os', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mediaType })
  });
  if (!response.ok) throw new Error('Erro no servidor: ' + response.status);
  return await response.json();
}

function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = () => {
    if (pwd === APP_PASSWORD) {
      sessionStorage.setItem("garimpo_auth", "1");
      onLogin();
    } else {
      setError(true);
      setPwd("");
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#faf7f4", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", border: "1px solid #e8ddd5", borderRadius: 20, padding: 52, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 4px 24px #c4a98820" }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg, #d4a574 0%, #c49660 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>💎</div>
        <div style={{ color: "#3d2b1f", fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Garimpo Jóias</div>
        <div style={{ color: "#b09080", fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", marginBottom: 36 }}>CONTROLE DE OS</div>
        <input
          type="password"
          value={pwd}
          onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder="Senha de acesso"
          style={{
            width: "100%", background: "#faf7f4",
            border: `1.5px solid ${error ? "#c0392b" : "#e0d0c4"}`,
            borderRadius: 10, padding: "13px 16px", color: "#3d2b1f",
            fontFamily: "'DM Mono', monospace", fontSize: 14,
            boxSizing: "border-box", outline: "none", marginBottom: 12,
          }}
        />
        {error && <div style={{ color: "#c0392b", fontSize: 12, fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>Senha incorreta</div>}
        <button onClick={handleSubmit} style={{
          width: "100%", padding: "13px 0",
          background: "linear-gradient(135deg, #d4a574 0%, #c49660 100%)",
          border: "none", borderRadius: 10, color: "#fff",
          fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.06em",
        }}>ENTRAR</button>
      </div>
    </div>
  );
}

function StatusBadge({ status, small }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Aberta"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "3px 10px" : "4px 12px", borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.color}40`, color: cfg.color, fontSize: small ? 11 : 12, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: small ? 8 : 10 }}>{cfg.icon}</span>{cfg.label}
    </span>
  );
}

function StatusPipeline({ current, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
      {STATUS_ORDER.map((s, i) => {
        const cfg = STATUS_CONFIG[s];
        const active = s === current;
        const passed = STATUS_ORDER.indexOf(current) >= i;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <button onClick={(e) => { e.stopPropagation(); onChange(s); }} style={{ padding: "3px 10px", borderRadius: 6, border: active ? `1.5px solid ${cfg.color}` : "1.5px solid #e8ddd5", background: active ? cfg.bg : "transparent", color: passed ? cfg.color : "#c4b0a4", fontSize: 11, fontFamily: "'DM Mono', monospace", cursor: "pointer", transition: "all 0.2s", fontWeight: active ? 700 : 400 }}>{s}</button>
            {i < STATUS_ORDER.length - 1 && <div style={{ width: 12, height: 1, background: "#e8ddd5" }} />}
          </div>
        );
      })}
    </div>
  );
}

function OSCard({ os, onStatusChange, onSelect, selected }) {
  const cfg = STATUS_CONFIG[os.status] || STATUS_CONFIG["Aberta"];
  return (
    <div onClick={() => onSelect(os)} style={{ background: selected ? "#fdf8f4" : "#fff", border: selected ? `1.5px solid ${cfg.color}` : "1px solid #ede5df", borderLeft: `3px solid ${cfg.color}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all 0.2s", marginBottom: 10, boxShadow: selected ? `0 2px 12px ${cfg.color}20` : "0 1px 4px #c4a98812" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <span style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.08em" }}>OS {os.numero}</span>
          <div style={{ color: "#3d2b1f", fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: 2, fontWeight: 600 }}>{os.cliente}</div>
        </div>
        <StatusBadge status={os.status} small />
      </div>
      <div style={{ color: "#a08878", fontSize: 12, fontFamily: "'DM Mono', monospace", marginBottom: 12, lineHeight: 1.6 }}>
        {os.descricao?.length > 65 ? os.descricao.slice(0, 65) + "…" : os.descricao}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <StatusPipeline current={os.status} onChange={(s) => onStatusChange(os.id, s)} />
        {os.ac && <span style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>R$ {os.ac}</span>}
      </div>
    </div>
  );
}

function UploadModal({ onClose, onSave }) {
  const [phase, setPhase] = useState("idle");
  const [editData, setEditData] = useState({});
  const [preview, setPreview] = useState(null);
  const [preview2, setPreview2] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef();
  const input2Ref = useRef();

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPhase("processing");
    try {
      const base64 = await toBase64(file);
      const data = await extractOSFromImage(base64, file.type || "image/jpeg");
      setEditData(data);
      setPhase("review");
    } catch (e) {
      setErrorMsg("Não consegui ler a OS: " + e.message);
      setPhase("error");
    }
  }, []);

  const handleFile2 = useCallback(async (file) => {
    if (!file) return;
    setPreview2(URL.createObjectURL(file));
    const base64 = await toBase64(file);
    setEditData(d => ({ ...d, foto_peca_base64: base64, foto_peca_type: file.type || "image/jpeg" }));
  }, []);

  const F = (key, label, textarea) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ color: "#a08878", fontSize: 11, fontFamily: "'DM Mono', monospace", display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>{label}</label>
      {textarea
        ? <textarea value={editData[key] || ""} rows={3} onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))} style={{ width: "100%", background: "#faf7f4", border: "1.5px solid #e0d0c4", borderRadius: 8, padding: "9px 12px", color: "#3d2b1f", fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box", resize: "vertical", outline: "none" }} />
        : <input value={editData[key] || ""} onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))} style={{ width: "100%", background: "#faf7f4", border: "1.5px solid #e0d0c4", borderRadius: 8, padding: "9px 12px", color: "#3d2b1f", fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box", outline: "none" }} />
      }
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: "#fff", border: "1px solid #e8ddd5", borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: "#3d2b1f", fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova OS — Leitura por IA</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#b09080", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {phase === "idle" && (
          <div onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current.click()}
            style={{ border: "2px dashed #e0d0c4", borderRadius: 12, padding: 60, textAlign: "center", cursor: "pointer", background: "#faf7f4" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
            <div style={{ color: "#3d2b1f", fontFamily: "'Playfair Display', serif", fontSize: 16, marginBottom: 6 }}>Arraste a foto da OS aqui</div>
            <div style={{ color: "#b09080", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>ou clique para selecionar — JPG, PNG</div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}
        {phase === "processing" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            {preview && <img src={preview} alt="" style={{ maxHeight: 200, borderRadius: 10, marginBottom: 20, opacity: 0.7 }} />}
            <div style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>🔍 IA lendo a OS…</div>
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{errorMsg}</div>
            <button onClick={() => setPhase("idle")} style={{ background: "#faf7f4", border: "1px solid #e0d0c4", color: "#3d2b1f", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Tentar novamente</button>
          </div>
        )}
        {phase === "review" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <div>
              <div style={{ color: "#b09080", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA OS</div>
              {preview && <img src={preview} alt="OS" style={{ width: "100%", borderRadius: 10, border: "1px solid #e8ddd5", marginBottom: 16 }} />}
              <div style={{ color: "#b09080", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA PEÇA (opcional)</div>
              {preview2
                ? <img src={preview2} alt="Peça" style={{ width: "100%", borderRadius: 10, border: "1px solid #e8ddd5", marginBottom: 8 }} />
                : <div onClick={() => input2Ref.current.click()} style={{ border: "2px dashed #e0d0c4", borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: "#faf7f4", marginBottom: 8 }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
                    <div style={{ color: "#b09080", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>Adicionar foto da peça</div>
                  </div>
              }
              {preview2 && <button onClick={() => input2Ref.current.click()} style={{ background: "#faf7f4", border: "1px solid #e0d0c4", color: "#a08878", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Trocar foto</button>}
              <input ref={input2Ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile2(e.target.files[0])} />
            </div>
            <div>
              <div style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 16, letterSpacing: "0.04em" }}>✓ Campos extraídos — revise antes de salvar</div>
              {F("numero", "Nº OS")}{F("cliente", "Cliente")}{F("fone", "Telefone")}
              {F("descricao", "Descrição", true)}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {F("data", "Data")}{F("ac", "A/C (R$)")}{F("recepcao", "Recepção")}{F("obs", "Observação")}
              </div>
              <button onClick={() => onSave(editData)} style={{ marginTop: 16, width: "100%", padding: "12px 0", background: "linear-gradient(135deg, #d4a574 0%, #c49660 100%)", border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.06em" }}>
                SALVAR OS NO BANCO
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OSDetail({ os, onStatusChange, onDelete, onClose }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!os) return null;
  const cfg = STATUS_CONFIG[os.status] || STATUS_CONFIG["Aberta"];
  return (
    <div style={{ background: "#fff", border: "1px solid #e8ddd5", borderRadius: 14, padding: 26, boxShadow: "0 2px 12px #c4a98812" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", marginBottom: 4 }}>OS {os.numero}</div>
          <div style={{ color: "#3d2b1f", fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{os.cliente}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#b09080", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <StatusPipeline current={os.status} onChange={(s) => onStatusChange(os.id, s)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginBottom: 18 }}>
        {[["Telefone", os.fone], ["Data entrada", os.data], ["Recepção", os.recepcao], ["A/C", os.ac ? `R$ ${os.ac}` : "—"], ["N/C", os.nc ? `R$ ${os.nc}` : "—"], ["Observação", os.obs || "—"]].map(([lbl, val]) => (
          <div key={lbl}>
            <div style={{ color: "#b09080", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 3, letterSpacing: "0.06em" }}>{lbl}</div>
            <div style={{ color: "#3d2b1f", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: "#b09080", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 6, letterSpacing: "0.06em" }}>DESCRIÇÃO DO SERVIÇO</div>
        <div style={{ color: "#3d2b1f", fontSize: 13, fontFamily: "'DM Mono', monospace", lineHeight: 1.7, background: "#faf7f4", padding: 14, borderRadius: 8, border: "1px solid #e8ddd5" }}>{os.descricao}</div>
      </div>
      {os.foto_peca_base64 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: "#b09080", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.06em" }}>FOTO DA PEÇA</div>
          <img src={`data:${os.foto_peca_type || "image/jpeg"};base64,${os.foto_peca_base64}`} alt="Peça" style={{ width: "100%", borderRadius: 10, border: "1px solid #e8ddd5" }} />
        </div>
      )}
      <div style={{ marginTop: 20, borderTop: "1px solid #ede5df", paddingTop: 16 }}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "1px solid #e8c4c0", color: "#c0392b", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
            🗑 Excluir OS
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#c0392b", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Confirma exclusão?</span>
            <button onClick={() => onDelete(os.id)} style={{ background: "#c0392b", border: "none", color: "#fff", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>Sim, excluir</button>
            <button onClick={() => setConfirmDelete(false)} style={{ background: "#faf7f4", border: "1px solid #e0d0c4", color: "#a08878", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => sessionStorage.getItem("garimpo_auth") === "1");
  const [osList, setOsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOS, setSelectedOS] = useState(null);
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!auth) return;
    db.list()
      .then(data => { setOsList(data || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [auth]);

  if (!auth) return <LoginScreen onLogin={() => setAuth(true)} />;

  const handleStatusChange = async (id, newStatus) => {
    const os = osList.find(o => o.id === id);
    setOsList(list => list.map(o => o.id === id ? { ...o, status: newStatus } : o));
    if (selectedOS?.id === id) setSelectedOS(prev => ({ ...prev, status: newStatus }));
    try {
      await db.update(id, { status: newStatus });
      if (newStatus === "Ag. Retirada" && os?.fone) {
        await notifyWhatsApp({ ...os, status: newStatus });
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    try {
      await db.delete(id);
      setOsList(list => list.filter(os => os.id !== id));
      setSelectedOS(null);
    } catch (e) { alert("Erro ao excluir: " + e.message); }
  };

  const handleSaveNew = async (data) => {
    try {
      const saved = await db.insert({ ...data, status: "Aberta" });
      const newOS = Array.isArray(saved) ? saved[0] : saved;
      setOsList(list => [newOS, ...list]);
      setShowUpload(false);
      setSelectedOS(newOS);
    } catch (e) { alert("Erro ao salvar: " + e.message); }
  };

  const filtered = osList.filter(os => {
    const matchStatus = filterStatus === "Todos" || os.status === filterStatus;
    const matchSearch = !search || os.cliente?.toLowerCase().includes(search.toLowerCase()) || os.numero?.includes(search) || os.descricao?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = STATUS_ORDER.reduce((acc, s) => { acc[s] = osList.filter(o => o.status === s).length; return acc; }, {});

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #faf7f4; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #f5efe9; }
        ::-webkit-scrollbar-thumb { background: #e0d0c4; border-radius: 2px; }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#faf7f4", color: "#3d2b1f", fontFamily: "'DM Mono', monospace" }}>

        <div style={{ borderBottom: "1px solid #ede5df", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #d4a574 0%, #c49660 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💎</div>
            <div>
              <div style={{ color: "#3d2b1f", fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700 }}>Garimpo Jóias</div>
              <div style={{ color: "#b09080", fontSize: 10, letterSpacing: "0.1em" }}>CONTROLE DE ORDENS DE SERVIÇO</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!loading && !error && <span style={{ color: "#7a9e87", fontSize: 10, fontFamily: "'DM Mono', monospace" }}>● CONECTADO</span>}
            <button onClick={() => { sessionStorage.removeItem("garimpo_auth"); setAuth(false); }} style={{ background: "none", border: "1px solid #e8ddd5", color: "#b09080", padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Sair</button>
            <button onClick={() => setShowUpload(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #d4a574 0%, #c49660 100%)", border: "none", borderRadius: 9, padding: "9px 18px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📸 NOVA OS</button>
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #ede5df", background: "#fff", overflowX: "auto" }}>
          {[{ label: "Todas", count: osList.length, color: "#3d2b1f" }, ...STATUS_ORDER.map(s => ({ label: s, count: counts[s], color: STATUS_CONFIG[s].color }))].map(({ label, count, color }) => (
            <div key={label} onClick={() => setFilterStatus(label === "Todas" ? "Todos" : label)}
              style={{ padding: "14px 24px", borderRight: "1px solid #ede5df", cursor: "pointer", whiteSpace: "nowrap", background: (filterStatus === label || (label === "Todas" && filterStatus === "Todos")) ? "#faf7f4" : "transparent", transition: "background 0.2s", borderBottom: (filterStatus === label || (label === "Todas" && filterStatus === "Todos")) ? `2px solid ${color}` : "2px solid transparent" }}>
              <div style={{ color, fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700 }}>{count}</div>
              <div style={{ color: "#b09080", fontSize: 10, letterSpacing: "0.08em" }}>{label.toUpperCase()}</div>
            </div>
          ))}
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 20px", minWidth: 200 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, OS ou serviço…"
              style={{ width: "100%", background: "#faf7f4", border: "1px solid #e8ddd5", borderRadius: 8, padding: "8px 14px", color: "#3d2b1f", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }} />
          </div>
        </div>

        {error ? (
          <div style={{ textAlign: "center", padding: 60, color: "#c0392b", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Erro ao conectar: {error}</div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#b09080", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Carregando OS…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selectedOS ? "1fr 400px" : "1fr", minHeight: "calc(100vh - 130px)" }}>
            <div style={{ padding: 24, overflowY: "auto", borderRight: selectedOS ? "1px solid #ede5df" : "none" }}>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: 60, color: "#c4b0a4", fontSize: 13 }}>{osList.length === 0 ? "Nenhuma OS cadastrada — clique em NOVA OS para começar" : "Nenhuma OS encontrada"}</div>
                : filtered.map(os => <OSCard key={os.id} os={os} onStatusChange={handleStatusChange} onSelect={setSelectedOS} selected={selectedOS?.id === os.id} />)
              }
            </div>
            {selectedOS && (
              <div style={{ padding: 20, overflowY: "auto", background: "#faf7f4" }}>
                <OSDetail os={selectedOS} onStatusChange={handleStatusChange} onDelete={handleDelete} onClose={() => setSelectedOS(null)} />
              </div>
            )}
          </div>
        )}
      </div>
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSave={handleSaveNew} />}
    </>
  );
}
