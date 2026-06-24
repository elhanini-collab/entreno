// Rutina de hipertrofia · Torso/Pierna 4 días · casa con mancuernas (hasta 10 kg) y banco.
// Datos fijos extraídos de tu Excel. La app solo guarda tu seguimiento; esto es la referencia.
//
// Campos por ejercicio:
//   id           identificador estable (no cambiar: enlaza tus registros guardados)
//   name         nombre visible
//   scheme       texto original "Series × Reps"
//   sets         nº de series objetivo
//   repLow/High  extremos del rango (reps o segundos)
//   unit         'reps' | 'reps_lado' | 'seg'
//   rir          texto del RIR
//   ejecucion    descripción de técnica
//   mainMuscle   músculo principal
//   secMuscles   músculos complementarios (array)
//   cues         pistas cortas para la pantalla previa (se elige una al azar)
//
// Foto del ejercicio: la app busca automáticamente "img/<id>.jpg" (o .png).

export const DUMBBELL_CAP_KG = 10;

export const DAYS = [
  {
    id: "d1", name: "Torso A", group: "torso",
    exercises: [
      { id: "d1e1", name: "Press banca con mancuernas", scheme: "3 × 8-12", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "2",
        mainMuscle: "Pectoral mayor", secMuscles: ["Tríceps", "Deltoides anterior"],
        cues: ["Ahora toca pecho: no rebotes la mancuerna abajo.", "Ahora toca pecho: codos a unos 45°, no abiertos del todo.", "Ahora toca pecho: baja con control, no dejes caer el peso."],
        ejecucion: "Túmbate con los pies bien apoyados y las escápulas retraídas. Baja las mancuernas controlando hasta la altura del pecho y empuja sin bloquear los codos de golpe. Codos a unos 45° respecto al torso." },
      { id: "d1e2", name: "Remo a una mano con mancuerna", scheme: "3 × 10-12 (lado)", sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        mainMuscle: "Dorsal ancho", secMuscles: ["Romboides", "Trapecio", "Bíceps", "Deltoides posterior"],
        cues: ["Ahora toca espalda: tira con el codo, no con el bíceps.", "Ahora toca espalda: no gires el torso para subir más peso.", "Ahora toca espalda: aprieta arriba un instante, no tires por inercia."],
        ejecucion: "Apoya rodilla y mano del mismo lado en el banco, con la espalda neutra y casi paralela al suelo. Tira del codo hacia la cadera llevando la mancuerna al costado; aprieta la espalda arriba y baja con control." },
      { id: "d1e3", name: "Press militar sentado con mancuernas", scheme: "3 × 10-12", sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        mainMuscle: "Deltoides (anterior y medio)", secMuscles: ["Tríceps", "Trapecio superior"],
        cues: ["Ahora toca hombro: no arquees la lumbar al empujar.", "Ahora toca hombro: baja hasta las orejas, no te quedes a medias.", "Ahora toca hombro: sube sin impulsar con las piernas."],
        ejecucion: "Sentado con la espalda apoyada y el core firme. Empuja las mancuernas desde la altura de los hombros hasta arriba sin arquear la lumbar. Baja hasta la altura de las orejas." },
      { id: "d1e4", name: "Aperturas en banco inclinado", scheme: "2 × 12-15", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Pectoral mayor (porción clavicular)", secMuscles: ["Deltoides anterior"],
        cues: ["Ahora toca pecho: es una apertura, no un press; codos fijos.", "Ahora toca pecho: no bajes tanto que fuerces el hombro.", "Ahora toca pecho: busca el estiramiento, no el peso máximo."],
        ejecucion: "Tumbado en banco inclinado con los codos ligeramente flexionados y fijos. Abre los brazos en arco hasta notar estiramiento en el pecho y cierra como si abrazaras un barril. No exageres la bajada." },
      { id: "d1e5", name: "Curl de bíceps", scheme: "2 × 12-15", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Bíceps braquial", secMuscles: ["Braquial anterior", "Braquiorradial"],
        cues: ["Ahora toca bíceps: sin balanceo, que no tire la espalda.", "Ahora toca bíceps: codos quietos pegados al cuerpo.", "Ahora toca bíceps: baja lento, no dejes caer la mancuerna."],
        ejecucion: "De pie, codos pegados al torso. Sube las mancuernas contrayendo el bíceps sin balancear el cuerpo. Baja lento controlando toda la fase." },
      { id: "d1e6", name: "Extensión de tríceps sobre la cabeza", scheme: "2 × 12-15", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Tríceps (cabeza larga)", secMuscles: ["Resto del tríceps"],
        cues: ["Ahora toca tríceps: no abras los codos hacia los lados.", "Ahora toca tríceps: codos quietos apuntando arriba.", "Ahora toca tríceps: controla detrás de la nuca, sin tirones."],
        ejecucion: "Sujeta una mancuerna con ambas manos por encima de la cabeza. Baja flexionando solo los codos (mantenlos apuntando arriba) y extiende sin bloquear bruscamente." },
    ],
  },
  {
    id: "d2", name: "Pierna A", group: "pierna",
    exercises: [
      { id: "d2e1", name: "Sentadilla goblet", scheme: "3 × 12-15", sets: 3, repLow: 12, repHigh: 15, unit: "reps", rir: "2",
        mainMuscle: "Cuádriceps", secMuscles: ["Glúteos", "Isquiosurales", "Core"],
        cues: ["Ahora toca cuádriceps: no metas las rodillas hacia dentro.", "Ahora toca cuádriceps: baja al menos hasta paralelo, no te quedes corto.", "Ahora toca cuádriceps: talones en el suelo, no de puntillas."],
        ejecucion: "Mancuerna pegada al pecho, pies a la anchura de los hombros. Baja sacando la cadera atrás y abriendo las rodillas, espalda recta, hasta que los muslos queden al menos paralelos. Sube empujando con los talones." },
      { id: "d2e2", name: "Peso muerto rumano con mancuernas", scheme: "3 × 10-12", sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        mainMuscle: "Isquiosurales", secMuscles: ["Glúteo mayor", "Erectores espinales (lumbar)"],
        cues: ["Ahora toca femoral: cadera atrás, no lo conviertas en sentadilla.", "Ahora toca femoral: espalda recta, no la curves al bajar.", "Ahora toca femoral: mancuernas pegadas a las piernas."],
        ejecucion: "Mancuernas frente a los muslos, rodillas algo flexionadas y fijas. Lleva la cadera hacia atrás bajando las mancuernas pegadas a las piernas hasta notar tensión en los isquios. Sube empujando la cadera adelante." },
      { id: "d2e3", name: "Zancada búlgara", scheme: "3 × 10-12 (lado)", sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        mainMuscle: "Cuádriceps", secMuscles: ["Glúteos", "Isquiosurales", "Estabilizadores de cadera"],
        cues: ["Ahora toca pierna: baja de verdad, no te quedes corto.", "Ahora toca pierna: peso en el talón delantero, no en la punta.", "Ahora toca pierna: tronco estable, no des bandazos para equilibrarte."],
        ejecucion: "Empeine del pie trasero sobre el banco. Baja flexionando la rodilla delantera hasta unos 90°, con el tronco ligeramente inclinado. Empuja con el talón delantero para subir. Controla el equilibrio." },
      { id: "d2e4", name: "Puente de glúteo con mancuerna", scheme: "3 × 12-15", sets: 3, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Glúteo mayor", secMuscles: ["Isquiosurales", "Core"],
        cues: ["Ahora toca glúteo: aprieta arriba, no arquees la lumbar.", "Ahora toca glúteo: empuja con los talones, no con las puntas.", "Ahora toca glúteo: no apoyes del todo abajo, mantén tensión."],
        ejecucion: "Boca arriba, mancuerna sobre la cadera, pies apoyados cerca del glúteo. Eleva la cadera apretando los glúteos hasta alinear tronco y muslos. Pausa arriba y baja sin apoyar del todo." },
      { id: "d2e5", name: "Elevación de gemelo de pie", scheme: "3 × 15-20", sets: 3, repLow: 15, repHigh: 20, unit: "reps", rir: "1",
        mainMuscle: "Gastrocnemio (gemelos)", secMuscles: ["Sóleo"],
        cues: ["Ahora toca gemelo: sube al máximo, no hagas medio recorrido.", "Ahora toca gemelo: pausa arriba, no rebotes.", "Ahora toca gemelo: baja lento estirando, sin caer de golpe."],
        ejecucion: "De pie (con mancuernas para más carga), eleva los talones poniéndote de puntillas al máximo. Pausa arriba 1 segundo y baja lento estirando el gemelo. En un escalón ganas rango." },
      { id: "d2e6", name: "Plancha frontal", scheme: "3 × 30-45 seg", sets: 3, repLow: 30, repHigh: 45, unit: "seg", rir: "Isom.",
        mainMuscle: "Core (recto abdominal y transverso)", secMuscles: ["Oblicuos", "Glúteos", "Hombros"],
        cues: ["Ahora toca core: no dejes caer la cadera.", "Ahora toca core: no subas el culo buscando descanso.", "Ahora toca core: respira, no aguantes la respiración."],
        ejecucion: "Apóyate sobre antebrazos y puntas de los pies, con el cuerpo en línea recta de la cabeza a los talones. Aprieta abdomen y glúteos, sin hundir ni elevar la cadera. Respira con normalidad." },
    ],
  },
  {
    id: "d3", name: "Torso B", group: "torso",
    exercises: [
      { id: "d3e1", name: "Press inclinado con mancuernas", scheme: "3 × 8-12", sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "2",
        mainMuscle: "Pectoral superior (porción clavicular)", secMuscles: ["Deltoides anterior", "Tríceps"],
        cues: ["Ahora toca pecho: no rebotes abajo ni bloquees arriba de golpe.", "Ahora toca pecho: banco a 30-45°, no demasiado vertical (eso es hombro).", "Ahora toca pecho: baja a la parte alta del pecho, controlado."],
        ejecucion: "Banco a 30-45° y escápulas retraídas. Baja las mancuernas a la parte alta del pecho y empuja hacia arriba juntándolas ligeramente. Codos a unos 45°, sin rebotar abajo." },
      { id: "d3e2", name: "Remo con apoyo de pecho", scheme: "3 × 10-12", sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        mainMuscle: "Dorsal ancho y espalda media", secMuscles: ["Romboides", "Trapecio", "Deltoides posterior", "Bíceps"],
        cues: ["Ahora toca espalda: pecho pegado al banco, no te despegues para hacer trampa.", "Ahora toca espalda: lleva los codos atrás, no encojas los hombros.", "Ahora toca espalda: aprieta la espalda, no tires solo con los brazos."],
        ejecucion: "Tumbado boca abajo sobre el banco inclinado, con el pecho apoyado. Deja colgar los brazos y rema llevando los codos hacia atrás, apretando la espalda. Baja con control." },
      { id: "d3e3", name: "Elevaciones laterales", scheme: "3 × 12-20", sets: 3, repLow: 12, repHigh: 20, unit: "reps", rir: "1-2",
        mainMuscle: "Deltoides medio", secMuscles: ["Deltoides anterior y posterior", "Trapecio"],
        cues: ["Ahora toca hombro: ni impulso ni subir por encima del hombro.", "Ahora toca hombro: lidera con los codos, no con las manos.", "Ahora toca hombro: poco peso bien hecho, no cargues de más."],
        ejecucion: "De pie, con una leve flexión de codo. Eleva las mancuernas hacia los lados hasta la altura de los hombros, liderando con los codos. Sube sin impulso y baja lento; no pases del hombro." },
      { id: "d3e4", name: "Pullover con mancuerna", scheme: "2 × 12-15", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Dorsal ancho", secMuscles: ["Pectoral", "Tríceps (cabeza larga)", "Serrato anterior"],
        cues: ["Ahora toca espalda: codos casi fijos, no flexiones para 'ayudarte'.", "Ahora toca espalda: rango cómodo detrás, no fuerces el hombro.", "Ahora toca espalda: controla la bajada, no dejes caer el peso."],
        ejecucion: "Tumbado en el banco, sujeta una mancuerna con ambas manos sobre el pecho. Llévala en arco por detrás de la cabeza con los codos casi rectos hasta notar estiramiento, y regresa contrayendo pecho y dorsal." },
      { id: "d3e5", name: "Curl martillo", scheme: "2 × 12-15", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Braquial y braquiorradial", secMuscles: ["Bíceps braquial"],
        cues: ["Ahora toca brazo: agarre neutro, palmas enfrentadas todo el rato.", "Ahora toca brazo: sin balanceo, codos quietos.", "Ahora toca brazo: baja controlando, no sueltes de golpe."],
        ejecucion: "Como el curl, pero con agarre neutro (palmas enfrentadas), pulgares hacia arriba. Sube sin balanceo y baja controlado. Trabaja el braquial y el antebrazo." },
      { id: "d3e6", name: "Press cerrado en suelo", scheme: "2 × 12-15", sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Tríceps", secMuscles: ["Pectoral", "Deltoides anterior"],
        cues: ["Ahora toca tríceps: codos pegados al cuerpo, no abiertos.", "Ahora toca tríceps: el suelo marca el rango, no rebotes los codos.", "Ahora toca tríceps: empuja pensando en el tríceps, no en el pecho."],
        ejecucion: "Tumbado en el suelo, mancuernas con agarre neutro y codos pegados al cuerpo. Empuja hacia arriba enfocando el tríceps. El suelo limita el rango y protege los hombros." },
    ],
  },
  {
    id: "d4", name: "Pierna B", group: "pierna",
    exercises: [
      { id: "d4e1", name: "Zancada inversa con mancuernas", scheme: "3 × 10-12 (lado)", sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        mainMuscle: "Cuádriceps y glúteo mayor", secMuscles: ["Isquiosurales", "Estabilizadores"],
        cues: ["Ahora toca pierna: paso atrás firme, no pierdas el equilibrio.", "Ahora toca pierna: tronco erguido, no te vayas hacia delante.", "Ahora toca pierna: baja la rodilla de atrás, no te quedes corto."],
        ejecucion: "De pie con mancuernas a los lados. Da un paso atrás y baja la rodilla trasera hacia el suelo manteniendo el tronco erguido. Empuja con la pierna delantera para volver." },
      { id: "d4e2", name: "Peso muerto rumano a una pierna", scheme: "3 × 10-12 (lado)", sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        mainMuscle: "Isquiosurales y glúteo", secMuscles: ["Erectores espinales", "Estabilizadores de cadera y tobillo"],
        cues: ["Ahora toca femoral: cadera atrás, no curves la espalda.", "Ahora toca femoral: ve despacio, el equilibrio es parte del ejercicio.", "Ahora toca femoral: no hagas sentadilla, es bisagra de cadera."],
        ejecucion: "Sobre una pierna, mancuerna(s) al frente. Lleva la cadera hacia atrás bajando el tronco mientras la pierna libre se extiende hacia atrás. Espalda recta y subida controlada. Es un buen reto de equilibrio." },
      { id: "d4e3", name: "Sentadilla goblet con tempo", scheme: "3 × 10-12", sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        mainMuscle: "Cuádriceps", secMuscles: ["Glúteos", "Isquiosurales", "Core"],
        cues: ["Ahora toca cuádriceps: baja en 3-4 s, no aceleres la bajada.", "Ahora toca cuádriceps: rodillas hacia fuera, no hacia dentro.", "Ahora toca cuádriceps: el peso es lo de menos, manda el tempo."],
        ejecucion: "Igual que la goblet, pero baja en 3-4 segundos controlando cada centímetro y sube a velocidad normal. El tempo lento aumenta el estímulo con poco peso." },
      { id: "d4e4", name: "Step-up al banco", scheme: "3 × 10-12 (lado)", sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "1-2",
        mainMuscle: "Cuádriceps y glúteo mayor", secMuscles: ["Isquiosurales", "Gemelos", "Estabilizadores"],
        cues: ["Ahora toca pierna: sube con el pie de arriba, no te impulses con el de abajo.", "Ahora toca pierna: pie completo en el banco, no de puntillas.", "Ahora toca pierna: baja controlando, no te dejes caer."],
        ejecucion: "Coloca un pie completo sobre el banco. Sube empujando con ese talón hasta extender la pierna, sin impulsarte con la pierna de abajo. Baja controlado. Mancuernas a los lados para añadir carga." },
      { id: "d4e5", name: "Elevación de gemelo sentado", scheme: "3 × 15-20", sets: 3, repLow: 15, repHigh: 20, unit: "reps", rir: "1",
        mainMuscle: "Sóleo", secMuscles: ["Gastrocnemio (gemelos)"],
        cues: ["Ahora toca gemelo: rango completo, no medio movimiento.", "Ahora toca gemelo: pausa arriba, sin rebotes.", "Ahora toca gemelo: baja lento estirando bien."],
        ejecucion: "Sentado, con las mancuernas apoyadas sobre las rodillas. Eleva los talones poniéndote de puntillas, pausa arriba y baja lento. Enfatiza el sóleo." },
      { id: "d4e6", name: "Elevación de piernas tumbado", scheme: "3 × 12-15", sets: 3, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        mainMuscle: "Recto abdominal (parte inferior)", secMuscles: ["Flexores de cadera", "Oblicuos"],
        cues: ["Ahora toca abdomen: no despegues la lumbar de golpe.", "Ahora toca abdomen: baja controlando, no dejes caer las piernas.", "Ahora toca abdomen: si tiras de cuello o cadera, reduce el rango."],
        ejecucion: "Boca arriba, manos bajo los glúteos. Sube las piernas casi rectas controlando, sin despegar la lumbar de golpe, y baja lento sin tocar el suelo." },
    ],
  },
];

export const PRINCIPLES = [
  { title: "Frecuencia y reparto", body: "4 sesiones (p. ej. Lun · Mar · Jue · Vie), cada grupo muscular entrenado 2 veces por semana. Calienta 5 min antes de cada sesión." },
  { title: "Sobrecarga progresiva (doble progresión)", body: "Empieza en el extremo bajo del rango con buena técnica. Cuando alcances el extremo alto en todas las series, sube peso. Al llegar a tu tope de 10 kg, progresa con más reps, fase excéntrica más lenta (3-4 s) o versiones a una pierna/un brazo." },
  { title: "Esfuerzo (RIR)", body: "El RIR son las repeticiones que dejas «en la recámara». RIR 2 = podrías hacer 2 más con buena forma. Prioriza la técnica antes que llegar al fallo." },
  { title: "Suplementación y recuperación", body: "Proteína 1,6-2,2 g por kg de peso al día. Creatina 3-5 g diarios constantes (la hora es indiferente). Dormir bien es donde se construye el músculo." },
  { title: "Nota", body: "Plan orientativo. Ajusta cargas y volumen según tu recuperación. Ante dolor (no la molestia muscular normal), detente y revisa la técnica." },
];

export const EXERCISE_INDEX = (() => {
  const idx = {};
  for (const day of DAYS) for (const ex of day.exercises) idx[ex.id] = { ...ex, dayId: day.id, dayName: day.name };
  return idx;
})();

export function videoUrl(name) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(name + " técnica mancuernas");
}
