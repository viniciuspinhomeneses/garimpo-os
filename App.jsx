import { useState, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

const STATUS_CONFIG = {
  Aberta:     { color: "#94a3b8", bg: "#1e293b", label: "Aberta",    icon: "○" },
  Aprovada:   { color: "#f59e0b", bg: "#2d1f00", label: "Aprovada",  icon: "◐" },
  "Produção": { color: "#3b82f6", bg: "#0f1f3d", label: "Produção",  icon: "◕" },
  Entregue:   { color: "#10b981", bg: "#022c1e", label: "Entregue",  icon: "●" },
};
const STATUS_ORDER = ["Aberta", "Aprovada", "Produção", "Entregue"];

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
