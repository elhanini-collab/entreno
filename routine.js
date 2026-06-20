// Rutina de hipertrofia · Torso/Pierna 4 días · casa con mancuernas (hasta 10 kg) y banco.
// Datos fijos extraídos de tu Excel. La app solo guarda tu seguimiento; esto es la referencia.
//
// Campos por ejercicio:
//   id        identificador estable (no cambiar: enlaza tus registros guardados)
//   name      nombre visible
//   scheme    texto original "Series × Reps"
//   sets      nº de series objetivo
//   repLow    extremo bajo del rango (en reps o segundos)
//   repHigh   extremo alto del rango
//   unit      'reps' | 'reps_lado' | 'seg'
//   rir       texto del RIR
//   ejecucion descripción de técnica
//
// El límite de mancuerna es 10 kg: al llegar a ese tope, la progresión cambia
// (más reps, excéntrica más lenta o versiones a una pierna/un brazo).

export const DUMBBELL_CAP_KG = 10;

export const DAYS = [
  {
    id: "d1",
    name: "Torso A",
    group: "torso",
    exercises: [
      {
        id: "d1e1",
        name: "Press banca con mancuernas",
        scheme: "3 × 8-12",
        sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "2",
        ejecucion: "Túmbate con los pies bien apoyados y las escápulas retraídas. Baja las mancuernas controlando hasta la altura del pecho y empuja sin bloquear los codos de golpe. Codos a unos 45° respecto al torso.",
      },
      {
        id: "d1e2",
        name: "Remo a una mano con mancuerna",
        scheme: "3 × 10-12 (lado)",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        ejecucion: "Apoya rodilla y mano del mismo lado en el banco, con la espalda neutra y casi paralela al suelo. Tira del codo hacia la cadera llevando la mancuerna al costado; aprieta la espalda arriba y baja con control.",
      },
      {
        id: "d1e3",
        name: "Press militar sentado con mancuernas",
        scheme: "3 × 10-12",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        ejecucion: "Sentado con la espalda apoyada y el core firme. Empuja las mancuernas desde la altura de los hombros hasta arriba sin arquear la lumbar. Baja hasta la altura de las orejas.",
      },
      {
        id: "d1e4",
        name: "Aperturas en banco inclinado",
        scheme: "2 × 12-15",
        sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Tumbado en banco inclinado con los codos ligeramente flexionados y fijos. Abre los brazos en arco hasta notar estiramiento en el pecho y cierra como si abrazaras un barril. No exageres la bajada.",
      },
      {
        id: "d1e5",
        name: "Curl de bíceps",
        scheme: "2 × 12-15",
        sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "De pie, codos pegados al torso. Sube las mancuernas contrayendo el bíceps sin balancear el cuerpo. Baja lento controlando toda la fase.",
      },
      {
        id: "d1e6",
        name: "Extensión de tríceps sobre la cabeza",
        scheme: "2 × 12-15",
        sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Sujeta una mancuerna con ambas manos por encima de la cabeza. Baja flexionando solo los codos (mantenlos apuntando arriba) y extiende sin bloquear bruscamente.",
      },
    ],
  },
  {
    id: "d2",
    name: "Pierna A",
    group: "pierna",
    exercises: [
      {
        id: "d2e1",
        name: "Sentadilla goblet",
        scheme: "3 × 12-15",
        sets: 3, repLow: 12, repHigh: 15, unit: "reps", rir: "2",
        ejecucion: "Mancuerna pegada al pecho, pies a la anchura de los hombros. Baja sacando la cadera atrás y abriendo las rodillas, espalda recta, hasta que los muslos queden al menos paralelos. Sube empujando con los talones.",
      },
      {
        id: "d2e2",
        name: "Peso muerto rumano con mancuernas",
        scheme: "3 × 10-12",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        ejecucion: "Mancuernas frente a los muslos, rodillas algo flexionadas y fijas. Lleva la cadera hacia atrás bajando las mancuernas pegadas a las piernas hasta notar tensión en los isquios. Sube empujando la cadera adelante.",
      },
      {
        id: "d2e3",
        name: "Zancada búlgara",
        scheme: "3 × 10-12 (lado)",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        ejecucion: "Empeine del pie trasero sobre el banco. Baja flexionando la rodilla delantera hasta unos 90°, con el tronco ligeramente inclinado. Empuja con el talón delantero para subir. Controla el equilibrio.",
      },
      {
        id: "d2e4",
        name: "Puente de glúteo con mancuerna",
        scheme: "3 × 12-15",
        sets: 3, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Boca arriba, mancuerna sobre la cadera, pies apoyados cerca del glúteo. Eleva la cadera apretando los glúteos hasta alinear tronco y muslos. Pausa arriba y baja sin apoyar del todo.",
      },
      {
        id: "d2e5",
        name: "Elevación de gemelo de pie",
        scheme: "3 × 15-20",
        sets: 3, repLow: 15, repHigh: 20, unit: "reps", rir: "1",
        ejecucion: "De pie (con mancuernas para más carga), eleva los talones poniéndote de puntillas al máximo. Pausa arriba 1 segundo y baja lento estirando el gemelo. En un escalón ganas rango.",
      },
      {
        id: "d2e6",
        name: "Plancha frontal",
        scheme: "3 × 30-45 seg",
        sets: 3, repLow: 30, repHigh: 45, unit: "seg", rir: "Isom.",
        ejecucion: "Apóyate sobre antebrazos y puntas de los pies, con el cuerpo en línea recta de la cabeza a los talones. Aprieta abdomen y glúteos, sin hundir ni elevar la cadera. Respira con normalidad.",
      },
    ],
  },
  {
    id: "d3",
    name: "Torso B",
    group: "torso",
    exercises: [
      {
        id: "d3e1",
        name: "Press inclinado con mancuernas",
        scheme: "3 × 8-12",
        sets: 3, repLow: 8, repHigh: 12, unit: "reps", rir: "2",
        ejecucion: "Banco a 30-45° y escápulas retraídas. Baja las mancuernas a la parte alta del pecho y empuja hacia arriba juntándolas ligeramente. Codos a unos 45°, sin rebotar abajo.",
      },
      {
        id: "d3e2",
        name: "Remo con apoyo de pecho",
        scheme: "3 × 10-12",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        ejecucion: "Tumbado boca abajo sobre el banco inclinado, con el pecho apoyado. Deja colgar los brazos y rema llevando los codos hacia atrás, apretando la espalda. Baja con control.",
      },
      {
        id: "d3e3",
        name: "Elevaciones laterales",
        scheme: "3 × 12-20",
        sets: 3, repLow: 12, repHigh: 20, unit: "reps", rir: "1-2",
        ejecucion: "De pie, con una leve flexión de codo. Eleva las mancuernas hacia los lados hasta la altura de los hombros, liderando con los codos. Sube sin impulso y baja lento; no pases del hombro.",
      },
      {
        id: "d3e4",
        name: "Pullover con mancuerna",
        scheme: "2 × 12-15",
        sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Tumbado en el banco, sujeta una mancuerna con ambas manos sobre el pecho. Llévala en arco por detrás de la cabeza con los codos casi rectos hasta notar estiramiento, y regresa contrayendo pecho y dorsal.",
      },
      {
        id: "d3e5",
        name: "Curl martillo",
        scheme: "2 × 12-15",
        sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Como el curl, pero con agarre neutro (palmas enfrentadas), pulgares hacia arriba. Sube sin balanceo y baja controlado. Trabaja el braquial y el antebrazo.",
      },
      {
        id: "d3e6",
        name: "Press cerrado en suelo",
        scheme: "2 × 12-15",
        sets: 2, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Tumbado en el suelo, mancuernas con agarre neutro y codos pegados al cuerpo. Empuja hacia arriba enfocando el tríceps. El suelo limita el rango y protege los hombros.",
      },
    ],
  },
  {
    id: "d4",
    name: "Pierna B",
    group: "pierna",
    exercises: [
      {
        id: "d4e1",
        name: "Zancada inversa con mancuernas",
        scheme: "3 × 10-12 (lado)",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        ejecucion: "De pie con mancuernas a los lados. Da un paso atrás y baja la rodilla trasera hacia el suelo manteniendo el tronco erguido. Empuja con la pierna delantera para volver.",
      },
      {
        id: "d4e2",
        name: "Peso muerto rumano a una pierna",
        scheme: "3 × 10-12 (lado)",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "2",
        ejecucion: "Sobre una pierna, mancuerna(s) al frente. Lleva la cadera hacia atrás bajando el tronco mientras la pierna libre se extiende hacia atrás. Espalda recta y subida controlada. Es un buen reto de equilibrio.",
      },
      {
        id: "d4e3",
        name: "Sentadilla goblet con tempo",
        scheme: "3 × 10-12",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps", rir: "2",
        ejecucion: "Igual que la goblet, pero baja en 3-4 segundos controlando cada centímetro y sube a velocidad normal. El tempo lento aumenta el estímulo con poco peso.",
      },
      {
        id: "d4e4",
        name: "Step-up al banco",
        scheme: "3 × 10-12 (lado)",
        sets: 3, repLow: 10, repHigh: 12, unit: "reps_lado", rir: "1-2",
        ejecucion: "Coloca un pie completo sobre el banco. Sube empujando con ese talón hasta extender la pierna, sin impulsarte con la pierna de abajo. Baja controlado. Mancuernas a los lados para añadir carga.",
      },
      {
        id: "d4e5",
        name: "Elevación de gemelo sentado",
        scheme: "3 × 15-20",
        sets: 3, repLow: 15, repHigh: 20, unit: "reps", rir: "1",
        ejecucion: "Sentado, con las mancuernas apoyadas sobre las rodillas. Eleva los talones poniéndote de puntillas, pausa arriba y baja lento. Enfatiza el sóleo.",
      },
      {
        id: "d4e6",
        name: "Elevación de piernas tumbado",
        scheme: "3 × 12-15",
        sets: 3, repLow: 12, repHigh: 15, unit: "reps", rir: "1-2",
        ejecucion: "Boca arriba, manos bajo los glúteos. Sube las piernas casi rectas controlando, sin despegar la lumbar de golpe, y baja lento sin tocar el suelo.",
      },
    ],
  },
];

export const PRINCIPLES = [
  {
    title: "Frecuencia y reparto",
    body: "4 sesiones (p. ej. Lun · Mar · Jue · Vie), cada grupo muscular entrenado 2 veces por semana. Calienta 5 min antes de cada sesión.",
  },
  {
    title: "Sobrecarga progresiva (doble progresión)",
    body: "Empieza en el extremo bajo del rango con buena técnica. Cuando alcances el extremo alto en todas las series, sube peso. Al llegar a tu tope de 10 kg, progresa con más repeticiones, fase excéntrica más lenta (3-4 s) o versiones a una pierna/un brazo.",
  },
  {
    title: "Esfuerzo (RIR)",
    body: "El RIR son las repeticiones que dejas «en la recámara». RIR 2 = podrías hacer 2 más con buena forma. Prioriza la técnica antes que llegar al fallo.",
  },
  {
    title: "Suplementación y recuperación",
    body: "Proteína 1,6-2,2 g por kg de peso al día. Creatina 3-5 g diarios constantes (la hora es indiferente). Dormir bien es donde se construye el músculo.",
  },
  {
    title: "Nota",
    body: "Plan orientativo. Ajusta cargas y volumen según tu recuperación. Ante dolor (no la molestia muscular normal), detente y revisa la técnica.",
  },
];

// Mapa id -> {exercise, day} para búsquedas rápidas (historial, gráficas, progresión).
export const EXERCISE_INDEX = (() => {
  const idx = {};
  for (const day of DAYS) {
    for (const ex of day.exercises) {
      idx[ex.id] = { ...ex, dayId: day.id, dayName: day.name };
    }
  }
  return idx;
})();

// URL de búsqueda en YouTube con la técnica del ejercicio.
export function videoUrl(name) {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(name + " técnica mancuernas");
}
