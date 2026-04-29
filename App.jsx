import { useState, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

const OS_STATUS = {
  Aberta:         { color: "#a0856c", bg: "#f5efe9", icon: "○" },
  Aprovada:       { color: "#b8860b", bg: "#fdf6e3", icon: "◐" },
  "Produção":     { color: "#7a9e87", bg: "#f0f5f2", icon: "◕" },
  "Ag. Retirada": { color: "#9b7fb6", bg: "#f5f0fa", icon: "◎" },
  Entregue:       { color: "#6aaa8a", bg: "#edf7f2", icon: "●" },
  Histórico:      { color: "#b09080", bg: "#f5efe9", icon: "▣" },
};
const OS_ORDER = ["Aberta", "Aprovada", "Produção", "Ag. Retirada", "Entregue"];
const ORC_STATUS = { Pendente: { color: "#a0856c", bg: "#f5efe9", icon: "○" }, Enviado: { color: "#b8860b", bg: "#fdf6e3", icon: "◐" }, Aprovado: { color: "#6aaa8a", bg: "#edf7f2", icon: "●" }, Recusado: { color: "#c0392b", bg: "#fdf0ef", icon: "✕" } };
const ORC_ORDER = ["Pendente", "Enviado", "Aprovado", "Recusado"];
const RES_STATUS = { Reservado: { color: "#9b7fb6", bg: "#f5f0fa", icon: "○" }, Confirmado: { color: "#7a9e87", bg: "#f0f5f2", icon: "◐" }, Entregue: { color: "#6aaa8a", bg: "#edf7f2", icon: "●" }, Cancelado: { color: "#c0392b", bg: "#fdf0ef", icon: "✕" } };
const RES_ORDER = ["Reservado", "Confirmado", "Entregue", "Cancelado"];
const HIST_STATUS = { Histórico: { color: "#b09080", bg: "#f5efe9", icon: "▣" } };
const LOG_STATUS = { auto_60dias: { color: "#b09080", bg: "#f5efe9", icon: "📋" } };

const nude = { bg: "#faf7f4", white: "#fff", border: "#ede5df", border2: "#e0d0c4", text: "#3d2b1f", muted: "#b09080", gold: "#d4a574", gold2: "#c49660" };

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": options.prefer || "return=representation", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const db = {
  os: {
    list: () => sbFetch("/ordens_servico?status=neq.Histórico&order=created_at.desc"),
    listHistorico: () => sbFetch("/ordens_servico?status=eq.Histórico&order=data_entrega.desc"),
    insert: (d) => sbFetch("/ordens_servico", { method: "POST", body: JSON.stringify(d) }),
    update: (id, d) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }),
    delete: (id) => sbFetch(`/ordens_servico?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }),
  },
  orc: { list: () => sbFetch("/orcamentos?order=created_at.desc"), insert: (d) => sbFetch("/orcamentos", { method: "POST", body: JSON.stringify(d) }), update: (id, d) => sbFetch(`/orcamentos?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }), delete: (id) => sbFetch(`/orcamentos?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }) },
  res: { list: () => sbFetch("/reservas?order=created_at.desc"), insert: (d) => sbFetch("/reservas", { method: "POST", body: JSON.stringify(d) }), update: (id, d) => sbFetch(`/reservas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(d), prefer: "return=minimal" }), delete: (id) => sbFetch(`/reservas?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" }) },
  hist: { list: () => sbFetch("/os_historico?order=arquivado_em.desc"), insert: (d) => sbFetch("/os_historico", { method: "POST", body: JSON.stringify(d) }) },
  usuarios: { list: () => sbFetch("/usuarios?select=id,nome,senha,role&ativo=eq.true") },
};

function toBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = () => rej(new Error("Falha")); r.readAsDataURL(file); });
}

async function extractOSFromImage(base64, mediaType) {
  const r = await fetch('/api/extract-os', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base64, mediaType }) });
  if (!r.ok) throw new Error('Erro no servidor: ' + r.status);
  return await r.json();
}

async function notifyWhatsApp(os) {
  try { await fetch('/api/extract-os', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'notify_whatsapp', phone: os.fone, osData: { cliente: os.cliente, numero: os.numero, descricao: os.descricao } }) }); } catch (e) { console.error(e); }
}

async function runAutoArchive(list, setOsList) {
  const now = new Date();
  for (const os of list) {
    if (!os.data_entrega) continue;
    const dias = (now - new Date(os.data_entrega)) / 86400000;
    if (os.status === "Entregue" && dias >= 7) { await db.os.update(os.id, { status: "Histórico" }); setOsList(l => l.filter(i => i.id !== os.id)); }
    else if (os.status === "Histórico" && dias >= 60) { await db.hist.insert({ numero: os.numero, cliente: os.cliente, fone: os.fone, descricao: os.descricao, recepcao: os.recepcao, data_entrada: os.data, data_entrega: os.data_entrega, ac: os.ac, nc: os.nc, obs: os.obs, motivo: "auto_60dias" }); await db.os.delete(os.id); setOsList(l => l.filter(i => i.id !== os.id)); }
  }
}

function Badge({ status, cfg, small }) {
  const c = cfg[status] || Object.values(cfg)[0];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: small ? "4px 12px" : "5px 14px", borderRadius: 20, background: c.bg, border: `1px solid ${c.color}40`, color: c.color, fontSize: small ? 12 : 13, fontFamily: "'DM Mono', monospace", fontWeight: 600, whiteSpace: "nowrap" }}><span style={{ fontSize: 10 }}>{c.icon}</span>{status}</span>;
}

function Pipeline({ current, order, cfg, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
      {order.map((s, i) => {
        const c = cfg[s]; const active = s === current; const passed = order.indexOf(current) >= i;
        return <div key={s} style={{ display: "flex", alignItems: "center" }}>
          <button onClick={(e) => { e.stopPropagation(); onChange(s); }} style={{ padding: "6px 14px", borderRadius: 8, border: active ? `2px solid ${c.color}` : "1.5px solid #e8ddd5", background: active ? c.bg : "transparent", color: passed ? c.color : "#c4b0a4", fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer", fontWeight: active ? 700 : 400, minHeight: 36 }}>{s}</button>
          {i < order.length - 1 && <div style={{ width: 8, height: 1, background: "#e8ddd5" }} />}
        </div>;
      })}
    </div>
  );
}

function Field({ label, value, onChange, textarea }) {
  const style = { width: "100%", background: nude.bg, border: `1.5px solid ${nude.border2}`, borderRadius: 10, padding: "11px 14px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 14, boxSizing: "border-box", outline: "none" };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", display: "block", marginBottom: 5, letterSpacing: "0.06em" }}>{label}</label>
      {textarea ? <textarea value={value || ""} rows={3} onChange={e => onChange(e.target.value)} style={{ ...style, resize: "vertical" }} /> : <input value={value || ""} onChange={e => onChange(e.target.value)} style={style} />}
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [usuarios, setUsuarios] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { db.usuarios.list().then(d => { setUsuarios(d || []); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const handleSubmit = () => {
    const user = usuarios.find(u => u.nome === selectedUser);
    if (!user) { setError("Selecione um usuário."); return; }
    if (user.senha !== pwd) { setError("Senha incorreta."); setPwd(""); return; }
    sessionStorage.setItem("garimpo_user", JSON.stringify({ id: user.id, nome: user.nome, role: user.role }));
    onLogin({ id: user.id, nome: user.nome, role: user.role });
  };

  const inputStyle = { width: "100%", background: nude.bg, border: `1.5px solid ${nude.border2}`, borderRadius: 12, padding: "15px 18px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 16, boxSizing: "border-box", outline: "none", marginBottom: 14 };

  return (
    <div style={{ minHeight: "100vh", background: nude.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 24, padding: 48, width: "100%", maxWidth: 400, textAlign: "center", boxShadow: "0 4px 24px #c4a98820" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 20px" }}>💎</div>
        <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Garimpo Jóias</div>
        <div style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", marginBottom: 36 }}>SISTEMA DE GESTÃO</div>
        {loading ? <div style={{ color: nude.muted, fontSize: 14 }}>Carregando…</div> : (
          <>
            <select value={selectedUser} onChange={e => { setSelectedUser(e.target.value); setError(""); }} style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}>
              <option value="">Selecione seu nome</option>
              {usuarios.map(u => <option key={u.id} value={u.nome}>{u.nome}{u.role === "master" ? " ★" : ""}</option>)}
            </select>
            <input type="password" value={pwd} onChange={e => { setPwd(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleSubmit()} placeholder="Senha" style={inputStyle} />
            {error && <div style={{ color: "#c0392b", fontSize: 13, fontFamily: "'DM Mono', monospace", marginBottom: 14 }}>{error}</div>}
            <button onClick={handleSubmit} style={{ width: "100%", padding: "16px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>ENTRAR</button>
          </>
        )}
      </div>
    </div>
  );
}

function OSModal({ onClose, onSave, userName }) {
  const [mode, setMode] = useState("choose"); const [phase, setPhase] = useState("idle");
  const [data, setData] = useState({ recepcao: userName }); const [preview, setPreview] = useState(null); const [preview2, setPreview2] = useState(null); const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef(); const input2Ref = useRef();
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const handleFile = useCallback(async (file) => {
    if (!file) return; setPreview(URL.createObjectURL(file)); setPhase("processing");
    try { const b64 = await toBase64(file); const ex = await extractOSFromImage(b64, file.type || "image/jpeg"); setData(d => ({ ...ex, recepcao: d.recepcao || userName })); setPhase("form"); }
    catch (e) { setErrorMsg(e.message); setPhase("error"); }
  }, [userName]);
  const handleFile2 = useCallback(async (file) => {
    if (!file) return; setPreview2(URL.createObjectURL(file)); const b64 = await toBase64(file); setData(d => ({ ...d, foto_peca_base64: b64, foto_peca_type: file.type }));
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f70", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 999, padding: 0 }}>
      <div style={{ background: nude.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 680, maxHeight: "95vh", overflow: "auto", padding: "24px 24px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova OS</span>
          <button onClick={onClose} style={{ background: nude.bg, border: "none", color: nude.muted, fontSize: 20, cursor: "pointer", width: 40, height: 40, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        {mode === "choose" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div onClick={() => setMode("photo")} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 16, padding: 32, textAlign: "center", cursor: "pointer", background: nude.bg }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📸</div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Foto da OS</div>
              <div style={{ color: nude.muted, fontSize: 12 }}>IA extrai automaticamente</div>
            </div>
            <div onClick={() => { setMode("manual"); setPhase("form"); }} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 16, padding: 32, textAlign: "center", cursor: "pointer", background: nude.bg }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>✏️</div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Manual</div>
              <div style={{ color: nude.muted, fontSize: 12 }}>Preencher campos</div>
            </div>
          </div>
        )}
        {mode === "photo" && phase === "idle" && (
          <div onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current.click()} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 16, padding: 60, textAlign: "center", cursor: "pointer", background: nude.bg }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📸</div>
            <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 18, marginBottom: 8 }}>Tire ou selecione a foto da OS</div>
            <div style={{ color: nude.muted, fontSize: 13 }}>JPG, PNG</div>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}
        {phase === "processing" && <div style={{ textAlign: "center", padding: 60 }}>{preview && <img src={preview} alt="" style={{ maxHeight: 200, borderRadius: 12, marginBottom: 20, opacity: 0.7 }} />}<div style={{ color: nude.gold, fontFamily: "'DM Mono', monospace", fontSize: 14 }}>🔍 IA lendo a OS…</div></div>}
        {phase === "error" && <div style={{ textAlign: "center", padding: 40 }}><div style={{ color: "#c0392b", fontSize: 14, marginBottom: 16 }}>{errorMsg}</div><button onClick={() => setPhase("idle")} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.text, padding: "12px 24px", borderRadius: 10, cursor: "pointer", fontSize: 14 }}>Tentar novamente</button></div>}
        {phase === "form" && (
          <div>
            {preview && <><div style={{ color: nude.muted, fontSize: 11, marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA OS</div><img src={preview} alt="OS" style={{ width: "100%", borderRadius: 12, border: `1px solid ${nude.border}`, marginBottom: 16 }} /></>}
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
              <Field label="Valor de Custo (R$)" value={data.nc} onChange={set("nc")} />
            </div>
            <Field label="Observação" value={data.obs} onChange={set("obs")} />
            <div style={{ color: nude.muted, fontSize: 11, marginBottom: 8, letterSpacing: "0.1em" }}>FOTO DA PEÇA (opcional)</div>
            {preview2 ? <img src={preview2} alt="Peça" style={{ width: "100%", borderRadius: 12, border: `1px solid ${nude.border}`, marginBottom: 10 }} /> : <div onClick={() => input2Ref.current.click()} style={{ border: `2px dashed ${nude.border2}`, borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", background: nude.bg, marginBottom: 10 }}><div style={{ fontSize: 28, marginBottom: 4 }}>📷</div><div style={{ color: nude.muted, fontSize: 13 }}>Adicionar foto da peça</div></div>}
            {preview2 && <button onClick={() => input2Ref.current.click()} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.muted, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, marginBottom: 14 }}>Trocar foto</button>}
            <input ref={input2Ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFile2(e.target.files[0])} />
            <button onClick={() => onSave(data)} style={{ width: "100%", padding: "16px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>SALVAR OS</button>
          </div>
        )}
      </div>
    </div>
  );
}

function OrcModal({ onClose, onSave, userName }) {
  const [data, setData] = useState({ recepcao: userName }); const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f70", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: nude.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto", padding: "24px 24px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Novo Orçamento</span>
          <button onClick={onClose} style={{ background: nude.bg, border: "none", color: nude.muted, fontSize: 20, cursor: "pointer", width: 40, height: 40, borderRadius: 20 }}>✕</button>
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
        <button onClick={() => onSave(data)} style={{ width: "100%", padding: "16px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>SALVAR ORÇAMENTO</button>
      </div>
    </div>
  );
}

function ResModal({ onClose, onSave, userName }) {
  const [data, setData] = useState({ recepcao: userName }); const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#3d2b1f70", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: nude.white, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 680, maxHeight: "90vh", overflow: "auto", padding: "24px 24px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <span style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>Nova Reserva</span>
          <button onClick={onClose} style={{ background: nude.bg, border: "none", color: nude.muted, fontSize: 20, cursor: "pointer", width: 40, height: 40, borderRadius: 20 }}>✕</button>
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
        <button onClick={() => onSave(data)} style={{ width: "100%", padding: "16px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>SALVAR RESERVA</button>
      </div>
    </div>
  );
}

function Card({ item, onSelect, selected, onStatusChange, statusCfg, statusOrder, titleField, subtitleField, valueField, tagField, readonly }) {
  const cfg = statusCfg[item.status] || Object.values(statusCfg)[0];
  return (
    <div onClick={() => onSelect(item)} style={{ background: selected ? "#fdf8f4" : nude.white, border: selected ? `2px solid ${cfg.color}` : `1px solid ${nude.border}`, borderLeft: `4px solid ${cfg.color}`, borderRadius: 14, padding: "18px 20px", cursor: "pointer", transition: "all 0.2s", marginBottom: 12, boxShadow: selected ? `0 4px 16px ${cfg.color}25` : `0 1px 4px #c4a98812` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, paddingRight: 10 }}>
          {tagField && item[tagField] && <span style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: "0.08em" }}>{item[tagField]}</span>}
          <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 18, marginTop: tagField ? 2 : 0, fontWeight: 600 }}>{item[titleField]}</div>
          {subtitleField && item[subtitleField] && <div style={{ color: nude.muted, fontSize: 13, fontFamily: "'DM Mono', monospace", marginTop: 4, lineHeight: 1.4 }}>{item[subtitleField]?.length > 55 ? item[subtitleField].slice(0, 55) + "…" : item[subtitleField]}</div>}
        </div>
        <Badge status={item.status} cfg={statusCfg} small />
      </div>
      {!readonly && (
        <div style={{ marginTop: 12 }}>
          <Pipeline current={item.status} order={statusOrder} cfg={statusCfg} onChange={(s) => onStatusChange(item.id, s)} />
          {valueField && item[valueField] && <div style={{ marginTop: 8 }}><span style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>R$ {item[valueField]}</span></div>}
        </div>
      )}
      {readonly && valueField && item[valueField] && <div style={{ marginTop: 8 }}><span style={{ color: "#7a9e87", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>R$ {item[valueField]}</span></div>}
    </div>
  );
}

function Detail({ item, onClose, onDelete, onStatusChange, onSave, statusCfg, statusOrder, editFields, extraAction, readonly, isMaster }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editData, setEditData] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEditData(item); setDirty(false); setConfirmDelete(false); }, [item?.id]);
  const set = (k) => (v) => { setEditData(d => ({ ...d, [k]: v })); setDirty(true); };
  const handleSave = async () => { setSaving(true); await onSave(item.id, editData); setDirty(false); setSaving(false); };
  if (!item) return null;
  const inputStyle = { width: "100%", background: nude.bg, border: `1.5px solid ${nude.border2}`, borderRadius: 10, padding: "11px 14px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 14, boxSizing: "border-box", outline: "none" };
  return (
    <div style={{ background: nude.white, border: `1px solid ${nude.border}`, borderRadius: 16, padding: 24, boxShadow: "0 2px 16px #c4a98815" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          {item.numero && <div style={{ color: "#c4956a", fontFamily: "'DM Mono', monospace", fontSize: 12, letterSpacing: "0.1em", marginBottom: 4 }}>Nº {item.numero}</div>}
          <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{editData.cliente || item.cliente}</div>
          {item.recepcao && <div style={{ color: nude.muted, fontSize: 12, fontFamily: "'DM Mono', monospace", marginTop: 4 }}>por {item.recepcao}</div>}
        </div>
        <button onClick={onClose} style={{ background: nude.bg, border: "none", color: nude.muted, fontSize: 18, cursor: "pointer", width: 40, height: 40, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
      </div>
      {!readonly && <div style={{ marginBottom: 20 }}><Pipeline current={editData.status} order={statusOrder} cfg={statusCfg} onChange={(s) => onStatusChange(item.id, s)} /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginBottom: 16 }}>
        {editFields.map(({ label, key, full, textarea }) => (
          <div key={key} style={{ gridColumn: full ? "span 2" : "span 1" }}>
            <div style={{ color: nude.muted, fontSize: 11, fontFamily: "'DM Mono', monospace", marginBottom: 5, letterSpacing: "0.06em" }}>{label}</div>
            {readonly
              ? <div style={{ color: nude.text, fontSize: 14, fontFamily: "'DM Mono', monospace", lineHeight: 1.5 }}>{item[key] || "—"}</div>
              : textarea
                ? <textarea value={editData[key] || ""} rows={3} onChange={e => set(key)(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />
                : <input value={editData[key] || ""} onChange={e => set(key)(e.target.value)} style={inputStyle} />
            }
          </div>
        ))}
      </div>
      {item.foto_peca_base64 && <div style={{ marginBottom: 16 }}><div style={{ color: nude.muted, fontSize: 11, marginBottom: 8, letterSpacing: "0.06em" }}>FOTO DA PEÇA</div><img src={`data:${item.foto_peca_type || "image/jpeg"};base64,${item.foto_peca_base64}`} alt="Peça" style={{ width: "100%", borderRadius: 12, border: `1px solid ${nude.border}` }} /></div>}
      {!readonly && dirty && <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "14px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 14, opacity: saving ? 0.7 : 1 }}>{saving ? "Salvando…" : "SALVAR ALTERAÇÕES"}</button>}
      {extraAction && <div style={{ marginBottom: 14 }}>{extraAction}</div>}
      {!readonly && isMaster && (
        <div style={{ marginTop: 8, borderTop: `1px solid ${nude.border}`, paddingTop: 16 }}>
          {!confirmDelete
            ? <button onClick={() => setConfirmDelete(true)} style={{ background: "none", border: "1px solid #e8c4c0", color: "#c0392b", padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>🗑 Excluir</button>
            : <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ color: "#c0392b", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>Confirma exclusão?</span>
                <button onClick={() => onDelete(item.id)} style={{ background: "#c0392b", border: "none", color: "#fff", padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700 }}>Sim</button>
                <button onClick={() => setConfirmDelete(false)} style={{ background: nude.bg, border: `1px solid ${nude.border2}`, color: nude.muted, padding: "10px 18px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Cancelar</button>
              </div>
          }
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(sessionStorage.getItem("garimpo_user")); } catch { return null; } });
  const [tab, setTab] = useState("os");
  const [osList, setOsList] = useState([]);
  const [orcList, setOrcList] = useState([]);
  const [resList, setResList] = useState([]);
  const [histList, setHistList] = useState([]);
  const [logList, setLogList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filterStatus, setFilterStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modal, setModal] = useState(null);

  const isMaster = user?.role === "master";

  useEffect(() => {
    if (!user) return;
    Promise.all([db.os.list(), db.orc.list(), db.res.list(), db.os.listHistorico(), db.hist.list()])
      .then(([os, orc, res, hist, log]) => {
        setOsList(os || []); setOrcList(orc || []); setResList(res || []); setHistList(hist || []); setLogList(log || []);
        setLoading(false);
        runAutoArchive([...(os || []), ...(hist || [])], setOsList);
      }).catch(() => setLoading(false));
  }, [user]);

  useEffect(() => { setSelected(null); setShowDetail(false); setFilterStatus("Todos"); setSearch(""); setDateFrom(""); setDateTo(""); }, [tab]);

  if (!user) return <LoginScreen onLogin={setUser} />;

  const isHistTab = tab === "hist" || tab === "log";
  const currentList = tab === "os" ? osList : tab === "orc" ? orcList : tab === "res" ? resList : tab === "hist" ? histList : logList;
  const currentStatus = tab === "os" ? OS_STATUS : tab === "orc" ? ORC_STATUS : tab === "res" ? RES_STATUS : OS_STATUS;
  const currentOrder = tab === "os" ? OS_ORDER : tab === "orc" ? ORC_ORDER : tab === "res" ? RES_ORDER : OS_ORDER;
  const dbRef = tab === "os" ? db.os : tab === "orc" ? db.orc : db.res;
  const setter = tab === "os" ? setOsList : tab === "orc" ? setOrcList : setResList;

  const handleStatusChange = async (id, newStatus) => {
    const item = currentList.find(i => i.id === id);
    setter(list => list.map(i => i.id === id ? { ...i, status: newStatus } : i));
    if (selected?.id === id) setSelected(prev => ({ ...prev, status: newStatus }));
    const updates = { status: newStatus };
    if (newStatus === "Entregue") updates.data_entrega = new Date().toISOString();
    await dbRef.update(id, updates);
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
    setSelected(null); setShowDetail(false);
  };

  const handleSaveOS = async (data) => {
    const saved = await db.os.insert({ ...data, status: "Aberta" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOsList(list => [item, ...list]); setModal(null);
  };
  const handleSaveOrc = async (data) => {
    const saved = await db.orc.insert({ ...data, status: "Pendente" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOrcList(list => [item, ...list]); setModal(null);
  };
  const handleSaveRes = async (data) => {
    const saved = await db.res.insert({ ...data, status: "Reservado" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setResList(list => [item, ...list]); setModal(null);
  };

  const handleOrcToOS = async (orc) => {
    const saved = await db.os.insert({ numero: orc.numero, cliente: orc.cliente, fone: orc.fone, descricao: orc.descricao, recepcao: orc.recepcao, data: orc.data, ac: orc.valor, obs: orc.obs, status: "Aberta" });
    const item = Array.isArray(saved) ? saved[0] : saved;
    setOsList(list => [item, ...list]);
    await db.orc.update(orc.id, { status: "Aprovado" });
    setOrcList(list => list.map(i => i.id === orc.id ? { ...i, status: "Aprovado" } : i));
    setSelected(null); setShowDetail(false); setTab("os");
  };

  const parseDate = (str) => {
    if (!str) return null;
    const p = str.split("/");
    if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}`);
    return new Date(str);
  };

  const filtered = currentList.filter(i => {
    const matchStatus = filterStatus === "Todos" || i.status === filterStatus;
    const matchSearch = !search || i.cliente?.toLowerCase().includes(search.toLowerCase()) || i.numero?.toLowerCase().includes(search.toLowerCase()) || i.descricao?.toLowerCase().includes(search.toLowerCase()) || i.descricao_produto?.toLowerCase().includes(search.toLowerCase()) || i.codigo_produto?.toLowerCase().includes(search.toLowerCase());
    let matchDate = true;
    if ((dateFrom || dateTo) && tab === "os") {
      const d = parseDate(i.data);
      if (dateFrom && d) matchDate = matchDate && d >= new Date(dateFrom);
      if (dateTo && d) matchDate = matchDate && d <= new Date(dateTo + "T23:59:59");
    }
    return matchStatus && matchSearch && matchDate;
  });

  const counts = currentOrder.reduce((acc, s) => { acc[s] = currentList.filter(i => i.status === s).length; return acc; }, {});

  const OS_FIELDS = [{ label: "Nº OS", key: "numero" }, { label: "Data", key: "data" }, { label: "Cliente", key: "cliente", full: true }, { label: "Telefone", key: "fone" }, { label: "Recepção", key: "recepcao" }, { label: "Descrição", key: "descricao", full: true, textarea: true }, { label: "A/C (R$)", key: "ac" }, { label: "Valor de Custo (R$)", key: "nc" }, { label: "Observação", key: "obs", full: true }];
  const ORC_FIELDS = [{ label: "Nº Orçamento", key: "numero" }, { label: "Data", key: "data" }, { label: "Cliente", key: "cliente", full: true }, { label: "Telefone", key: "fone" }, { label: "Recepção", key: "recepcao" }, { label: "Descrição", key: "descricao", full: true, textarea: true }, { label: "Valor (R$)", key: "valor" }, { label: "Observação", key: "obs" }];
  const RES_FIELDS = [{ label: "Cliente", key: "cliente", full: true }, { label: "Telefone", key: "fone" }, { label: "Data da Reserva", key: "data_reserva" }, { label: "Código do Produto", key: "codigo_produto" }, { label: "Valor (R$)", key: "valor" }, { label: "Descrição do Produto", key: "descricao_produto", full: true, textarea: true }, { label: "Observação", key: "obs", full: true }];
  const HIST_FIELDS = [{ label: "Nº OS", key: "numero" }, { label: "Data Entrada", key: "data_entrada" }, { label: "Cliente", key: "cliente", full: true }, { label: "Telefone", key: "fone" }, { label: "Descrição", key: "descricao", full: true }, { label: "A/C (R$)", key: "ac" }, { label: "Valor de Custo", key: "nc" }, { label: "Observação", key: "obs", full: true }];
  const LOG_FIELDS = [{ label: "Nº OS", key: "numero" }, { label: "Data Entrada", key: "data_entrada" }, { label: "Cliente", key: "cliente", full: true }, { label: "Telefone", key: "fone" }, { label: "Descrição", key: "descricao", full: true }, { label: "A/C (R$)", key: "ac" }, { label: "Arquivado em", key: "arquivado_em" }];
  const editFields = tab === "os" ? OS_FIELDS : tab === "orc" ? ORC_FIELDS : tab === "res" ? RES_FIELDS : tab === "hist" ? HIST_FIELDS : LOG_FIELDS;

  const tabCfg = [
    { key: "os", label: "OS", count: osList.length },
    { key: "orc", label: "Orçamentos", count: orcList.length },
    { key: "res", label: "Reservas", count: resList.length },
    { key: "hist", label: "Histórico", count: histList.length },
    ...(isMaster ? [{ key: "log", label: "Log", count: logList.length }] : []),
  ];

  const inputStyle = { background: nude.bg, border: `1px solid ${nude.border}`, borderRadius: 10, padding: "10px 14px", color: nude.text, fontFamily: "'DM Mono', monospace", fontSize: 13, outline: "none" };

  // Painel lateral no mobile vira overlay
  const DetailPanel = () => !selected ? null : (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={(e) => { if (e.target === e.currentTarget) { setSelected(null); setShowDetail(false); } }}>
      <div style={{ background: nude.bg, width: "100%", maxHeight: "92vh", overflowY: "auto", borderRadius: "20px 20px 0 0", padding: "20px 20px 40px", boxShadow: "0 -4px 32px #3d2b1f20" }}>
        <div style={{ width: 40, height: 4, background: nude.border2, borderRadius: 2, margin: "0 auto 20px" }} />
        <Detail item={selected} onClose={() => { setSelected(null); setShowDetail(false); }} onDelete={handleDelete} onStatusChange={handleStatusChange} onSave={handleSaveEdit} statusCfg={tab === "hist" ? HIST_STATUS : tab === "log" ? LOG_STATUS : currentStatus} statusOrder={currentOrder} editFields={editFields} readonly={isHistTab} isMaster={isMaster}
          extraAction={tab === "orc" && selected.status !== "Aprovado" && selected.status !== "Recusado" ? (
            <button onClick={() => handleOrcToOS(selected)} style={{ width: "100%", padding: "14px 0", background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>✓ Converter em OS</button>
          ) : null}
        />
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #faf7f4; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #f5efe9; } ::-webkit-scrollbar-thumb { background: #e0d0c4; border-radius: 2px; }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#faf7f4", color: nude.text, fontFamily: "'DM Mono', monospace" }}>

        {/* Header */}
        <div style={{ borderBottom: `1px solid ${nude.border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", background: nude.white, position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💎</div>
            <div>
              <div style={{ color: nude.text, fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700 }}>Garimpo Jóias</div>
              <div style={{ color: nude.muted, fontSize: 10, letterSpacing: "0.08em" }}>{user.nome}{isMaster ? " ★" : ""}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!isHistTab && (
              <button onClick={() => setModal(tab)} style={{ background: `linear-gradient(135deg, ${nude.gold}, ${nude.gold2})`, border: "none", borderRadius: 12, padding: "10px 18px", color: "#fff", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {tab === "os" ? "+ OS" : tab === "orc" ? "+ Orçamento" : "+ Reserva"}
              </button>
            )}
            <button onClick={() => { sessionStorage.removeItem("garimpo_user"); setUser(null); }} style={{ background: "none", border: `1px solid ${nude.border}`, color: nude.muted, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>Sair</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", background: nude.white, borderBottom: `1px solid ${nude.border}`, overflowX: "auto" }}>
          {tabCfg.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "14px 18px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? nude.gold2 : nude.muted, borderBottom: tab === t.key ? `3px solid ${nude.gold2}` : "3px solid transparent", whiteSpace: "nowrap" }}>
              {t.label} <span style={{ color: tab === t.key ? nude.gold : "#c4b0a4", marginLeft: 4, fontSize: 12 }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Filtros */}
        {!isHistTab && (
          <div style={{ background: nude.white, borderBottom: `1px solid ${nude.border}` }}>
            <div style={{ display: "flex", overflowX: "auto" }}>
              {[{ label: "Todos", count: currentList.length, color: nude.text }, ...currentOrder.map(s => ({ label: s, count: counts[s], color: currentStatus[s].color }))].map(({ label, count, color }) => (
                <div key={label} onClick={() => setFilterStatus(label)} style={{ padding: "12px 16px", borderRight: `1px solid ${nude.border}`, cursor: "pointer", whiteSpace: "nowrap", background: filterStatus === label ? nude.bg : "transparent", borderBottom: filterStatus === label ? `3px solid ${color}` : "3px solid transparent" }}>
                  <div style={{ color, fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{count}</div>
                  <div style={{ color: nude.muted, fontSize: 10, letterSpacing: "0.06em" }}>{label.toUpperCase()}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, nº OS…" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
              {tab === "os" && (
                <>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, fontSize: 12 }} />
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, fontSize: 12 }} />
                  {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} style={{ background: "none", border: "none", color: nude.muted, cursor: "pointer", fontSize: 18, padding: "0 4px" }}>✕</button>}
                </>
              )}
            </div>
          </div>
        )}

        {isHistTab && (
          <div style={{ padding: "12px 20px", background: nude.white, borderBottom: `1px solid ${nude.border}` }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" style={{ ...inputStyle, width: "100%" }} />
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: nude.muted, fontSize: 14 }}>Carregando…</div>
        ) : (
          <div style={{ padding: "16px 16px 100px" }}>
            {filtered.length === 0
              ? <div style={{ textAlign: "center", padding: 60, color: "#c4b0a4", fontSize: 14 }}>{currentList.length === 0 ? "Nenhum registro — toque no botão acima para começar" : "Nenhum resultado"}</div>
              : filtered.map(item => (
                  <Card key={item.id} item={item} selected={selected?.id === item.id}
                    onSelect={(i) => { setSelected(i); setShowDetail(true); }}
                    onStatusChange={handleStatusChange}
                    statusCfg={tab === "hist" ? HIST_STATUS : tab === "log" ? LOG_STATUS : currentStatus}
                    statusOrder={currentOrder} titleField="cliente"
                    subtitleField={tab === "res" ? "codigo_produto" : "descricao"}
                    valueField={tab === "os" || tab === "hist" || tab === "log" ? "ac" : "valor"}
                    tagField={tab === "res" ? null : "numero"} readonly={isHistTab}
                  />
                ))
            }
          </div>
        )}
      </div>

      {showDetail && selected && <DetailPanel />}
      {modal === "os"  && <OSModal  onClose={() => setModal(null)} onSave={handleSaveOS} userName={user.nome} />}
      {modal === "orc" && <OrcModal onClose={() => setModal(null)} onSave={handleSaveOrc} userName={user.nome} />}
      {modal === "res" && <ResModal onClose={() => setModal(null)} onSave={handleSaveRes} userName={user.nome} />}
    </>
  );
}
