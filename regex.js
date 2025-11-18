// Patrones dados
// (correo)
const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// (contraseña)
const pwdPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;

// Utilidades de caracteres
function isLetter(ch) {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}
function isDigit(ch) {
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}
function isAlphaNum(ch) {
  return isLetter(ch) || isDigit(ch);
}
function isLocalEmailChar(ch) {
  return (
    isAlphaNum(ch) ||
    ch === "." ||
    ch === "_" ||
    ch === "%" ||
    ch === "+" ||
    ch === "-"
  );
}
function isDomainChar(ch) {
  return isAlphaNum(ch) || ch === "." || ch === "-";
}
function isDomainLabelChar(ch) {
  return isAlphaNum(ch) || ch === "-";
}

// AUTÓMATA PARA EMAIL (aproxima el regex dado)
// Estados: S (inicio), L (local), D (domain label), AFTER_DOT (después de un punto, inicio de TLD o nuevo label),
// TLD (parte de TLD), TRAP (error)
//
// Reglas principales:
// - local: [a-zA-Z0-9._%+-]+
// - '@' obligatorio
// - domain: [a-zA-Z0-9.-]+ con al menos un '.'
// - TLD final: letras solamente y longitud >= 2
//
// Nota: Este DFA sigue la semántica del regex, admitiendo '.' consecutivos en local (tal como permite el regex),
// y permite múltiples puntos en el dominio, requiriendo que el último segmento (TLD) sean solo letras (>=2).
const EmailDFA = {
  id: "EmailDFA",
  states: ["S", "L", "D", "AFTER_DOT", "TLD", "TRAP"],
  start: "S",
  trap: "TRAP",
  // accepted: al final de la cadena si estamos en TLD y tldLen >= 2.
  isAccepting(state, ctx) {
    return state === "TLD" && ctx.seenAt && ctx.seenDot && ctx.tldLen >= 2 && !ctx.trap;
  },
  initContext() {
    return {
      seenAt: false,
      seenDot: false,
      localLen: 0,
      tldLen: 0,
      trap: false,
    };
  },
  step(state, ch, ctx) {
    if (state === "TRAP") return "TRAP";

    switch (state) {
      case "S": {
        if (isLocalEmailChar(ch)) {
          ctx.localLen = 1;
          return "L";
        }
        ctx.trap = true;
        return "TRAP";
      }
      case "L": {
        if (isLocalEmailChar(ch)) {
          ctx.localLen += 1;
          return "L";
        }
        if (ch === "@") {
          if (ctx.localLen >= 1) {
            ctx.seenAt = true;
            // reset domain segment tracking
            ctx.tldLen = 0;
            return "D";
          }
          ctx.trap = true;
          return "TRAP";
        }
        ctx.trap = true;
        return "TRAP";
      }
      case "D": {
        if (isDomainLabelChar(ch)) {
          // estamos en un label del dominio
          // si es letra y venimos de (posible final), puede contribuir a TLD si ya hubo punto(s)
          // BUT el TLD solo se activa formalmente después de un '.'
          return "D";
        }
        if (ch === ".") {
          ctx.seenDot = true;
          ctx.tldLen = 0; // empezará TLD (o un nuevo label) después de este punto
          return "AFTER_DOT";
        }
        ctx.trap = true;
        return "TRAP";
      }
      case "AFTER_DOT": {
        // Aquí el siguiente char puede iniciar TLD si es letra,
        // o simplemente otro label (si luego aparecen dígitos o '-'), lo manejaremos en TLD → D.
        if (isLetter(ch)) {
          ctx.tldLen = 1;
          return "TLD";
        }
        // Si no es letra, el supuesto TLD se invalida; pero si es dígito o '-', esto realmente implica
        // que no estábamos en TLD todavía, seguimos en dominio normal. Sin embargo, de acuerdo al regex,
        // tras el ÚLTIMO '.' debe haber solo letras, lo cual se valida al final (aceptación).
        // Si aparece dígito o '-', volvemos a D (nuevo label no-TLD).
        if (isDigit(ch) || ch === "-") {
          // No estamos en TLD; volvemos a D
          return "D";
        }
        ctx.trap = true;
        return "TRAP";
      }
      case "TLD": {
        if (isLetter(ch)) {
          ctx.tldLen += 1;
          return "TLD";
        }
        if (ch === ".") {
          // hubo otro punto: TLD se reinicia potencialmente
          ctx.seenDot = true;
          ctx.tldLen = 0;
          return "AFTER_DOT";
        }
        if (isDigit(ch) || ch === "-") {
          // ya no estamos en TLD puro; volvemos a dominio general
          return "D";
        }
        ctx.trap = true;
        return "TRAP";
      }
      default:
        ctx.trap = true;
        return "TRAP";
    }
  },
  simulate(input) {
    let state = this.start;
    const ctx = this.initContext();
    const steps = [];

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const from = state;
      const to = this.step(state, ch, ctx);
      steps.push({
        index: i,
        char: ch,
        from,
        to,
        ctx: { ...ctx },
      });
      state = to;
      if (state === this.trap) break;
    }

    const accepted = input.length > 0 && this.isAccepting(state, ctx);
    return { steps, state, accepted, ctx };
  },
};

// AUTÓMATA PARA CONTRASEÑA (aproxima el regex dado)
// Requisitos del regex:
// - Solo [A-Za-z\d]
// - Longitud >= 8
// - Al menos una minúscula, una mayúscula y un dígito
//
// Estados representados por bits: (L,U,D)
// L = tiene minúscula, U = tiene mayúscula, D = tiene dígito
// Estados: '000', '100', '010', '001', '110', '101', '011', '111', 'TRAP'
// Aceptación: estado '111' y length >= 8
const PasswordDFA = {
  id: "PasswordDFA",
  states: ["000", "100", "010", "001", "110", "101", "011", "111", "TRAP"],
  start: "000",
  trap: "TRAP",
  isAccepting(state, ctx) {
    return state === "111" && ctx.length >= 8 && !ctx.trap;
  },
  initContext() {
    return {
      length: 0,
      trap: false,
    };
  },
  step(state, ch, ctx) {
    if (state === "TRAP") return "TRAP";

    if (!(isLetter(ch) || isDigit(ch))) {
      ctx.trap = true;
      return "TRAP";
    }

    ctx.length += 1;

    // Decodificar bits actuales
    let hasL = state[0] === "1";
    let hasU = state[1] === "1";
    let hasD = state[2] === "1";

    if (isLetter(ch)) {
      if (ch === ch.toLowerCase()) hasL = true;
      if (ch === ch.toUpperCase()) hasU = true;
    } else if (isDigit(ch)) {
      hasD = true;
    }

    const nextState = `${hasL ? "1" : "0"}${hasU ? "1" : "0"}${hasD ? "1" : "0"}`;
    return nextState;
  },
  simulate(input) {
    let state = this.start;
    const ctx = this.initContext();
    const steps = [];

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      const from = state;
      const to = this.step(state, ch, ctx);
      steps.push({
        index: i,
        char: ch,
        from,
        to,
        ctx: { ...ctx },
      });
      state = to;
      if (state === this.trap) break;
    }

    const accepted = this.isAccepting(state, ctx);
    return { steps, state, accepted, ctx };
  },
};

// Exportar en window para uso en script.js
window.emailPattern = emailPattern;
window.pwdPattern = pwdPattern;
window.EmailDFA = EmailDFA;
window.PasswordDFA = PasswordDFA;
