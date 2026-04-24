import { useState, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

const STATUS_CONFIG = {
  Aberta:         { color: "#94a3b8", bg: "#1e293b", label: "Aberta",       icon: "○" },
  Aprovada:       { color: "#f59e0b", bg: "#2d1f00", label: "Aprovada",     icon: "◐" },
  "Produção":     { color: "#3b82f6", bg: "#0f1f3d", label: "Produção",     icon: "◕" },
  "Ag. Retirada": { color: "#a855f7", bg: "#1e0a2e", label: "Ag. Retirada", icon: "◎" },
  Entregue:       { color: "#10b981", bg: "#022c1e", label: "Entregue",     icon: "●" },
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

function StatusBadge({ status, small }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Aberta"];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "2px 8px" : "4px 12px", borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.color}40`, color: cfg.color, fontSize: small ? 11 : 12, fontFamily: "'DM Mono', monospace", fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
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
            <button onClick={(e) => { e.stopPropagation(); onChange(s); }} style={{ padding: "3px 10px", borderRadius: 4, border: active ? `1.5px solid ${cfg.color}` : "1.5px solid #1e293b", background: active ? cfg.bg : "transparent", color: passed ? cfg.color : "#334155", fontSize: 11, fontFamily: "'DM Mono', monospace", cursor: "pointer", transition: "all 0.2s", fontWeight: active ? 700 : 400 }}>{s}</button>
            {i < STATUS_ORDER.length - 1 && <div style={{ width: 12, height: 1, background: STATUS_ORDER.indexOf(current) > i ? STATUS_CONFIG[STATUS_ORDER[i + 1]].color + "50" : "#1e293b" }} />}
          </div>
        );
      })}
    </div>
  );
}

function OSCard({ os, onStatusChange, onSelect, selected }) {
  const cfg = STATUS_CONFIG[os.status] || STATUS_CONFIG["Aberta"];
  return (
    <div onClick={() => onSelect(os)} style={{ background: selected ? "#0f172a" : "#0a0f1a", border: selected ? `1px solid ${cfg.color}60` : "1px solid #1e293b", borderLeft: `3px solid ${cfg.color}`, borderRadius: 8, padding: "14px 16px", cursor: "pointer", transition: "all 0.2s", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <span style={{ color: "#f8c", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.08em" }}>OS {os.numero}</span>
          <div style={{ color: "#e2e8f0", fontFamily: "'Playfair Display', serif", fontSize: 15, marginTop: 2, fontWeight: 600 }}>{os.cliente}</div>
        </div>
        <StatusBadge status={os.status} small />
      </div>
      <div style={{ color: "#64748b", fontSize: 12, fontFamily: "'DM Mono', monospace", marginBottom: 10, lineHeight: 1.5 }}>
        {os.descricao?.length > 60 ? os.descricao.slice(0, 60) + "…" : os.descricao}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <StatusPipeline current={os.status} onChange={(s) => onStatusChange(os.id, s)} />
        {os.ac && <span style={{ color: "#10b981", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>R$ {os.ac}</span>}
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
    <div style={{ marginBottom: 10 }}>
      <label style={{ color: "#64748b", fontSize: 11, fontFamily: "'DM Mono', monospace", display: "block", marginBottom: 3 }}>{label}</label>
      {textarea
        ? <textarea value={editData[key] || ""} rows={3} onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))} style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 5, padding: "7px 10px", color: "#e2e8f0", fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box", resize: "vertical" }} />
        : <input value={editData[key] || ""} onChange={e => setEditData(d => ({ ...d, [key]: e.target.value }))} style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 5, padding: "7px 10px", color: "#e2e8f0", fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box" }} />
      }
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000090", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: "#060c18", border: "1px solid #1e293b", borderRadius: 12, width: "100%", maxWidth: 860, maxHeight: "90vh", overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ color: "#e2e8f0", fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700 }}>Nova OS — Leitura por IA</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {phase === "idle" && (
          <div onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current.click()}
            style={{ border: "2px dashed #1e293b", borderRadius: 10, padding: 60, textAlign: "center", cursor: "pointer" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
            <div style={{ color: "#e2e8f0", fontFamily: "'Playfair Display', serif", fontSize: 16, marginBottom: 6 }}>Arraste a foto da OS aqui</div>
            <div style={{ color: "#475569", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>ou clique para selecionar — JPG, PNG</div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}
        {phase === "processing" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            {preview && <img src={preview} alt="" style={{ maxHeight: 200, borderRadius: 8, marginBottom: 20, opacity: 0.6 }} />}
            <div style={{ color: "#f59e0b", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>🔍 IA lendo a OS…</div>
            <div style={{ color: "#475569", fontSize: 11, marginTop: 6, fontFamily: "'DM Mono', monospace" }}>Extraindo campos automaticamente</div>
          </div>
        )}
        {phase === "error" && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ color: "#ef4444", fontSize: 13, fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{errorMsg}</div>
            <button onClick={() => setPhase("idle")} style={{ background: "#1e293b", border: "none", color: "#e2e8f0", padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Tentar novamente</button>
          </div>
        )}
        {phase === "review" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ color: "#475569", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>FOTO DA OS</div>
              {preview && <img src={preview} alt="OS" style={{ width: "100%", borderRadius: 8, border: "1px solid #1e293b", marginBottom: 12 }} />}
              <div style={{ color: "#475569", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>FOTO DA PEÇA (opcional)</div>
              {preview2
                ? <img src={preview2} alt="Peça" style={{ width: "100%", borderRadius: 8, border: "1px solid #1e293b", marginBottom: 8 }} />
                : (
                  <div onClick={() => input2Ref.current.click()} style={{ border: "2px dashed #1e293b", borderRadius: 8, padding: 20, textAlign: "center", cursor: "pointer", marginBottom: 8 }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
                    <div style={{ color: "#475569", fontSize: 11, fontFamily: "'DM Mono', monospace" }}>Adicionar foto da peça</div>
                  </div>
                )
              }
              {preview2 && (
                <button onClick={() => input2Ref.current.click()} style={{ background: "#1e293b", border: "none", color: "#94a3b8", padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Trocar foto</button>
              )}
              <input ref={input2Ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile2(e.target.files[0])} />
            </div>
            <div>
              <div style={{ color: "#10b981", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 14 }}>✓ Campos extraídos — revise antes de salvar</div>
              {F("numero", "Nº OS")}{F("cliente", "Cliente")}{F("fone", "Telefone")}
              {F("descricao", "Descrição", true)}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {F("data", "Data")}{F("ac", "A/C (R$)")}{F("recepcao", "Recepção")}{F("obs", "Observação")}
              </div>
              <button onClick={() => onSave(editData)} style={{ marginTop: 12, width: "100%", padding: "10px 0", background: "linear-gradient(135deg, #f8c 0%, #f59e0b 100%)", border: "none", borderRadius: 6, color: "#060c18", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}>
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
    <div style={{ background: "#060c18", border: `1px solid ${cfg.color}40`, borderRadius: 10, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <div style={{ color: "#f8c", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", marginBottom: 4 }}>OS {os.numero}</div>
          <div style={{ color: "#e2e8f0", fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{os.cliente}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ marginBottom: 18 }}>
        <StatusPipeline current={os.status} onChange={(s) => onStatusChange(os.id, s)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: 16 }}>
        {[["Telefone", os.fone], ["Data entrada", os.data], ["Recepção", os.recepcao], ["A/C", os.ac ? `R$ ${os.ac}` : "—"], ["N/C", os.nc ? `R$ ${os.nc}` : "—"], ["Observação", os.obs || "—"]].map(([lbl, val]) => (
          <div key={lbl}>
            <div style={{ color: "#475569", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 2 }}>{lbl}</div>
            <div style={{ color: "#cbd5e1", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>{val}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ color: "#475569", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>Descrição do serviço</div>
        <div style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "'DM Mono', monospace", lineHeight: 1.6, background: "#0a0f1a", padding: 12, borderRadius: 6, border: "1px solid #1e293b" }}>{os.descricao}</div>
      </div>
      {os.foto_peca_base64 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#475569", fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>FOTO DA PEÇA</div>
          <img src={`data:${os.foto_peca_type || "image/jpeg"};base64,${os.foto_peca_base64}`} alt="Peça" style={{ width: "100%", borderRadius: 8, border: "1px solid #1e293b" }} />
        </div>
      )}
      <div style={{ marginTop: 20, borderTop: "1px solid #1e293b", paddingTop: 16 }}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "1px solid #ef444440", color: "#ef4444", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>
            🗑 Excluir OS
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#ef4444", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Confirma exclusão?</span>
            <button onClick={() => onDelete(os.id)} style={{ background: "#ef4444", border: "none", color: "#fff", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>Sim, excluir</button>
            <button onClick={() => setConfirmDelete(false)} style={{ background: "#1e293b", border: "none", color: "#94a3b8", padding: "5px 14px", borderRadius: 5, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [osList, setOsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOS, setSelectedOS] = useState(null);
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    db.list()
      .then(data => { setOsList(data || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    setOsList(list => list.map(os => os.id === id ? { ...os, status: newStatus } : os));
    if (selectedOS?.id === id) setSelectedOS(prev => ({ ...prev, status: newStatus }));
    try { await db.update(id, { status: newStatus }); } catch (e) { console.error(e); }
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
        body { background: #030812; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0f1a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#030812", color: "#e2e8f0", fontFamily: "'DM Mono', monospace" }}>
        <div style={{ borderBottom: "1px solid #1e293b", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#060c18" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg, #f8c 0%, #f59e0b 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💎</div>
            <div>
              <div style={{ color: "#e2e8f0", fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700 }}>Garimpo Jóias</div>
              <div style={{ color: "#475569", fontSize: 10, letterSpacing: "0.1em" }}>CONTROLE DE ORDENS DE SERVIÇO</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!loading && !error && <span style={{ color: "#10b981", fontSize: 10, fontFamily: "'DM Mono', monospace" }}>● BANCO CONECTADO</span>}
            <button onClick={() => setShowUpload(true)} style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #f8c 0%, #f59e0b 100%)", border: "none", borderRadius: 7, padding: "8px 16px", color: "#060c18", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📸 NOVA OS</button>
          </div>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#060c18", overflowX: "auto" }}>
          {[{ label: "Todas", count: osList.length, color: "#e2e8f0" }, ...STATUS_ORDER.map(s => ({ label: s, count: counts[s], color: STATUS_CONFIG[s].color }))].map(({ label, count, color }) => (
            <div key={label} onClick={() => setFilterStatus(label === "Todas" ? "Todos" : label)}
              style={{ padding: "12px 22px", borderRight: "1px solid #1e293b", cursor: "pointer", whiteSpace: "nowrap", background: (filterStatus === label || (label === "Todas" && filterStatus === "Todos")) ? "#0a0f1a" : "transparent", transition: "background 0.2s" }}>
              <div style={{ color, fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>{count}</div>
              <div style={{ color: "#475569", fontSize: 10, letterSpacing: "0.08em" }}>{label.toUpperCase()}</div>
            </div>
          ))}
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 20px", minWidth: 200 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
              style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e293b", borderRadius: 6, padding: "7px 12px", color: "#e2e8f0", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }} />
          </div>
        </div>
        {error ? (
          <div style={{ textAlign: "center", padding: 60, color: "#ef4444", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Erro ao conectar: {error}</div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#475569", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Carregando OS do banco…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selectedOS ? "1fr 380px" : "1fr", minHeight: "calc(100vh - 130px)" }}>
            <div style={{ padding: 24, overflowY: "auto", borderRight: selectedOS ? "1px solid #1e293b" : "none" }}>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: 60, color: "#334155", fontSize: 13 }}>{osList.length === 0 ? "Nenhuma OS cadastrada — clique em NOVA OS para começar" : "Nenhuma OS encontrada"}</div>
                : filtered.map(os => <OSCard key={os.id} os={os} onStatusChange={handleStatusChange} onSelect={setSelectedOS} selected={selectedOS?.id === os.id} />)
              }
            </div>
            {selectedOS && (
              <div style={{ padding: 20, overflowY: "auto" }}>
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
