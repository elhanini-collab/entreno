# Carga · app de seguimiento de hipertrofia

App web (PWA) para seguir tu rutina **Torso/Pierna de 4 días** desde el móvil:
registro de peso/reps/notas, historial, gráficas de progreso, sugerencia
automática de **doble progresión** y temporizador de descanso/isométricos.

- **Base de datos:** Firebase Firestore (cada usuario solo ve sus datos).
- **Acceso:** login con Google.
- **Publicación:** archivos estáticos en **GitHub Pages** (sin compilar nada).

---

## 1. Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Punto de entrada de la app |
| `app.js` | Toda la lógica (auth, Firestore, vistas, progresión, gráficas, temporizador) |
| `routine.js` | Tu rutina del Excel ya estructurada (no necesitas tocarla) |
| `firebase-config.js` | **Aquí pegas tus claves de Firebase** (único archivo a editar) |
| `styles.css` | Estilos |
| `manifest.json`, `sw.js`, `icon-*.png` | Hacen que se pueda instalar como app en el móvil |
| `firestore.rules` | Reglas de seguridad para copiar en la consola de Firebase |

Solo tienes que editar **`firebase-config.js`**. Lo demás se sube tal cual.

---

## 2. Configurar Firebase (≈10 min)

### 2.1 Crear el proyecto
1. Entra en https://console.firebase.google.com y pulsa **Agregar proyecto**.
2. Ponle un nombre (p. ej. `carga-entrenos`). Puedes **desactivar** Google Analytics.

### 2.2 Crear la base de datos (Firestore)
1. En el menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
2. Elige el modo **producción** y una región europea (p. ej. `eur3` / `europe-west`).
3. Cuando esté creada, ve a la pestaña **Reglas** y pega **exactamente** el
   contenido del archivo `firestore.rules` de esta carpeta. Pulsa **Publicar**.
   (Esto es lo que garantiza que cada persona solo accede a sus propios entrenos.)

### 2.3 Activar el login con Google
1. **Compilación → Authentication → Comenzar**.
2. En **Sign-in method**, activa el proveedor **Google** y guarda.

### 2.4 Registrar la app web y copiar las claves
1. Ve a **⚙ (Configuración del proyecto) → pestaña General**.
2. En **Tus apps**, pulsa el icono **`</>`** (Web) y registra la app (un nombre cualquiera; **no** marques Hosting).
3. Firebase te mostrará un bloque `const firebaseConfig = { ... }`.
4. Abre `firebase-config.js` en esta carpeta y **pega esos valores** en su sitio
   (apiKey, authDomain, projectId, etc.). Guarda.

> Estas claves no son secretas: es normal que viajen en el navegador. La
> seguridad la dan las reglas de Firestore del paso 2.2.

---

## 3. Publicar en GitHub Pages (≈5 min)

1. Crea un repositorio en GitHub (puede ser **público**) y sube **todos** los
   archivos de esta carpeta a la raíz del repo. Puedes hacerlo arrastrándolos en
   *Add file → Upload files*, o por línea de comandos:
   ```bash
   git init
   git add .
   git commit -m "App de entrenos"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. En el repo: **Settings → Pages**.
3. En **Build and deployment → Source** elige **Deploy from a branch**, rama
   `main` y carpeta `/ (root)`. Guarda.
4. En 1-2 minutos te dará una URL del tipo:
   `https://TU_USUARIO.github.io/TU_REPO/`

### 3.1 Autorizar ese dominio en Firebase (paso clave para que entre Google)
1. Vuelve a Firebase → **Authentication → Settings → Dominios autorizados**.
2. Pulsa **Agregar dominio** y añade `TU_USUARIO.github.io`.
   *(Sin esto, el login con Google fallará en la web publicada.)*

Abre la URL en el móvil. Si todo está bien, verás la pantalla de inicio y podrás
entrar con Google.

---

## 4. Instalarla como app en el móvil

- **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.
- **iPhone (Safari):** botón Compartir → *Añadir a pantalla de inicio*.

Quedará con su icono y se abrirá a pantalla completa, como una app normal.

---

## 5. Cómo se usa

- **Entreno:** elige el día (Torso A, Pierna A, Torso B, Pierna B). En cada
  ejercicio tienes el objetivo, la técnica (botón *Cómo se hace*), el vídeo, y
  campos para anotar peso, reps y notas. Pulsa **Guardar sesión**.
- **Sugerencia de progresión:** bajo cada ejercicio aparece qué hacer hoy según
  tu último registro (mantener peso y sumar reps, subir peso, o —al llegar a tu
  tope de 10 kg— progresar con más reps, excéntrica lenta o versión unilateral).
- **Barra de rango:** muestra de un vistazo cómo de cerca estás del extremo alto
  del rango; cuando lo completas, se pone en verde (toca subir peso).
- **Historial:** todas tus sesiones por fecha; toca una para ver el detalle.
- **Progreso:** elige un ejercicio y ve su gráfica de peso (o de aguante en los
  isométricos) a lo largo del tiempo, con tus mejores marcas.
- **Temporizador:** botón flotante en la sesión (descansos de 60/90/120/180 s) o
  el cronómetro del ejercicio isométrico (plancha).
- **Guía:** los principios de la rutina (frecuencia, doble progresión, RIR, etc.).

---

## 6. Notas y solución de problemas

- **El login con Google no abre / se cierra:** suele ser el dominio sin
  autorizar (paso 3.1). En móvil, si el popup se bloquea, la app cambia sola a
  redirección.
- **"No se pudo guardar / cargar":** revisa que pegaste las reglas de Firestore
  (paso 2.2) y que la configuración de `firebase-config.js` es la correcta.
- **La rutina es fija** (referencia del Excel). Solo se guarda tu seguimiento.
  Si más adelante quieres poder editar o añadir ejercicios, se puede ampliar.
- **Privacidad:** los datos quedan en tu proyecto de Firebase, bajo tu cuenta de
  Google. Las reglas impiden que un usuario vea los datos de otro.

> Nota: no he podido ejecutar la app en vivo desde aquí (requiere tus claves de
> Firebase y conexión a sus servidores), pero el código está completo y la
> sintaxis verificada. Si al desplegar algo no encaja, dime el mensaje de error
> exacto y lo afinamos.
