// Helpers
function $(sel, root = document) { return root.querySelector(sel); }
function createEl(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  });
  children.forEach((c) => el.appendChild(c));
  return el;
}

/* Tooltip manager (global) */
const Tooltip = (() => {
  const tip = $("#tooltip");
  let active = null;

  function show(text, x, y) {
    if (!tip) return;
    tip.textContent = text;
    tip.classList.remove("hidden");
    position(x, y);
  }
  function position(x, y) {
    if (!tip) return;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = tip.getBoundingClientRect();
    let nx = x + pad;
    let ny = y + pad;
    if (nx + rect.width + 8 > vw) nx = x - rect.width - pad;
    if (ny + rect.height + 8 > vh) ny = y - rect.height - pad;
    tip.style.left = `${nx}px`;
    tip.style.top = `${ny}px`;
  }
  function hide() { if (tip) tip.classList.add("hidden"); }

  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) return;
    active = t;
    show(t.getAttribute("data-tip"), e.clientX, e.clientY);
  });
  document.addEventListener("mousemove", (e) => { if (active) position(e.clientX, e.clientY); });
  document.addEventListener("mouseout", (e) => {
    if (active && !e.relatedTarget?.closest?.("[data-tip]")) {
      active = null;
      hide();
    }
  });

  return { show, hide };
})();

// Componente de diagrama con:
// - Marcadores de flecha únicos por diagrama (siempre visibles)
// - Deduplicación de aristas por par (from→to) con contadores apilados por categoría
class Diagram {
  static _uid = 0;

  constructor(svg, nodes, options = {}) {
    this.svg = svg;
    this.nodes = nodes; // [{id, label, tip?, x, y, accepting?, trap?}]
    this.options = Object.assign(
      { nodeRadius: 28, activeColor: "#2563eb", edgeColor: "#64748b", arrowSize: 12 },
      options
    );
    this.nodeMap = new Map(nodes.map((n) => [n.id, n]));
    this.edgesLayer = null;
    this.nodesLayer = null;
    this.labelsLayer = null;
    this.startLayer = null;
    this.currentActiveId = null;
    this.edgeCount = new Map(); // alterna curvaturas por par
    this.edgeIndex = new Map();  // par (from→to) -> entry (contadores apilados)
    this.activeEdgeGroup = null;

    // ID único por diagrama para el marcador
    this.uid = ++Diagram._uid;
    this.markerId = `arrow-${this.uid}`;

    this.draw();
  }

  clear() { while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild); }

  draw() {
    this.clear();
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    // Marcador de flecha único
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", this.markerId);
    marker.setAttribute("markerWidth", String(this.options.arrowSize));
    marker.setAttribute("markerHeight", String(this.options.arrowSize));
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", "auto-start-reverse");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M0,0 L10,4 L0,8 Z");
    path.setAttribute("fill", this.options.edgeColor);
    marker.appendChild(path);
    defs.appendChild(marker);
    this.svg.appendChild(defs);

    this.startLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.startLayer.setAttribute("class", "start");
    this.svg.appendChild(this.startLayer);

    this.edgesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.edgesLayer.setAttribute("class", "edges");
    this.svg.appendChild(this.edgesLayer);

    this.nodesLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.nodesLayer.setAttribute("class", "nodes");
    this.svg.appendChild(this.nodesLayer);

    this.labelsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.labelsLayer.setAttribute("class", "labels");
    this.svg.appendChild(this.labelsLayer);

    // Nodes
    for (const n of this.nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-id", n.id);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", n.x);
      circle.setAttribute("cy", n.y);
      circle.setAttribute("r", this.options.nodeRadius);
      circle.setAttribute("class", "state");
      if (n.trap) circle.classList.add("trap");
      if (n.tip) circle.setAttribute("data-tip", n.tip);
      g.appendChild(circle);

      const acc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      acc.setAttribute("cx", n.x);
      acc.setAttribute("cy", n.y);
      acc.setAttribute("r", this.options.nodeRadius - 6);
      acc.setAttribute("class", "state-accepting");
      if (!n.accepting) acc.classList.add("hidden");
      g.appendChild(acc);

      this.nodesLayer.appendChild(g);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", n.x);
      label.setAttribute("y", n.y + 4);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "state-label");
      if (n.tip) label.setAttribute("data-tip", n.tip);
      label.textContent = n.label ?? n.id;
      this.labelsLayer.appendChild(label);
    }

    // Flecha de inicio al primer nodo
    const startNode = this.nodes[0];
    if (startNode) {
      const sx = Math.max(10, startNode.x - 80);
      const sy = startNode.y;
      const ex = startNode.x - this.options.nodeRadius - 6;
      const ey = startNode.y;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", sx);
      line.setAttribute("y1", sy);
      line.setAttribute("x2", ex);
      line.setAttribute("y2", ey);
      line.setAttribute("stroke", "#5ca0ff");
      line.setAttribute("stroke-width", "2");
      line.setAttribute("marker-end", `url(#${this.markerId})`);
      line.setAttribute("data-tip", "Flecha de inicio del autómata");
      this.startLayer.appendChild(line);
    }
  }

  setActive(id) {
    const prev = this.currentActiveId && this.nodesLayer.querySelector(`g[data-id="${this.currentActiveId}"] circle.state`);
    if (prev) prev.classList.remove("active");
    const curr = this.nodesLayer.querySelector(`g[data-id="${id}"] circle.state`);
    if (curr) curr.classList.add("active");
    this.currentActiveId = id;
  }

  setDynamicAccepting(isAccepting) {
    if (!this.currentActiveId) return;
    const ring = this.nodesLayer.querySelector(`g[data-id="${this.currentActiveId}"] circle.state-accepting`);
    if (ring) {
      if (isAccepting) ring.classList.remove("hidden");
      else ring.classList.add("hidden");
    }
  }

  clearEdges() {
    this.edgeCount.clear();
    this.edgeIndex.clear();
    while (this.edgesLayer.firstChild) this.edgesLayer.removeChild(this.edgesLayer.firstChild);
    this.activeEdgeGroup = null;
  }

  _pairKey(fromId, toId) { return fromId <= toId ? `${fromId}->${toId}` : `${toId}->${fromId}`; }

  _selfLoopLabelPos(node) {
    const r = this.options.nodeRadius;
    return { x: node.x - (r + 16), y: node.y - (r + 18) };
  }

  _syncLabelBg(labelEl, bgEl) {
    try {
      const bb = labelEl.getBBox();
      bgEl.setAttribute("x", bb.x - 4);
      bgEl.setAttribute("y", bb.y - 2);
      bgEl.setAttribute("width", bb.width + 8);
      bgEl.setAttribute("height", bb.height + 4);
    } catch (_) {}
  }

  _setMultilineLabel(labelEl, lines, x, y) {
    while (labelEl.firstChild) labelEl.removeChild(labelEl.firstChild);
    let dy = 0;
    const lineHeight = 14;
    lines.forEach((txt) => {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      t.setAttribute("x", x);
      t.setAttribute("y", y + dy);
      t.textContent = txt;
      labelEl.appendChild(t);
      dy += lineHeight;
    });
  }

  addOrBumpEdge(fromId, toId, categoryLabel = "", tipText = "") {
    const from = this.nodeMap.get(fromId);
    const to = this.nodeMap.get(toId);
    if (!from || !to) return null;

    const pairKey = `${fromId}→${toId}`;
    let entry = this.edgeIndex.get(pairKey);

    if (!entry) {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", "edge");

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "edge-path");
      path.setAttribute("marker-end", `url(#${this.markerId})`); // Flecha SIEMPRE visible

      let labelEl = null, bg = null, labelPos = { x: 0, y: 0 };

      if (fromId === toId) {
        const r = this.options.nodeRadius;
        const x = from.x;
        const y = from.y;
        const d = `M ${x} ${y - r} c -20 -30, 20 -30, 0 0`;
        path.setAttribute("d", d);
        group.appendChild(path);
        labelPos = this._selfLoopLabelPos(from);
      } else {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;

        const sx = from.x + (dx / len) * this.options.nodeRadius;
        const sy = from.y + (dy / len) * this.options.nodeRadius;
        const ex = to.x - (dx / len) * this.options.nodeRadius;
        const ey = to.y - (dy / len) * this.options.nodeRadius;

        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        const nx = -dy / len;
        const ny = dx / len;

        const pair = this._pairKey(fromId, toId);
        const countForPair = (this.edgeCount.get(pair) || 0) + 1;
        this.edgeCount.set(pair, countForPair);
        const mag = 26 + (countForPair % 2) * 12;  // un poco más de separación
        const dir = fromId <= toId ? 1 : -1;
        const cx = mx + nx * mag * dir;
        const cy = my + ny * mag * dir;

        const d = `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
        path.setAttribute("d", d);
        group.appendChild(path);

        labelPos.x = (sx + 2 * cx + ex) / 4;
        labelPos.y = (sy + 2 * cy + ey) / 4 - 4;
      }

      labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      labelEl.setAttribute("x", labelPos.x);
      labelEl.setAttribute("y", labelPos.y);
      labelEl.setAttribute("text-anchor", "middle");
      labelEl.setAttribute("class", "edge-label");
      if (tipText) labelEl.setAttribute("data-tip", tipText);

      bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("class", "edge-label-bg");

      group.appendChild(bg);
      group.appendChild(labelEl);
      this.edgesLayer.appendChild(group);

      entry = {
        group,
        path,
        label: labelEl,
        bg,
        labelX: labelPos.x,
        labelY: labelPos.y,
        counts: new Map(), // categoría -> cantidad
      };
      this.edgeIndex.set(pairKey, entry);
    }

    // Actualizar contadores apilados
    if (categoryLabel) {
      entry.counts.set(categoryLabel, (entry.counts.get(categoryLabel) || 0) + 1);
    }

    const lines = Array.from(entry.counts.entries())
      .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .map(([k, v]) => `${k} × ${v}`);

    this._setMultilineLabel(entry.label, lines, entry.labelX, entry.labelY);
    const tip = lines.length ? `Conteo por categoría:\n• ${lines.join("\n• ")}` : tipText || "";
    if (tip) entry.label.setAttribute("data-tip", tip);

    requestAnimationFrame(() => this._syncLabelBg(entry.label, entry.bg));

    return entry.group;
  }

  setActiveEdge(group) {
    if (this.activeEdgeGroup) this.activeEdgeGroup.classList.remove("active");
    if (group) {
      group.classList.add("active");
      this.activeEdgeGroup = group;
    }
  }
}

// Layout claro para EMAIL (sin cambios)
function getEmailNodes() {
  return [
    { id: "S", label: "S\n(inicio)", x: 90, y: 180, tip: "Inicio. Espera el primer carácter de la parte local." },
    { id: "L", label: "L\n(local)", x: 240, y: 90, tip: "Parte local (antes de @). Permite letras, dígitos y ._%+-" },
    { id: "D", label: "D\n(dominio)", x: 420, y: 90, tip: "Dominio: etiquetas [a-zA-Z0-9-] separadas por '.'" },
    { id: "AFTER_DOT", label: "AFTER_DOT\n(tras '.')", x: 520, y: 220, tip: "Se leyó un punto en el dominio; empieza nueva etiqueta/TLD" },
    { id: "TLD", label: "TLD", x: 300, y: 260, accepting: true, tip: "TLD (p. ej., com). Solo letras y longitud ≥ 2" },
    { id: "TRAP", label: "TRAP", x: 120, y: 290, trap: true, tip: "Estado trampa: secuencia inválida para el email" },
  ];
}

// Layout DAG para PASSWORD para reducir cruces
function tipFromBits(id) {
  if (id === "TRAP") return "Estado trampa: carácter no permitido";
  const [L,U,D] = id.split("").map(Number);
  const parts = [];
  parts.push(`L=${L ? "sí" : "no"} minúscula`);
  parts.push(`U=${U ? "sí" : "no"} mayúscula`);
  parts.push(`D=${D ? "sí" : "no"} dígito`);
  return `Estado ${id}: ${parts.join(" · ")}. Acepta cuando es 111 y longitud ≥ 8.`;
}
function getPasswordNodes() {
  // Capas (izquierda→derecha): 000 | 100,010,001 | 110,101,011 | 111 | TRAP
  return [
    { id: "000", label: "000", x: 90,  y: 160, tip: tipFromBits("000") },

    { id: "100", label: "100\n(tiene min)", x: 240, y: 90,  tip: tipFromBits("100") },
    { id: "010", label: "010\n(tiene may)", x: 240, y: 160, tip: tipFromBits("010") },
    { id: "001", label: "001\n(tiene dig)", x: 240, y: 230, tip: tipFromBits("001") },

    { id: "110", label: "110\n(min+may)", x: 400, y: 110, tip: tipFromBits("110") },
    { id: "101", label: "101\n(min+dig)", x: 400, y: 190, tip: tipFromBits("101") },
    { id: "011", label: "011\n(may+dig)", x: 400, y: 270, tip: tipFromBits("011") },

    { id: "111", label: "111\n(min+may+dig)", x: 560, y: 180, accepting: true, tip: tipFromBits("111") },
    { id: "TRAP", label: "TRAP", x: 560, y: 290, trap: true, tip: tipFromBits("TRAP") },
  ];
}

// Render de pasos
function renderSteps(container, sim, acceptingCheck) {
  container.innerHTML = "";
  const status = createEl("div", {
    class: "status " + (sim.accepted ? "ok" : "bad"),
    text: sim.accepted ? "Aceptado" : "No aceptado",
  });
  container.appendChild(status);

  const ul = createEl("ul", { class: "steps" });
  if (sim.steps.length === 0) {
    ul.appendChild(createEl("li", { text: "Sin entrada." }));
  } else {
    sim.steps.forEach((st) => {
      const info =
        `i=${st.index}  char='${st.char}'  ${st.from} -> ${st.to}` +
        (acceptingCheck(st.to, st.ctx) ? "  [aceptando]" : "");
      ul.appendChild(createEl("li", { text: info }));
    });
  }
  container.appendChild(ul);
}

// Progreso
function renderProgress(el, value, pos) {
  if (!el) return;
  if (!value || value.length === 0) {
    el.innerHTML = "—";
    return;
  }
  const i = Math.max(0, Math.min(value.length - 1, pos));
  const consumed = value.slice(0, Math.max(0, i));
  const current = value[i] ?? "";
  const remaining = i + 1 < value.length ? value.slice(i + 1) : "";
  el.innerHTML =
    `<span class="consumed">${escapeHtml(consumed)}</span>` +
    `<span class="current">${escapeHtml(current)}</span>` +
    `<span class="remaining">${escapeHtml(remaining)}</span>`;
}
function renderProgressFinal(el, value) {
  if (!el) return;
  if (!value || value.length === 0) el.innerHTML = "—";
  else el.innerHTML = `<span class="consumed">${escapeHtml(value)}</span>`;
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

function setStateBadge(el, state, accepted, trap = false) {
  if (!el) return;
  const status = trap ? "TRAP" : accepted ? "ACEPTA" : "—";
  el.textContent = `Estado: ${state} ${status !== "—" ? `· ${status}` : ""}`;
}

// Tooltips de categorías
const emailEdgeTip = (lbl) => {
  const map = {
    "@": "Separador entre parte local y dominio",
    ".": "Punto entre etiquetas del dominio; el último segmento es el TLD",
    "letra": "Letra a-z",
    "LETRA": "Letra A-Z",
    "dígito": "Dígito 0-9",
    "_": "Carácter permitido en la parte local",
    "%": "Carácter permitido en la parte local",
    "+": "Carácter permitido en la parte local",
    "-": "Carácter permitido en la parte local",
    "inv": "Carácter inválido para el patrón de email"
  };
  return map[lbl] || map["inv"];
};
const pwdEdgeTip = (lbl) => {
  const map = {
    "min": "Carácter minúscula [a-z]",
    "MAY": "Carácter mayúscula [A-Z]",
    "dig": "Dígito [0-9]",
    "inv": "Carácter inválido: solo se permiten letras y dígitos"
  };
  return map[lbl] || map["inv"];
};

// Dibujo de simulación (con cancelación y contadores apilados)
async function drawSimulation(diagram, sim, edgeLabelFn, edgeTipFn, acceptingCheck, opts) {
  const { animate, delayMs, badgeEl, progressEl, value, runRef, token } = Object.assign(
    { animate: false, delayMs: 350 },
    opts || {}
  );

  diagram.clearEdges();

  // Estado inicial
  const initial = diagram.nodes[0]?.id ?? sim.steps[0]?.from ?? sim.state;
  diagram.setActive(initial);
  diagram.setDynamicAccepting(acceptingCheck(initial, sim.ctx));
  setStateBadge(badgeEl, initial, acceptingCheck(initial, sim.ctx), sim.state === "TRAP");

  // Entrada vacía: reset limpio
  if (!value || value.length === 0 || sim.steps.length === 0) {
    renderProgressFinal(progressEl, value || "");
    return;
  }

  let lastGroup = null;

  if (animate) {
    for (const st of sim.steps) {
      if (runRef && runRef.current !== token) return;
      renderProgress(progressEl, value || "", st.index);
      await new Promise((r) => setTimeout(r, delayMs));
      if (runRef && runRef.current !== token) return;

      const cat = edgeLabelFn(st.char, st);
      const tip = edgeTipFn(cat);
      lastGroup = diagram.addOrBumpEdge(st.from, st.to, cat, tip);
      diagram.setActiveEdge(lastGroup);
      diagram.setActive(st.to);
      const acc = acceptingCheck(st.to, st.ctx);
      diagram.setDynamicAccepting(acc);
      setStateBadge(badgeEl, st.to, acc, st.to === "TRAP" || st.ctx.trap);
    }
  } else {
    for (const st of sim.steps) {
      const cat = edgeLabelFn(st.char, st);
      const tip = edgeTipFn(cat);
      lastGroup = diagram.addOrBumpEdge(st.from, st.to, cat, tip);
    }
    if (lastGroup) diagram.setActiveEdge(lastGroup);
    const last = sim.steps[sim.steps.length - 1];
    diagram.setActive(last.to);
    const acc = acceptingCheck(last.to, last.ctx);
    diagram.setDynamicAccepting(acc);
    setStateBadge(badgeEl, last.to, acc, last.to === "TRAP" || last.ctx.trap);
    renderProgressFinal(progressEl, value || "");
  }
}

// Validación visual
function setValidity(el, valid, messageOk = "Válido", messageBad = "Inválido") {
  const holder = el.closest(".field");
  const badge = holder.querySelector(".badge");
  if (valid) {
    badge.classList.remove("bad");
    badge.classList.add("ok");
    badge.textContent = messageOk;
  } else {
    badge.classList.remove("ok");
    badge.classList.add("bad");
    badge.textContent = messageBad;
  }
}

// Main
window.addEventListener("DOMContentLoaded", () => {
  const emailInput = $("#email");
  const pwdInput = $("#password");
  const animateChk = $("#animate");
  const tabEmail = $("#tab-email");
  const tabPwd = $("#tab-pwd");
  const panelEmail = $("#panel-email");
  const panelPwd = $("#panel-pwd");

  // SVGs y diagramas
  const emailSvg = $("#email-svg");
  const pwdSvg = $("#pwd-svg");
  const emailDiagram = new Diagram(emailSvg, getEmailNodes());
  const pwdDiagram = new Diagram(pwdSvg, getPasswordNodes(), { arrowSize: 12 });

  // Paso a paso (columna izquierda)
  const emailStepsBox = $("#email-steps");
  const pwdStepsBox = $("#pwd-steps");
  const activePill = $("#active-automaton");

  // Badges y progreso (derecha)
  const emailBadge = $("#email-state-badge");
  const pwdBadge = $("#pwd-state-badge");
  const emailProgressEl = $("#email-progress");
  const pwdProgressEl = $("#pwd-progress");

  // Tokens de cancelación
  const emailRun = { current: 0 };
  const pwdRun = { current: 0 };

  function switchTab(which) {
    const isEmail = which === "email";
    if (isEmail) {
      tabEmail.classList.add("active");
      tabPwd.classList.remove("active");
      panelEmail.classList.remove("hidden");
      panelPwd.classList.add("hidden");
    } else {
      tabPwd.classList.add("active");
      tabEmail.classList.remove("active");
      panelPwd.classList.remove("hidden");
      panelEmail.classList.add("hidden");
    }
    emailStepsBox.classList.toggle("hidden", !isEmail);
    pwdStepsBox.classList.toggle("hidden", isEmail);
    if (activePill) activePill.textContent = isEmail ? "Email" : "Contraseña";
  }

  tabEmail.addEventListener("click", () => switchTab("email"));
  tabPwd.addEventListener("click", () => switchTab("pwd"));

  // Categorías
  const emailEdgeLabel = (ch) => {
    if (ch === "@") return "@";
    if (ch === ".") return ".";
    if (/[a-z]/.test(ch)) return "letra";
    if (/[A-Z]/.test(ch)) return "LETRA";
    if (/\d/.test(ch)) return "dígito";
    if (/[_%+-]/.test(ch)) return ch;
    return "inv";
  };
  const pwdEdgeLabel = (ch) => {
    if (/[a-z]/.test(ch)) return "min";
    if (/[A-Z]/.test(ch)) return "MAY";
    if (/\d/.test(ch)) return "dig";
    return "inv";
  };

  // Accepting
  const emailAcceptingCheck = (state, ctx) => EmailDFA.isAccepting(state, ctx);
  const pwdAcceptingCheck = (state, ctx) => PasswordDFA.isAccepting(state, ctx);

  async function updateEmail() {
    const token = ++emailRun.current;
    const value = emailInput.value;
    const isValid = window.emailPattern.test(value);
    setValidity(emailInput, isValid, "Correo válido", "Correo inválido");

    const sim = EmailDFA.simulate(value);
    renderSteps(emailStepsBox, sim, emailAcceptingCheck);

    await drawSimulation(
      emailDiagram,
      sim,
      emailEdgeLabel,
      emailEdgeTip,
      emailAcceptingCheck,
      { animate: animateChk.checked, delayMs: 250, badgeEl: emailBadge, progressEl: emailProgressEl, value, runRef: emailRun, token }
    );
  }

  async function updatePassword() {
    const token = ++pwdRun.current;
    const value = pwdInput.value;
    const isValid = window.pwdPattern.test(value);
    setValidity(pwdInput, isValid, "Contraseña válida", "Contraseña inválida");

    const sim = PasswordDFA.simulate(value);
    renderSteps(pwdStepsBox, sim, pwdAcceptingCheck);

    await drawSimulation(
      pwdDiagram,
      sim,
      pwdEdgeLabel,
      pwdEdgeTip,
      pwdAcceptingCheck,
      { animate: animateChk.checked, delayMs: 250, badgeEl: pwdBadge, progressEl: pwdProgressEl, value, runRef: pwdRun, token }
    );
  }

  emailInput.addEventListener("input", async () => { switchTab("email"); await updateEmail(); });
  pwdInput.addEventListener("input", async () => { switchTab("pwd"); await updatePassword(); });

  // Inicial
  switchTab("email");
  updateEmail();
  updatePassword();
});