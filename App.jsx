import { useState, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD;

const OS_STATUS = {
  Aberta:         { color: "#a0856c", bg: "#f5efe9", icon: "○" },
  Aprovada:       { color: "#b8860b", bg: "#fdf6e3", icon: "◐" },
  "Produção":     { color: "#7a9e87", bg: "#f0f5f2", icon: "◕" },
  "Ag. Retirada": { color: "#9b7fb6", bg: "#f5f0fa", icon: "◎" },
  Entregue:       { color: "#6aaa8a", bg: "#edf7f2", icon: "●" },
};
const OS_ORDER = ["Aberta", "Aprovada", "Produção", "Ag. Retirada", "Entregue"];

const ORC_STATUS = {
  Pendente:  { color: "#a0856c", bg: "#f5efe9", icon: "○" },
  Enviado:   { color: "#b8860b", bg: "#fdf6e3", icon: "◐" },
  Aprovado:  { color: "#6aaa8a", bg: "#edf7f2", icon: "●" },
  Recusado:  { color: "#c0392b", bg: "#fdf0ef", icon: "✕" },
};
const ORC_ORDER = ["Pendente", "Enviado", "Aprovado", "Recusado"];

const RES_STATUS = {
  Reservado:  { color: "#9b7fb6", bg: "#f5f0fa", icon: "○" },
  Confirmado: { color: "#7a9e87", bg: "#f0f5f2", icon: "◐" },
  Entregue:   { color: "#6aaa8a", bg: "#edf7f2", icon: "●" },
  Cancelado:  { color: "#c0392b", bg: "#fdf0ef", icon: "✕" },
};
const RES_ORDER = ["Reservado", "Confirmado", "Entregue", "Cancelado"];

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
  os:  { list: () => sbFetch("/ordens_servico?order=created_at.desc"), insert: (d) => sbFetch("/ordens_servico", { method: "POST", body: JSON.stringify(d) }), update: (id, d) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }), delete: (id) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }) },
  orc: { list: () => sbFetch("/orcamentos?order=created_at.desc"), insert: (d) => sbFetch("/orcamentos", { method: "POST", body: JSON.stringify(d) }), update: (id, d) => sbFetch(`/orcamentos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }), delete: (id) => sbFetch(`/orcamentos?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }) },
  res: { list: () => sbFetch("/reservas?order=created_at.desc"), insert: (d) => sbFetch("/reservas", { method: "POST", body: JSON.stringify(d) }), update: (id, d) => sbFetch(`/reservas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }), delete: (id) => sbFetch(`/reservas?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }) },
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
  const response = await fetch('/api/extract-os', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, mediaType }) });
  if (!response.ok) throw new Error('Erro no servidor: ' + response.status);
  return await response.json();
}

async function notifyWhatsApp(os) {
  try {
    await fetch('/api/extract-os', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notify_whatsapp', phone: os.fone, osData: { cliente: os.cliente, numero: os.numero, descricao: os.descricao } }) });
  } catch (e) { console.error('Erro WhatsApp:', e); }
}

const nude = { bg: "#faf7f4", white: "#fff", border: "#ede5df", border2: "#e0d0c4", text: "#3d2b1f", muted: "#b09080", gold: "#d4a574", gold2: "#c49660" };

function Badge({ status, cfg, small }) {
  const c = cfg[status] || Object.values(cfg)[0];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "3px 10px" : "4px 12px", borderRadius: 20, background: c.bg, border: `1px solid ${c.color}40`, color: c.color, fontSize: small ? 11 : 12, fontFamily: "'DM Mono', monospace", fontWeight: 600, whiteSpace: "nowrap" }}><span style={{ fontSize: 9 }}>{c.icon}</span>{status}</span>;
}

function Pipeline({ current, order, cfg, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
      {order.map((s, i) => {
        const c = cfg[s]; const active = s === current; const passed = order.indexOf(current) >= i;
        return <div key={s} style={{ display: "flex", alignItems: "center" }}>
          <button onClick={(e) => { e.stopPropagation(); onChange(s); }} style={{ padding: "3px 10px", borderRadius: 6, border: active ? `1.5px solid ${c.color}` : "1.5px solid #e8ddd5", background: active ? c.bg : "transparent", color: passed ? c.color : "#c4b0a4", fontSize: 11, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: active ? 700 : 400 }}>{s}</button>
          {i < order.length - 1 && <div style={{ width: 10, height: 1, background: "#e8ddd5" }} />}
        </div>;
      })}
    </div>
  );
}

function Field({ label, value, onChange, textarea }) {
  const style = { width: "100%", background: nude.bg, border: `1.5px solid ${nude.border2}`, borderRadius: 8, padding: "9px 12px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box", outline: "none" };
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>{label}</label>
      {textarea ? <textarea value={value || ""} rows={3} onChange={e => onChange(e.target.value)} style={{ ...style, resize: "vertical" }} /> : <input value={value || ""} onChange={e => onChange(e.target.value)} style={style} />}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState(""); const [error, setError] = useState(false);
  const handleSubmit = () => { if (pwd === APP_PASSWORD) { sessionStorage.setItem("garimpo_auth", "1"); onLogin(); } else { setError(true); setPwd(""); setTimeout(() => setError(false), 2000); } };
  return (
    <div style={{ minHeight: "100vh", background: nude.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 20, padding: 52, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 4px 24px #c4a98820" }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>💎</div>
        <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Garimpo Jóias</div>
        <div style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", marginBottom: 36 }}>CONTROLE DE OS</div>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Senha de acesso" style={{ width: "100%", background: nude.bg, border: `1.5px solid ${error ? "#c0392b" : nude.border2}`, borderRadius: 10, padding: "13px 16px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 14, boxSizing: "border-box", outline: "none", marginBottom: 12 }} />
        {error && <div style={{ color: "#c0392b", fontSize: 12, fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>Senha incorreta</div>}
        <button onClick={handleSubmit} style={{ width: "100%", padding: "13px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>ENTRAR</button>
      </div>
    </div>
  );
}

function OSModal({ onClose, onSave }) {
  const [mode, setMode] = useState("choose"); const [phase, setPhase] = useState("idle");
  const [data, setData] = useState({}); const [preview, setPreview] = useState(null); const [preview2, setPreview2] = useState(null); const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef(); const input2Ref = useRef();
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const handleFile = useCallback(async (file) => {
    if (!file) return; setPreview(URL.createObjectURL(file)); setPhase("processing");
    try { const b64 = await toBase64(file); const extracted = await extractOSFromImage(b64, file.type || "image/jpeg"); setData(extracted); setPhase("form"); }
    catch (e) { setErrorMsg(e.message); setPhase("error"); }
  }, []);
  const handleFile2 = useCallback(async (file) => {
    if (!file) return; setPreview2(URL.createObjectURL(file)); const b64 = await toBase64(file); setData(d => ({ ...d, foto_peca_base64: b64, foto_peca_type: file.type }));
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova Ordem de Serviço</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {mode === "choose" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div onClick={() => setMode("photo")} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 14, padding: 40, textAlign: "center", cursor: "pointer", background: nude.bg }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📸</div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Foto da OS</div>
              <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>IA extrai os campos automaticamente</div>
            </div>
            <div onClick={() => { setMode("manual"); setPhase("form"); }} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 14, padding: 40, textAlign: "center", cursor: "pointer", background: nude.bg }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✏️</div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Entrada Manual</div>
              <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Preencha os campos diretamente</div>
            </div>
          </div>
        )}
        {mode === "photo" && phase === "idle" && (
          <div onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current.click()} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 12, padding: 60, textAlign: "center", cursor: "pointer", background: nude.bg }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
            <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, marginBottom: 6 }}>Arraste a foto da OS aqui</div>
            <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>ou clique para selecionar</div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}
        {phase === "processing" && <div style={{ textAlign: "center", padding: 60 }}>{preview && <img src={preview} alt="" style={{ maxHeight: 200, borderRadius: 10, marginBottom: 20, opacity: 0.7 }} />}<div style={{ color: nude.gold, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>🔍 IA lendo a OS…</div></div>}
        {phase === "error" && <div style={{ textAlign: "center", padding: 40 }}><div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{errorMsg}</div><button onClick={() => setPhase("idle")} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.text, padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Tentar novamente</button></div>}
        {phase === "form" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              {preview && <><div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA OS</div><img src={preview} alt="OS" style={{ width: "100%", borderRadius: 10, border: `1px solid ${nude.border}`, marginBottom: 16 }} /></>}
              <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA PEÇA (opcional)</div>
              {preview2 ? <img src={preview2} alt="Peça" style={{ width: "100%", borderRadius: 10, border: `1px solid ${nude.border}`, marginBottom: 8 }} /> : <div onClick={() => input2Ref.current.click()} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: nude.bg, marginBottom: 8 }}><div style={{ fontSize: 24, marginBottom: 4 }}>📷</div><div style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>Adicionar foto da peça</div></div>}
              {preview2 && <button onClick={() => input2Ref.current.click()} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.muted, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Trocar foto</button>}
              <input ref={input2Ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile2(e.target.files[0])} />
            </div>
            <div>
              {mode === "photo" && <div style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 16 }}>✓ Campos extraídos — revise antes de salvar</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                <Field label="Nº OS" value={data.numero} onChange={set("numero")} />
                <Field label="Data" value={data.data} onChange={set("data")} />
              </div>
              <Field label="Cliente" value={data.cliente} onChange={set("cliente")} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                <Field label="Telefone" value={data.fone} onChange={set("fone")} />
                <Field label="Recepção" value={data.recepcao} onChange={set("recepcao")} />
              </div>
              <Field label="Descrição do Serviço" value={data.descricao} onChange={set("descricao")} textarea />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
                <Field label="A/C (R$)" value={data.ac} onChange={set("ac")} />
                <Field label="N/C (R$)" value={data.nc} onChange={set("nc")} />
              </div>
              <Field label="Observação" value={data.obs} onChange={set("obs")} />
              <button onClick={() => onSave(data)} style={{ marginTop: 8, width: "100%", padding: "12px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>SALVAR OS</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrcModal({ onClose, onSave }) {
  const [data, setData] = useState({}); const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Novo Orçamento</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <Field label="Nº Orçamento" value={data.numero} onChange={set("numero")} />
          <Field label="Data" value={data.data} onChange={set("data")} />
        </div>
        <Field label="Cliente" value={data.cliente} onChange={set("cliente")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <Field label="Telefone" value={data.fone} onChange={set("fone")} />
          <Field label="Recepção" value={data.recepcao} onChange={set("recepcao")} />
        </div>
        <Field label="Descrição" value={data.descricao} onChange={set("descricao")} textarea />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <Field label="Valor (R$)" value={data.valor} onChange={set("valor")} />
          <Field label="Observação" value={data.obs} onChange={set("obs")} />
        </div>
        <button onClick={() => onSave(data)} style={{ marginTop: 8, width: "100%", padding: "12px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>SALVAR ORÇAMENTO</button>
      </div>
    </div>
  );
}

function ResModal({ onClose, onSave }) {
  const [data, setData] = useState({}); const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova Reserva</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <Field label="Cliente" value={data.cliente} onChange={set("cliente")} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <Field label="Telefone" value={data.fone} onChange={set("fone")} />
          <Field label="Data da Reserva" value={data.data_reserva} onChange={set("data_reserva")} />
          <Field label="Código do Produto" value={data.codigo_produto} onChange={set("codigo_produto")} />
          <Field label="Valor (R$)" value={data.valor} onChange={set("valor")} />
        </div>
        <Field label="Descrição do Produto" value={data.descricao_produto} onChange={set("descricao_produto")} textarea />
        <Field label="Observação" value={data.obs} onChange={set("obs")} />
        <button onClick={() => onSave(data)} style={{ marginTop: 8, width: "100%", padding: "12px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>SALVAR RESERVA</button>
      </div>
    </div>
  );
}

function Card({ item, onSelect, selected, onStatusChange, statusCfg, statusOrder, titleField, subtitleField, valueField, tagField }) {
  const cfg = statusCfg[item.status] || Object.values(statusCfg)[0];
  return (
    <div onClick={() => onSelect(item)} style={{ background: selected ? "#fdf8f4" : nude.white, border: selected ? `1.5px solid ${cfg.color}` : `1px solid ${nude.border}`, borderLeft: `3px solid ${cfg.color}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all 0.2s", marginBottom: 10, boxShadow: selected ? `0 2px 12px ${cfg.color}20` : `0 1px 4px #c4a98812` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          {tagField && item[tagField] && <span style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.08em" }}>{item[tagField]}</span>}
          <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: tagField ? 2 : 0, fontWeight: 600 }}>{item[titleField]}</div>
          {subtitleField && item[subtitleField] && <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{item[subtitleField]?.length > 60 ? item[subtitleField].slice(0, 60) + "…" : item[subtitleField]}</div>}
        </div>
        <Badge status={item.status} cfg={statusCfg} small />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <Pipeline current={item.status} order={statusOrder} cfg={statusCfg} onChange={(s) => onStatusChange(item.id, s)} />
        {valueField && item[valueField] && <span style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>R$ {item[valueField]}</span>}
      </div>
    </div>
  );
}

// ── Detail com edição inline ──────────────────────────────────────────────────
function Detail({ item, onClose, onDelete, onStatusChange, onSave, statusCfg, statusOrder, editFields, extraAction }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editData, setEditData] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEditData(item); setDirty(false); }, [item?.id]);

  const set = (k) => (v) => { setEditData(d => ({ ...d, [k]: v })); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    await onSave(item.id, editData);
    setDirty(false);
    setSaving(false);
  };

  if (!item) return null;
  const cfg = statusCfg[editData.status] || Object.values(statusCfg)[0];

  const inputStyle = { width: "100%", background: nude.bg, border: `1.5px solid ${nude.border2}`, borderRadius: 8, padding: "8px 10px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box", outline: "none" };

  return (
    <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 14, padding: 26, boxShadow: "0 2px 12px #c4a98812" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          {item.numero && <div style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", marginBottom: 4 }}>Nº {item.numero}</div>}
          <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{editData.cliente || item.cliente}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Pipeline current={editData.status} order={statusOrder} cfg={statusCfg} onChange={(s) => onStatusChange(item.id, s)} />
      </div>

      {/* Campos editáveis */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 16 }}>
        {editFields.map(({ label, key, full, textarea }) => (
          <div key={key} style={{ gridColumn: full ? "span 2" : "span 1" }}>
            <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 4, letterSpacing: "0.06em" }}>{label}</div>
            {textarea
              ? <textarea value={editData[key] || ""} rows={3} onChange={e => set(key)(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
              : <input value={editData[key] || ""} onChange={e => set(key)(e.target.value)} style={inputStyle} />
            }
          </div>
        ))}
      </div>

      {item.foto_peca_base64 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.06em" }}>FOTO DA PEÇA</div>
          <img src={`data:${item.foto_peca_type || "image/jpeg"};base64,${item.foto_peca_base64}`} alt="Peça" style={{ width: "100%", borderRadius: 10, border: `1px solid ${nude.border}` }} />
        </div>
      )}

      {dirty && (
        <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "10px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 12, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Salvando…" : "SALVAR ALTERAÇÕES"}
        </button>
      )}

      {extraAction && <div style={{ marginBottom: 12 }}>{extraAction}</div>}

      <div style={{ marginTop: 8, borderTop: `1px solid ${nude.border}`, paddingTop: 16 }}>
        {!confirmDelete
          ? <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "1px solid #e8c4c0", color: "#c0392b", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>🗑 Excluir</button>
          : <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: "#c0392b", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Confirma exclusão?</span>
              <button onClick={() => onDelete(item.id)} style={{ background: "#c0392b", border: "none", color: "#fff", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>Sim</button>
              <button onClick={() => setConfirmDelete(false)} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.muted, padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Cancelar</button>
            </div>
        }
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(() => sessionStorage.getItem("garimpo_auth") === "1");
  const [tab, setTab] = useState("os");
  const [osList, setOsList] = useState([]);
  const [orcList, setOrcList] = useState([]);
  const [resList, setResList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!auth) return;
    Promise.all([db.os.list(), db.orc.list(), db.res.list()])
      .then(([os, orc, res]) => { setOsList(os || []); setOrcList(orc || []); setResList(res || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [auth]);

  useEffect(() => { setSelected(null); setFilterStatus("Todos"); setSearch(""); }, [tab]);

  if (!auth) return <LoginScreen onLogin={() => setAuth(true)} />;

  const currentList = tab === "os" ? osList : tab === "orc" ? orcList : resList;
  const currentStatus = tab === "os" ? OS_STATUS : tab === "orc" ? ORC_STATUS : RES_STATUS;
  const currentOrder = tab === "os" ? OS_ORDER : tab === "orc" ? ORC_ORDER : RES_ORDER;
  const dbRef = tab === "os" ? db.os : tab === "orc" ? db.orc : db.res;
  const setter = tab === "os" ? setOsList : tab === "orc" ? setOrcList : setResList;

  const handleStatusChange = async (id, newStatus) => {
    const item = currentList.find(i => i.id === id);
    setter(list => list.map(i => i.id === id ? { ...i, status: newStatus } : i));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    await dbRef.update(id, { status: newStatus });
    if (tab === "os" && newStatus === "Ag. Retirada" && item?.fone) await notifyWhatsApp(item);
  };

  const handleSaveEdit = async (id, data) => {
    await dbRef.update(id, data);
    setter(list => list.map(i => i.id === id ? { ...i, ...data } : i));
    setSelected(prev => ({ ...prev, ...data }));
  };

  const handleDelete = async (id) => {
    await dbRef.delete(id);
    setter(list => list.filter(i => i.id !== id));
    setSelected(null);
  };

  const handleSaveOS = async (data) => {
    const saved = await db.os.insert({ ...data, status: "Aberta" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOsList(list => [item, ...list]); setModal(null); setSelected(item); setTab("os");
  };

  const handleSaveOrc = async (data) => {
    const saved = await db.orc.insert({ ...data, status: "Pendente" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOrcList(list => [item, ...list]); setModal(null); setSelected(item); setTab("orc");
  };

  const handleSaveRes = async (data) => {
    const saved = await db.res.insert({ ...data, status: "Reservado" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setResList(list => [item, ...list]); setModal(null); setSelected(item); setTab("res");
  };

  const handleOrcToOS = async (orc) => {
    const saved = await db.os.insert({ numero: orc.numero, cliente: orc.cliente, fone: orc.fone, descricao: orc.descricao, recepcao: orc.recepcao, data: orc.data, ac: orc.valor, obs: orc.obs, status: "Aberta" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOsList(list => [item, ...list]);
    await db.orc.update(orc.id, { status: "Aprovado" });
    setOrcList(list => list.map(i => i.id === orc.id ? { ...i, status: "Aprovado" } : i));
    setSelected(null); setTab("os");
  };

  const filtered = currentList.filter(i => {
    const matchStatus = filterStatus === "Todos" || i.status === filterStatus;
    const matchSearch = !search || i.cliente?.toLowerCase().includes(search.toLowerCase()) || i.numero?.includes(search) || i.descricao?.toLowerCase().includes(search.toLowerCase()) || i.descricao_produto?.toLowerCase().includes(search.toLowerCase()) || i.codigo_produto?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = currentOrder.reduce((acc, s) => { acc[s] = currentList.filter(i => i.status === s).length; return acc; }, {});

  const OS_FIELDS = [
    { label: "Nº OS", key: "numero" }, { label: "Data", key: "data" },
    { label: "Cliente", key: "cliente", full: true },
    { label: "Telefone", key: "fone" }, { label: "Recepção", key: "recepcao" },
    { label: "Descrição", key: "descricao", full: true, textarea: true },
    { label: "A/C (R$)", key: "ac" }, { label: "N/C (R$)", key: "nc" },
    { label: "Observação", key: "obs", full: true },
  ];
  const ORC_FIELDS = [
    { label: "Nº Orçamento", key: "numero" }, { label: "Data", key: "data" },
    { label: "Cliente", key: "cliente", full: true },
    { label: "Telefone", key: "fone" }, { label: "Recepção", key: "recepcao" },
    { label: "Descrição", key: "descricao", full: true, textarea: true },
    { label: "Valor (R$)", key: "valor" }, { label: "Observação", key: "obs" },
  ];
  const RES_FIELDS = [
    { label: "Cliente", key: "cliente", full: true },
    { label: "Telefone", key: "fone" }, { label: "Data da Reserva", key: "data_reserva" },
    { label: "Código do Produto", key: "codigo_produto" }, { label: "Valor (R$)", key: "valor" },
    { label: "Descrição do Produto", key: "descricao_produto", full: true, textarea: true },
    { label: "Observação", key: "obs", full: true },
  ];

  const editFields = tab === "os" ? OS_FIELDS : tab === "orc" ? ORC_FIELDS : RES_FIELDS;

  const tabCfg = [
    { key: "os",  label: "Ordens de Serviço", count: osList.length },
    { key: "orc", label: "Orçamentos",         count: orcList.length },
    { key: "res", label: "Reservas",            count: resList.length },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${nude.bg}; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #f5efe9; } ::-webkit-scrollbar-thumb { background: #e0d0c4; border-radius: 2px; }
      `}</style>
      <div style={{ minHeight: "100vh", background: nude.bg, color: nude.text, fontFamily: "'DM Mono', monospace" }}>

        <div style={{ borderBottom: `1px solid ${nude.border}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: nude.white }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💎</div>
            <div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700 }}>Garimpo Jóias</div>
              <div style={{ color: nude.muted, fontSize: 10, letterSpacing: "0.1em" }}>SISTEMA DE GESTÃO</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!loading && <span style={{ color: "#7a9e87", fontSize: 10 }}>● CONECTADO</span>}
            <button onClick={() => { sessionStorage.removeItem("garimpo_auth"); setAuth(false); }} style={{ background: "none", border: `1px solid ${nude.border}`, color: nude.muted, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Sair</button>
            <button onClick={() => setModal(tab)} style={{ background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 9, padding: "9px 18px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {tab === "os" ? "📋 NOVA OS" : tab === "orc" ? "💬 NOVO ORÇAMENTO" : "🔖 NOVA RESERVA"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", background: nude.white, borderBottom: `1px solid ${nude.border}` }}>
          {tabCfg.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "14px 28px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? nude.gold2 : nude.muted, borderBottom: tab === t.key ? `2px solid ${nude.gold2}` : "2px solid transparent", whiteSpace: "nowrap" }}>
              {t.label} <span style={{ color: tab === t.key ? nude.gold : "#c4b0a4", marginLeft: 6 }}>{t.count}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", borderBottom: `1px solid ${nude.border}`, background: nude.white, overflowX: "auto" }}>
          {[{ label: "Todos", count: currentList.length, color: nude.text }, ...currentOrder.map(s => ({ label: s, count: counts[s], color: currentStatus[s].color }))].map(({ label, count, color }) => (
            <div key={label} onClick={() => setFilterStatus(label)}
              style={{ padding: "12px 20px", borderRight: `1px solid ${nude.border}`, cursor: "pointer", whiteSpace: "nowrap", background: filterStatus === label ? nude.bg : "transparent", borderBottom: filterStatus === label ? `2px solid ${color}` : "2px solid transparent" }}>
              <div style={{ color, fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>{count}</div>
              <div style={{ color: nude.muted, fontSize: 10, letterSpacing: "0.08em" }}>{label.toUpperCase()}</div>
            </div>
          ))}
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 20px", minWidth: 200 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" style={{ width: "100%", background: nude.bg, border: `1px solid ${nude.border}`, borderRadius: 8, padding: "8px 14px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }} />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: nude.muted, fontSize: 13 }}>Carregando…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 420px" : "1fr", minHeight: "calc(100vh - 200px)" }}>
            <div style={{ padding: 24, overflowY: "auto", borderRight: selected ? `1px solid ${nude.border}` : "none" }}>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: 60, color: "#c4b0a4", fontSize: 13 }}>{currentList.length === 0 ? "Nenhum registro — clique no botão acima para começar" : "Nenhum resultado"}</div>
                : filtered.map(item => (
                    <Card key={item.id} item={item} selected={selected?.id === item.id} onSelect={setSelected}
                      onStatusChange={handleStatusChange} statusCfg={currentStatus} statusOrder={currentOrder}
                      titleField="cliente" subtitleField={tab === "res" ? "codigo_produto" : "descricao"}
                      valueField={tab === "os" ? "ac" : "valor"} tagField={tab === "res" ? null : "numero"} />
                  ))
              }
            </div>
            {selected && (
              <div style={{ padding: 20, overflowY: "auto", background: nude.bg }}>
                <Detail
                  item={selected} onClose={() => setSelected(null)}
                  onDelete={handleDelete} onStatusChange={handleStatusChange}
                  onSave={handleSaveEdit} statusCfg={currentStatus} statusOrder={currentOrder}
                  editFields={editFields}
                  extraAction={tab === "orc" && selected.status !== "Aprovado" && selected.status !== "Recusado" ? (
                    <button onClick={() => handleOrcToOS(selected)} style={{ width: "100%", padding: "10px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✓ Converter em OS
                    </button>
                  ) : null}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {modal === "os"  && <OSModal  onClose={() => setModal(null)} onSave={handleSaveOS} />}
      {modal === "orc" && <OrcModal onClose={() => setModal(null)} onSave={handleSaveOrc} />}
      {modal === "res" && <ResModal onClose={() => setModal(null)} onSave={handleSaveRes} />}
    </>
  );
}    headers: {
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
  os: {
    list: () => sbFetch("/ordens_servico?order=created_at.desc"),
    insert: (d) => sbFetch("/ordens_servico", { method: "POST", body: JSON.stringify(d) }),
    update: (id, d) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
    delete: (id) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
  orc: {
    list: () => sbFetch("/orcamentos?order=created_at.desc"),
    insert: (d) => sbFetch("/orcamentos", { method: "POST", body: JSON.stringify(d) }),
    update: (id, d) => sbFetch(`/orcamentos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
    delete: (id) => sbFetch(`/orcamentos?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
  res: {
    list: () => sbFetch("/reservas?order=created_at.desc"),
    insert: (d) => sbFetch("/reservas", { method: "POST", body: JSON.stringify(d) }),
    update: (id, d) => sbFetch(`/reservas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
    delete: (id) => sbFetch(`/reservas?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  } catch (e) { console.error('Erro WhatsApp:', e); }
}

// ── Componentes base ──────────────────────────────────────────────────────────
const nude = {
  bg: "#faf7f4", white: "#fff", border: "#ede5df", border2: "#e0d0c4",
  text: "#3d2b1f", muted: "#b09080", gold: "#d4a574", gold2: "#c49660",
};

function Badge({ status, cfg, small }) {
  const c = cfg[status] || Object.values(cfg)[0];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "3px 10px" : "4px 12px", borderRadius: 20, background: c.bg, border: `1px solid ${c.color}40`, color: c.color, fontSize: small ? 11 : 12, fontFamily: "'DM Mono', monospace", fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 9 }}>{c.icon}</span>{status}
    </span>
  );
}

function Pipeline({ current, order, cfg, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
      {order.map((s, i) => {
        const c = cfg[s];
        const active = s === current;
        const passed = order.indexOf(current) >= i;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <button onClick={(e) => { e.stopPropagation(); onChange(s); }} style={{ padding: "3px 10px", borderRadius: 6, border: active ? `1.5px solid ${c.color}` : "1.5px solid #e8ddd5", background: active ? c.bg : "transparent", color: passed ? c.color : "#c4b0a4", fontSize: 11, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: active ? 700 : 400 }}>{s}</button>
            {i < order.length - 1 && <div style={{ width: 10, height: 1, background: "#e8ddd5" }} />}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange, textarea, half }) {
  const style = { width: "100%", background: nude.bg, border: `1.5px solid ${nude.border2}`, borderRadius: 8, padding: "9px 12px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 12, boxSizing: "border-box", outline: "none" };
  return (
    <div style={{ marginBottom: 12, gridColumn: half ? "span 1" : "span 2" }}>
      <label style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", display: "block", marginBottom: 4, letterSpacing: "0.06em" }}>{label}</label>
      {textarea
        ? <textarea value={value || ""} rows={3} onChange={e => onChange(e.target.value)} style={{ ...style, resize: "vertical" }} />
        : <input value={value || ""} onChange={e => onChange(e.target.value)} style={style} />
      }
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState(false);
  const handleSubmit = () => {
    if (pwd === APP_PASSWORD) { sessionStorage.setItem("garimpo_auth", "1"); onLogin(); }
    else { setError(true); setPwd(""); setTimeout(() => setError(false), 2000); }
  };
  return (
    <div style={{ minHeight: "100vh", background: nude.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 20, padding: 52, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 4px 24px #c4a98820" }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>💎</div>
        <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Garimpo Jóias</div>
        <div style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", marginBottom: 36 }}>CONTROLE DE OS</div>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Senha de acesso"
          style={{ width: "100%", background: nude.bg, border: `1.5px solid ${error ? "#c0392b" : nude.border2}`, borderRadius: 10, padding: "13px 16px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 14, boxSizing: "border-box", outline: "none", marginBottom: 12 }} />
        {error && <div style={{ color: "#c0392b", fontSize: 12, fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>Senha incorreta</div>}
        <button onClick={handleSubmit} style={{ width: "100%", padding: "13px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>ENTRAR</button>
      </div>
    </div>
  );
}

// ── Modal OS ──────────────────────────────────────────────────────────────────
function OSModal({ onClose, onSave }) {
  const [mode, setMode] = useState("choose");
  const [phase, setPhase] = useState("idle");
  const [data, setData] = useState({});
  const [preview, setPreview] = useState(null);
  const [preview2, setPreview2] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef();
  const input2Ref = useRef();

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setPhase("processing");
    try {
      const b64 = await toBase64(file);
      const extracted = await extractOSFromImage(b64, file.type || "image/jpeg");
      setData(extracted);
      setPhase("form");
    } catch (e) { setErrorMsg(e.message); setPhase("error"); }
  }, []);

  const handleFile2 = useCallback(async (file) => {
    if (!file) return;
    setPreview2(URL.createObjectURL(file));
    const b64 = await toBase64(file);
    setData(d => ({ ...d, foto_peca_base64: b64, foto_peca_type: file.type }));
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova Ordem de Serviço</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {mode === "choose" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div onClick={() => { setMode("photo"); }} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 14, padding: 40, textAlign: "center", cursor: "pointer", background: nude.bg }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📸</div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Foto da OS</div>
              <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>IA extrai os campos automaticamente</div>
            </div>
            <div onClick={() => { setMode("manual"); setPhase("form"); }} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 14, padding: 40, textAlign: "center", cursor: "pointer", background: nude.bg }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✏️</div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Entrada Manual</div>
              <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Preencha os campos diretamente</div>
            </div>
          </div>
        )}

        {mode === "photo" && phase === "idle" && (
          <div onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current.click()}
            style={{ border: `2px dashed ${nude.border2}`, borderRadius: 12, padding: 60, textAlign: "center", cursor: "pointer", background: nude.bg }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
            <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, marginBottom: 6 }}>Arraste a foto da OS aqui</div>
            <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>ou clique para selecionar</div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {phase === "processing" && (
          <div style={{ textAlign: "center", padding: 60 }}>
            {preview && <img src={preview} alt="" style={{ maxHeight: 200, borderRadius: 10, marginBottom: 20, opacity: 0.7 }} />}
            <div style={{ color: nude.gold, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>🔍 IA lendo a OS…</div>
          </div>
        )}

        {phase === "error" && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>{errorMsg}</div>
            <button onClick={() => setPhase("idle")} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.text, padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace" }}>Tentar novamente</button>
          </div>
        )}

        {phase === "form" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              {preview && (
                <>
                  <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA OS</div>
                  <img src={preview} alt="OS" style={{ width: "100%", borderRadius: 10, border: `1px solid ${nude.border}`, marginBottom: 16 }} />
                </>
              )}
              <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA PEÇA (opcional)</div>
              {preview2
                ? <img src={preview2} alt="Peça" style={{ width: "100%", borderRadius: 10, border: `1px solid ${nude.border}`, marginBottom: 8 }} />
                : <div onClick={() => input2Ref.current.click()} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", background: nude.bg, marginBottom: 8 }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
                    <div style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>Adicionar foto da peça</div>
                  </div>
              }
              {preview2 && <button onClick={() => input2Ref.current.click()} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.muted, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Trocar foto</button>}
              <input ref={input2Ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile2(e.target.files[0])} />
            </div>
            <div>
              {mode === "photo" && <div style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 11, marginBottom: 16 }}>✓ Campos extraídos — revise antes de salvar</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                <Field label="Nº OS" value={data.numero} onChange={set("numero")} half />
                <Field label="Data" value={data.data} onChange={set("data")} half />
                <Field label="Cliente" value={data.cliente} onChange={set("cliente")} />
                <Field label="Telefone" value={data.fone} onChange={set("fone")} half />
                <Field label="Recepção" value={data.recepcao} onChange={set("recepcao")} half />
                <Field label="Descrição do Serviço" value={data.descricao} onChange={set("descricao")} textarea />
                <Field label="A/C (R$)" value={data.ac} onChange={set("ac")} half />
                <Field label="N/C (R$)" value={data.nc} onChange={set("nc")} half />
                <Field label="Observação" value={data.obs} onChange={set("obs")} />
              </div>
              <button onClick={() => onSave(data)} style={{ marginTop: 8, width: "100%", padding: "12px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                SALVAR OS
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal Orçamento ───────────────────────────────────────────────────────────
function OrcModal({ onClose, onSave }) {
  const [data, setData] = useState({});
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Novo Orçamento</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          <Field label="Nº Orçamento" value={data.numero} onChange={set("numero")} half />
          <Field label="Data" value={data.data} onChange={set("data")} half />
          <Field label="Cliente" value={data.cliente} onChange={set("cliente")} />
          <Field label="Telefone" value={data.fone} onChange={set("fone")} half />
          <Field label="Recepção" value={data.recepcao} onChange={set("recepcao")} half />
          <Field label="Descrição" value={data.descricao} onChange={set("descricao")} textarea />
          <Field label="Valor (R$)" value={data.valor} onChange={set("valor")} half />
          <Field label="Observação" value={data.obs} onChange={set("obs")} half />
        </div>
        <button onClick={() => onSave(data)} style={{ marginTop: 8, width: "100%", padding: "12px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          SALVAR ORÇAMENTO
        </button>
      </div>
    </div>
  );
}

// ── Modal Reserva ─────────────────────────────────────────────────────────────
function ResModal({ onClose, onSave }) {
  const [data, setData] = useState({});
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f60", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova Reserva</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          <Field label="Cliente" value={data.cliente} onChange={set("cliente")} />
          <Field label="Telefone" value={data.fone} onChange={set("fone")} half />
          <Field label="Data da Reserva" value={data.data_reserva} onChange={set("data_reserva")} half />
          <Field label="Código do Produto" value={data.codigo_produto} onChange={set("codigo_produto")} half />
          <Field label="Descrição do Produto" value={data.descricao_produto} onChange={set("descricao_produto")} textarea />
          <Field label="Valor (R$)" value={data.valor} onChange={set("valor")} half />
          <Field label="Observação" value={data.obs} onChange={set("obs")} half />
        </div>
        <button onClick={() => onSave(data)} style={{ marginTop: 8, width: "100%", padding: "12px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 10, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          SALVAR RESERVA
        </button>
      </div>
    </div>
  );
}

// ── Card genérico ─────────────────────────────────────────────────────────────
function Card({ item, onSelect, selected, onStatusChange, statusCfg, statusOrder, titleField, subtitleField, valueField, tagField }) {
  const cfg = statusCfg[item.status] || Object.values(statusCfg)[0];
  return (
    <div onClick={() => onSelect(item)} style={{ background: selected ? "#fdf8f4" : nude.white, border: selected ? `1.5px solid ${cfg.color}` : `1px solid ${nude.border}`, borderLeft: `3px solid ${cfg.color}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all 0.2s", marginBottom: 10, boxShadow: selected ? `0 2px 12px ${cfg.color}20` : `0 1px 4px #c4a98812` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          {tagField && <span style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.08em" }}>{item[tagField]}</span>}
          <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, marginTop: tagField ? 2 : 0, fontWeight: 600 }}>{item[titleField]}</div>
          {subtitleField && <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{item[subtitleField]}</div>}
        </div>
        <Badge status={item.status} cfg={statusCfg} small />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <Pipeline current={item.status} order={statusOrder} cfg={statusCfg} onChange={(s) => onStatusChange(item.id, s)} />
        {valueField && item[valueField] && <span style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600 }}>R$ {item[valueField]}</span>}
      </div>
    </div>
  );
}

// ── Detail genérico ───────────────────────────────────────────────────────────
function Detail({ item, onClose, onDelete, onStatusChange, statusCfg, statusOrder, fields, extraAction }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!item) return null;
  const cfg = statusCfg[item.status] || Object.values(statusCfg)[0];
  return (
    <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 14, padding: 26, boxShadow: "0 2px 12px #c4a98812" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          {item.numero && <div style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: "0.1em", marginBottom: 4 }}>Nº {item.numero}</div>}
          <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{item.cliente}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: nude.muted, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Pipeline current={item.status} order={statusOrder} cfg={statusCfg} onChange={(s) => onStatusChange(item.id, s)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px", marginBottom: 18 }}>
        {fields.map(([lbl, key]) => (
          <div key={lbl}>
            <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 3, letterSpacing: "0.06em" }}>{lbl}</div>
            <div style={{ color: nude.text, fontSize: 13, fontFamily: "'DM Mono', monospace" }}>{item[key] || "—"}</div>
          </div>
        ))}
      </div>
      {item.foto_peca_base64 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: nude.muted, fontSize: 10, fontFamily: "'DM Mono', monospace", marginBottom: 8, letterSpacing: "0.06em" }}>FOTO DA PEÇA</div>
          <img src={`data:${item.foto_peca_type || "image/jpeg"};base64,${item.foto_peca_base64}`} alt="Peça" style={{ width: "100%", borderRadius: 10, border: `1px solid ${nude.border}` }} />
        </div>
      )}
      {extraAction && (
        <div style={{ marginBottom: 16 }}>
          {extraAction}
        </div>
      )}
      <div style={{ marginTop: 16, borderTop: `1px solid ${nude.border}`, paddingTop: 16 }}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "1px solid #e8c4c0", color: "#c0392b", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>🗑 Excluir</button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#c0392b", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Confirma exclusão?</span>
            <button onClick={() => onDelete(item.id)} style={{ background: "#c0392b", border: "none", color: "#fff", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700 }}>Sim</button>
            <button onClick={() => setConfirmDelete(false)} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.muted, padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────────
export default function App() {
  const [auth, setAuth] = useState(() => sessionStorage.getItem("garimpo_auth") === "1");
  const [tab, setTab] = useState("os");
  const [osList, setOsList] = useState([]);
  const [orcList, setOrcList] = useState([]);
  const [resList, setResList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  useEffect(() => {
    if (!auth) return;
    Promise.all([db.os.list(), db.orc.list(), db.res.list()])
      .then(([os, orc, res]) => { setOsList(os || []); setOrcList(orc || []); setResList(res || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [auth]);

  useEffect(() => { setSelected(null); setFilterStatus("Todos"); setSearch(""); }, [tab]);

  if (!auth) return <LoginScreen onLogin={() => setAuth(true)} />;

  const currentList = tab === "os" ? osList : tab === "orc" ? orcList : resList;
  const currentStatus = tab === "os" ? OS_STATUS : tab === "orc" ? ORC_STATUS : RES_STATUS;
  const currentOrder = tab === "os" ? OS_ORDER : tab === "orc" ? ORC_ORDER : RES_ORDER;

  const handleStatusChange = async (id, newStatus) => {
    const item = currentList.find(i => i.id === id);
    const setter = tab === "os" ? setOsList : tab === "orc" ? setOrcList : setResList;
    setter(list => list.map(i => i.id === id ? { ...i, status: newStatus } : i));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    const dbRef = tab === "os" ? db.os : tab === "orc" ? db.orc : db.res;
    await dbRef.update(id, { status: newStatus });
    if (tab === "os" && newStatus === "Ag. Retirada" && item?.fone) await notifyWhatsApp(item);
  };

  const handleDelete = async (id) => {
    const dbRef = tab === "os" ? db.os : tab === "orc" ? db.orc : db.res;
    const setter = tab === "os" ? setOsList : tab === "orc" ? setOrcList : setResList;
    await dbRef.delete(id);
    setter(list => list.filter(i => i.id !== id));
    setSelected(null);
  };

  const handleSaveOS = async (data) => {
    const saved = await db.os.insert({ ...data, status: "Aberta" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOsList(list => [item, ...list]);
    setModal(null); setSelected(item);
  };

  const handleSaveOrc = async (data) => {
    const saved = await db.orc.insert({ ...data, status: "Pendente" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOrcList(list => [item, ...list]);
    setModal(null); setSelected(item);
  };

  const handleSaveRes = async (data) => {
    const saved = await db.res.insert({ ...data, status: "Reservado" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setResList(list => [item, ...list]);
    setModal(null); setSelected(item);
  };

  const handleOrcToOS = async (orc) => {
    const saved = await db.os.insert({ numero: orc.numero, cliente: orc.cliente, fone: orc.fone, descricao: orc.descricao, recepcao: orc.recepcao, data: orc.data, ac: orc.valor, obs: orc.obs, status: "Aberta" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOsList(list => [item, ...list]);
    await db.orc.update(orc.id, { status: "Aprovado" });
    setOrcList(list => list.map(i => i.id === orc.id ? { ...i, status: "Aprovado" } : i));
    setSelected(null); setTab("os");
  };

  const filtered = currentList.filter(i => {
    const matchStatus = filterStatus === "Todos" || i.status === filterStatus;
    const matchSearch = !search || i.cliente?.toLowerCase().includes(search.toLowerCase()) || i.numero?.includes(search) || i.descricao?.toLowerCase().includes(search.toLowerCase()) || i.descricao_produto?.toLowerCase().includes(search.toLowerCase()) || i.codigo_produto?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = currentOrder.reduce((acc, s) => { acc[s] = currentList.filter(i => i.status === s).length; return acc; }, {});

  const tabCfg = [
    { key: "os",  label: "Ordens de Serviço", count: osList.length },
    { key: "orc", label: "Orçamentos",         count: orcList.length },
    { key: "res", label: "Reservas",            count: resList.length },
  ];

  const detailFields = tab === "os"
    ? [["Telefone","fone"],["Data entrada","data"],["Recepção","recepcao"],["A/C","ac"],["N/C","nc"],["Observação","obs"],["Descrição","descricao"]]
    : tab === "orc"
    ? [["Telefone","fone"],["Data","data"],["Recepção","recepcao"],["Valor","valor"],["Observação","obs"],["Descrição","descricao"]]
    : [["Telefone","fone"],["Data Reserva","data_reserva"],["Código","codigo_produto"],["Valor","valor"],["Observação","obs"],["Produto","descricao_produto"]];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${nude.bg}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #f5efe9; }
        ::-webkit-scrollbar-thumb { background: #e0d0c4; border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: nude.bg, color: nude.text, fontFamily: "'DM Mono', monospace" }}>

        {/* Header */}
        <div style={{ borderBottom: `1px solid ${nude.border}`, padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: nude.white }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💎</div>
            <div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 700 }}>Garimpo Jóias</div>
              <div style={{ color: nude.muted, fontSize: 10, letterSpacing: "0.1em" }}>SISTEMA DE GESTÃO</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!loading && <span style={{ color: "#7a9e87", fontSize: 10 }}>● CONECTADO</span>}
            <button onClick={() => { sessionStorage.removeItem("garimpo_auth"); setAuth(false); }} style={{ background: "none", border: `1px solid ${nude.border}`, color: nude.muted, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>Sair</button>
            <button onClick={() => setModal(tab)} style={{ background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 9, padding: "9px 18px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {tab === "os" ? "📋 NOVA OS" : tab === "orc" ? "💬 NOVO ORÇAMENTO" : "🔖 NOVA RESERVA"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: nude.white, borderBottom: `1px solid ${nude.border}` }}>
          {tabCfg.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "14px 28px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? nude.gold2 : nude.muted, borderBottom: tab === t.key ? `2px solid ${nude.gold2}` : "2px solid transparent", transition: "all 0.2s", whiteSpace: "nowrap" }}>
              {t.label} <span style={{ color: tab === t.key ? nude.gold : "#c4b0a4", marginLeft: 6 }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", borderBottom: `1px solid ${nude.border}`, background: nude.white, overflowX: "auto" }}>
          {[{ label: "Todos", count: currentList.length, color: nude.text }, ...currentOrder.map(s => ({ label: s, count: counts[s], color: currentStatus[s].color }))].map(({ label, count, color }) => (
            <div key={label} onClick={() => setFilterStatus(label)}
              style={{ padding: "12px 20px", borderRight: `1px solid ${nude.border}`, cursor: "pointer", whiteSpace: "nowrap", background: filterStatus === label ? nude.bg : "transparent", borderBottom: filterStatus === label ? `2px solid ${color}` : "2px solid transparent", transition: "all 0.2s" }}>
              <div style={{ color, fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700 }}>{count}</div>
              <div style={{ color: nude.muted, fontSize: 10, letterSpacing: "0.08em" }}>{label.toUpperCase()}</div>
            </div>
          ))}
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 20px", minWidth: 200 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
              style={{ width: "100%", background: nude.bg, border: `1px solid ${nude.border}`, borderRadius: 8, padding: "8px 14px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none" }} />
          </div>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: nude.muted, fontSize: 13 }}>Carregando…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", minHeight: "calc(100vh - 180px)" }}>
            <div style={{ padding: 24, overflowY: "auto", borderRight: selected ? `1px solid ${nude.border}` : "none" }}>
              {filtered.length === 0
                ? <div style={{ textAlign: "center", padding: 60, color: "#c4b0a4", fontSize: 13 }}>
                    {currentList.length === 0 ? "Nenhum registro — clique no botão acima para começar" : "Nenhum resultado encontrado"}
                  </div>
                : filtered.map(item => (
                    <Card key={item.id} item={item} selected={selected?.id === item.id} onSelect={setSelected}
                      onStatusChange={handleStatusChange} statusCfg={currentStatus} statusOrder={currentOrder}
                      titleField="cliente"
                      subtitleField={tab === "res" ? "codigo_produto" : "descricao"}
                      valueField={tab === "os" ? "ac" : "valor"}
                      tagField={tab === "res" ? null : "numero"}
                    />
                  ))
              }
            </div>
            {selected && (
              <div style={{ padding: 20, overflowY: "auto", background: nude.bg }}>
                <Detail
                  item={selected}
                  onClose={() => setSelected(null)}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  statusCfg={currentStatus}
                  statusOrder={currentOrder}
                  fields={detailFields}
                  extraAction={tab === "orc" && selected.status !== "Aprovado" && selected.status !== "Recusado" ? (
                    <button onClick={() => handleOrcToOS(selected)} style={{ width: "100%", padding: "10px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 8, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      ✓ Converter em OS
                    </button>
                  ) : null}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {modal === "os"  && <OSModal  onClose={() => setModal(null)} onSave={handleSaveOS} />}
      {modal === "orc" && <OrcModal onClose={() => setModal(null)} onSave={handleSaveOrc} />}
      {modal === "res" && <ResModal onClose={() => setModal(null)} onSave={handleSaveRes} />}
    </>
  );
}
