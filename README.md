# Validación con Autómatas — Email y Contraseña 

Proyecto front-end pequeño que valida en tiempo real un correo y una contraseña usando autómatas (DFA) y visualiza paso a paso el recorrido sobre el diagrama. Ideal para aprender cómo funcionan los autómatas aplicados a validaciones prácticas y para incorporar una UI didáctica en demos o materiales docentes.

---

## Demo / ¿Qué hace?
- Valida en tiempo real:
  - Correo electrónico (patrón: parte local + @ + dominio + TLD).
  - Contraseña (mínimo 8 caracteres, al menos una minúscula, una mayúscula y un dígito).
- Muestra a la derecha un diagrama SVG del autómata correspondiente (email / password).
- Dibuja las transiciones recorridas, mantiene contadores por categoría (p. ej. `letra × 12`, `dig × 3`) apilados y actualizables.
- Tooltips explicativos al pasar el ratón por estados, flechas y etiquetas.
- Modo de animación paso a paso y cancelación segura al escribir rápido o borrar.
- Panel "Paso a paso" (left) con el historial i, char, from → to (se puede alternar entre Email/Contraseña).

---

## Estructura del proyecto

- `index.html` — Estructura de la interfaz.
- `style.css` — Estilos y reglas para la visualización (temática oscura).
- `regex.js` — Definición de los automatas y los patrones (emailPattern, pwdPattern). También contiene las funciones de simulación (EmailDFA y PasswordDFA).
- `script.js` — Lógica de interacción, renderizado del SVG, animación, manejo de tooltips y agrupación de contadores.
  
---

